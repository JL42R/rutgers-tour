---
name: capture-protocol
description: How to capture video/photos of a room for 3D Gaussian Splatting reconstruction. Use this skill whenever the user is planning a capture session, about to film a zone, asking what settings or camera movement to use, or when a reconstruction came out with holes, floaters, blur, ghosting, or COLMAP failed to find camera poses — bad capture is the root cause of almost every downstream failure, so consult this before suggesting retraining or parameter changes.
---

# Capture Protocol for Gaussian Splatting (CORE Tour Project)

Capture quality determines everything downstream. A perfect training run cannot fix a bad capture; a good capture makes everything else easy. When a reconstruction looks bad, the fix is almost always RECAPTURE, not retraining with different parameters.

## Phone settings (do this before every session)
- 4K resolution, 30 fps. Turn OFF: HDR, auto-enhancement, cinematic/portrait modes, video stabilization if it causes warping (test once; standard OIS is fine).
- LOCK exposure and focus if the phone allows (tap-hold in most camera apps). Auto-exposure shifting mid-capture confuses reconstruction.
- Clean the lens. Seriously.
- Landscape orientation, always.

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
- [ ] Phone: 4K/30, exposure locked, lens cleaned, storage free (2–4 min of 4K ≈ 1.5–3 GB)
- [ ] Walked the route once WITHOUT recording to plan the path

## After capture, before leaving the building
Review the footage on the phone at 2x speed. Check: no blur when paused at random points, no people, full room coverage, loop closed. Re-shoot NOW if in doubt — coming back another day costs more than 5 minutes of re-shooting.

## Failure → fix table
| Symptom in reconstruction | Cause | Fix |
|---|---|---|
| COLMAP finds few/no poses | Spinning in place, blur, textureless walls | Recapture: slower, more translation, include floor/ceiling edges in frame |
| Holes/missing patches | Area never filmed from enough angles | Recapture just that area with a detail pass, add images to dataset |
| Floaters (blobs in mid-air) | Reflections, moving objects, sparse coverage | Delete in SuperSplat; if severe, recapture with monitors off / less glare |
| Ghosting/doubled surfaces | Loop not closed, exposure shifted mid-capture | Recapture with locked exposure and explicit loop closure |
| Mushy/blurry surfaces everywhere | Motion blur in source video | Recapture at half speed; brighter light lets the phone use faster shutter |

File naming convention for this project: `captures/<zone-id>/<YYYY-MM-DD>-take<N>.mp4` (e.g., `captures/lobby/2026-08-04-take1.mp4`). Never delete takes — storage is cheap, re-shoots are not.
