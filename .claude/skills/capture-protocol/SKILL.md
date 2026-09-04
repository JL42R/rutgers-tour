---
name: capture-protocol
description: How to capture video/photos of a room for 3D Gaussian Splatting reconstruction. Use this skill whenever the user is planning a capture session, about to film a zone, asking what settings or camera movement to use, or when a reconstruction came out with holes, floaters, blur, ghosting, or COLMAP failed to find camera poses — bad capture is the root cause of almost every downstream failure, so consult this before suggesting retraining or parameter changes.
---

# Capture Protocol for Gaussian Splatting (CORE Tour Project)

Capture quality determines everything downstream. A perfect training run cannot fix a bad capture; a good capture makes everything else easy. When a reconstruction looks bad, the fix is almost always RECAPTURE, not retraining with different parameters.

## Phone settings (do this before every session)
- 4K resolution. Turn OFF: HDR, auto-enhancement, cinematic/portrait modes, video stabilization if it causes warping (test once; standard OIS is fine).
  - **Why HDR must be off:** 10-bit HDR video (Dolby Vision, bt2020, HLG) extracted to 8-bit frames without tonemapping loses local contrast. SIFT, the feature detector COLMAP uses, finds keypoints at local contrast extrema — flatten the contrast and there are no features left to match, so COLMAP finds no poses. Evidence: our first test take, shot with HDR on, registered 2 of 318 frames (0.63%). Don't just trust the camera app setting — see "Verify the file before you shoot the real capture" below.
- Frame rate: prefer **4K/60 over 4K/30** whenever light is anything less than bright. At 60fps the shutter cannot stay open longer than 1/60s, which forces a faster shutter and higher ISO. Sharp-and-noisy beats smooth-and-blurry for feature matching — this is the single biggest blur lever after adding more light.
- LOCK exposure and focus if the phone allows (tap-hold in most camera apps). Auto-exposure shifting mid-capture confuses reconstruction.
- Clean the lens. Seriously.
- Landscape orientation, always.

## Verify the file before you shoot the real capture
Camera app settings are not the ground truth — the file that actually lands on disk is. Before shooting the real capture, shoot a 5-second test clip, transfer it the exact same way you'll transfer the real footage, and check it:

```bash
ffprobe FILE.mp4 2>&1 | grep -E "Video:|DOVI"
```

- **PASS:** `yuv420p`, `bt709`, no `DOVI` line.
- **FAIL:** `yuv420p10le`, `bt2020`, `arib-std-b67`, or any "DOVI configuration record" line.

Check the file on disk, not just the camera setting — transfer paths (AirDrop, cloud sync, some cable-copy apps) can re-encode video and preserve HDR metadata even when the camera app said HDR was off. Both test takes on 2026-09-04 showed evidence of re-encoding between phone and disk, so don't skip this step.

## Movement technique
- Walk SLOWLY — half normal walking pace. Motion blur is the #1 capture killer.
- Hold the phone with two hands at chest height, slightly tilted down toward the room center.
- Move in smooth, continuous paths. No sudden pans, no whip turns. Rotate your whole body, not just wrists.
- Every new frame should overlap ~70–80% with the previous view. If you rotate, rotate slowly.
- Translation beats rotation: COLMAP needs the camera to MOVE through space, not spin in place. Never stand in one spot and pan — that is the classic failure.

## Coverage pattern per zone (aim for 2–4 minutes of video)
1. Perimeter loop: walk the room's edge, camera aimed across the room, one full lap.
2. Second lap at a different height (crouch slightly or raise overhead) and/or aimed at the opposite angle.
3. Cross passes: walk 2–3 straight lines through the middle of the room.
4. Detail passes: slowly approach anything important (lab equipment, signage) from multiple angles.
5. CLOSE THE LOOP: end near where you started, re-filming the starting area. Loop closure dramatically improves pose accuracy.
6. Doorways/transitions between zones: film a slow pass through each doorway from both directions — needed later to align zones.

**Video length vs. frame count:** `ns-process-data` samples a target number of frames (~300) regardless of clip length, so a longer clip means wider frame spacing, not more detail. A 3-minute clip and a 90-second clip both yield ~300 frames — the 3-minute clip just has less overlap between them, and costs the same COLMAP time. For testing/rehearsal captures, 60–90 seconds is enough to validate the pipeline; save the full 2–4 minute coverage pattern above for real zone captures. Budget accordingly: COLMAP took ~24 minutes for ~300 frames on our CPU-only build (no CUDA).

### Capture scope and the VRAM ceiling
Training happens on a single 8 GB RTX 5060. Capture scope has to stay within what that GPU can actually train. This is why the building is split into zones at doorway chokepoints rather than captured as one continuous walk. A beautiful five-minute capture spanning half a floor may simply not train. If in doubt, capture a smaller area.

## Scale reference (required)
COLMAP recovers geometry only up to an unknown scale factor: a small room filmed close up and a large room filmed from far away produce identical images, so the math cannot tell them apart. Splatfacto inherits that arbitrary scale, and `auto_scale_poses` normalizes it further. This project's convention is 1 unit = 1 meter with the floor at y=0, and collision boxes are authored in real-world dimensions — so every zone needs a way to recover true scale.

- Place a tape measure extended to exactly 1 meter flat on the floor and film it clearly from two or three angles.
- Write down the room's real length, width, and floor-to-ceiling height.
- After training, measure that same reference in the finished splat; the ratio between measured and real gives the scale factor to apply.

Without this, every zone lands at a different arbitrary scale and zone-to-zone alignment becomes guesswork.

## Lighting and environment
- Even, bright, diffuse light. Overcast daylight through windows or all room lights on. Avoid: direct sun patches, strong shadows, mixed color temperature.
- Avoid or minimize: mirrors, glass walls, TVs/monitors that are ON (turn them off), highly reflective floors when possible (angle the camera to reduce glare).
- NO PEOPLE in frame (privacy requirement + moving objects break reconstruction). Capture during off-hours.
- Remove/avoid papers with personal info, name plates, whiteboards with sensitive content — or plan to crop them in SuperSplat.
- Nothing should move during capture: no swaying doors, no fans with visible blades, no chairs being bumped.

## Pre-session checklist
- [ ] Written permission confirmed for this space
- [ ] Off-hours / space is empty
- [ ] Monitors off, sensitive info removed
- [ ] Phone: 4K/30 or 4K/60 in dim light, exposure locked, lens cleaned, storage free (2–4 min of 4K ≈ 1.5–3 GB)
- [ ] 5-second test clip shot, transferred, and verified with `ffprobe` (see "Verify the file before you shoot the real capture" above) — no HDR/DOVI metadata
- [ ] Walked the route once WITHOUT recording to plan the path
- [ ] Tape measure ready for the 1-meter scale reference (see "Scale reference (required)" above)

## After capture, before leaving the building
Review the footage on the phone at 2x speed. Check: no blur when paused at random points, no people, full room coverage, loop closed. Re-shoot NOW if in doubt — coming back another day costs more than 5 minutes of re-shooting.

## Reading the registration percentage
`ns-process-data` reports what fraction of frames COLMAP registered. Interpretation:

- **Above ~80%:** healthy, proceed to training.
- **40–70%:** workable but technique needs tightening; consider a retake.
- **Under ~20%:** do not train. Diagnose first — check HDR metadata, then frame sharpness, then whether the registered frames are contiguous or scattered (see the failure table below).

A low percentage is a capture problem, not a training-parameter problem. The fix is recapture, not retraining with different parameters.

## Failure → fix table
| Symptom in reconstruction | Cause | Fix |
|---|---|---|
| COLMAP finds few/no poses | Spinning in place, blur, textureless walls | Recapture: slower, more translation, include floor/ceiling edges in frame |
| COLMAP registers a CONTIGUOUS BLOCK of frames and nothing else (e.g. frames 114–170 of 309) | Motion blur breaking the match chain — the mapper grew outward from one good pair until it could no longer link frames in either direction; one stretch of the walk was sharp, the rest was not | Recapture with more light, locked exposure, 4K/60, and a slower walk. Contiguous means blur, NOT coverage gaps — scattered clusters would indicate a coverage problem instead |
| Holes/missing patches | Area never filmed from enough angles | Recapture just that area with a detail pass, add images to dataset |
| Floaters (blobs in mid-air) | Reflections, moving objects, sparse coverage | Delete in SuperSplat; if severe, recapture with monitors off / less glare |
| Ghosting/doubled surfaces | Loop not closed, exposure shifted mid-capture | Recapture with locked exposure and explicit loop closure |
| Mushy/blurry surfaces everywhere | Motion blur in source video | Recapture at half speed; brighter light lets the phone use faster shutter |

## Rescuing footage already shot in HDR
If a capture with HDR on cannot be reshot, frames can be re-extracted with explicit tonemapping and fed to `ns-process-data images` (not `video`):

```bash
ffmpeg -i INPUT.mp4 -vf "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,fps=2" -q:v 2 OUTDIR/frame_%05d.jpg
```

Requires an ffmpeg build with `libzimg` for the `zscale` filter. This is a rescue for footage that cannot be reshot — it is not an acceptable capture method on its own. Reshooting with HDR off is always better.

File naming convention for this project: `captures/<zone-id>/<YYYY-MM-DD>-take<N>.mp4` (e.g., `captures/lobby/2026-08-04-take1.mp4`). Never delete takes — storage is cheap, re-shoots are not.

## Field notes
**2026-09-04, first real test capture session** (indoors, late-afternoon September light):
- Take 1 — 2:38, 4K/30, HDR on: COLMAP registered 2 of 318 frames (0.63%). Root cause: HDR contrast flattening killed SIFT features.
- Take 2 — 2:56, 4K/30, HDR off: COLMAP registered 57 of 309 frames (18.45%), and the registered frames formed an exactly contiguous block (frame_00114–frame_00170) — motion blur breaking the match chain, not a coverage gap.
- COLMAP runtime: ~24 minutes for 309 frames, CPU-only build (no CUDA).

These recommendations (HDR verification, 4K/60 in dim light, scale reference, registration-percentage triage) came from this session's measurements, not theory.
