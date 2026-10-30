# DECTA — Project Plan (September – November 2026)

**Deadline:** Friday, November 20, 2026 — final build deployed, tested, and demo-ready.
**Buffer:** Nov 23–30 is reserved for written deliverables and contingency only. No new features.

> This document is the *schedule*. `DESIGN.md` is the *technical spec*. `docs/ONBOARDING.md` is the
> *setup guide*. If this file and `DESIGN.md` ever disagree, `DESIGN.md` wins on technical
> questions and this file wins on dates.

---

## Final scope addendum — 2026-10-30

The current team's deliverable is **exactly three environments**: CORE Hallway (`hallway`), 3D Printing Room (`printing-room`) and Project Studio / Room 116 (`project-studio`). Machine Shop and Computer Lab are **excluded for this cohort** and retained only as future-group options. Their capture research and earlier schedules are preserved below; neither room blocks current-project completion.

Current work, in priority order:

1. **Room 116 NPCs/dialogue (#56).** Navigation, D3, boundaries/exclusions, sign and arrival are published in main `b2a18e5` (feature `bc0b623`). Choose permissioned identities, verify facts, review scripts, place guides and test tracker/accessibility behavior. No studio NPCs are implemented yet.
2. **Interactive guide (#47), developed by Vishan.** PRs #48/#59/#61 are standalone, unmerged foundations; PR #46's discoverability work is also unmerged. Main's Johnny typed form returns an AI TEST echo. Approved knowledge, component/UI integration and browser/accessibility acceptance remain; preserve existing welcome/printing guides. No live LLM/backend approval is implied.
3. **Quality/performance on these three environments (#8/#23/#24/#25/#34).** Measure the current baseline, compare SH/cleanup copies side by side and get user approval before changing assets; do not initiate additional captures/environments.

Remaining release work includes permanent printing equipment boxes (#66), missing Vishan portrait (#67), CI regression integration (#68), content approvals (#20), NVDA failure (#33), first-time-user recruitment/testing (#29/#16), cross-browser/network acceptance (#11), and final rehearsals/demo preparation (#35). These are separate from the completed Room 116 environment.

**Schedule preserved:** the original gates/dates below remain historical commitments, not claims that every gate passed. Interpret current G3/G4 scope as these three environments only. #49/#55 stay open pending a separate reviewed future-cohort closure; no milestone dates or GitHub states are changed by this documentation pass. The Nov 6 feature-freeze wording and current guide priorities require team scheduling, not an automatic extension.

## 1. How to use this document

Tasks live on the GitHub milestone board (§4), unassigned. Pick up whatever is open and claim it
there. The only hard constraint on who does what is hardware: **Johnny's laptop is the only
machine with a GPU capable of training**, so every training task lands there by necessity.
Everything else — capture, dialogue writing, collision authoring, testing, deployment — is open
to whoever has time.

Keep it that way deliberately. With four people at maybe 6–8 hours a week each during a semester,
rigid ownership creates blocking. Open tasks let whoever has a free evening move the project.

Two rules that make an unassigned list work:
- Say in the team chat what you are picking up **before** you start, so two people don't do it twice.
- If you pick something up and stall, say so within 48 hours. Silence is the failure mode.

---

## 2. Why the schedule is ordered this way (historical rationale)

The following records the earlier capture-first, 4–5-zone plan. It explains the original schedule; the dated scope addendum above supersedes its remaining-room and zone-count instructions.

**Capture is front-loaded, ahead of everything else.** This is the biggest change from the earlier
plan and it is deliberate. Capture depends only on a phone camera, building access, and daylight —
none of which depend on the training pipeline working. There is no reason to wait. Meanwhile
daylight is actively shrinking: New Jersey loses roughly two and a half hours between early
September and late November, and overcast days become the norm. A dataset shot in September can be
retrained ten times; a dataset that doesn't exist until November can't be fixed at all.

**Zone 1 was captured and trained before the rest were shot — and that paid off.** The one real
risk of capturing early is capturing badly — wrong overlap, wrong pacing, wrong lighting — and
burning several sessions before anyone knows. Zone 1 (the printing room) went through capture
*and* training first, which is exactly how we learned that HDR destroys registration: three
captures took us 0.63% → 18.45% → 99.78%. Those lessons are now in the capture protocol, and
every remaining zone gets shot with them applied.

**The scene is 4–5 zones in a star topology, with the hallway as the hub.** Every transition is
hallway↔room; the rooms never connect to each other directly. Two scheduling consequences follow.
First, **the hallway is the shared reference frame** — it gets captured and aligned before the
rooms that hang off it, because every other zone's position is expressed relative to it. Second,
hallways are the hardest subject in structure-from-motion — long, thin, repetitive, often
blank-walled — so the hardest capture is also the one on the critical path. Plan more than one
take for it.

**The 8GB VRAM ceiling is the hard technical limit.** Training is the only step that can fail in a
way we can't quickly engineer around. Navigation, collision, NPCs, and dialogue are already built
and verified working. So training validation gets its own gate with a real fallback, early.

---

## 3. Original decision gates and recorded evidence

Original dates and pass conditions are preserved below. The current three-zone scope does not itself prove missing historical capture/training records, content approval or release tests. Room 116's later publication and the user's 14/14 integrated Chrome approvals are recorded in `ROOM116_INTEGRATION.md`; its capture provenance remains incomplete (#50).

Each gate is a go/no-go with a date. If one fails, execute the fallback **that week**. Don't slide
the date and hope.

| Gate | Date | Pass condition | If it fails |
|---|---|---|---|
| **G1 — Training works ✅ passed Sep 9** | Fri Sep 11 | **Passed on the printing room, which is Zone 1 — not a throwaway test capture.** 451/452 frames registered (99.78%), trained 30k iterations, renders and is walkable in our app. The zone it produced is the one we ship. (The export-to-Spark-loader seam is where integration surprises would otherwise surface in October with no slack. Same criterion as `docs/SETUP_TRAINING.md` §9c.) | Evaluate in order: (1) Brush — Rust/wgpu trainer, avoids CUDA entirely (the direct answer to a CUDA-on-Blackwell failure), accepts COLMAP/Nerfstudio datasets so alignment work carries over, headless CLI, exports `.ply`; it's a self-described proof of concept with unoptimized performance and unvalidated on our hardware, so budget ~1hr to evaluate before committing. (2) Postshot (native Windows, no WSL). (3) Luma AI. Log the reason in `DESIGN.md`. |
| **G2 — Hallway captured, scope fixed ✅ passed Sep 29** | Fri Sep 25 | **Hallway captured, registered ≥ 80%, backed up to Drive.** The zone list and every doorway off the hallway are finalized and committed. Remaining rooms are captured on an ongoing basis after this date; **Oct 16 is the hard stop** for any capture. | Re-shoot window stays open through Oct 16, but scope drops to whatever is captured by then. If the hallway itself is what missed, it takes priority over every room — nothing else can be aligned until it exists. |
| **G3 — Every zone exists (breadth)** | Fri Oct 9 | **Every expected zone is *primitive*:** captured (≥ 70% registration), trained, exported at the chosen SH band, placed in `zones.json`, aligned to the hallway, reachable from it through a working transition, and carrying a rough collision box. **No NPCs, no cleanup, and no compression target required** — this gate is about coverage, not finish. Plus: live on a public URL, loaded on a machine that isn't Johnny's, which catches the "works on the training laptop" failures (absolute paths, missing files, hosting config) while there is still time to fix them. | **Any zone not primitive on Oct 9 is cut, not chased** — that is the gate's purpose, not its failure mode, so removing a zone here is a pass, not a miss. Take the cut at the review and update §7's ladder to match; do not carry a half-done zone into G4 hoping for time that does not exist.<br><br>**If the public URL leg is what failed** → it is on §7's never-cut list and is not descopable. It becomes the only work happening that week. Usually hosting config or a missing file: hours, not weeks. Fix it before Monday rather than moving the gate. |
| **G4 — Every zone finished (depth)** | Fri Nov 6 | **Every surviving zone reachable from the hallway.** Every zone has **at least one NPC with real dialogue**. The first user-testing round is complete, scored against the four criteria from the project report (navigability, reconstruction completeness, visual quality, overall performance), with a **ranked fix list** produced. **No new features after this date.** | Descope per the ladder in §7 — but note that zone cuts were already taken at G3, so what remains to cut here is polish: audio overlay, then branching dialogue. If a surviving zone still has no NPC, that zone is the priority; NPC dialogue text is on the never-cut list. |
| **G5 — Final lock** | Fri Nov 20 | **Top three fixes from testing merged.** The deployed URL **cold-loads on a non-team machine**. The demo has been **rehearsed twice end to end, once on venue wifi**. A **backup video** is recorded and stored off-repo. | — |

**Why the gates are ordered this way:** G3 measures *breadth* (every zone exists), G4 measures
*depth* (every zone is finished), and G5 measures *the stranger test* under demo conditions.
Breadth is gated first because capture and training run on an external clock — daylight and a
single training machine — while polish does not.

**Historical G2 acceptance recorded 2026-09-29, four days after the Sep 25 date.** The five-zone list below is the decision made then, superseded for the current deliverable on 2026-10-30; retain it as history.
- ✅ Hallway captured: 11:25 video, 684/735 registered (93.06%, above the ≥80% floor)
- ✅ Backed up to Drive
- ✅ Trained (30k iterations)
- ✅ Zone list and every doorway off the hallway finalized and committed — `docs/ZONES.md` and
  `docs/img/first-floor-zones.svg` (#28). Five zones: `hallway`, `printing-room`, `machine-shop`,
  `project-studio`, and `computer-lab` (the optional fifth zone, first on the §7 cut ladder).
  Exact doorway z ranges are measured at G3 wiring.
- The four prep issues filed under G2 were not gate conditions: #17, #23, and #30 moved to G3;
  #31 closed.

---

## 4. Where the work lives

**The GitHub milestone board is the task-level source of truth. Not this file.**

There used to be a week-by-week checklist here. Nobody maintained it, so it described a project
we were no longer running — which is worse than having no list, because a stale plan still gets
read and believed. Tasks now live as GitHub Issues grouped into one milestone per gate. This
file keeps only what doesn't change week to week: why the order is what it is (§2), the gates
(§3), the risks (§6), and what to cut when you're behind (§7).

| Milestone on the board | Gate | Date |
|---|---|---|
| *(none — closed)* | **G1** Training works | ✅ passed Sep 9 |
| `G2 — Hallway captured, scope fixed` *(still open on GitHub as checked 2026-10-30)* | **G2** | Historical acceptance Sep 29; status reconciliation pending |
| `G3 — Every zone exists (breadth)` | **G3** | Fri Oct 9 |
| `G4 — Every zone finished (depth)` | **G4** | Fri Nov 6 |
| `G5 — Final lock` | **G5** | Fri Nov 20 |

The milestone descriptions retain the original gate conditions from §3; final three-zone scope was added to the development issues on 2026-10-30, but milestone metadata has not been changed. #49 (G3) and #55 (G4) are future-cohort work, not active blockers. G2 remains open despite its recorded acceptance. Reconcile those statuses through a separately reviewed GitHub update; do not change dates or claim new gate completion from this document.

To find your next task: open the board, filter to the nearest open milestone, take something
unassigned, and say so in the team chat before you start. If a milestone is empty and its date
is close, that is itself the signal — raise it at Monday's check-in.

**Buffer · Nov 23–30.** Thanksgiving is Thursday Nov 26; assume the team is unavailable. Written
report, slides, and contingency only. If you are writing code that week, something upstream went
wrong.

---

## 5. Standing rhythm

- **Monday, async, 15 min:** what shipped, what you're picking up, what's blocked
- **Friday, milestone-board triage:** someone walks the board — close what's done, re-milestone
  what slipped, open issues for anything discovered this week that isn't tracked yet. Ten
  minutes. The board is only trustworthy if somebody does this.
- **Every session:** `git pull` before you start, `git push` when you stop

---

## 6. Known risks (original capture/training planning)

Retained historical risk analysis. Earlier smaller/more-zone or recapture mitigations below do not authorize changing the final three-environment deliverable. Current release risks and issue links are listed in the 2026-10-30 addendum.

| Risk | Likelihood | Mitigation |
|---|---|---|
| WSL2/CUDA install eats a week | High | G1 fallback to Postshot or Luma AI, decided Sep 11 |
| 8GB VRAM can't train a zone at usable quality | Medium | Smaller zones, downscaled input, fewer gaussians; worst case more zones of smaller size |
| Early capture turns out to be bad capture | Medium | Zone 1 is trained before the rest are shot; re-shoot window open through Oct 16 |
| Single training machine unavailable | Low / severe | Every raw dataset backed up to cloud the day it's shot, so any GPU machine can resume |
| Not enough user testers in November | Medium | Build the tester list from Week 1 and over-recruit; testers are easy to line up early and hard to find on short notice |
| Unassigned tasks go unclaimed | Medium | Monday check-in exists specifically to surface this; anything unclaimed two weeks running gets discussed |

---

## 7. Historical descoping ladder

**Superseded for active zone scope on 2026-10-30.** The original ladder/rationale below is preserved for handoff. Machine Shop and Computer Lab are already excluded; no additional zone is to be implemented, and no approved environment, transition or collision behavior may be cut without a new explicit decision.

If you're behind at a gate, cut in this order. Cut early and deliberately — a polished three-zone
tour demos far better than a broken five-zone one.

1. Fifth zone
2. Fourth zone
3. Audio overlay for dialogue (keep the visible text, note it as future work)
4. Branching dialogue → linear dialogue
5. Third zone
6. Zone transitions → a simple menu to jump between zones

**Know what this ladder costs before you climb it.** Scoping at 4–5 zones instead of the
original 3 means rungs 1 and 2 are *deliberately pre-spent* — we have chosen to hold the slack
as extra zones rather than as schedule. That is a real bet: zones 4 and 5 are the cheapest
things to cut, so if capture slips we lose them and land back at the original three-zone plan
with nothing else sacrificed. But it also means the first two rungs buy back **no** time we
weren't always prepared to give up. If you are behind and reach for this ladder, expect to be
on rung 3 almost immediately, and treat cutting into dialogue quality as the first *real* cut.

**Zone cuts happen at the G3 review on Oct 9, not gradually.** That date is the single decision
point for scope: any zone that is not *primitive* by then — captured, trained, placed, aligned to
the hallway, reachable through a working transition, rough collision box — comes out of scope
rather than being chased into G4. Cutting it there is the gate working as designed, not a
failure. What makes this worth holding to is that a half-finished zone is the most expensive
thing you can own: it consumes November attention that the surviving zones need for NPCs,
testing, and fixes, and it usually still doesn't land. Decide once, on the date, and spend the
rest of the time finishing what survived.

The star topology helps here: dropping a room is cheap because nothing else aligns against it.
**Never cut the hallway** — every other zone is positioned relative to it, so losing it doesn't
cost one zone, it costs the tour's whole coordinate system.

**Never cut:** collision (walking through walls destroys the illusion), NPC dialogue text (it's the
actual point of the project), or the deployed public URL.

---

## 8. What "done" means

A stranger opens a URL in a browser, walks the CORE first floor with WASD, meets NPC guides who
explain the rooms in real staff-informed copy, and comes away understanding what that building
does — with no install, no account, and no backend.
