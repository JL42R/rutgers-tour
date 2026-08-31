# Rutgers CORE Virtual Tour

A web-based, photorealistic 3D tour of the CORE building first floor, built with 3D Gaussian Splatting. Senior Design, Group 9.

**Read `DESIGN.md` first** — it is the project bible (all technical decisions + roadmap). `docs/PLAN.md` has the schedule and team roles. `AGENTS.md` is instructions for AI assistants and is read automatically by Claude Code and other AGENTS.md-aware tools.

## Which doc do I need?

New teammate? Start with [`docs/ONBOARDING.md`](docs/ONBOARDING.md) — one-time setup, about half a day. Already set up? This README is your day-to-day reference.

## Run it (2 minutes)

Requirements: [Node.js LTS](https://nodejs.org) installed.

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). Click the scene, walk with **WASD**, look with the mouse, press **E** near the floating badge to talk to the demo NPC, **Esc** to release the mouse.

You'll see a gray placeholder room — that's expected. It gets replaced by real captured scans of CORE as zones are trained (see below).

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
public/splats/      trained .spz / .compressed.ply zone files go here
.claude/skills/     pipeline procedures — auto-loaded by Claude Code, readable by any AI assistant
```

## Adding a real captured zone

Follow `.claude/skills/training-pipeline/SKILL.md` (or just ask your AI assistant: *"walk me through processing my new capture"* — Claude Code auto-loads this skill; with other tools, point it at the file directly). Short version: capture → `ns-process-data` → `ns-train splatfacto` → export → clean in SuperSplat → drop the file in `public/splats/` → update `zones.json`.

## Working with AI coding assistants

Any AI coding assistant works here via `AGENTS.md` — it holds all the project context. Claude Code and Gemini CLI both pick it up automatically (`CLAUDE.md` and `GEMINI.md` are thin pointers to it); Claude Code also loads the skills when relevant. After every work session, update the status checklist at the bottom of `AGENTS.md`.

## Deploying

`npm run build` produces a static site in `dist/`. Host on GitHub Pages or Cloudflare Pages — there is no backend.
