# PROJECT CONTEXT — Rutgers CORE Virtual Tour (paste this at the start of every AI session)

You are helping a 4-person senior design team (no prior 3D/web experience) build a web-based Gaussian-splat virtual tour of the CORE building first floor at Rutgers. Deadline and schedule live in `docs/PLAN.md` — do not hardcode dates here. All architecture decisions are ALREADY MADE and documented in `DESIGN.md` — do not re-litigate them; if you believe one is wrong, say so explicitly and wait for approval before deviating.

## Where to look
- `docs/PLAN.md` — schedule and gates
- `DESIGN.md` — architecture and technical decisions
- `CHANGELOG.md` — what changed and when (read the newest entry before touching anything)
- `docs/ONBOARDING.md` — teammate setup (Node + Vite only)
- `docs/SETUP_TRAINING.md` — WSL2/CUDA/Nerfstudio setup, Johnny's laptop only. Holds the venv patches (`weights_only=False` in `eval_utils.py`, `MAX_JOBS=2`, `.wslconfig`) that are NOT version-controlled and must be reapplied if the venv is rebuilt
- `.claude/skills/capture-protocol/SKILL.md` and `.claude/skills/training-pipeline/SKILL.md` — pipeline procedures
- GitHub Issues — current task state

## Locked decisions (do not change without explicit approval)
- Training: Nerfstudio `splatfacto` (gsplat backend) on a laptop RTX 5060 (8 GB VRAM, 16 GB RAM), in WSL2 Ubuntu 24.04. COLMAP via `ns-process-data` (currently CPU-only).
- Scene is split into 2–4 ZONES, trained and shipped separately. Convention: 1 unit = 1 meter, floor at y=0.
- COLMAP/splatfacto output is in an arbitrary coordinate space. Correction is NOT baked into the splat file — `rotation` (Euler degrees), `scale` (uniform), and `origin` are per-zone fields in `public/zones.json`, applied at load time by `src/zones.js` as scale, XYZ Euler rotation, then origin. Editing JSON and reloading is the iteration loop.
- Cleanup in SuperSplat. Delivery target: compressed, < 50 MB per zone. See "Known blockers" — `.spz` is currently NOT loadable and `.ply` is the interim workaround.
- Web: Vite + Three.js + Spark (`@sparkjsdev/spark` ^2.1.0). `SplatMesh` is a `THREE.Object3D`; NPCs/colliders live in the same scene graph.
- Navigation: first-person, WASD + Pointer Lock mouse-look, eye height 1.65 m. Collision = hand-authored AABBs in `zones.json`, NEVER against splat geometry.
- NPCs: 2D portrait + DOM dialogue overlay (visual-novel style), proximity-triggered via markers placed at coordinates in `zones.json`. Dialogue = JSON node graphs in `public/dialogue/`. NO 3D characters.
- NO backend. Everything is static files. Hosting: GitHub Pages / Cloudflare Pages.
- Scripted dialogue only through final lock (see `docs/PLAN.md`). LLM dialogue is future work.

## Repo layout
src/{main,zones,controls,collision,npc,dialogue}.js · public/{splats,dialogue,zones.json}
(`public/portraits/` is planned but does not exist yet. Demo dialogue JSON files remain, but the printing-room zone currently has no NPC placements.)

## Known blockers (verified — do not "fix" by guessing)
- **`.spz` from SuperSplat does not load in Spark.** Root cause confirmed 2026-09-11 by inspecting the file header: SuperSplat (v3.0.0-alpha) exports SPZ **v4** (`NGSP` magic, ZSTD streams). Spark's WASM decoder only reads gzip-wrapped SPZ v1–v3 and fails with `Worker error: Invalid gzip header`. Upstream fix is `sparkjsdev/spark` PR #332, still unmerged as of Aug 2026 — no released Spark version reads v4, so bumping Spark does not help. The next delivery-format test is **Compressed PLY** from SuperSplat (Spark supports it; already the listed alternative in `DESIGN.md`). `.sog` is the fallback. Issue #8.
- **Splat files are shared via Google Drive, not Git.** The raw printing-room `.ply` is approximately 240 MB; GitHub rejects files > 100 MB, so `*.ply` is gitignored. `zones.json` references `./splats/printing-room-updated.ply`, which a fresh clone does NOT have — the app falls back to the placeholder room until you download it from the Drive folder linked in `docs/ONBOARDING.md`. Once Compressed PLY works, un-ignore finished compressed zone files so they can be committed; keep the raw PLY outside Git.

## Printing-room alignment (verified in browser 2026-09-14)
- Calibrated transform in `public/zones.json`: `origin: [-0.4239378102298068, 0.074344140921842, 3.17070150997874]`, `rotation: [180, 91.78889410373753, 0]`, `scale: 2.881555849683783`.
- Four collision boundary walls use the measured physical room dimensions, 12.43584 × 4.35864 × 3.29184 m. `debugCollision: true` temporarily draws their cyan wireframe over the real splat.
- Runtime rotation, uniform scale, and origin are confirmed working in the browser. The next major blocker is performance and compressed delivery: measure FPS/load time, then test Compressed PLY.

## How to behave in sessions
- The team are beginners: explain what code does in one or two sentences when writing it, prefer small working increments over big rewrites, and always give the exact commands to run.
- When editing the repo, follow existing conventions in the files; don't restructure.
- If a task involves the capture/train/export pipeline, follow `.claude/skills/capture-protocol` and `.claude/skills/training-pipeline` exactly.
- Windows laptop; Nerfstudio runs in WSL2 Ubuntu. Give WSL commands for training, PowerShell/Windows for everything else unless told otherwise.
- Before claiming something is "not built yet" or "still broken", check `CHANGELOG.md` — this status block lags it.

## Current status (TEAM: UPDATE THIS SECTION AFTER EVERY WORK SESSION)
- [x] Dev environment (WSL2 + CUDA + Nerfstudio) installed — PyTorch 2.11.0+cu128, sm_120 confirmed, gsplat kernels compiled
- [x] First end-to-end smoke test (capture → splat → renders in Spark) — **G1 passed 2026-09-09**
- [x] Repo scaffold with navigation (WASD, mouse-look, AABB collision)
- [x] NPC/dialogue system code (proximity trigger, node-graph JSON, DOM overlay) — demo dialogue files remain; no NPCs are placed in the printing-room zone
- [ ] CORE production zones captured — none yet. Printing-room test zone captured (451/452 frames registered, trained 30k iters) and aligned.
- [x] Printing-room splat positioned and scaled to the 1 m convention (#6) — runtime transform verified in the browser
- [ ] Performance baseline and compressed delivery format working (#8) — measure FPS/load time, then test Compressed PLY
- [ ] Deployed / static hosting tested
Last updated: 2026-09-14 — printing-room alignment verified in browser; performance and Compressed PLY are next.
