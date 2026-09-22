# Changelog

Newest entry first. This records what changed and when — for schedule and gates see `PLAN.md`, for architecture see `DESIGN.md`, for task state see GitHub Issues.

## 2026-09-22

### GitHub Pages deployment live and verified (Issue #11, PR #40)
- Added `.github/workflows/deploy.yml`; pushes and merges to `main` now run the Vite production build
  and publish `dist/` to https://jl42r.github.io/rutgers-tour/ through GitHub Pages.
- The deployed page, `zones.json`, and 62,132,080-byte compressed printing-room PLY return HTTP 200.
  The raw uncompressed PLY is not in the repository or deployment. The deployed scene loaded and
  rendered all 1,013,854 splats successfully.
- Manual public-site testing on a non-Johnny Windows machine over normal Wi-Fi reached a usable room
  in approximately 12 seconds. WASD, mouse-look, pointer lock/Esc release, collision, boundary
  sliding, and the disabled cyan collision overlay all behaved as expected, with no major visual
  problems observed.
- Chrome and Edge have deployment test coverage. Firefox is still unverified; Safari is still
  unverified and requires an Apple device. Known non-blocking observations are a missing
  `favicon.ico` request and a Three.js shader warning.

## 2026-09-21

### Printing-room collision debug overlay disabled and manually verified (Issue #26)
- Changed the printing room's `debugCollision` setting from `true` to `false`, so the translucent
  cyan collision wireframes are no longer enabled for public/deployment use.
- Collision AABBs and runtime behavior are unchanged, and the reusable debug rendering support
  remains available in `src/zones.js` for future zone authoring.
- Manual browser testing confirmed that the splat loads without the overlay while normal movement,
  collision blocking, and sliding along collision boundaries continue to work.

### Dialogue audio narration implemented and manually verified (Issue #14)
- Added opt-in Web Speech API narration for the currently displayed dialogue text. Advancing or
  closing dialogue cancels speech, disabling narration stops it immediately, and the On/Off setting
  persists while dialogue is closed and reopened during the page session.
- Audible narration was manually verified in normal Chrome through the existing dialogue system,
  using a temporary browser-only fixture because production NPC placement is not yet integrated.
  The fixture did not change repository files, and full NPC-triggered end-to-end testing is not claimed.
- This completes the audio-narration scope of Issue #14 only. Broader accessibility work remains in
  Issue #33, including focus behavior, keyboard-only verification, screen-reader testing, and
  pointer-lock accessibility limitations; none of those items is claimed complete here.

## 2026-09-17

### Docs synced, gates rewritten, board rebuilt (PR #22, merged as f32f882)
No code or pipeline changes — the docs described blockers already solved and a scope we'd moved past.

- **Zone 1 is the printing room**, official, not a test capture. Compressed PLY ships in the repo,
  so a fresh clone renders it — the "download from Drive" steps are gone from all five docs.
- **Scope: 4–5 zones, star topology.** The hallway is the hub and the shared reference frame:
  every transition is hallway↔room, and it is aligned before anything is positioned against it.
- **Gates now each measure one thing** — G3 breadth (every zone primitive), G4 depth (every surviving
  zone finished), G5 the stranger test. Cuts are taken at the Oct 9 G3 review; milestones match §3.
- **Unmaintained checklists deleted** (PLAN.md §4, AGENTS.md status block) — both had drifted into
  describing a project we weren't running. GitHub Issues is the task-level record.
- **`.gitignore`:** added `*.MOV`/`*.mov`; generalized the splat negation to `!public/splats/*.compressed.ply`,
  which had named one file — the next zone would have been silently ignored. Removed `demo-guide.json`.

### Board rebuilt — 14 issues opened, #23–#36
#23 SH bands · #24 FPS baseline · #25 cleanup regression · #26 debugCollision · #27 hallway align ·
#28 zone list · #29 testers · #30 frame count · #31 venv patch · #32 primitive checklist · #33 a11y
· #34 performance · #35 demo prep · #36 push local NPC work

**Three decisions left open on purpose, each now an issue rather than a guess in a doc:** the SH
band standard (#23 — blocks every zone export), the `ns-process-data` frame target (#30 — 250 vs
the 450 that worked), and the cleanup quality regression (#25 — cause undiagnosed).

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
