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

**No Python backend:** Scripted dialogue is data, not computation. Storing it as JSON in the frontend means the whole product is static files → free hosting, zero maintenance, infinite scalability, trivially demoable. An LLM-powered "ask the guide anything" mode is a future-work extension that WOULD need a backend (or the Anthropic API) — do not build it before final lock (see `PLAN.md`) unless everything else is done.

## 3. Architecture

### 3.1 Zone-based scenes (important)
The first floor is captured, trained, and shipped as **2–4 separate zones** (e.g., lobby, main hallway, ISE lab, secondary corridor), not one monolithic splat.

Reasons: (a) each training run stays within 8 GB VRAM and 16 GB system RAM; (b) each web file stays under the ~50 MB budget; (c) a bad capture only forces re-doing one zone; (d) the viewer lazy-loads the next zone as the user approaches a doorway (simple distance check → load → fade).

Zones share a common coordinate convention: after cleanup in SuperSplat, each zone is exported with the floor at y=0, 1 unit = 1 meter (scale using a known measurement like a doorway height), and a documented origin point. Write each zone's origin/orientation into `zones.json`.

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

## 4. Pipeline (capture → web)

1. **Capture** a zone: 4K video, slow walk, high overlap, loop closure, even lighting. (Full protocol in `skills/capture-protocol`.)
2. **Extract & pose**: `ns-process-data video --data zone.mp4 --output-dir data/zoneX` (runs COLMAP). Target 150–300 frames per zone.
3. **Train**: `ns-train splatfacto --data data/zoneX`. Watch in the Nerfstudio viewer; ~30k steps.
4. **Export**: `ns-export gaussian-splat ... ` → .ply
5. **Clean**: open .ply in SuperSplat → delete floaters, crop to room bounds, orient floor to y=0 → export compressed (.spz or compressed .ply).
6. **Budget check**: file < 50 MB? renders 30+ fps in Spark on a mid laptop? If not: prune more aggressively in SuperSplat or retrain at lower cap.
7. **Integrate**: drop into `public/splats/`, add zone entry to `zones.json`.

## 5. Hardware notes
- Training machine: laptop RTX 5060, **8 GB VRAM** (documented minimum for this pipeline), 16 GB system RAM.
- Mitigations for the RAM ceiling: cap frames per zone (~300 max), downscale training images to ≤1600 px on the long side, close everything else during COLMAP, keep zones small.
- If a zone repeatedly OOMs: split it into two zones. If setup on Windows fights us: use WSL2 Ubuntu (recommended for Nerfstudio anyway) or fall back to Postshot.

## 6. Schedule

Schedule, milestones, and decision gates live in `PLAN.md`. This document does not
duplicate dates — if you need to know when something is due, that is the wrong file.

## 6a. Fallback options

Technical fallbacks, listed without dates. `PLAN.md` gates decide when to trigger them.

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
