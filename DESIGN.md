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
| Delivery format | **SuperSplat Compressed PLY** (confirmed in Spark 2.1.0), target **< 50 MB per zone** | .sog / .ksplat, supported by renderer. **Not .spz** — see §3.5 |
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
The first floor is captured, trained, and shipped as **4–5 separate zones** (the main hallway plus the rooms opening off it), not one monolithic splat.

Reasons: (a) each training run stays within 8 GB VRAM and 16 GB system RAM; (b) each web file stays under the ~50 MB budget; (c) a bad capture only forces re-doing one zone; (d) the viewer lazy-loads the next zone as the user approaches a doorway (simple distance check → load → fade).

**Star topology: the hallway is the hub.** Every zone-to-zone transition is hallway↔room; there are no room↔room transitions. This falls out of the building itself — the rooms connect to each other only through the hallway — and it buys a real simplification: each room only ever has to align against one neighbour, the hallway, instead of against every room it might border.

That makes **the hallway the shared reference frame.** Align it first, then express every other zone's `origin` and `rotation` relative to it. A room's alignment error stays local to that room instead of propagating around a loop of mutually-aligned neighbours.

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

### 3.5 Delivery format: Compressed PLY (resolved 2026-09-15) — and why not .spz

SuperSplat's `.spz` export (tested against v3.0.0-alpha) is not usable for delivery with our current renderer. It produces a well-compressed file — roughly 13x smaller than the uncompressed `.ply` — but Spark fails to load it with `Worker error: Invalid gzip header`, even though SuperSplat reads the same file back without complaint.

**Root cause.** The file is a valid **SPZ v4**, and Spark only reads v1–v3. Confirmed by inspecting the header of `public/splats/test-room.spz`: the first bytes are `4e 47 53 50 04` — ASCII magic `NGSP`, version byte `4`. SPZ v1–v3 wrap the whole payload in gzip (files start with `1f 8b`); v4 dropped the gzip wrapper in favour of a raw `NGSP` header followed by per-attribute ZSTD-compressed streams. Spark's viewer decodes `.spz` in a Rust WASM worker that expects the gzip wrapper, so a v4 file fails at the first byte. Upstream v4 support is `sparkjsdev/spark` PR #332 (opened May 2026, reviewed, still unmerged as of August 2026) — no released Spark version reads v4, so upgrading `@sparkjsdev/spark` does not fix this.

**Resolution: Compressed PLY, confirmed working 2026-09-15.** SuperSplat's Compressed PLY export loads in Spark 2.1.0 — option (1) below, the cheapest one, worked. The printing room ships as `public/splats/printing-room-updated.compressed.ply` (62,132,080 bytes), committed to the repo with a `.gitignore` negation past the blanket `*.ply` rule, and renders with LOD enabled (`lodSplatCount` 500000, pixel ratio 1). `.spz` is abandoned, not pending; do not spend time on it again unless PR #332 lands.

Options considered, cheapest first — (1) is what we took:
1. **Compressed PLY** from SuperSplat. Adopted.
2. `.sog` from SuperSplat — also on Spark's supported-format list. Never needed; remains the fallback if Compressed PLY ever fails on a future zone.
3. Transcode v4 → v3 with Niantic's reference `spz` tool. Rejected — a pipeline step for no gain over (1).

**The open problem is size, not format.** 62 MB is over our 50 MB target, and this is a delivery
problem rather than a storage one: every visitor downloads a full zone file before they can walk
it. The dominant term is spherical harmonics. At SuperSplat's default SH Bands = 3, the file is
1,013,854 splats × (16 bytes base + 45 bytes SH) ≈ 61.85 MB plus chunk metadata — **SH is 74% of
the file.** Projecting the same splat count at lower bands:

| SH Bands | Bytes/splat | Projected size | Visual cost |
|---|---|---|---|
| 3 (current) | 16 + 45 | 62 MB | — |
| 1 | 16 + 9 | ~26 MB | unmeasured |
| 0 | 16 + 0 | ~16.5 MB | unmeasured |

**SH band selection is the primary size lever, and the band choice is not yet made.** Band 1 and
band 0 get exported and compared side by side in the browser before we set a project standard —
the projections above are arithmetic, not a judgement about how either one looks. Culling splats
is the secondary lever, but see the cleanup caveat in §4 step 5. Issue #8.

## 4. Pipeline (capture → web)

1. **Capture** a zone: 4K video, slow walk, high overlap, loop closure, even lighting. (Full protocol in `.claude/skills/capture-protocol/SKILL.md`.)
2. **Extract & pose**: `ns-process-data video --data zone.MOV --output-dir data/zoneX` (runs COLMAP). Frame target is an open question — see the capture-protocol skill before picking one.
3. **Train**: `ns-train splatfacto --data data/zoneX`. Watch in the Nerfstudio viewer; ~30k steps.
4. **Export**: `ns-export gaussian-splat ... ` → .ply
5. **Clean**: open .ply in SuperSplat → delete floaters, crop to room bounds, perform privacy cleanup → preserve reconstruction coordinates → export **Compressed PLY**.
   **Caveat, unresolved:** on the printing room the team observed visual quality getting *worse* after cleanup, so the shipped Zone 1 file is uncleaned. The cause was never diagnosed. Until someone does, treat aggressive cleanup as a change that needs an A/B look in the browser, not a free win — and prefer SH band reduction as the size lever.
6. **Budget check**: file < 50 MB? renders 30+ fps in Spark on a mid laptop? If not, lower SH Bands on export (see §3.5) before pruning splats.
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
- *Performance/loading*: Compressed PLY, < 50 MB/zone target (currently 62 MB — SH band reduction pending, §3.5), Spark LoD, zone lazy-loading.
- *Accessibility*: DOM-based dialogue (screen readers), visible NPC markers, keyboard navigation, audio narration slot.
- *Privacy*: capture during off-hours, no people in frames, blur/exclude posted personal info in SuperSplat cleanup, get building permission in writing.
- *Standards*: HTML/CSS/JS, WebGL2 (98%+ support), static hosting.
