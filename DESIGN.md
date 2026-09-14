# Rutgers CORE Virtual Tour — Technical Design Document
**Group 9 · Senior Design · Locked July 2026**

This document records the final stack decisions and architecture for the project. These decisions were made after researching the July 2026 state of the Gaussian splatting ecosystem. Treat them as settled unless a hard blocker forces a change — every decision here has a documented fallback for exactly that case.

---

## 1. Product summary

A web-based, photorealistic, freely-navigable 3D tour of the CORE building's first floor at Rutgers, reconstructed via 3D Gaussian Splatting. Users navigate with WASD + mouse (or click-to-move), and interactive NPC guides deliver scripted information about rooms and facilities. Deliverable is a static website — no backend server.

## 2. The locked stack

| Layer | Choice | Fallback |
|---|---|---|
| Capture | Smartphone video/photos (see capture skill) | Borrowed DSLR if phone footage fails COLMAP |
| Pose estimation (SfM) | COLMAP, invoked automatically via Nerfstudio's `ns-process-data` | RealityCapture (free under $1M revenue) exports poses Nerfstudio can import |
| Splat training | **Nerfstudio `splatfacto`** (gsplat CUDA backend) | Postshot (Windows GUI, Indie tier ~€17/mo for PLY export) |
| Splat cleanup | **SuperSplat** (free browser editor) — crop, delete floaters | — |
| Delivery format | Compressed **.spz** (or SuperSplat compressed .ply), target **< 50 MB per zone** | .sog / .ksplat, all supported by renderer |
| Web renderer | **Spark** (`@sparkjsdev/spark`) on Three.js + WebGL2 | mkkellogg GaussianSplats3D |
| NPC visuals | **2D character portraits + dialogue box overlay** (visual-novel style) | Simple 3D billboard sprites in-scene |
| Dialogue logic | **Frontend JSON** — no backend | — |
| Hosting | **GitHub Pages or Cloudflare Pages** (static, free) | Vercel/Netlify free tier |
| Build tooling | Vite + vanilla JS (or TS) | — |

### Why these choices

**Nerfstudio/gsplat over the original INRIA code:** gsplat uses ~4x less GPU memory and trains faster. On our 8 GB VRAM RTX 5060 this is the difference between fitting and not fitting. It also wraps COLMAP so we never run it by hand.

**Spark over raw Three.js or other viewers:** Three.js cannot render splats natively — a splat renderer library is mandatory. Spark's `SplatMesh` is a `THREE.Object3D`, so the splat scene, NPC sprites, invisible collision walls, and trigger volumes all live in ONE scene graph with correct occlusion and shared coordinates. Spark 2.0 adds Level-of-Detail rendering with a fixed splat budget (near-constant frame cost regardless of scene size), which directly addresses our performance constraint. Targets 98%+ WebGL2 device support including mobile.

**2D NPC overlay as primary (not fallback):** Photoreal environment + low-poly 3D character = uncanny mismatch (we noted this ourselves in the report). A polished 2D portrait + dialogue box reads as an intentional art direction, is 10x less work, and is fully accessible (screen-reader-friendly DOM, easy audio overlay later). The NPC still has a 3D *presence*: a marker/sprite in the scene at fixed coordinates with a proximity trigger.

**No Python backend:** Scripted dialogue is data, not computation. Storing it as JSON in the frontend means the whole product is static files → free hosting, zero maintenance, infinite scalability, trivially demoable. An LLM-powered "ask the guide anything" mode is a future-work extension that WOULD need a backend (or the Anthropic API) — do not build it before final lock (see `docs/PLAN.md`) unless everything else is done.

## 3. Architecture

### 3.1 Zone-based scenes (important)
The first floor is captured, trained, and shipped as **2–4 separate zones** (e.g., lobby, main hallway, ISE lab, secondary corridor), not one monolithic splat.

Reasons: (a) each training run stays within 8 GB VRAM and 16 GB system RAM; (b) each web file stays under the ~50 MB budget; (c) a bad capture only forces re-doing one zone; (d) the viewer lazy-loads the next zone as the user approaches a doorway (simple distance check → load → fade).

Zones share a common web-scene coordinate convention: floor at y=0 and 1 unit = 1 meter. Preserve each cleaned splat's reconstruction coordinate system on export, then use per-zone `rotation`, uniform `scale`, and `origin` in `zones.json` to place it in that convention.

**The coordinate seam.** COLMAP recovers geometry only up to an unknown scale factor — a small room filmed close up and a large room filmed from far away produce identical images, so the math cannot tell them apart. Splatfacto trains with `auto_scale_poses=True`, which normalizes that arbitrary scale further. Our collision boxes, by contrast, are authored in real-world meters against the 1 unit = 1 meter / floor-at-y=0 convention above. Reconciling COLMAP's arbitrary output scale with our real-world convention is a per-zone step, not something the pipeline gives us for free.

**Decision: `rotation`/`scale`/`origin` are `zones.json` fields, not a SuperSplat bake.** Baking a correction into the splat file itself means every attempt requires re-exporting a 240 MB file, which makes iteration impractical and blocks teammates from working on the same zone in parallel. Instead, `src/zones.js` applies uniform `scale` (non-uniform scaling would distort the geometry), `rotation` (XYZ Euler degrees, `[x, y, z]`), then `origin` for position at runtime. This turns physical calibration into a JSON edit anyone can make and reload in seconds.

**Zone schema fields** (`public/zones.json`, one entry per zone):
- `splat` — path to the zone's exported splat file
- `placeholder` / `placeholderSize` — when `placeholder` is true, render a stand-in gray room sized `placeholderSize` instead of loading `splat`
- `origin` `[x, y, z]` — position offset in scene units (meters)
- `rotation` `[x, y, z]` degrees — Euler angles correcting COLMAP's arbitrary orientation; default `[0, 0, 0]`
- `scale` — uniform scale factor correcting COLMAP's arbitrary scale; default `1`
- `spawn` `[x, y, z]` — player spawn position
- `collision` — array of hand-authored AABB `{min, max}` boxes; never derived from splat geometry

**Printing room status (verified in browser 2026-09-14):** the splat is aligned using `origin: [-0.4239378102298068, 0.074344140921842, 3.17070150997874]`, `rotation: [180, 91.78889410373753, 0]`, and `scale: 2.881555849683783` in `public/zones.json`. Four collision boundary walls use the room's measured physical dimensions; temporary `debugCollision` wireframe support makes them visible over the splat.

First zone measured: printing room, tape-measured at 40.8 × 14.3 × 10.8 ft = 12.43584 × 4.35864 × 3.29184 m.

### 3.2 Runtime structure (frontend)
```
index.html
src/
  main.js            // Three.js + Spark setup, render loop
  zones.js           // zone loading/unloading, zones.json driven
  controls.js        // WASD + mouse-look, click-to-move optional later
  collision.js       // invisible AABB walls per zone (data in zones.json)
  npc.js             // NPC markers, proximity triggers
  dialogue.js        // dialogue UI (DOM overlay), reads dialogue/*.json
public/
  splats/            // zone .spz files
  dialogue/          // one JSON per NPC
  portraits/         // NPC portrait images
  zones.json         // zone origins, bounds, NPC placements, collision boxes
```

### 3.3 Movement & collision
First-person camera at fixed eye height (~1.65 m), WASD moves on the ground plane, mouse-look via Pointer Lock API. Collision is axis-aligned bounding boxes hand-authored per zone in `zones.json` — do NOT attempt collision against the splats themselves (they have no usable geometry). A dozen boxes per zone (walls, big furniture) is enough. Provide an on-screen touch joystick for mobile later; desktop first.

### 3.4 NPC & dialogue system
Each NPC = entry in `zones.json`: `{ id, zone, position [x,y,z], radius, portrait, dialogueFile }`. In the scene it renders as a floating marker/sprite (always-visible, per our accessibility requirement that interactions must be easy to spot). When the player enters `radius`, show "Press E / tap to talk". Dialogue JSON is a simple node graph:

```json
{
  "npc": "prof_aziz_guide",
  "name": "ISE Lab Guide",
  "nodes": {
    "start": { "text": "Welcome to the ISE lab! ...", "choices": [
      { "label": "What happens in this lab?", "next": "about" },
      { "label": "Where should I go next?", "next": "directions" }
    ]},
    "about": { "text": "...", "next": "start" },
    "directions": { "text": "...", "end": true }
  }
}
```

Dialogue UI is plain DOM over the canvas (not rendered in WebGL): portrait left, text box bottom, choices as buttons. This is keyboard-navigable and screen-reader-compatible for free, and audio narration is a later drop-in (`<audio>` per node or Web Speech API).

### 3.5 Known issue: .spz delivery format rejected by Spark (root cause identified 2026-09-11)

SuperSplat's `.spz` export (tested against v3.0.0-alpha) is not usable for delivery with our current renderer. It produces a well-compressed file — roughly 13x smaller than the uncompressed `.ply` — but Spark fails to load it with `Worker error: Invalid gzip header`, even though SuperSplat reads the same file back without complaint.

**Root cause.** The file is a valid **SPZ v4**, and Spark only reads v1–v3. Confirmed by inspecting the header of `public/splats/test-room.spz`: the first bytes are `4e 47 53 50 04` — ASCII magic `NGSP`, version byte `4`. SPZ v1–v3 wrap the whole payload in gzip (files start with `1f 8b`); v4 dropped the gzip wrapper in favour of a raw `NGSP` header followed by per-attribute ZSTD-compressed streams. Spark's viewer decodes `.spz` in a Rust WASM worker that expects the gzip wrapper, so a v4 file fails at the first byte. Upstream v4 support is `sparkjsdev/spark` PR #332 (opened May 2026, reviewed, still unmerged as of August 2026) — no released Spark version reads v4, so upgrading `@sparkjsdev/spark` does not fix this.

**Resolution plan, cheapest first:**
1. Export **Compressed PLY** from SuperSplat instead of `.spz`. Spark documents support for the SuperSplat/gsplat compressed `.ply` variant, and it was already the listed alternative in §2. Expect a size in the same range as the `.spz` (same quantization approach). Requires un-ignoring `public/splats/*.ply` in `.gitignore` so finished zones can be committed (the `*.ply` rule exists only to keep 240 MB raw exports out).
2. Export **`.sog`** from SuperSplat — also on Spark's supported-format list. Untested by us.
3. Transcode v4 → v3 with Niantic's reference `spz` tool. Works but adds a pipeline step for no gain over (1).
4. If none of the above gets under 50 MB: drop SuperSplat's SH Bands export setting (default 3) to 0 or 1.

**Interim workaround** is uncompressed `.ply`. Consequence: zones land far above the <50 MB target (a single small room exported at ~240 MB), which matters because this is a static-hosting delivery problem, not just a storage one — every visitor downloads a full zone file before they can walk it. Until (1) is verified, splat files are shared via Google Drive (see `docs/ONBOARDING.md`), not Git.

## 4. Pipeline (capture → web)

1. **Capture** a zone: 4K video, slow walk, high overlap, loop closure, even lighting. (Full protocol in `.claude/skills/capture-protocol/SKILL.md`.)
2. **Extract & pose**: `ns-process-data video --data zone.mp4 --output-dir data/zoneX` (runs COLMAP). Target 150–300 frames per zone.
3. **Train**: `ns-train splatfacto --data data/zoneX`. Watch in the Nerfstudio viewer; ~30k steps.
4. **Export**: `ns-export gaussian-splat ... ` → .ply
5. **Clean**: open .ply in SuperSplat → delete floaters, crop to room bounds, perform privacy cleanup → preserve reconstruction coordinates on export (Compressed PLY is the next delivery-format test).
6. **Budget check**: file < 50 MB? renders 30+ fps in Spark on a mid laptop? If not: prune more aggressively in SuperSplat or retrain at lower cap.
7. **Integrate and calibrate**: drop into `public/splats/`, add the zone entry, then set `rotation`, uniform `scale`, and `origin` in `zones.json` to put the floor at world y=0 and match physical meters. Do not bake those transforms into the PLY.

## 5. Hardware notes
- Training machine: laptop RTX 5060, **8 GB VRAM** (documented minimum for this pipeline), 16 GB system RAM.
- Mitigations for the RAM ceiling: cap frames per zone (~300 max), downscale training images to ≤1600 px on the long side, close everything else during COLMAP, keep zones small.
- If a zone repeatedly OOMs: split it into two zones. If setup on Windows fights us: use WSL2 Ubuntu (recommended for Nerfstudio anyway) or fall back to Postshot.
- gsplat JIT-compiles its CUDA kernels on first GPU use — the first training run after a fresh venv pays a one-time compile cost before training itself starts. This compile is memory-hungry enough to get OOM-killed under WSL2's default RAM allocation; see `docs/SETUP_TRAINING.md` for the `MAX_JOBS` and `.wslconfig` settings that fixed it on our machine.

## 6. Schedule

Schedule, milestones, and decision gates live in `docs/PLAN.md`. This document does not
duplicate dates — if you need to know when something is due, that is the wrong file.

## 6a. Fallback options

Technical fallbacks, listed without dates. `docs/PLAN.md` gates decide when to trigger them.

**Nerfstudio install fails or stalls**
Switch to Postshot Indie (native Windows, no WSL) or Luma AI cloud processing.
Acceptable for a prototype; note the substitution in the report.

**COLMAP repeatedly fails to align a zone**
Try RealityCapture alignment for that zone, or process it through Polycam/Luma.
A zone processed in the cloud is still a valid zone.

**A zone repeatedly runs out of VRAM**
Split it into two smaller zones. Failing that, reduce input resolution or cap the
gaussian count. More small zones beats one zone that will not train.

**Multi-zone loading proves unreliable**
Replace seamless transitions with a menu that jumps between zones. If that also
fails, ship the single best zone. A polished one-zone tour beats a broken four-zone one.

## 7. Constraints traceability (for the report)
- *Performance/loading*: compressed .spz, < 50 MB/zone, Spark LoD, zone lazy-loading.
- *Accessibility*: DOM-based dialogue (screen readers), visible NPC markers, keyboard navigation, audio narration slot.
- *Privacy*: capture during off-hours, no people in frames, blur/exclude posted personal info in SuperSplat cleanup, get building permission in writing.
- *Standards*: HTML/CSS/JS, WebGL2 (98%+ support), static hosting.
