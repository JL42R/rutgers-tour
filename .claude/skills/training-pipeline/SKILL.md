---
name: training-pipeline
description: The exact end-to-end pipeline for turning captured footage into a web-ready Gaussian splat zone for this project — frame extraction, COLMAP posing via ns-process-data, splatfacto training, PLY export, SuperSplat cleanup, compression, and adding the zone to the web app. Use this skill whenever the user mentions processing a capture, training a splat, ns-train, COLMAP, exporting, a zone for the tour, out-of-memory (OOM/CUDA memory) errors during training, or asks "what do I do with this video I just filmed."
---

# Training Pipeline: Capture → Web-Ready Zone

Runs in WSL2 Ubuntu on the RTX 5060 laptop (8 GB VRAM, 16 GB system RAM — both are TIGHT; the caps below exist for a reason, do not remove them). Give the user commands one stage at a time and confirm each stage succeeded before the next.

## Stage 0: environment (once per machine)
Use the verified WSL2 Ubuntu 24.04 setup in `docs/SETUP_TRAINING.md`: Python 3.11 venv at `~/nerf`, not Conda. In WSL, run `nerf` to activate it; this alias expands to `source ~/nerf/bin/activate`. Follow that document for the CUDA/PyTorch/gsplat setup, memory limits, verification checks, and required checkpoint-loader patch rather than copying version numbers or generic installation instructions here. Verify with `python --version`, `ns-train --help`, and `colmap -h`.

## Stage 1: frames + camera poses (COLMAP, ~20–60 min)
```bash
nerf
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
  --max-num-iterations 30000
```
- Open the viewer URL it prints (http://localhost:7007) to watch training live.
- If CUDA OUT OF MEMORY: (1) downscale input images; (2) move the image cache to CPU RAM with the verified `--pipeline.datamanager.cache-images cpu` option; (3) inspect the installed splatfacto config and `ns-train splatfacto --help` for current Gaussian-count levers before changing them. If the zone still does not fit, split it. See `docs/SETUP_TRAINING.md` for the verified flag names; do not use an unverified `max-gs-num` flag.
- Output lands in `outputs/<zone>/splatfacto/<timestamp>/`.

## Stage 3: export PLY
```bash
ns-export gaussian-splat \
  --load-config outputs/<zone>/splatfacto/<timestamp>/config.yml \
  --output-dir exports/<zone>
```
If export fails with a `weights_only` checkpoint error, follow the required venv patch in `docs/SETUP_TRAINING.md` section 9d before retrying.

## Stage 4: cleanup in SuperSplat (browser, manual, ~15–30 min)
Open https://superspl.at/editor, load the exported .ply. In order:
1. Delete floaters (sphere-select stray blobs in the air, delete).
2. Crop to the room bounds — remove everything outside walls/ceiling.
3. Delete/blur any surface showing sensitive or personal info (privacy requirement).
4. Preserve the splat's reconstruction coordinate system. Record physical measurements and the doorway location for calibration in `public/zones.json`; do not bake orientation, physical scale, floor y=0, or zone origin into the PLY.
5. Export **Compressed PLY** as the primary current delivery experiment, named `<zone>.compressed.ply`. SuperSplat SPZ v4 is known incompatible with the current Spark release; see `DESIGN.md`.

## Stage 5: budget check (hard gates)
- File ≤ 50 MB. Over budget → back to SuperSplat, delete more aggressively (distant ceiling detail, under-furniture splats), or inspect the installed model's verified Gaussian-count levers in `docs/SETUP_TRAINING.md` before retraining.
- Drop the file into the web app and confirm ≥ 30 fps walking around on the dev laptop. Spark's LoD helps, but a bloated file still costs load time.

## Stage 6: add zone to web app
1. Copy the tested Compressed PLY to `public/splats/<zone>.compressed.ply`.
2. Add/update the zone entry in `public/zones.json`: set `splat` to the file path, remove `"placeholder": true`, and record runtime `rotation`, uniform `scale`, and `origin` so the floor is world y=0 and 1 unit = 1 meter. Keep or author `collision` boxes and `npcs` in those world coordinates. `src/zones.js` applies the transform after loading; collision never uses splat geometry.
3. `npm run dev`, walk the zone, tune collision boxes to match real walls.
4. Record capture/training results in `CHANGELOG.md` and the relevant GitHub Issue. Commit only validated compressed zone files under 50 MB when the repo's ignore rules permit them; raw PLY exports stay outside Git.

## Conventions
- Zone ids: short lowercase (`lobby`, `hallway-a`, `ise-lab`).
- Keep every trained output until final lock (see `docs/PLAN.md`); disk is cheaper than retraining.
- Record each zone's capture date, frames matched, iterations, file size, and known issues in `CHANGELOG.md` and the relevant GitHub Issue.
