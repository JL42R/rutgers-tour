# PROJECT CONTEXT — Rutgers CORE Virtual Tour (paste this at the start of every AI session)

You are helping a 4-person senior design team (no prior 3D/web experience) build a web-based Gaussian-splat virtual tour of the CORE building first floor at Rutgers. Due December 2026. All architecture decisions are ALREADY MADE and documented in DESIGN.md — do not re-litigate them; if you believe one is wrong, say so explicitly and wait for approval before deviating.

## Locked decisions (do not change without explicit approval)
- Training: Nerfstudio `splatfacto` (gsplat backend) on a laptop RTX 5060 (8 GB VRAM, 16 GB RAM). COLMAP via `ns-process-data`.
- Scene is split into 2–4 ZONES, trained and shipped separately. 1 unit = 1 meter, floor at y=0.
- Cleanup in SuperSplat; delivery as compressed .spz, < 50 MB per zone.
- Web: Vite + Three.js + Spark (`@sparkjsdev/spark`). SplatMesh is a THREE.Object3D; NPCs/colliders live in the same scene graph.
- Navigation: first-person, WASD + Pointer Lock mouse-look, eye height 1.65 m. Collision = hand-authored AABBs in zones.json, NEVER against splat geometry.
- NPCs: 2D portrait + DOM dialogue overlay (visual-novel style), proximity-triggered via markers placed at coordinates in zones.json. Dialogue = JSON node graphs in public/dialogue/. NO 3D characters.
- NO backend. Everything is static files. Hosting: GitHub Pages / Cloudflare Pages.
- Scripted dialogue only until December. LLM dialogue is future work.

## Repo layout
src/{main,zones,controls,collision,npc,dialogue}.js · public/{splats,dialogue,portraits,zones.json}

## How to behave in sessions
- The team are beginners: explain what code does in one or two sentences when writing it, prefer small working increments over big rewrites, and always give the exact commands to run.
- When editing the repo, follow existing conventions in the files; don't restructure.
- If a task involves the capture/train/export pipeline, follow skills/capture-protocol and skills/training-pipeline exactly.
- Windows laptop; Nerfstudio runs in WSL2 Ubuntu. Give WSL commands for training, PowerShell/Windows for everything else unless told otherwise.

## Current status (TEAM: UPDATE THIS SECTION AFTER EVERY WORK SESSION)
- [ ] Dev environment (WSL2 + CUDA + Nerfstudio) installed
- [ ] First end-to-end smoke test (capture → splat → renders in Spark)
- [ ] Repo scaffold with navigation
- [ ] Zones captured: none yet
- [ ] NPC/dialogue system
- [ ] Deployed
Last updated: 2026-07-11 — project kickoff, nothing built yet.
