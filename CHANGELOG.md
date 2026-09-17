# Changelog

Newest entry first. This records what changed and when — for schedule and gates see `PLAN.md`, for architecture see `DESIGN.md`, for task state see GitHub Issues.

## 2026-09-17

### Documentation synced to verified state
No code or pipeline changes. The docs had drifted far enough from reality to be actively
misleading — several described blockers that were already solved and a zone count we had moved
past. Corrected against the repo as it actually stands:

- **The printing room is Zone 1**, an official CORE zone, not a test zone. Every doc that called
  it a test/smoke capture now says so.
- **Compressed PLY works** (see the 2026-09-15 entry). Removed the "download the splat from
  Drive", "fresh clone falls back to the placeholder room", and "Compressed PLY is the next
  test" language from `README.md`, `AGENTS.md`, `docs/ONBOARDING.md`, `DESIGN.md`, and
  `docs/SETUP_TRAINING.md`. A fresh clone renders Zone 1 with no download step.
- **Scope is 4–5 zones in a star topology**: the hallway is the hub, every transition is
  hallway↔room, never room↔room. This makes the hallway the shared reference frame — it is
  aligned first and every other zone's origin/rotation is expressed relative to it. Recorded in
  `DESIGN.md` §3.1, `AGENTS.md`, `docs/PLAN.md` §2, and the training-pipeline skill's Stage 6.
- **The real remaining blocker is size, not format.** Zone 1 is 62 MB against a 50 MB target.
  SH is 74% of the file; band 1 projects to ~26 MB and band 0 to ~16.5 MB. The band choice is
  deliberately NOT made — band 1 and band 0 get compared side by side first. `DESIGN.md` §3.5.
- **`docs/PLAN.md` §4 (week-by-week) deleted.** Nobody maintained it, so it described a project
  we were not running. Replaced by a pointer to the GitHub milestone board, which is the
  task-level source of truth. `AGENTS.md`'s status checklist was removed for the same reason.
  §5's Friday ritual is now milestone-board triage.
- **G3 re-specified**: two zones walkable with collision and real NPCs, live on a public URL,
  loaded by someone who is not Johnny. Compression moved from gate to target. The GitHub
  milestone was renamed to match and now carries the pass condition in its description.
  Its fallback was rewritten — "cut to 2 zones" was a no-op against a two-zone gate. The gate
  bundles three legs of very different descopability: the second zone is cuttable, while the
  public URL and real NPCs are both on §7's never-cut list, so failing those means stopping
  other work rather than descoping.
- **Descoping ladder** now runs from five zones, with a note that planning 4–5 means its first
  two rungs are pre-spent — they buy back no time we had not already committed.

### Skills reconciled against measured practice
- **OPEN QUESTION recorded, deliberately unresolved:** the capture protocol specifies 250 frames
  (150–300) and 2–4 minute clips; our only successful capture used `--num-frames-target 450` and
  a 7:16 clip. Nobody has run the same room both ways. The runtime consequence is recorded
  because it is large and measured: ~24 min of COLMAP at ~300 frames vs 135m53s at 452.
- **SuperSplat cleanup is recorded as harmful-in-practice and undiagnosed** — see the 2026-09-15
  entry. Stage 5 of the training pipeline now prefers SH band reduction over splat deletion.
- **Stage 5's "hard gate" language corrected to "target."** It claimed ≤ 50 MB was a hard gate
  while the shipped zone is 62 MB — the skill was asserting something untrue.
- **SH Bands must now be recorded in `CHANGELOG.md` on every export.** Without it, zone files
  cannot be compared and the pending band test is uninterpretable.
- **Capture file convention standardized on `.MOV`**, matching issues #3/#4 and what the iPhone
  actually writes. `.gitignore` previously covered only `*.mp4`, leaving a 1.5–3 GB take
  unprotected — `*.MOV` and `*.mov` added, verified with `git check-ignore`. This mattered
  ahead of the Sep 18 hallway shoot.
- **Fixed a latent footgun found while testing those rules.** The `!` negation was written for
  one specific filename, so a future zone's `hallway.compressed.ply` came back ignored — zone 2
  would have been silently skipped at commit time. Replaced with
  `!public/splats/*.compressed.ply`, which re-includes finished zones by pattern while leaving
  raw `.ply` exports ignored. Verified both directions with `git check-ignore`. The consequence
  is that the `.compressed.ply` naming convention is now load-bearing, which is documented
  wherever the pipeline touches it.
- Added: re-verify the `eval_utils.py` `weights_only` venv patch before the first export of each
  new zone. Nothing has been exported since Sep 9, so its current state is assumed, not observed.

### Removed
- `public/dialogue/demo-guide.json` (Riley, the demo NPC). Unreferenced by `src/` and absent from
  `zones.json` since the demo room was retired. Recoverable from Git history.

## 2026-09-15

### Compressed PLY works — delivery format resolved (012a723)
The `.spz` blocker is resolved on the load side. SuperSplat's **Compressed PLY** export loads in
Spark 2.1.0, so the format question from #8 is answered; `.spz` stays dead (SuperSplat writes v4,
no released Spark decoder reads it) and is not worth revisiting unless PR #332 lands.

- `public/splats/printing-room-updated.compressed.ply` committed at **62,132,080 bytes**
  (1,013,854 splats, SH bands 3). First splat file ever to enter the repo.
- `.gitignore` gained a negation past the blanket `*.ply` rule. (As originally written it matched
  one filename only; generalized to a pattern on 2026-09-17.)
- `zones.json` switched the printing room to the compressed file. Alignment, collision, and spawn
  settings were preserved unchanged.
- Spark LOD enabled: `lod: true` on the `SplatMesh`, `lodSplatCount: 500000` on the
  `SparkRenderer`.
- Renderer pixel ratio pinned to `1`, down from `Math.min(devicePixelRatio, 2)`. This is a real
  tradeoff, not a pure win: on a HiDPI display the scene now renders at 1x and looks softer, in
  exchange for a large fill-rate saving.

### Still over budget
62 MB misses the < 50 MB target. SH is ~74% of the file, so band selection is the lever — band 1
projects to ~26 MB, band 0 to ~16.5 MB. Neither has been exported or looked at yet. #8 stays open
for the size problem rather than the format problem.

### SuperSplat cleanup skipped — it made quality worse
The team cleaned the printing room in SuperSplat and observed visual quality **decreasing**
against the uncleaned export, so the shipped file has no cleanup applied. **Cause never
diagnosed.** Until someone does, treat cleanup as a change requiring an A/B look in the browser
rather than an automatic improvement, and do not rely on it to hit the size budget.

## 2026-09-14

### Printing-room alignment completed
- Tape-measured room: 40.8 × 14.3 × 10.8 ft = 12.43584 × 4.35864 × 3.29184 m.
- Independent analysis parsed 1,013,854 splats from the original PLY. The long axis is approximately raw Z, width raw X, and upward raw -Y. Fitted raw dimensions: length ≈ 4.3077, width ≈ 1.6839, height ≈ 1.1445 units.
- Length and height measurements were used to derive a uniform scale of `2.881555849683783`.
- Final browser-verified runtime transform in `public/zones.json`: `origin: [-0.4239378102298068, 0.074344140921842, 3.17070150997874]`, `rotation: [180, 91.78889410373753, 0]`, `scale: 2.881555849683783`.
- Four collision boundary walls now use the measured physical room dimensions. Temporary `debugCollision: true` support draws a translucent cyan wireframe over the real splat; collision still uses only the AABB data.
- `npm run build` passes.

### Next work
- Measure an FPS/load-time baseline, then test SuperSplat Compressed PLY for delivery. The raw PLY remains approximately 240 MB and outside Git.

## 2026-09-09

### G1 passed — full pipeline validated end to end
Capture -> ffmpeg -> COLMAP -> splatfacto (RTX 5060) -> ns-export -> SuperSplat ->
.ply -> Vite -> Spark -> rendering and walkable. Validated first on a deliberately
poor apartment capture, then on the real printing-room capture.

### Printing room captured and trained
- 7:16, 4K/60, HEVC, yuv420p/bt709, 48 Mbps, no HDR
- COLMAP registered 451 of 452 frames (99.78%), using --num-frames-target 450
  --matching-method sequential
- 135m53s wall, 1712m CPU (~12.6x parallelism). Feature matching alone was 112 of 136
  minutes and is CUDA-accelerable
- Trained at the full 30000-iteration default, ~23 ms/iteration, ~22 M rays/sec
- Exported .ply: 240 MB
- Room measured by tape: 40.8 x 14.3 x 10.8 ft = 12.44 x 4.36 x 3.29 m

### BLOCKER: splat files cannot be committed at current size
GitHub blocks pushes containing files over 100 MB. At 240 MB the printing-room .ply
cannot enter the repo at all, so *.ply stays in .gitignore and splat files are shared
through Google Drive until compression is solved (#8). This also blocks static
hosting — visitors download a zone before they can walk it.

### Spark rejects SuperSplat .spz
SuperSplat v3.0.0-alpha's .spz export (6.0 MB, 13x compression) fails in Spark with
"Worker error: Invalid gzip header". SuperSplat reads the same file back fine, so it is
not corrupt — Spark's decompressor does not recognise this .spz variant. Uncompressed
.ply is the workaround and the cause of the size blocker above.

### Rotation and scale moved into the zone schema
Orientation correction is now config in zones.json rather than baked into the splat
file (#7). Baking required re-exporting 240 MB per attempt, which blocked parallel
work. rotation is Euler degrees, scale is a uniform multiplier. This supersedes rather
than resolves the earlier open question of whether SuperSplat bakes transforms into
its export — that was never tested, and now doesn't matter, since the correction lives
in zones.json instead of the exported file.

### Fixed silent splat load failure in src/zones.js
new SplatMesh({ url }) returns before its fetch completes, so load errors landed
outside the try block and the catch never fired. Now awaits mesh.initialized, logs
success, and falls back to the placeholder on failure. This fix is what surfaced the
gzip error above — the same failure was completely silent before it.

### Capture protocol validated by measurement
Registration across three captures: 0.63% (HDR on) -> 18.45% (HDR off, 4K/30, dim
evening light) -> 99.78% (4K/60, exposure locked, slow pace, lab lighting).

### Environment fixes
- Ubuntu 24.04 has no python3.11 package; requires the deadsnakes PPA
- PyTorch 2.6+ flipped torch.load's weights_only default, which BLOCKS ns-export.
  Patched in eval_utils.py. This patch lives inside the venv, is not version
  controlled, and must be reapplied if the venv is rebuilt
- gsplat JIT-compiles CUDA kernels on first GPU use. That compile was killed at
  MAX_JOBS=4 because WSL2 allocates only about half of host RAM. Fixed with MAX_JOBS=2
  and a .wslconfig raising WSL2 to 12 GB with 4 GB swap
- sm_120 execution confirmed: PyTorch 2.11.0+cu128 reports (12, 0)

### Still open
- Printing-room splat renders but is not correctly positioned; rotation, scale, and
  floor offset not yet derived (#6)
- The rotation/scale schema change (#7) is committed but NOT YET VERIFIED IN THE APP —
  no page load has confirmed that a non-zero rotation actually moves the splat
- 240 MB per zone is above the 50 MB target and above GitHub's hard limit (#8).
  Cheapest untested lever is SuperSplat's SH Bands export setting, currently 3
- Cleanup (floaters, cropping) skipped on the printing-room splat
- Static hosting never tested
