# Rutgers CORE Virtual Tour — Technical Design Document
**Group 9 · Senior Design · Locked July 2026**

This document records the final stack decisions and architecture for the project. These decisions were made after researching the July 2026 state of the Gaussian splatting ecosystem. Treat them as settled unless a hard blocker forces a change — every decision here has a documented fallback for exactly that case.

---

## Scope and implementation addendum — 2026-10-30

The current deliverable contains exactly CORE Hallway (`hallway`), 3D Printing Room (`printing-room`) and Project Studio / Room 116 (`project-studio`). Machine Shop and Computer Lab are excluded for this cohort; their earlier plans/research are retained for future groups. This addendum supersedes earlier four/five-zone planning without changing the stack or coordinate system.

Room 116 navigation is published in main `b2a18e5` (feature `bc0b623`); its NPC work remains #56. Vishan's interactive guide (#47) is ongoing: PRs #46/#48/#59/#61 are open and must not be treated as integrated. No real LLM/backend is approved by this documentation update.

## 1. Product summary

A web-based, photorealistic, freely-navigable 3D tour of the CORE building's first floor at Rutgers, reconstructed via 3D Gaussian Splatting. Users navigate with WASD + mouse (click-to-move remains a future option), and interactive NPC guides deliver scripted information about rooms and facilities. Deliverable is a static website — no backend server.

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
| Hosting | **GitHub Pages**, via `.github/workflows/deploy.yml` (Settings → Pages → Source: GitHub Actions). Live at https://jl42r.github.io/rutgers-tour/ | Cloudflare Pages, or Vercel/Netlify free tier |
| Build tooling | Vite + vanilla JS (or TS) | — |

### Why these choices

**Nerfstudio/gsplat over the original INRIA code:** gsplat uses ~4x less GPU memory and trains faster. On our 8 GB VRAM RTX 5060 this is the difference between fitting and not fitting. It also wraps COLMAP so we never run it by hand.

**Spark over raw Three.js or other viewers:** Three.js cannot render splats natively — a splat renderer library is mandatory. Spark's `SplatMesh` is a `THREE.Object3D`, so the splat scene, NPC sprites, invisible collision walls, and trigger volumes all live in ONE scene graph with correct occlusion and shared coordinates. Spark 2.0 adds Level-of-Detail rendering with a fixed splat budget (near-constant frame cost regardless of scene size), which directly addresses our performance constraint. Targets 98%+ WebGL2 device support including mobile.

**2D NPC overlay as primary (not fallback):** Photoreal environment + low-poly 3D character = uncanny mismatch (we noted this ourselves in the report). A polished 2D portrait + dialogue box reads as an intentional art direction. It uses a DOM interface with keyboard controls and opt-in Web Speech narration. Actual screen-reader acceptance remains unresolved: NVDA failed to announce dialogue/choices (#33). The NPC still has a 3D *presence*: a marker/sprite in the scene at fixed coordinates with a proximity trigger.

**No Python backend:** Scripted dialogue is data, not computation. Storing it as JSON in the frontend means the whole product is static files → free hosting, zero maintenance, infinite scalability, trivially demoable. An interactive guide is now a current priority (#47), with standalone frontend matcher/memory/orchestration PRs under review. The existing typed form only echoes an AI TEST message. This does not approve a live LLM, external service or backend; those still require a separate team architecture/security decision and must never expose secrets in browser code.

## 3. Architecture

### 3.1 Zone-based scenes (important)
The current first-floor tour ships as **three separate zones**: the hallway hub and its printing-room and Room 116 neighbours. The earlier 4–5-zone plan is historical (see `docs/PLAN.md`); Machine Shop/Computer Lab are future-cohort options only.

Reasons: (a) separate training runs fit the laptop's limited memory; (b) separate files support a per-zone size target, which printing room and Room 116 currently exceed; (c) a reconstruction problem stays local to one zone; (d) the runtime loads one zone at a time. Current `src/main.js` switches after a directed doorway crossing; `src/zones.js` releases the previous group and awaits the new Spark `SplatMesh.initialized` promise. Proximity preloading and a transition fade are earlier design ideas, not implemented behavior.

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
- `spawnYaw` — optional initial horizontal facing angle in degrees; default `0` faces negative Z
- `collision` — array of hand-authored AABB `{min, max}` boxes for hallway/printing room; never derived from splat geometry
- `walkingBoundary` — approved Room 116 oriented rectangle, doorway corridor and local exclusion rectangles; resolved separately from the AABB path
- `transitions`, `signs`, `npcs` — existing data-driven door triggers, entrance signs and guide placements

**Current printing-room configuration (2026-10-30; `public/zones.json`):** `origin: [0.7237599145844933, 0.074344140921842, 2.7959428682414633]`, `rotation: [-180, 1.7888941037375379, 0]`, `scale: 2.881555849683783`. Five boundary-wall AABBs leave D1 open. Permanent equipment boxes are not implemented (#66); mapping/debug and optional draft tools are implemented. `debugCollision: false` hides production wireframes.

**Historical 2026-09-14 example, superseded by hallway alignment:** origin `[-0.4239378102298068, 0.074344140921842, 3.17070150997874]`, rotation `[180, 91.78889410373753, 0]`, four wall boxes. Do not copy these earlier values into current configuration.

First zone measured: printing room, tape-measured at 40.8 × 14.3 × 10.8 ft = 12.43584 × 4.35864 × 3.29184 m.

### 3.2 Runtime structure (frontend)
```
index.html
src/
  main.js            // Three.js + Spark setup, render loop
  zones.js           // zone loading/unloading, zones.json driven
  controls.js        // WASD + mouse-look, click-to-move optional later
  collision.js       // hallway/printing-room AABB walls
  room116-boundary.js // approved oriented boundary and doorway corridor
  room116-exclusions.js // approved furniture exclusions
  room116-arrival.js // D3-only inward arrival
  npc.js             // NPC markers, proximity triggers
  dialogue.js        // dialogue UI, narration, completion callbacks
  interaction-tracker.js // persistent configured-NPC completion
  equipment-*.js     // opt-in printing-room mapping/draft tools
public/
  splats/            // three tracked .compressed.ply files
  dialogue/          // one JSON per NPC
  portraits/         // NPC portrait images
  zones.json         // zone origins, bounds, NPC placements, collision boxes
```

### 3.3 Movement & collision
First-person camera at eye height **1.65 m**; WASD/arrow keys move on the ground plane and mouse-look uses Pointer Lock. Player radius is **0.35 m**. Hallway/printing-room collisions use hand-authored AABBs in `zones.json`. Room 116 uses the separately approved oriented solver: a **6.096 × 11.049 m** walking rectangle, D3 corridor and two exclusions (entrance-right forward 0–1.900 / left 0.300–4.236812761805356 m; right-wall strip forward 1.900–11.049 / left 0–1.2192 m). Never collide against splat geometry. Do not change approved Room 116 alignment or geometry without explicit authorization. Touch navigation remains future work.

D1 uses X plane **-0.62295043**, configured trigger Z **[4.80, 6.55]**, hallway crossing negative X / return positive X. D3 uses X plane **1.2642833297509717**, radius-safe trigger Z **[16.505667581697203, 17.573909531203245]**, hallway crossing positive X / return negative X. D3 entry advances to local forward **0.60 m**, with at most **11.1 mm** lateral correction at applicable edge entries; camera height/facing and return crossing positions are preserved. Full unchanged measurements and history are in `docs/ZONES.md` and `docs/ROOM116_INTEGRATION.md`.

### 3.4 NPC & dialogue system
Each NPC is an entry inside its zone's `npcs` array: `{ id, position [x,y,z], radius, portrait, markerImage, dialogueFile, trackerLabel }`. It renders as a portrait/badge sprite with normal depth/occlusion behavior and a proximity-based "Press E to talk" prompt. Main currently uses a fixed marker scale of 0.45; PR #46's visibility improvements are not merged. Hallway has one replayable welcome guide, printing room has five guides, and Room 116 has none yet (#56). The configured Vishan portrait/marker image is missing (#67). Dialogue JSON is a simple node graph:

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

Dialogue UI is DOM over the canvas: portrait, text and choice buttons. Keyboard focus containment/restoration, shortcuts, opt-in Web Speech narration and terminal completion reporting are implemented. `InteractionTracker` reads configured NPC IDs/labels and persists progress; reaching and closing a terminal conversation counts, and conversations remain replayable. Markup and reported visible-keyboard passes do not prove screen-reader access: the recorded NVDA/Chrome announcement failure remains #33. Existing scripts also require factual/subject-matter approval evidence (#20).

Johnny Bambu's `ask-ai` action opens a typed form with submission/follow-up controls, but `showAIResponse` still returns an AI TEST echo. PR #48 supplies a standalone matcher, #59 conversation memory and #61 an injected orchestrator; they are unmerged, use synthetic fixtures and require approved knowledge, adapters, UI integration and browser/accessibility testing (#47).

### 3.5 Delivery format: Compressed PLY (resolved 2026-09-15) — and why not .spz

The decoder diagnosis and upstream status below are the retained 2026 investigation, not a live upstream release audit. The project's tested Spark 2.1.0 compressed-PLY delivery remains the current baseline; no dependency/format change is proposed.

SuperSplat's `.spz` export (tested against v3.0.0-alpha) is not usable for delivery with our current renderer. It produces a well-compressed file — roughly 13x smaller than the uncompressed `.ply` — but Spark fails to load it with `Worker error: Invalid gzip header`, even though SuperSplat reads the same file back without complaint.

**Root cause.** The file is a valid **SPZ v4**, and Spark only reads v1–v3. Confirmed by inspecting the header of `public/splats/test-room.spz`: the first bytes are `4e 47 53 50 04` — ASCII magic `NGSP`, version byte `4`. SPZ v1–v3 wrap the whole payload in gzip (files start with `1f 8b`); v4 dropped the gzip wrapper in favour of a raw `NGSP` header followed by per-attribute ZSTD-compressed streams. Spark's viewer decodes `.spz` in a Rust WASM worker that expects the gzip wrapper, so a v4 file fails at the first byte. Upstream v4 support is `sparkjsdev/spark` PR #332 (opened May 2026, reviewed, still unmerged as of August 2026) — no released Spark version reads v4, so upgrading `@sparkjsdev/spark` does not fix this.

**Resolution: Compressed PLY, confirmed working 2026-09-15.** SuperSplat's Compressed PLY export loads in Spark 2.1.0 — option (1) below, the cheapest one, worked. The printing room ships as `public/splats/printing-room-updated.compressed.ply` (62,132,080 bytes), committed to the repo with a `.gitignore` negation past the blanket `*.ply` rule, and renders with LOD enabled (`lodSplatCount` 500000, pixel ratio 1). `.spz` is abandoned, not pending; do not spend time on it again unless PR #332 lands.

Options considered, cheapest first — (1) is what we took:
1. **Compressed PLY** from SuperSplat. Adopted.
2. `.sog` from SuperSplat — also on Spark's supported-format list. Never needed; remains the fallback if Compressed PLY ever fails on a future zone.
3. Transcode v4 → v3 with Niantic's reference `spz` tool. Rejected — a pipeline step for no gain over (1).

**Current asset inventory (2026-10-30):** hallway 19,617,110 bytes; printing room 62,132,080; Room 116 68,849,656. All are SH3; combined size **150,598,846 bytes** is not a measured route's network transfer. Printing room and Room 116 exceed the target. The 55 tracked Room 116 tests are not yet run by CI (#68); install/build/deployment success is not runtime acceptance.

**The open problem is size, not format.** The printing room's 62 MB is over our 50 MB target, and this is a delivery
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

Retained reference for existing-data research and future cohorts. The current team is not adding environments; do not initiate capture, retraining or replacement exports from this summary. Follow the repository skills for separately authorized work.

1. **Capture** a zone: 4K video, slow walk, high overlap, loop closure, even lighting. (Full protocol in `.claude/skills/capture-protocol/SKILL.md`.)
2. **Extract & pose**: `ns-process-data video --data zone.MOV --output-dir data/zoneX` (runs COLMAP). Frame target is an open question — see the capture-protocol skill before picking one.
3. **Train**: `ns-train splatfacto --data data/zoneX`. Watch in the Nerfstudio viewer; ~30k steps.
4. **Export**: `ns-export gaussian-splat ... ` → .ply
5. **Clean**: open .ply in SuperSplat → delete floaters, crop to room bounds, perform privacy cleanup → preserve reconstruction coordinates → export **Compressed PLY**.
   **Caveat, unresolved:** on the printing room the team observed visual quality getting *worse* after cleanup, so the shipped Zone 1 file is uncleaned. The cause was never diagnosed. Until someone does, treat aggressive cleanup as a change that needs an A/B look in the browser, not a free win — and prefer SH band reduction as the size lever.
6. **Budget check**: measure bytes/load time/FPS on representative hardware. The historical goals are <50 MB/zone and 30+ FPS, not verified current results. Compare SH bands side by side on experimental copies and obtain user approval before replacing any asset; do not lower quality automatically to meet the target.
7. **Integrate and calibrate**: drop into `public/splats/`, add the zone entry, then set `rotation`, uniform `scale`, and `origin` in `zones.json` to put the floor at world y=0 and match physical meters. Do not bake those transforms into the PLY.

## 5. Hardware notes
- Training machine: laptop RTX 5060, **8 GB VRAM** (documented minimum for this pipeline), 16 GB system RAM.
- Historical RAM-budget guidance proposed ~300 frames; successful printing/hallway captures used larger targets (see the pipeline field notes). That original cap is not a current proven maximum. Retain downscaling/memory research in `docs/SETUP_TRAINING.md`; do not invent a replacement frame standard.
- Earlier OOM planning considered splitting zones. That is historical/future-cohort research, not authorization to add environments to the current three-zone deliverable. Existing-data investigation uses Johnny's documented WSL2 setup.
- gsplat JIT-compiles its CUDA kernels on first GPU use — the first training run after a fresh venv pays a one-time compile cost before training itself starts. This compile is memory-hungry enough to get OOM-killed under WSL2's default RAM allocation; see `docs/SETUP_TRAINING.md` for the `MAX_JOBS` and `.wslconfig` settings that fixed it on our machine.

## 6. Schedule

Schedule, milestones, and decision gates live in `docs/PLAN.md`. This document does not
duplicate dates — if you need to know when something is due, that is the wrong file.

## 6a. Fallback options

Historical technical fallback research, retained without dates. The published three-zone deliverable is now the reference; none of these options authorizes adding/removing zones, changing navigation or replacing approved assets without a new explicit decision.

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
- *Performance/loading*: three compressed PLYs, <50 MB/zone target (printing room and studio exceed it), Spark LOD 500k/pixel ratio 1, one-zone-at-a-time loading. SH visual comparisons and current FPS/load baselines remain #8/#23/#24/#25/#34.
- *Accessibility*: DOM dialogue, markers, keyboard focus controls and opt-in narration are implemented; actual screen-reader acceptance remains unresolved (#33).
- *Privacy*: capture during off-hours, no people in frames, blur/exclude posted personal info in SuperSplat cleanup, get building permission in writing.
- *Standards*: HTML/CSS/JS, WebGL2 (98%+ support), static hosting.
