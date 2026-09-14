# Changelog

Newest entry first. This records what changed and when — for schedule and gates see `PLAN.md`, for architecture see `DESIGN.md`, for task state see GitHub Issues.

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
