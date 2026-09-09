# Changelog

Newest entry first. This records what changed and when — for schedule and gates see `PLAN.md`, for architecture see `DESIGN.md`, for task state see GitHub Issues.

## 2026-09-09

### G1 passed — full pipeline validated end to end
Capture -> ffmpeg -> COLMAP -> splatfacto (RTX 5060) -> ns-export -> SuperSplat ->
.ply -> Vite -> Spark -> rendering and walkable in the app. Validated first with a
deliberately poor apartment capture, then with the real printing-room capture.

### Printing room captured and trained
- Capture: 7:16, 4K/60, HEVC, yuv420p/bt709, 48 Mbps, no HDR
- COLMAP: 451 of 452 frames registered (99.78%) with --num-frames-target 450
  --matching-method sequential
- Runtime: 135m53s wall, 1712m CPU (~12.6x parallelism). Feature matching alone was
  112 of 136 minutes and is CUDA-accelerable — see issue on building COLMAP from source
- Trained at the full 30000-iteration default, ~23 ms/iteration, ~22 M rays/sec
- Exported .ply: 240 MB
- Room measured by tape: 40.8 x 14.3 x 10.8 ft = 12.44 x 4.36 x 3.29 m

### Spark rejects SuperSplat .spz — switched to uncompressed .ply
SuperSplat v3.0.0-alpha's .spz export (6.0 MB, 13x compression) fails in Spark with
"Worker error: Invalid gzip header". SuperSplat reads the same file back without
complaint, so the file is not corrupt — Spark's decompressor does not recognise this
.spz variant. Workaround: export uncompressed .ply. Consequence: 240 MB per zone
against a 50 MB target, on static hosting where visitors download a zone before they
can walk it. Compression is now a real constraint, not an optimisation.

### Fixed silent splat load failure in src/zones.js
new SplatMesh({ url }) returns before its fetch completes, so load errors landed
outside the try block and the catch never fired. Now awaits mesh.initialized, logs
success, and falls back to the placeholder on failure. This fix is what surfaced the
gzip error above — the same failure was completely silent before it.

### Capture protocol validated by measurement
Registration across three captures: 0.63% (HDR on) -> 18.45% (HDR off, 4K/30, dim
evening light) -> 99.78% (4K/60, exposure locked, slow pace, lab lighting). Every
correction in the protocol came from a measured failure.

### Environment fixes
- Ubuntu 24.04 has no python3.11 package; requires the deadsnakes PPA
- PyTorch 2.6+ flipped torch.load's weights_only default, which BLOCKS ns-export.
  Patched in eval_utils.py. This patch lives inside the venv and is not version
  controlled — it must be reapplied if the venv is rebuilt
- gsplat JIT-compiles CUDA kernels on first GPU use. The compile was killed at
  MAX_JOBS=4 because WSL2 allocates only about half of host RAM. Fixed with
  MAX_JOBS=2 and a .wslconfig raising WSL2 to 12 GB with 4 GB swap
- sm_120 kernel execution confirmed: PyTorch 2.11.0+cu128 reports (12, 0)

### Still open
- Printing-room splat renders but is not correctly positioned. Rotation is close at
  X=90 (upside down; -90 is the likely correction). Scale and floor offset not yet
  derived. See the coordinate seam issue
- Whether SuperSplat bakes transforms into the exported file is UNVERIFIED. If it does
  not, rotation and scale need to become zones.json schema fields instead
- 240 MB per zone is above target. Cheapest untested lever is SuperSplat's SH Bands
  export setting, currently 3 — band 0 drops view-dependent colour and should cut size
  substantially
- Cleanup (floaters, cropping) skipped on the printing-room splat
