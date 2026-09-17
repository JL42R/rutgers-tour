# DECTA — Project Plan (September – November 2026)

**Deadline:** Friday, November 20, 2026 — final build deployed, tested, and demo-ready.
**Buffer:** Nov 23–30 is reserved for written deliverables and contingency only. No new features.

> This document is the *schedule*. `DESIGN.md` is the *technical spec*. `docs/ONBOARDING.md` is the
> *setup guide*. If this file and `DESIGN.md` ever disagree, `DESIGN.md` wins on technical
> questions and this file wins on dates.

---

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

## 2. Why the schedule is ordered this way

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

## 3. Decision gates

Each gate is a go/no-go with a date. If one fails, execute the fallback **that week**. Don't slide
the date and hope.

| Gate | Date | Pass condition | If it fails |
|---|---|---|---|
| **G1 — Training works ✅ passed Sep 9** | Fri Sep 11 | **Passed on the printing room, which is Zone 1 — not a throwaway test capture.** 451/452 frames registered (99.78%), trained 30k iterations, renders and is walkable in our app. The zone it produced is the one we ship. (The export-to-Spark-loader seam is where integration surprises would otherwise surface in October with no slack. Same criterion as `docs/SETUP_TRAINING.md` §9c.) | Evaluate in order: (1) Brush — Rust/wgpu trainer, avoids CUDA entirely (the direct answer to a CUDA-on-Blackwell failure), accepts COLMAP/Nerfstudio datasets so alignment work carries over, headless CLI, exports `.ply`; it's a self-described proof of concept with unoptimized performance and unvalidated on our hardware, so budget ~1hr to evaluate before committing. (2) Postshot (native Windows, no WSL). (3) Luma AI. Log the reason in `DESIGN.md`. |
| **G2 — Primary capture complete** | Fri Sep 25 | Every zone in scope has a usable dataset backed up to cloud storage | Re-shoot window stays open through Oct 16, but scope drops to whatever is captured by then. |
| **G3 — Two zones shipped end to end** | Fri Oct 9 | **Both zones walkable with collision and real NPCs, live on a public URL, and loaded by someone who is not Johnny.** The last clause is the point of the gate: it catches the "works on the training laptop" failures — absolute paths, missing files, hosting config — while there is still time. *Target, not gate:* zone files under 50 MB. Shipping at 62 MB is acceptable here; shipping something only Johnny can open is not. | **Diagnose which leg failed — they are not equally cuttable.** Only one of the three is descopable at all.<br><br>**Second zone not ready** → ship zone 1 live, move zone 2 to G4, and treat 4–5 zones as dead: spend §7 rungs 1 and 2 *that week* rather than carrying scope you no longer have time for.<br><br>**Public URL or real NPCs not ready** → neither is descopable; both are on §7's never-cut list. This becomes the only work happening that week. Pull people off capture.<br><br>**Only the not-Johnny clause failed** → almost always hosting config, absolute paths, or a missing file. Hours, not weeks. Fix it before Monday; do not move the gate for it. |
| **G4 — Feature freeze** | Fri Nov 6 | All zones integrated, all NPCs placed, app live on static hosting | Descope per the ladder in §7. |
| **G5 — Final lock** | Fri Nov 20 | Tested, fixed, deployed, demo rehearsed | — |

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
| `G2 — Primary capture complete` | **G2** | Fri Sep 25 |
| `G3 — Two zones shipped end to end` | **G3** | Fri Oct 9 |
| `G4 — Feature freeze` | **G4** | Fri Nov 6 |
| `G5 — Final lock` | **G5** | Fri Nov 20 |

Each milestone's description carries its pass condition, so the board is readable without
opening this file.

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
