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

## Confirmed current scope (2026-10-30)

- Exactly three active environments: `hallway`, `printing-room`, `project-studio` (Room 116).
- Machine Shop and Computer Lab are excluded from this team's deliverable. Do not plan, capture, train or implement additional environments. Preserve their historical research for future cohorts.
- Current priorities: Room 116 NPCs/dialogue (#56), then Vishan's interactive guide (#47), then quality/performance on the three existing environments. These are ongoing tasks, not completed features.
- Room 116 navigation/alignment/boundaries/exclusions/sign/arrival are approved and published. **Never alter approved Room 116 transforms, geometry or D3 behavior without explicit authorization.** Future NPC work must preserve D1/D3, the hallway welcome, existing printing-room conversations and Tour Progress.

## Locked decisions (do not change without explicit approval)
- Training: Nerfstudio `splatfacto` (gsplat backend) on a laptop RTX 5060 (8 GB VRAM, 16 GB RAM), in WSL2 Ubuntu 24.04. COLMAP via `ns-process-data` (currently CPU-only).
- Scene is split into exactly **three active zones**, trained and shipped separately. **Star topology: the hallway is the hub.** Every transition is hallway↔room, never room↔room, so the hallway is the shared reference frame every other zone aligns against. Convention: 1 unit = 1 meter, floor at y=0.
- COLMAP/splatfacto output is in an arbitrary coordinate space. Correction is NOT baked into the splat file — `rotation` (Euler degrees), `scale` (uniform), and `origin` are per-zone fields in `public/zones.json`, applied at load time by `src/zones.js` as scale, XYZ Euler rotation, then origin. Editing JSON and reloading is the iteration loop.
- Cleanup in SuperSplat. Delivery format is **Compressed PLY**, confirmed loading in Spark 2.1.0 and committed to the repo. Size target is < 50 MB per zone; the shipped printing room is 62 MB, so the target is not met yet and SH band selection is the lever. See "Known blockers" — `.spz` remains unloadable.
- Web: Vite + Three.js + Spark (`@sparkjsdev/spark` ^2.1.0). `SplatMesh` is a `THREE.Object3D`; NPCs/colliders live in the same scene graph.
- Navigation: first-person, WASD + Pointer Lock mouse-look, eye height 1.65 m. Hallway/printing-room collision uses hand-authored AABBs in `zones.json`. Room 116 has its separately approved oriented walking-boundary/exclusion solver in `src/room116-boundary.js` and `src/room116-exclusions.js`. Collision is NEVER against splat geometry.
- NPCs: 2D portrait + DOM dialogue overlay (visual-novel style), proximity-triggered via markers placed at coordinates in `zones.json`. Dialogue = JSON node graphs in `public/dialogue/`. NO 3D characters.
- NO backend. Everything is static files. GitHub Pages deployment through `.github/workflows/deploy.yml` is implemented and live; Cloudflare Pages remains a fallback.
- Current dialogue is frontend JSON, with a typed-question prototype that returns an AI TEST echo. Vishan's interactive-guide work (#47) is ongoing. Open PRs #46 (discoverability), #48 (matcher), #59 (memory) and #61 (orchestrator) **must not be assumed merged or integrated**. A real LLM/service/API/backend still needs separate explicit architecture/security approval; this scope update does not grant it.

## Repo layout
src/{main,zones,controls,collision,npc,dialogue,interaction-tracker}.js · src/room116-*.js · src/equipment-*.js · public/{splats,dialogue,portraits,zones.json} · tests/
(`public/portraits/` contains four Johnny assets. Printing-room has five NPC placements; hallway has one guide; Room 116 has none yet.)

## Current limitations (verified 2026-10-30)

- Room 116 NPCs/content are not implemented (#56); existing script operation does not establish factual/subject-matter approval (#20).
- `public/portraits/vishan.png` is referenced but absent (#67). Do not invent a replacement image.
- Printing-room permanent equipment collision boxes are unfinished (#66); PR #65 shipped mapping/debug/draft tools, not measured production boxes. Preserve its five wall AABBs.
- The three tracked Room 116 files contain 55 tests; run `node --test tests/room116-boundary.test.js tests/room116-exclusions.test.js tests/room116-entry.test.js`, then `npm.cmd run build`. CI currently runs install/build only (#68).
- NVDA/Chrome dialogue announcements failed in the recorded actual screen-reader test (#33); visible keyboard passes and narration do not resolve that failure.
- Quality, lower-SH visual comparisons and current three-zone load/FPS measurements remain planned (#8/#23/#24/#25/#34). Do not trade image quality for the size target without side-by-side testing and user approval.

## Known blockers (verified — do not "fix" by guessing)
- **`.spz` from SuperSplat does not load in Spark — do not retry it.** Root cause confirmed 2026-09-11 by inspecting the file header: SuperSplat (v3.0.0-alpha) exports SPZ **v4** (`NGSP` magic, ZSTD streams). Spark's WASM decoder only reads gzip-wrapped SPZ v1–v3 and fails with `Worker error: Invalid gzip header`. The original investigation recorded upstream `sparkjsdev/spark` PR #332 as unmerged in Aug 2026; that is historical evidence, not a current upstream release audit. The installed project decoder remains the tested baseline; do not change dependencies or retry SPZ by assumption. **Resolved in practice by Compressed PLY**, which Spark 2.1.0 loads; `.spz` itself is still dead. Issue #8.
- **Zone files are over the size target.** All three shipped assets are SH3: hallway 19,617,110 bytes, printing room 62,132,080, Room 116 68,849,656. The latter two exceed the target. The shipped `printing-room-updated.compressed.ply` is 62,132,080 bytes against a < 50 MB target. The file is band-3 spherical harmonics: 1,013,854 splats × (16 + 45 bytes) ≈ 61.85 MB plus chunk metadata, so **SH is 74% of the file**. Projected: band 1 ≈ 26 MB, band 0 ≈ 16.5 MB. Decision pending — test band 1 and band 0 side by side and compare visual cost before setting a project standard. SH Bands is SuperSplat's export setting, default 3. Issue #8.
- **Raw `.ply` and raw capture video never enter Git.** The raw printing-room export is ~240 MB, over GitHub's 100 MB hard limit. `.gitignore` excludes `*.ply` and re-includes `public/splats/*.compressed.ply` by pattern, so a zone named `<zone>.compressed.ply` is tracked automatically and raw exports are not. Raw captures live in the Drive folder linked in `docs/ONBOARDING.md`.

## Zone 1 — printing room (official CORE zone, done; verified in browser 2026-09-14)
- Not a test zone. Captured 2026-09-09 (451/452 frames registered, 99.78%), trained 30k iterations, aligned, collision authored, shipped as `public/splats/printing-room-updated.compressed.ply`.
- Hallway-aligned transform in `public/zones.json`: `origin: [0.7237599145844933, 0.074344140921842, 2.7959428682414633]`, `rotation: [-180, 1.7888941037375379, 0]`, `scale: 2.881555849683783`. A data-driven doorway transition connects the two captured zones.
- Five collision wall boxes preserve the measured 12.43584 × 4.35864 × 3.29184 m room boundary while leaving the aligned hallway doorway open. `debugCollision: false` keeps their cyan wireframe hidden in the current build.
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
