# Rutgers CORE Virtual Tour

A web-based, photorealistic 3D tour of the CORE building first floor, built with 3D Gaussian Splatting. Senior Design, Group 9.

**Read `DESIGN.md` first** — it is the project bible (all technical decisions + roadmap). `docs/PLAN.md` has the schedule and team roles. `AGENTS.md` is instructions for AI assistants and is read automatically by Claude Code and other AGENTS.md-aware tools.

## Which doc do I need?

New teammate? Start with [`docs/ONBOARDING.md`](docs/ONBOARDING.md) — one-time setup, about half a day. Already set up? This README is your day-to-day reference. Integration lead setting up the training environment? Use [`docs/SETUP_TRAINING.md`](docs/SETUP_TRAINING.md) instead — WSL2/CUDA/Nerfstudio setup is Johnny-only; everyone else stays on `docs/ONBOARDING.md`.

## Run it (2 minutes)

Requirements: [Node.js LTS](https://nodejs.org) installed.

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). Click the scene, walk with **WASD**, look with the mouse, and press **Esc** to release the mouse. NPC interaction is implemented, and the current printing-room zone has five NPC placements.

Zone 1, the printing room, is committed to the repo as a 62 MB Compressed PLY, so a fresh clone renders the real scan with no download step. Compressed PLY is our delivery format — Spark 2.1.0 loads it. (SPZ v4, which the tested SuperSplat version exports, is not readable by any released Spark decoder; don't go down that path.) Raw uncompressed PLYs and raw capture video stay out of Git and live in Drive — see [onboarding](docs/ONBOARDING.md#7a-the-splat-files).

## Project layout

```
index.html          page shell + dialogue/HUD styling
src/main.js         entry point — start reading here
src/controls.js     WASD + mouse look
src/collision.js    invisible walls
src/zones.js        loads splat scenes (or placeholder rooms)
src/npc.js          NPC markers + proximity detection
src/dialogue.js     conversation UI
public/zones.json   THE map: zones, walls, NPC placement — most edits happen here
public/dialogue/    one JSON per NPC's conversation — writers edit these, no code
public/splats/      compressed zone files, committed; raw PLYs stay out of Git
.claude/skills/     pipeline procedures — auto-loaded by Claude Code, readable by any AI assistant
```

## Adding a real captured zone

Follow `.claude/skills/training-pipeline/SKILL.md` (or just ask your AI assistant: *"walk me through processing my new capture"* — Claude Code auto-loads this skill; with other tools, point it at the file directly). Short version: capture → `ns-process-data` → `ns-train splatfacto` → export → clean in SuperSplat → drop the file in `public/splats/` → update `zones.json`.

## Working with AI coding assistants

Any AI coding assistant works here via `AGENTS.md` — it holds all the project context. Claude Code and Gemini CLI both pick it up automatically (`CLAUDE.md` and `GEMINI.md` are thin pointers to it); Claude Code also loads the skills when relevant. After every work session, update the relevant GitHub Issue and add a `CHANGELOG.md` entry — those are the maintained records, not a checklist in a doc.

## Deploying

`npm run build` produces a static site in `dist/`. GitHub Pages deployment is implemented through `.github/workflows/deploy.yml`: pushes and merges to `main` build and deploy the static Vite site. The current public deployment has been successfully verified for the printing-room build. There is no backend.
