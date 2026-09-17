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
  --data captures/<zone>/<file>.MOV \
  --output-dir data/<zone> \
  --num-frames-target 250
```
- **The frame target is an OPEN QUESTION — read the capture-protocol skill's field notes before picking one.** 250 (range 150–300) is this document's original RAM-derived budget; our only successful capture used `--num-frames-target 450` and registered 99.78%. The two have never been compared head to head, so choose deliberately rather than copying the command above. Runtime is the thing that bites: ~24 min of COLMAP at ~300 frames vs **135m53s at 452** on our CPU-only build.
- Whichever you pick, record it and the registration percentage in `CHANGELOG.md`.
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
5. Export **Compressed PLY**, named `<zone>.compressed.ply`. This is our confirmed delivery format — Spark 2.1.0 loads it. Do NOT export SPZ: SuperSplat writes v4 and no released Spark decoder reads it; see `DESIGN.md` §3.5.
   **Record the SH Bands setting you exported at, in `CHANGELOG.md`, every single time.** It is the dominant term in file size and the one export knob we vary. A zone file whose band setting wasn't written down cannot be compared against another, which makes the pending band-1-vs-band-0 test impossible to interpret. Note the setting and the resulting byte count together.

## Stage 5: budget check (targets, not gates)
- **≤ 50 MB is the target, and we are currently over it.** Zone 1 shipped at 62,132,080 bytes and was accepted. Do not block a zone on this number, and do not claim the project meets it.
- **SH bands are the primary size lever.** At SuperSplat's default SH Bands = 3, spherical harmonics are ~74% of the file (16 bytes base + 45 bytes SH per splat). Projected for Zone 1's 1,013,854 splats: band 1 ≈ 26 MB, band 0 ≈ 16.5 MB.
- **The band choice is not made yet.** Band 1 and band 0 are to be exported and compared side by side in the browser before the project sets a standard — the numbers above are arithmetic, not a judgement on how either looks. Until that test happens, use band 3 and record it. See `DESIGN.md` §3.5 and issue #8.
- Deleting splats is the *secondary* lever, and it carries a caveat: on the printing room, SuperSplat cleanup was observed to make quality *worse* (cause never diagnosed — see the capture-protocol skill's field notes). Prefer lowering SH bands over aggressive deletion, and look at the result before trusting it.
- Drop the file into the web app and confirm ≥ 30 fps walking around on the dev laptop. Spark's LoD helps, but a bloated file still costs load time.

## Stage 6: add zone to web app

**The hallway is the reference frame. Align it first.** The scene is 4–5 zones in a star
topology — every transition is hallway↔room, never room↔room — so the hallway is the one zone
every other zone is positioned against. Concretely:

- Align the hallway to world coordinates first, before any room that opens off it.
- Express every other zone's `origin` and `rotation` **relative to the aligned hallway**, using the doorway you filmed from both directions as the shared landmark.
- Never re-align the hallway after rooms have been placed against it — that invalidates every room's transform at once. If the hallway is wrong, fix it before adding zones, not after.

1. Copy the tested Compressed PLY to `public/splats/<zone>.compressed.ply`. **The `.compressed.ply` suffix is load-bearing:** `.gitignore` blanket-ignores `*.ply` and re-includes `public/splats/*.compressed.ply` by pattern, so a correctly-named file is tracked automatically and a misnamed one is silently invisible. Confirm with `git status` that Git sees it.
2. Add/update the zone entry in `public/zones.json`: set `splat` to the file path, remove `"placeholder": true`, and record runtime `rotation`, uniform `scale`, and `origin` so the floor is world y=0 and 1 unit = 1 meter. Keep or author `collision` boxes and `npcs` in those world coordinates. `src/zones.js` applies the transform after loading; collision never uses splat geometry.
3. `npm run dev`, walk the zone, tune collision boxes to match real walls.
4. Record capture/training results in `CHANGELOG.md` and the relevant GitHub Issue: capture date, frame target used, frames registered, iterations, **SH bands exported at**, final byte count, and known issues. Commit the compressed zone file once it loads in Spark — 50 MB is a target, not a commit gate. Raw PLY exports stay outside Git.

## Conventions
- Zone ids: short lowercase (`lobby`, `hallway-a`, `ise-lab`).
- Keep every trained output until final lock (see `docs/PLAN.md`); disk is cheaper than retraining.
- Record each zone's capture date, frames matched, iterations, file size, and known issues in `CHANGELOG.md` and the relevant GitHub Issue.
