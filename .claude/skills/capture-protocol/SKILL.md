---
name: capture-protocol
description: How to capture video/photos of a room for 3D Gaussian Splatting reconstruction. Use this skill when planning a capture, choosing camera settings or movement, or diagnosing holes, floaters, blur, ghosting, or missing COLMAP poses. Inspect capture quality and alignment evidence before suggesting recapture or training changes.
---

# Capture Protocol for Gaussian Splatting (CORE Tour Project)

Sharp, overlapping views give reconstruction a good starting point. When results look bad, inspect the source images and camera alignment first; capture defects, processing, and matching failures need different fixes. Training cannot recover views that were never captured clearly.

## Recommended photo workflow: Hamza's next iPhone 14 Pro Max test

Try individual **stop-and-shoot photos**, especially where walking video shows motion blur. This is a proposed project workflow to validate with alignment and reconstruction, not a proven team result. Apple documents the controls below; our choices of settings, overlap, and photo count are project recommendations. Menu labels may vary with iOS version; use controls available on the iPhone 14 Pro Max, not newer-model-only features.

### Photo settings (before every photo session)

- Settings → Camera → Formats → **Most Compatible** for ordinary JPEG photos.
- Keep **RAW off** in the Camera app for this initial test. Optional 48 MP ProRAW is an advanced workflow needing consistent conversion of every image; it is unnecessary for our first test and produces much larger originals.
- Settings → Camera → **Prioritize Faster Shooting off**. Apple says this changes processing for rapid shutter taps; our test uses deliberate individual shots.
- Turn **Grid and Level on**, where available. Choose **Photographic Style: Standard**, with no filters.
- Camera app: **Photo mode, 1× main camera, 4:3, landscape orientation**. Set **Flash and Live Photos off**.
- Avoid Portrait, Panorama, digital zoom, and lens switching. Stay far enough from details to avoid switching into an Ultra Wide macro view.
- For handheld capture, add room lighting instead of relying on long Night-mode exposures; inspect a test photo for blur.
- There is no global “auto-enhancement” switch or Smart HDR photo switch to disable on this model. **HDR Video controls video only**, not photo processing.

### Exact photo-capture procedure

1. Clean the lens, turn on room lights, and avoid harsh sunlight patches. Follow the permission/privacy checklist below and keep the room static.
2. Point at a textured object at a representative distance. Touch and hold it on screen until **AE/AF Lock** appears; adjust exposure if needed. Take a test photo and check sharpness and exposure. Tap to unlock and re-establish the lock when distance or lighting changes enough to require it.
3. Move a small step, **stop completely**, hold the phone steady with both hands, and take one photo. Repeat with roughly **70–80% overlap** between neighboring views. Move through space; do not just stand in one place and rotate.
4. Follow the shared coverage pattern below: perimeter loop, overlapping viewpoints at different heights, cross passes, and details from multiple angles. Revisit the starting area for loop closure.
5. Target **150–300 photos per small zone** within our 8 GB VRAM / 16 GB system RAM budget. Coverage and sharpness matter more than reaching a number. Keep original resolution for review and backup; the existing processing workflow handles working-image downscaling (DESIGN.md targets ≤1600 px on the long side).
6. Capture the measured one-meter reference from multiple angles and record room dimensions as described below.
7. Before leaving, inspect full-resolution photos, zooming in to check detail. Retake blurry sections with overlapping views connecting them to the surrounding coverage.
8. Transfer original files without messaging-app compression or per-image edits. Preserve originals in a dated take folder and back them up; see naming guidance below.

## Separate video workflow (still supported)

- Use normal **Video mode, 1× main camera, landscape**, and clean the lens.
- Prefer **4K/60 when lighting is sufficient**. It can limit exposure time, but 60 fps is not a cure for darkness and may increase noise. Add light and slow down; bright, sharp **4K/30 can also be usable**.
- Settings → Camera → Record Video: **HDR Video off, Auto FPS off, Lock Camera on**, and **Lock White Balance on if available**. Apple documents these video controls; these settings are our project recommendation for consistency.
- Keep **Action mode, Cinematic mode, and ProRes off** for this workflow. Standard OIS is fine; inspect a test clip for stabilization artifacts.
- **4K/60 may require High Efficiency (HEVC) encoding.** Do not require H.264 for every video; codec and HDR are separate properties. Switch back to Most Compatible when returning to the JPEG photo test.
- Lock focus/exposure on a representative textured subject, check the result, and re-establish the lock when necessary. Follow the slow movement and coverage instructions below.
- We recommend SDR to simplify frame extraction. Incorrect HDR-to-SDR conversion can alter contrast and matching, but metadata or low registration counts alone do not establish the cause of an alignment failure.

## Verify the file before you shoot the real capture
For video, inspect the file that actually lands on disk. Before shooting the real capture, shoot a 5-second test clip, transfer it the exact same way you'll transfer the real footage, and check it:

In Windows PowerShell with `ffprobe` installed:

```powershell
ffprobe "FILE.MOV" 2>&1 | Select-String -Pattern 'Video:|DOVI'
```

- **Expected for this SDR workflow:** `yuv420p`, `bt709`, no `DOVI` line; also check resolution and frame rate.
- **Investigate before extraction:** `yuv420p10le`, `bt2020`, `arib-std-b67`, or any "DOVI configuration record" line. Ten-bit pixel format alone does not prove HDR. Missing color tags require inspection rather than assuming SDR.

Check the file on disk as well as the camera setting: transfer paths can convert or re-encode video. SDR/BT.709 metadata describes the uploaded copy; it does **not** prove the original camera recording had HDR disabled. The September 4 session reported evidence of re-encoding for both takes, so retain originals and record the transfer method. This metadata check does not validate sharpness or reconstruction success.

## Video movement technique
- Walk SLOWLY — half normal walking pace. Inspect sharpness; even slow movement can blur in poor light.
- Hold the phone with two hands at chest height, slightly tilted down toward the room center.
- Move in smooth, continuous paths. No sudden pans, no whip turns. Rotate your whole body, not just wrists.
- Every new frame should overlap ~70–80% with the previous view. If you rotate, rotate slowly.
- Translation beats rotation: COLMAP needs the camera to MOVE through space, not spin in place. Never stand in one spot and pan — that is the classic failure.

## Shared coverage pattern per zone (photos or video)
For photos, stop fully at each viewpoint. For video, aim for 2–4 minutes of slow coverage.

1. Perimeter loop: walk the room's edge, camera aimed across the room, one full lap.
2. Second lap at a different height (crouch slightly or raise overhead) and/or aimed at the opposite angle.
3. Cross passes: walk 2–3 straight lines through the middle of the room.
4. Detail passes: slowly approach anything important (lab equipment, signage) from multiple angles.
5. CLOSE THE LOOP: end near where you started, capturing the starting area again to provide matches for loop closure.
6. Doorways/transitions between zones: capture overlapping views through each doorway from both directions — needed later to align zones.

**Video length vs. frame count:** the existing training workflow targets 250 frames, within a 150–300-frame budget — **but see the OPEN QUESTION in the field notes below: our one successful capture used 450 frames and a 7:16 clip, and the two have never been compared head to head.** At the same extraction target, a longer clip means wider time spacing between sampled views; it does not automatically add detail and can reduce overlap. For a small rehearsal area, plan 60–90 seconds; duration alone does not validate the pipeline. Budget accordingly: COLMAP took ~24 minutes for ~300 frames and 135m53s for 452 on our CPU-only build (no CUDA); equal frame counts do not guarantee equal runtimes.

### Capture scope and the VRAM ceiling
Training happens on a single 8 GB RTX 5060. Capture scope has to stay within what that GPU can actually train. This is why the building is split into zones at doorway chokepoints rather than captured as one continuous walk. A beautiful five-minute capture spanning half a floor may simply not train. If in doubt, capture a smaller area.

## Scale reference (required)
COLMAP recovers geometry only up to an unknown scale factor: a small room filmed close up and a large room filmed from far away produce identical images, so the math cannot tell them apart. Splatfacto inherits that arbitrary scale, and `auto_scale_poses` normalizes it further. This project's convention is 1 unit = 1 meter with the floor at y=0, and collision boxes are authored in real-world dimensions — so every zone needs a way to recover true scale.

- Place a tape measure extended to exactly 1 meter flat on the floor and photograph or film it clearly from two or three angles.
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
- [ ] Both workflows: lens cleaned, storage free, room lights on, representative AE/AF Lock checked, room static
- [ ] Photos (if chosen): JPEG / RAW off, Faster Shooting off, Grid/Level on where available, Standard style / no filters, Photo / 1× / 4:3 / landscape, Flash / Live Photos off
- [ ] Photos (if chosen): test originals transferred and inspected at full resolution; plan 150–300 sharp overlapping views
- [ ] Video (if chosen): 4K/60 with sufficient light or sharp 4K/30; HDR Video / Auto FPS off, Lock Camera on, Lock White Balance on if available; Action / Cinematic / ProRes off
- [ ] Video (if chosen): 5-second test clip transferred and checked with `ffprobe` and visual inspection; encoding may be HEVC (2–4 min of 4K can need roughly 1.5–3 GB, depending on settings)
- [ ] Walked the route once WITHOUT recording to plan the path
- [ ] Tape measure ready for the 1-meter scale reference (see "Scale reference (required)" above)

## After capture, before leaving the building
Photos: inspect full-resolution images and retake blurry sections with connecting overlap. Video: review the clip, pause at points throughout it, and inspect for blur. For both, check privacy, room coverage, the scale reference, and loop closure before leaving. Preserve original files without compression or individual edits and make a backup after transfer.

## Reading the registration percentage
`ns-process-data` reports what fraction of frames COLMAP registered. Interpretation:

- **Above ~80%:** healthy, proceed to training.
- **Below ~70%:** stop before training per the training-pipeline skill; inspect alignment and coverage, and consider a retake.
- **70–80%:** inspect missing views and pose quality before proceeding.
- **Under ~20%:** do not train. Diagnose first — check HDR metadata, then frame sharpness, then whether the registered frames are contiguous or scattered (see the failure table below).

A low percentage calls for capture, extraction, and matching diagnosis before training. Registration percentage alone neither identifies the cause nor guarantees a usable reconstruction.

## Failure → fix table
| Symptom in reconstruction | Possible cause (verify first) | Fix |
|---|---|---|
| COLMAP finds few/no poses | Spinning in place, blur, textureless walls | Recapture: slower, more translation, include floor/ceiling edges in frame |
| COLMAP registers a CONTIGUOUS BLOCK of frames and nothing else (e.g. frames 114–170 of 309) | A break in matching; blur is one hypothesis, alongside insufficient overlap, weak/repeating texture, exposure changes, or matching configuration | Inspect images and matches around the block boundaries. If blur is confirmed, add light and test stop-and-shoot photos or slower video; use 4K/60 only with sufficient light. The block alone does not rule out coverage gaps |
| Holes/missing patches | Area never filmed from enough angles | Recapture just that area with a detail pass, add images to dataset |
| Floaters (blobs in mid-air) | Reflections, moving objects, sparse coverage | Delete in SuperSplat; if severe, recapture with monitors off / less glare |
| Ghosting/doubled surfaces | Loop not closed, exposure shifted mid-capture | Recapture with locked exposure and explicit loop closure |
| Mushy/blurry surfaces everywhere | Motion blur in source video | Recapture at half speed; brighter light lets the phone use faster shutter |

## Rescuing footage already shot in HDR
If a capture with HDR on cannot be reshot, frames can be re-extracted with explicit tonemapping and fed to `ns-process-data images` (not `video`):

```bash
ffmpeg -i INPUT.MOV -vf "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,fps=2" -q:v 2 OUTDIR/frame_%05d.jpg
```

Run this existing rescue command in WSL2 Ubuntu; it requires an ffmpeg build with `libzimg` for the `zscale` filter. Preserve the original and inspect converted frames before alignment. A new SDR capture is our preferred starting point, but conversion may salvage useful footage; success must be checked.

File naming convention for this project: `captures/<zone-id>/<YYYY-MM-DD>-take<N>.MOV` (e.g., `captures/hallway/2026-09-18-take1.MOV`). Matches issues #3 and #4, and matches what the iPhone actually writes — keep the `.MOV` extension rather than renaming to `.mp4`. Never delete takes — storage is cheap, re-shoots are not.

> **`.gitignore` covers `*.mp4` but not `*.MOV`.** A 4K take is 1.5–3 GB and will not be caught
> by the ignore rules if it lands inside the repo. Keep captures in the Drive folder and out of
> the working tree; run `git status` before staging after any capture session.

For photos, use `captures/<zone-id>/<YYYY-MM-DD>-take<N>/` and retain original filenames inside it. Back up raw captures outside Git; do not commit photo datasets or videos.

## Field notes

### ⚠️ OPEN QUESTION — frame count and clip length are NOT settled

**This skill and our only successful capture disagree, and the disagreement is unresolved.**
Do not treat either number as the answer; know that you are choosing between them.

| | This skill says | The Sep 9 printing room (our only success) did |
|---|---|---|
| Frame target | 250, budget 150–300 | `--num-frames-target 450` → 452 extracted |
| Clip length | 2–4 min per zone | 7:16 |
| Result | — | 451/452 registered, **99.78%** |

The 150–300 budget was written from the 8 GB VRAM / 16 GB RAM ceiling, before any capture had
succeeded. The 450-frame run then registered at 99.78% and trained fine, so the budget was
never actually validated as a ceiling — nor was it shown to be wrong, because nobody has run
the same room at 250 to compare.

**The runtime consequence is real but was overstated — see the 2026-09-22 update below.**
The original comparison (CPU-only COLMAP, the build we have):

| Frames | COLMAP wall time |
|---|---|
| 309 | ~24 min |
| 452 | **135m53s** |

1.46x the frames cost 5.6x the wall time. This was read as matching growing superlinearly with
frame count, but the two runs differed in more than frame count — matching method (default vs.
sequential) and footage quality (blurrier 4K/30 vs. sharper 4K/60) both changed at the same time,
so the 1.46x→5.6x figure can't isolate frame count as the cause. **Do not repeat "matching grows
superlinearly" as a settled scaling law** — the 2026-09-22 hallway run, which held matching
method and footage quality roughly constant, measured a much smaller cost per added frame (see
below). Treat runtime as expensive and worth budgeting for, not as following a known curve.

**What would settle it:** process one already-captured zone at both targets and compare
registration percentage and visual quality. Until someone does that, state which target you
used and why in `CHANGELOG.md`, and budget the runtime above accordingly. Issue #17 (CUDA
COLMAP) would change this calculus substantially if it ever lands.

**2026-09-04, first real test capture session** (indoors, late-afternoon September light):
- Take 1 — 2:38, 4K/30, reported HDR on: COLMAP registered 2 of 318 frames (0.63%). The original diagnosis was HDR contrast flattening affecting SIFT features; this is a hypothesis, not a cause established by the count alone.
- Take 2 — 2:56, 4K/30, reported HDR off: COLMAP registered 57 of 309 frames (18.45%), and the registered frames formed an exactly contiguous block (frame_00114–frame_00170). The original diagnosis was motion blur breaking the match chain; the block suggests a matching break but does not prove blur or exclude a coverage gap.
- COLMAP runtime: ~24 minutes for 309 frames, CPU-only build (no CUDA).

The session motivated metadata checks and registration triage. Its original recommendation of 4K/60 in dim light was not a measured comparison of frame rates; the current recommendation above requires sufficient lighting. Scale references and overlapping viewpoints are project capture requirements, not results proven by these two takes.

**2026-09-09, printing room — first capture under the fully corrected protocol** (first positive datapoint in these notes):
- 7:16, 4K/60, HEVC, `yuv420p`/`bt709`, 48 Mbps, no HDR — passed the `ffprobe` pre-flight before shooting.
- Exposure locked, half-pace walk, tape-measure reference, loop closed, lab lighting (even, bright).
- `ns-process-data` run with `--num-frames-target 450 --matching-method sequential`, extracting 452 of 26,194 frames.
- COLMAP registered 451 of 452 frames — **99.78%**, comfortably above the "healthy" threshold.
- Registration across all three captures to date: 0.63% (HDR on) → 18.45% (HDR off, 4K/30, dim evening light) → 99.78% (this capture). Every correction below came from one of these three measured results, not from guessing.

**2026-09-15, printing room — SuperSplat cleanup made it look WORSE, and we don't know why:**
- The team cleaned the printing-room splat in SuperSplat (the standard floater-deletion and
  crop pass this project's pipeline calls for) and observed **visual quality decreasing** in the
  result compared to the uncleaned export.
- **Cause unknown.** Not diagnosed. Plausible explanations nobody has tested: the selection was
  removing splats that contribute to surfaces rather than true floaters; the crop cut geometry
  that was reading as wall/ceiling detail at grazing angles; or the re-export quantized
  differently. All three are guesses.
- **The shipped Zone 1 file is therefore uncleaned.** `printing-room-updated.compressed.ply` is
  the raw export compressed, with no SuperSplat cleanup applied.
- Consequence for future zones: do not assume cleanup is a free quality win or a safe way to
  hit the size budget. Export both, look at them side by side in the browser, and keep the one
  that looks better. Use SH band reduction as the size lever instead — see `DESIGN.md` §3.5.

**2026-09-22, hallway capture — the runtime comparison above was confounded, corrected here:**
- 11:25.66, 4K/30, H.264 (not the printing room's 4K/60 HEVC — cause unknown, ask before
  assuming a camera setting). `--num-frames-target 720` → 735 extracted → **684 registered,
  93.06%**, healthy and well clear of the 80% line.
- Registered at 1.63x the printing room's frame count, in 1.25x the total wall time and 1.17x
  the matching time — not the 5.6x the earlier 309-vs-452 comparison implied. That comparison
  changed matching method and footage quality alongside frame count; this one held both roughly
  constant, and the frame-count cost dropped accordingly. Frame target itself remains an open
  choice (see the OPEN QUESTION above) — this only corrects the runtime-scaling framing, not the
  target decision.
- Missing frames were scattered, not one contiguous block — evidence against a single blur/motion
  event and more consistent with several short weak stretches. Full detail in `CHANGELOG.md`.

**2026-09-07, Hamza's uploaded `IMG_4462 (1).mp4`** (review findings supplied for this documentation update):
- Duration approximately 195.64 seconds; 3840 × 2160; approximately 30 fps.
- Uploaded copy: H.264, 8-bit `yuv420p`, BT.709. This describes the uploaded file, not proof of the original camera HDR setting.
- Metadata inspection and 20 sampled frames at ten-second intervals were reviewed. The frame sampled at 1:00 was visibly blurred; other samples were sharper.
- Sampled views contained plain walls, repeating blinds, and bright-window/darker-room contrast.
- No camera alignment or Gaussian-splat training was performed on this upload, so reconstruction success remains unverified.
- These findings support testing stop-and-shoot photos; they do not establish that the video is unusable. The supplied review was not rerun in this documentation session.

## References

Official sources checked for this documentation update. Apple documents available controls; our selected settings and capture targets are project recommendations. Observed team results are recorded separately above.

- [Apple: image formats](https://support.apple.com/en-us/116944) — Most Compatible uses JPEG/H.264; High Efficiency uses HEIF/HEVC, and transfers may convert media.
- [Apple: advanced camera settings](https://support.apple.com/guide/iphone/change-advanced-camera-settings-iphb362b394e/ios) — Prioritize Faster Shooting and model-specific controls.
- [Apple: HDR camera settings](https://support.apple.com/guide/iphone/iph2cafe2ebc/ios) — distinguishes older-model Smart HDR photo controls from HDR Video.
- [Apple: focus/exposure and shot setup](https://support.apple.com/guide/iphone/set-up-your-shot-iph3dc593597/ios) — AE/AF Lock, Grid, and Level.
- [Apple: ProRAW](https://support.apple.com/en-us/119916) — RAW controls, 12/48 MP options, and file-size tradeoffs.
- [Apple: video settings](https://support.apple.com/guide/iphone/iphc1827d32f/ios) — frame rates, Auto FPS, HDR Video, Lock Camera, and Lock White Balance.
- [COLMAP: capture guidance](https://colmap.github.io/tutorial.html) — texture, consistent lighting, high overlap, and translated viewpoints. Our 70–80% overlap and 150–300-image budget are project targets, not COLMAP guarantees.
