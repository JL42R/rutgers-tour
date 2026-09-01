---
name: training-pipeline
description: The exact end-to-end pipeline for turning captured footage into a web-ready Gaussian splat zone for this project — frame extraction, COLMAP posing via ns-process-data, splatfacto training, PLY export, SuperSplat cleanup, compression, and adding the zone to the web app. Use this skill whenever the user mentions processing a capture, training a splat, ns-train, COLMAP, exporting, a zone for the tour, out-of-memory (OOM/CUDA memory) errors during training, or asks "what do I do with this video I just filmed."
---

# Training Pipeline: Capture → Web-Ready Zone

Runs in WSL2 Ubuntu on the RTX 5060 laptop (8 GB VRAM, 16 GB system RAM — both are TIGHT; the caps below exist for a reason, do not remove them). Give the user commands one stage at a time and confirm each stage succeeded before the next.

## Stage 0: environment (once per machine)
Conda env `splat` with Python 3.10, PyTorch + CUDA, then `pip install nerfstudio`, and COLMAP (`sudo apt install colmap` or via conda). Follow current install docs at docs.nerf.studio if anything fails — versions shift. Verify with: `ns-train --help` and `colmap -h`.

## Stage 1: frames + camera poses (COLMAP, ~20–60 min)
```bash
conda activate splat
ns-process-data video \
  --data captures/<zone>/<file>.mp4 \
  --output-dir data/<zone> \
  --num-frames-target 250
```
- 250 frames is the default budget for our RAM. Range 150–300. More frames ≠ better beyond this; it mostly costs RAM and time.
- Close browsers/apps during this — COLMAP eats system RAM.
- SUCCESS CHECK: output says the vast majority of frames matched (e.g., "245/250 images"). If under ~70% matched, STOP — this is a capture problem. Consult the capture-protocol skill's failure table; do not try to train on bad poses.

## Stage 2: train (~30–60 min on the 5060)
```bash
ns-train splatfacto --data data/<zone> \
  --pipeline.model.cull-alpha-thresh 0.1 \
  --max-num-iterations 30000
```
- Open the viewer URL it prints (http://localhost:7007) to watch training live.
- If CUDA OUT OF MEMORY: (1) rerun Stage 1 with `--num-frames-target 180`; (2) add `--pipeline.model.max-gs-num 1500000` to cap splat count; (3) if still OOM, the zone is too big — split it into two zones. In that order.
- Output lands in `outputs/<zone>/splatfacto/<timestamp>/`.

## Stage 3: export PLY
```bash
ns-export gaussian-splat \
  --load-config outputs/<zone>/splatfacto/<timestamp>/config.yml \
  --output-dir exports/<zone>
```

## Stage 4: cleanup in SuperSplat (browser, manual, ~15–30 min)
Open https://superspl.at/editor, load the exported .ply. In order:
1. Delete floaters (sphere-select stray blobs in the air, delete).
2. Crop to the room bounds — remove everything outside walls/ceiling.
3. Delete/blur any surface showing sensitive or personal info (privacy requirement).
4. ORIENT: floor flat on the ground plane, floor level at y = 0. This convention is load-bearing — the web app assumes it.
5. SCALE: 1 unit = 1 meter. Calibrate against a known measurement (standard US door ≈ 0.91 m wide, 2.03 m tall).
6. Note the world position of the zone's entry doorway — this becomes the zone origin in zones.json.
7. Export as **Compressed PLY** (or SPZ if the option exists). Name it `<zone>.compressed.ply` / `<zone>.spz`.

## Stage 5: budget check (hard gates)
- File ≤ 50 MB. Over budget → back to SuperSplat, delete more aggressively (distant ceiling detail, under-furniture splats), or retrain with a lower `max-gs-num`.
- Drop the file into the web app and confirm ≥ 30 fps walking around on the dev laptop. Spark's LoD helps, but a bloated file still costs load time.

## Stage 6: add zone to web app
1. Copy file to `public/splats/<zone>.spz` (or .compressed.ply).
2. Add/update the zone entry in `public/zones.json`: set `splat` to the file path, remove `"placeholder": true`, set `origin`, keep or author `collision` boxes and `npcs` (positions are in the zone's meter coordinates, y = height above floor).
3. `npm run dev`, walk the zone, tune collision boxes to match real walls.
4. Commit: capture notes + zones.json + the splat file (if the repo uses Git LFS for splats, follow that; otherwise files under 50 MB commit fine to GitHub).

## Conventions
- Zone ids: short lowercase (`lobby`, `hallway-a`, `ise-lab`).
- Keep every trained output until final lock (see `PLAN.md`); disk is cheaper than retraining.
- Log each zone in `docs/ZONELOG.md`: capture date, frames matched, iterations, file size, known issues.
