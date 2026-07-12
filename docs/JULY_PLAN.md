# July Solo Plan & August Team Onboarding
**For the integration lead (solo until Aug 1)**

The goal of July: by the time teammates arrive, the pipeline works end-to-end, the repo runs, and each teammate can be productive on day one using Claude Code + the repo's CLAUDE.md + skills, without you having to teach them everything.

---

## Tooling setup (do once, Week 1)

| Tool | Purpose | Notes |
|---|---|---|
| WSL2 + Ubuntu | Runs Nerfstudio/COLMAP on your Windows laptop | Nerfstudio is far happier on Linux |
| CUDA toolkit (in WSL2) + NVIDIA driver (Windows side) | GPU training | Driver on Windows, CUDA toolkit in WSL |
| Miniconda (in WSL2) | Python env management | `conda create -n splat python=3.10` |
| Nerfstudio + gsplat + COLMAP | Training pipeline | Follow docs.nerf.studio install guide |
| Node.js LTS + Vite (Windows side is fine) | Web app | |
| **Claude Code** | AI pair programmer for everything | Install per docs.claude.com/en/docs/claude-code — run it inside the repo; run `/init` once and merge with our CLAUDE.md |
| GitHub (private repo) | Code + task board (Issues) | Free; teammates fork/clone in Aug |
| SuperSplat (browser, no install) | Splat cleanup | superspl.at |

**Claude Code usage habits:** Plan Mode (Shift+Tab) before big changes · `/clear` between unrelated tasks · commit before large refactors · review diffs with `/diff` before committing · after two failed corrections, `/clear` and re-prompt rather than arguing. Sonnet-tier models are fine for day-to-day work in this repo — the CLAUDE.md and skills carry the project knowledge so the model doesn't have to.

**Training location decision: LOCAL, not Colab.** Colab free tier = session disconnects that kill long training runs, re-uploading GB of frames, reinstalling tools every session. Your 5060 (8 GB VRAM) meets the documented minimum. Fallback only if a zone won't fit: rent a cloud GPU by the hour (Lightning AI / RunPod). Your laptop is the team's ONLY training machine (CUDA/NVIDIA required) — structure roles accordingly.

---

## Week-by-week (July)

### Week 1 — Jul 12–19: Environment + admin
- [ ] Send TWO emails (highest priority, longest lead time):
  - Written permission to photograph/capture CORE first floor (privacy requirement from our report)
  - Request for content: staff/faculty bios, room descriptions, lab functions (route via Prof. Aziz)
- [ ] WSL2 + CUDA + conda + Nerfstudio installed; `ns-train --help` runs
- [ ] Create GitHub repo; commit DESIGN.md, CLAUDE.md, skills/
- [ ] Install Claude Code; do the free "Claude Code 101" course (~an evening)
- [ ] **Smoke test at home**: capture your own hallway/room on your phone → `ns-process-data video` → `ns-train splatfacto` → export .ply → open in SuperSplat. Done when you can orbit a recognizable splat of your room.

### Week 2 — Jul 20–26: Pipeline reps + web rendering
- [ ] 2–3 more practice captures at home; deliberately vary technique (lighting, speed, overlap) and note what breaks COLMAP → this experience becomes edits to the capture-protocol skill
- [ ] Learn SuperSplat: delete floaters, crop, orient floor to y=0, export compressed
- [ ] Get one practice splat rendering in Spark in a browser (their quick-start example, swap in your file)
- [ ] **Milestone: full pipeline (phone → browser) proven on practice data**
- [ ] KILL CRITERION: if Nerfstudio still isn't training by Jul 26 → switch to Postshot Indie, keep moving

### Week 3 — Jul 27–Aug 2: Repo scaffold (with Claude Code)
- [ ] Build the app skeleton per DESIGN.md §3.2: Vite + Three.js + Spark, WASD + pointer-lock look, AABB collision from zones.json, zone loader
- [ ] Deploy to GitHub Pages/Cloudflare Pages NOW with practice-splat content — deploying early surfaces hosting issues while they're cheap
- [ ] Walkable demo of your practice room online
- [ ] Write GitHub Issues for August work (see role breakdown below)

### Week 4 — Aug 3–9: CORE capture begins + team onboards
- [ ] First real CORE captures (permission should be in hand; capture during low-traffic hours, no people in frame)
- [ ] Teammates: onboarding checklist below; first tasks from Issues

---

## August team structure (4 people)

| Role | Owner | Needs GPU? | First tasks |
|---|---|---|---|
| **Integration lead + pipeline** (you) | You | YES (your laptop) | CORE captures, training runs, zone exports |
| **Frontend/navigation** | Teammate A | No | Click-to-move option, mobile joystick, loading UI, zone transitions |
| **NPC & dialogue systems** | Teammate B | No | Proximity triggers, dialogue UI per DESIGN.md §3.4, accessibility (keyboard nav) |
| **Content & testing** | Teammate C | No | Dialogue JSON writing from departmental info, NPC portraits, zones.json authoring (collision boxes, NPC placement), test coordination |

Adjust to interest/skill, but keep GPU-dependent work consolidated on your machine.

### Teammate onboarding checklist (each person, ~half a day)
1. Clone repo; `npm install`; `npm run dev`; confirm the demo runs locally
2. Install Claude Code; open it in the repo (it auto-reads CLAUDE.md and discovers skills/)
3. Do Claude Code 101 (free course) if not already done
4. Read DESIGN.md fully — it is the project bible; don't relitigate locked decisions in AI sessions
5. Claim a GitHub Issue; make a trivial PR (e.g., README typo) to learn the flow
6. Rule of the repo: after every work session, update the "Current status" block in AGENTS.md

### Working agreements (propose to team in first August meeting)
- main branch always runs; work in branches, PR + one review to merge
- Small PRs over big ones; commit before letting Claude Code do big changes
- Weekly 30-min sync: demo what works, update status, reassign
- Anything that changes DESIGN.md decisions requires whole-team agreement

---

## What "set up for success" looks like on Aug 1
1. Pipeline proven end-to-end on practice data (their captures will just work)
2. Deployed walkable demo (they extend working code, never build from zero)
3. CLAUDE.md + skills in repo (Claude Code makes any model productive here)
4. Issues written (nobody asks "what should I do?")
5. Permission + content requests already in flight (the slow external dependencies started a month early)
