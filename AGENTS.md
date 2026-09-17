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
- Scene is split into 4–5 ZONES, trained and shipped separately. **Star topology: the hallway is the hub.** Every transition is hallway↔room, never room↔room, so the hallway is the shared reference frame every other zone aligns against. Convention: 1 unit = 1 meter, floor at y=0.
- COLMAP/splatfacto output is in an arbitrary coordinate space. Correction is NOT baked into the splat file — `rotation` (Euler degrees), `scale` (uniform), and `origin` are per-zone fields in `public/zones.json`, applied at load time by `src/zones.js` as scale, XYZ Euler rotation, then origin. Editing JSON and reloading is the iteration loop.
- Cleanup in SuperSplat. Delivery format is **Compressed PLY**, confirmed loading in Spark 2.1.0 and committed to the repo. Size target is < 50 MB per zone; the shipped printing room is 62 MB, so the target is not met yet and SH band selection is the lever. See "Known blockers" — `.spz` remains unloadable.
- Web: Vite + Three.js + Spark (`@sparkjsdev/spark` ^2.1.0). `SplatMesh` is a `THREE.Object3D`; NPCs/colliders live in the same scene graph.
- Navigation: first-person, WASD + Pointer Lock mouse-look, eye height 1.65 m. Collision = hand-authored AABBs in `zones.json`, NEVER against splat geometry.
- NPCs: 2D portrait + DOM dialogue overlay (visual-novel style), proximity-triggered via markers placed at coordinates in `zones.json`. Dialogue = JSON node graphs in `public/dialogue/`. NO 3D characters.
- NO backend. Everything is static files. Hosting: GitHub Pages / Cloudflare Pages.
- Scripted dialogue only through final lock (see `docs/PLAN.md`). LLM dialogue is future work.

## Repo layout
src/{main,zones,controls,collision,npc,dialogue}.js · public/{splats,dialogue,zones.json}
(`public/portraits/` is planned but does not exist yet. `public/dialogue/` holds `mohsen_jafari.json`. The printing-room zone has no NPC placements in `zones.json` — that work exists only on teammates' local machines; see issues #9 and #20.)

## Known blockers (verified — do not "fix" by guessing)
- **`.spz` from SuperSplat does not load in Spark — do not retry it.** Root cause confirmed 2026-09-11 by inspecting the file header: SuperSplat (v3.0.0-alpha) exports SPZ **v4** (`NGSP` magic, ZSTD streams). Spark's WASM decoder only reads gzip-wrapped SPZ v1–v3 and fails with `Worker error: Invalid gzip header`. Upstream fix is `sparkjsdev/spark` PR #332, still unmerged as of Aug 2026 — no released Spark version reads v4, so bumping Spark does not help. **Resolved in practice by Compressed PLY**, which Spark 2.1.0 loads; `.spz` itself is still dead. Issue #8.
- **Zone files are over the size target.** The shipped `printing-room-updated.compressed.ply` is 62,132,080 bytes against a < 50 MB target. The file is band-3 spherical harmonics: 1,013,854 splats × (16 + 45 bytes) ≈ 61.85 MB plus chunk metadata, so **SH is 74% of the file**. Projected: band 1 ≈ 26 MB, band 0 ≈ 16.5 MB. Decision pending — test band 1 and band 0 side by side and compare visual cost before setting a project standard. SH Bands is SuperSplat's export setting, default 3. Issue #8.
- **Raw `.ply` and raw capture video never enter Git.** The raw printing-room export is ~240 MB, over GitHub's 100 MB hard limit. `.gitignore` excludes `*.ply` and re-includes `public/splats/*.compressed.ply` by pattern, so a zone named `<zone>.compressed.ply` is tracked automatically and raw exports are not. Raw captures live in the Drive folder linked in `docs/ONBOARDING.md`.

## Zone 1 — printing room (official CORE zone, done; verified in browser 2026-09-14)
- Not a test zone. Captured 2026-09-09 (451/452 frames registered, 99.78%), trained 30k iterations, aligned, collision authored, shipped as `public/splats/printing-room-updated.compressed.ply`.
- Calibrated transform in `public/zones.json`: `origin: [-0.4239378102298068, 0.074344140921842, 3.17070150997874]`, `rotation: [180, 91.78889410373753, 0]`, `scale: 2.881555849683783`.
- Four collision boundary walls use the measured physical room dimensions, 12.43584 × 4.35864 × 3.29184 m. `debugCollision: true` temporarily draws their cyan wireframe over the real splat.
- Runtime rotation, uniform scale, and origin are confirmed working in the browser. Compressed PLY loads in Spark 2.1.0 with LOD enabled (`lodSplatCount` 500000, pixel ratio 1). A fresh clone renders this zone with no download step.
- SuperSplat cleanup was **skipped** on this zone: the team observed visual quality getting worse when they cleaned it. Cause unknown and uninvestigated.

## How to behave in sessions
- The team are beginners: explain what code does in one or two sentences when writing it, prefer small working increments over big rewrites, and always give the exact commands to run.
- When editing the repo, follow existing conventions in the files; don't restructure.
- If a task involves the capture/train/export pipeline, follow `.claude/skills/capture-protocol` and `.claude/skills/training-pipeline` exactly.
- Windows laptop; Nerfstudio runs in WSL2 Ubuntu. Give WSL commands for training, PowerShell/Windows for everything else unless told otherwise.
- Before claiming something is "not built yet" or "still broken", check `CHANGELOG.md` and GitHub Issues — not this file, which holds no task state.

## Task state
**Task state lives in GitHub Issues, not here.** The milestone board is the only maintained record of what is open, done, or in progress; any checklist in a Markdown file will be stale.

This file holds locked decisions and verified blockers only. `CHANGELOG.md` records what changed and when.
