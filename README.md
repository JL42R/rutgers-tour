# Rutgers CORE Virtual Tour

A web-based, photorealistic 3D tour of the CORE building first floor, built with 3D Gaussian Splatting. Senior Design, Group 9.

**Read `DESIGN.md` first** — it is the project bible (all technical decisions + roadmap). `docs/PLAN.md` has the schedule and team roles. `AGENTS.md` is instructions for AI assistants and is read automatically by Claude Code and other AGENTS.md-aware tools.

## Which doc do I need?

New teammate? Start with [`docs/ONBOARDING.md`](docs/ONBOARDING.md) — one-time setup, about half a day. Already set up? This README is your day-to-day reference. Integration lead setting up the training environment? Use [`docs/SETUP_TRAINING.md`](docs/SETUP_TRAINING.md) instead — WSL2/CUDA/Nerfstudio setup is Johnny-only; everyone else stays on `docs/ONBOARDING.md`.

**Current scope — confirmed 2026-10-30:** exactly three environments: CORE Hallway (`hallway`), 3D Printing Room (`printing-room`), and Project Studio / Room 116 (`project-studio`). Machine Shop and Computer Lab are excluded from this team's deliverable; their research is preserved for possible future student groups.

## Run it (2 minutes)

Requirements: [Node.js LTS](https://nodejs.org) installed.

```powershell
npm.cmd install
npm.cmd run dev
```

These are Windows PowerShell commands. On other platforms use `npm` in place of `npm.cmd`.

Open the URL Vite prints (usually http://localhost:5173). The tour starts in the **hallway**, with an automatic welcome and persistent Tour Progress. Close the dialogue, click the scene, move with **WASD**, look with the mouse, and press **Esc** to release the mouse. Approach a guide and press **E** to talk.

Walk through **D1**, the marked negative-X hallway doorway, to enter the 3D Printing Room and meet its five guides. Return to the hallway and continue toward positive Z to **D3**, the marked positive-X doorway near the far end, to enter Project Studio / Room 116. Both doorways support returning to the hallway. The route is optional. Room 116 navigation, boundaries, exclusions, entrance sign and arrival behavior are implemented; **Room 116 has no NPCs yet** ([#56](https://github.com/JL42R/rutgers-tour/issues/56)).

All three compressed PLY assets ship in the repository, so a fresh clone needs no separate asset download: hallway **19,617,110 bytes**, printing room **62,132,080 bytes**, and Room 116 **68,849,656 bytes**. Spark 2.1.0 loads this delivery format. The tested SPZ v4 export does not load in this project's decoder; keep using compressed PLY. Raw uncompressed exports and capture video stay out of Git — see [onboarding](docs/ONBOARDING.md#7a-the-splat-files).

## Project layout

```
index.html          page shell + dialogue/HUD styling
src/main.js         entry point — start reading here
src/controls.js     WASD + mouse look
src/collision.js    hallway/printing-room AABB collisions
src/room116-*.js    approved oriented boundary, exclusions and D3 arrival
src/zones.js        loads splat scenes (or placeholder rooms)
src/npc.js          NPC markers + proximity detection
src/dialogue.js     conversation UI + opt-in narration
src/interaction-tracker.js  persistent conversation progress
src/equipment-*.js  opt-in printing-room mapping/draft tools
tests/              three tracked Room 116 regression files
public/zones.json   THE map: zones, walls, NPC placement — most edits happen here
public/dialogue/    one JSON per NPC's conversation — writers edit these, no code
public/splats/      compressed zone files, committed; raw PLYs stay out of Git
.claude/skills/     pipeline procedures — auto-loaded by Claude Code, readable by any AI assistant
```

## Checks and current limitations

```powershell
node --test tests/room116-boundary.test.js tests/room116-exclusions.test.js tests/room116-entry.test.js
npm.cmd run build
```

The tracked Room 116 suite has **55 tests**. Run it explicitly: there is no package test script or CI test step yet ([#68](https://github.com/JL42R/rutgers-tour/issues/68)). A successful build is not browser or accessibility acceptance.

Room 116 NPCs remain priority 1 (#56); Vishan's interactive guide is priority 2 (#47). PRs #46, #48, #59 and #61 are still open, not production functionality. Johnny's typed-question form currently returns an **AI TEST echo**. Other outstanding work: missing Vishan portrait/marker image (#67), permanent printing-room equipment collision boxes (#66), actual NVDA acceptance failure (#33), and three-zone quality/SH-band/performance comparisons (#8/#23/#24/#25/#34). Existing scripts do not by themselves establish faculty/content approval (#20).

## Pipeline reference for future cohorts

The current team is not adding environments. Capture/training/export procedures remain in `.claude/skills/capture-protocol/SKILL.md`, `.claude/skills/training-pipeline/SKILL.md` and `docs/SETUP_TRAINING.md` for existing-data research and future-group handoff. Preserve the original reconstruction coordinates and approved transforms; do not crop, recompress or change approved geometry without explicit authorization.

## Working with AI coding assistants

Any AI coding assistant works here via `AGENTS.md` — it holds all the project context. Claude Code and Gemini CLI both pick it up automatically (`CLAUDE.md` and `GEMINI.md` are thin pointers to it); Claude Code also loads the skills when relevant. After every work session, update the relevant GitHub Issue and add a `CHANGELOG.md` entry — those are the maintained records, not a checklist in a doc.

## Deploying

`npm.cmd run build` produces static files in `dist/`. The existing GitHub Pages workflow builds and deploys main; there is no backend. Room 116 implementation `bc0b623` was published in integrated main `b2a18e5`, and [Pages run 40986520793](https://github.com/JL42R/rutgers-tour/actions/runs/40986520793) succeeded. The user reported 41/41 stage approvals and 14/14 integrated Chrome checks. Firefox, Safari and current three-zone cold-cache/network measurements remain outstanding (#11). See [the integration record](docs/ROOM116_INTEGRATION.md).
