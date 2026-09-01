# DECTA — Project Plan (September – November 2026)

**Deadline:** Friday, November 20, 2026 — final build deployed, tested, and demo-ready.
**Buffer:** Nov 23–30 is reserved for written deliverables and contingency only. No new features.

> This document is the *schedule*. `DESIGN.md` is the *technical spec*. `docs/ONBOARDING.md` is the
> *setup guide*. If this file and `DESIGN.md` ever disagree, `DESIGN.md` wins on technical
> questions and this file wins on dates.

---

## 1. How to use this document

Tasks are listed by week, unassigned. Pick up whatever is open and mark it off. The only hard
constraint on who does what is hardware: **Johnny's laptop is the only machine with a GPU capable
of training**, so every training task lands there by necessity. Everything else — capture,
dialogue writing, collision authoring, testing, deployment — is open to whoever has time.

Keep it that way deliberately. With four people at maybe 6–8 hours a week each during a semester,
rigid ownership creates blocking. Open tasks let whoever has a free evening move the project.

Two rules that make an unassigned list work:
- Say in the team chat what you are picking up **before** you start, so two people don't do it twice.
- If you pick something up and stall, say so within 48 hours. Silence is the failure mode.

---

## 2. Why the schedule is ordered this way

**Capture is front-loaded, ahead of everything else.** This is the biggest change from the earlier
plan and it is deliberate. Capture depends only on a phone camera, building access, and daylight —
none of which depend on the training pipeline working. There is no reason to wait. Meanwhile
daylight is actively shrinking: New Jersey loses roughly two and a half hours between early
September and late November, and overcast days become the norm. A dataset shot in September can be
retrained ten times; a dataset that doesn't exist until November can't be fixed at all.

**But Zone 1 gets captured and trained before the rest are shot.** The one real risk of capturing
early is capturing badly — wrong overlap, wrong pacing, wrong lighting — and burning several
sessions before anyone knows. So Zone 1 goes through capture *and* training first, the lessons get
written into the capture protocol, and the remaining zones are shot with those lessons applied a
week later. Primary capture still finishes in September.

**The 8GB VRAM ceiling is the hard technical limit.** Training is the only step that can fail in a
way we can't quickly engineer around. Navigation, collision, NPCs, and dialogue are already built
and verified working. So training validation gets its own gate with a real fallback, early.

---

## 3. Decision gates

Each gate is a go/no-go with a date. If one fails, execute the fallback **that week**. Don't slide
the date and hope.

| Gate | Date | Pass condition | If it fails |
|---|---|---|---|
| **G1 — Training works** | Fri Sep 11 | A splat trained from Johnny's own test capture renders and is walkable in our app — not just when `ns-train` completes. (The export-to-Spark-loader seam is where integration surprises would otherwise surface in October with no slack. Same criterion as `docs/SETUP_TRAINING.md` §9c.) | Evaluate in order: (1) Brush — Rust/wgpu trainer, avoids CUDA entirely (the direct answer to a CUDA-on-Blackwell failure), accepts COLMAP/Nerfstudio datasets so alignment work carries over, headless CLI, exports `.ply`; it's a self-described proof of concept with unoptimized performance and unvalidated on our hardware, so budget ~1hr to evaluate before committing. (2) Postshot (native Windows, no WSL). (3) Luma AI. Log the reason in `DESIGN.md`. |
| **G2 — Primary capture complete** | Fri Sep 25 | Every zone in scope has a usable dataset backed up to cloud storage | Re-shoot window stays open through Oct 16, but scope drops to whatever is captured by then. |
| **G3 — One zone shipped end to end** | Fri Oct 9 | Zone 1 trained, cleaned, exported `.spz`, walkable with collision and real NPCs | Cut to 2 zones total and reassess scope. |
| **G4 — Feature freeze** | Fri Nov 6 | All zones integrated, all NPCs placed, app live on static hosting | Descope per the ladder in §7. |
| **G5 — Final lock** | Fri Nov 20 | Tested, fixed, deployed, demo rehearsed | — |

---

## 4. Week-by-week

### Week 1 · Sep 1–6 — Install and first capture, in parallel

- [ ] Install WSL2 + CUDA toolkit + Nerfstudio. Budget two full evenings; this install fails in
      creative ways. Stop and ask for help at the 4-hour mark rather than grinding.
- [ ] Verify the GPU is visible inside WSL (`nvidia-smi` from the Ubuntu shell)
- [ ] Smoke capture: one small, well-lit space you control (apartment/dorm room), 150–300 photos.
      This exists to test the pipeline, not to ship.
- [ ] Team walkthrough of the CORE first floor. Mark zone boundaries on a floor plan, commit the
      image to the repo.
- [ ] Finalize zone count — target 3, hard max 4 — and pick Zone 1 as the highest-value space
      (main entry / hallway toward the ISE lab)
- [ ] Confirm everyone can run `npm run dev` and walk the placeholder room
- [ ] Start a running list of possible user testers for November. Aim for 8+ names so the test
      round doesn't depend on any one person saying yes.

### Week 2 · Sep 7–13 — Prove the pipeline, capture Zone 1

- [ ] Run COLMAP on the smoke dataset, then splatfacto. Expect failed runs. Record every setting
      that fits inside 8GB.
- [ ] Export `.ply` — clean in SuperSplat — export compressed `.spz`
- [ ] Load it into the app as a zone and walk around it
- [ ] **GATE G1 (Sep 11)**
- [ ] Capture CORE Zone 1, midday, using `.claude/skills/capture-protocol/SKILL.md`
- [ ] Back the raw dataset up to cloud storage the same day it's shot

### Week 3 · Sep 14–20 — Train Zone 1, capture everything else

- [ ] Train Zone 1. Budget at least two rounds.
- [ ] Write the working settings and any capture lessons into the skill files, and push, before
      the next capture session
- [ ] Capture the remaining zones with those lessons applied — all of them this week
- [ ] Quality-check every dataset the same day it's shot: photo count, coverage, blur, exposure.
      A bad dataset caught today is a re-shoot; caught in November it's a cut feature.
- [ ] Back up every dataset to cloud storage

### Week 4 · Sep 21–27 — Close out capture, integrate Zone 1

- [ ] Any re-shoots identified in Week 3
- [ ] **GATE G2 (Sep 25)** — primary capture complete
- [ ] Clean Zone 1 in SuperSplat: crop floaters, trim outside geometry, floor at y=0
- [ ] Export `.spz`, confirm under 50MB
- [ ] Place in the app, author collision boxes, verify scale (1 unit = 1 meter)
- [ ] First draft of NPC dialogue JSON from the secured staff bios and room descriptions

### Week 5 · Sep 28 – Oct 2 — Zone 1 complete

- [ ] Place the first real NPCs in Zone 1 with real dialogue
- [ ] Retire Riley and the placeholder room from the default load path
- [ ] Train Zone 2

### Week 6 · Oct 5–9 — First zone signed off

- [ ] Fix whatever Zone 1 integration surfaced
- [ ] **GATE G3 (Oct 9)** — demo walkable Zone 1 to an outside viewer for early signal
- [ ] Clean and export Zone 2
- [ ] Train Zone 3

### Week 7 · Oct 12–16 — Last re-capture window

- [ ] Re-shoot anything that trained badly. **This is the last capture week** — after this,
      daylight and building access stop being reliable.
- [ ] Integrate Zone 2
- [ ] Full dialogue draft for all rooms, committed as JSON

### Week 8 · Oct 19–23 — Everything integrated

- [ ] Train, clean, and integrate remaining zones
- [ ] Build zone transitions: loading, unloading, entry points
- [ ] Collision passes on all zones

### Week 9 · Oct 26–30 — Content and deploy

- [ ] All NPCs placed across all zones with final dialogue
- [ ] Accessibility pass: keyboard navigation, dialogue text readable by screen readers, audio
      overlay if time allows (this was an explicit commitment in the project report)
- [ ] Deploy to GitHub Pages or Cloudflare Pages. Get the real public URL working now, not in
      November.

### Week 10 · Nov 2–6 — User testing

- [ ] Structured test with 5–8 people who have never seen the build
- [ ] Watch silently. Record where people get stuck, not what they say they liked.
- [ ] Score against the four criteria from the project report: navigability, reconstruction
      completeness, visual quality, overall performance
- [ ] **GATE G4 (Nov 6)** — feature freeze

### Week 11 · Nov 9–13 — Fix

- [ ] Fix the top three issues by frequency across testers. Only those three.
- [ ] Performance pass: load time, frame rate on a mid-range laptop, mobile browser check
- [ ] Short second test round to confirm the fixes landed

### Week 12 · Nov 16–20 — Lock

- [ ] Final deploy, verified from a machine that isn't yours
- [ ] Rehearse the demo end to end, twice, including a cold start on venue wifi
- [ ] Record a backup video walkthrough in case the live demo fails
- [ ] **GATE G5 (Nov 20) — project locked**

### Buffer · Nov 23–30
Thanksgiving is Thursday Nov 26; assume the team is unavailable. Written report, slides, and
contingency only. If you are writing code this week, something upstream went wrong.

---

## 5. Standing rhythm

- **Monday, async, 15 min:** what shipped, what you're picking up, what's blocked
- **Friday:** someone updates the checkboxes in this file and pushes
- **Every session:** `git pull` before you start, `git push` when you stop

---

## 6. Known risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| WSL2/CUDA install eats a week | High | G1 fallback to Postshot or Luma AI, decided Sep 11 |
| 8GB VRAM can't train a zone at usable quality | Medium | Smaller zones, downscaled input, fewer gaussians; worst case more zones of smaller size |
| Early capture turns out to be bad capture | Medium | Zone 1 is trained before the rest are shot; re-shoot window open through Oct 16 |
| Single training machine unavailable | Low / severe | Every raw dataset backed up to cloud the day it's shot, so any GPU machine can resume |
| Not enough user testers in November | Medium | Build the tester list from Week 1 and over-recruit; testers are easy to line up early and hard to find on short notice |
| Unassigned tasks go unclaimed | Medium | Monday check-in exists specifically to surface this; anything unclaimed two weeks running gets discussed |

---

## 7. Descoping ladder

If you're behind at a gate, cut in this order. Cut early and deliberately — a polished three-zone
tour demos far better than a broken five-zone one.

1. Fourth zone
2. Audio overlay for dialogue (keep the visible text, note it as future work)
3. Branching dialogue → linear dialogue
4. Third zone
5. Zone transitions → a simple menu to jump between zones

**Never cut:** collision (walking through walls destroys the illusion), NPC dialogue text (it's the
actual point of the project), or the deployed public URL.

---

## 8. What "done" means

A stranger opens a URL in a browser, walks the CORE first floor with WASD, meets NPC guides who
explain the rooms in real staff-informed copy, and comes away understanding what that building
does — with no install, no account, and no backend.
