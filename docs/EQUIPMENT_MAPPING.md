# Printing-room equipment mapping (Issue #12)

This stage prepares mapping only. No equipment footprints have been measured or
added. Issue #5 is completed; Issue #12 remains open. Its original centred-room
example predates the hallway alignment and must not be copied as world positions.

## Run the mapping helper

In PowerShell at the repository root:

```powershell
npm.cmd run dev
```

Open the Local URL printed by Vite with `?debugEquipment` appended (normally
`http://localhost:5173/?debugEquipment`). Open F12 > Console, finish the normal
hallway welcome, and walk through the printing-room doorway. Cyan wireframes
automatically show that room's collision boxes over the real splat. Press P once
per sample to log X/Y/Z and yaw in degrees as copyable JSON. Held P does not repeat;
dialogue, editable fields, modifier shortcuts, and other zones suppress snapshots.
Remove the query parameter and reload to disable both tools. Neither tool changes
the saved JSON, the start zone, alignment, or movement.

X/Z are the player's centre on the floor plan; logged Y is camera eye height
(normally 1.65 m), **not equipment height or floor height**. Yaw 0 faces -Z,
90 faces -X, 180 faces +Z, and 270 faces +X. A player snapshot near an object is
an observation point, not a measurement of its surface. Record which face you
observed and measure its offset; do not turn walking positions directly into boxes.

## Current coordinate audit

Source: `public/zones.json`, `src/zones.js`, `src/controls.js`, and `src/collision.js`.
All boxes, NPC positions, and spawns are already in hallway-aligned world metres.
Only the splat receives scale, XYZ Euler rotation, and origin; do not transform
collision coordinates a second time.

- Splat origin: `[0.7237599145844933, 0.074344140921842, 2.7959428682414633]`.
- Rotation: `[-180, 1.7888941037375379, 0]` degrees; scale: `2.881555849683783`.
- Room interior: X approximately `[-4.626261595, -0.267621595]` (short, 4.35864 m),
  Z approximately `[-3.845914942, 8.589925058]` (long, 12.43584 m).
- Interior centre: approximately `[-2.446941595, 0, 2.372005058]`;
  floor Y=0; measured ceiling Y=3.29184.
- Spawn feet: `[-0.9469415953942466, 0, 2.3720050580116565]`.
  No printing-room spawnYaw is specified. Doorway transitions retain the current view.
- Door opening: positive-X wall, Z `[4.80, 6.55]`; transition plane X `-0.62295043`.
  Keep the opening and its approach corridor clear in both zones.
- Five existing wall boxes must remain intact.

The placeholder floor is now 4.35864 m along X by 12.43584 m along Z,
centred at `[-2.4469415953942466, 0, 2.3720050580116565]`. These values
come from the end walls' inner faces; the split doorway wall differs in X by
less than 0.000000001 m due to existing rounding. The rectangular grid shares
these X/Z bounds and sits 0.01 m above the floor to avoid flickering. Wall meshes
remain at their existing world coordinates; neither receives the splat transform.

For a temporary placeholder preview, use
`http://localhost:5173/?debugEquipment&equipmentPlaceholder` (use Vite's actual
port). Finish the normal hallway welcome and walk into the printing room. Only
that room uses the placeholder; its production `placeholder` remains false.
P snapshots and cyan overlays remain available. Remove `equipmentPlaceholder`
and reload for the real splat with cyan overlays; remove both parameters for the
normal tour. `equipmentPlaceholder` alone has no effect.

The configured printing-room spawn is inside the floor and clear of all five
walls including player clearance. Normal doorway entry preserves the player's
position, so it does not exercise that configured spawn. Browser verification
must check floor edges, grid alignment, doorway traversal, movement/sliding,
NPC interactions, P logging, and real-splat rendering after switching URLs.
Vishan now has a provisional interior placement; visually verify it against the workstations.

## Evidence and proposed inventory

[Issue #5](https://github.com/JL42R/rutgers-tour/issues/5) supplies tape-measured
room dimensions only (40.8 x 14.3 x 10.8 ft); its sample uses an older X-long,
centred coordinate frame. [Issue #12](https://github.com/JL42R/rutgers-tour/issues/12)
explicitly requires an on-site tape survey. Neither issue nor their comments gives
equipment footprints. Repository dialogue describes equipment, not its geometry.
NPC markers are leads for exploration, not verified equipment centres or extents.

Every row below is a survey candidate, not a confirmed count or production box.
All min/max values remain **TBD** until surveyed in the aligned world frame.

| Candidate | Mapping lead (world X/Z) | Required before defining min/max X/Y/Z |
| --- | --- | --- |
| Bambu Lab printers and supporting bench(es) | Johnny: -3.797 / -1.128 | Count units; measure bench footprint, printer overhangs, height, and world corner offsets. |
| Ultimaker printers and supporting bench(es) | Johnny: -3.797 / -2.678 | Count units; measure bench edges, protrusions, height, and corner offsets. |
| Stratasys printer cabinet(s) | Johnny: -3.797 / 1.522 | Count cabinets; measure independent footprints, height, and world corners. |
| SCA support-cleaning station | Johnny: -3.797 / 0.372 | Measure cabinet/support footprint, protrusions, height, and world corners. |
| Ergonomics station | Vishan: -0.900 / 0.372 | Verify actual station location first; measure each large component's footprint and height. |
| Other benches, shelving, cabinets, large fixed obstacles | No measured leads | Walk the whole room; identify/count objects, photograph/label them, and survey corners and heights. |

Vishan's provisional marker is now `[-0.90, 1.80, 0.372]`, on the opposite
side from the Johnny markers. It is inside the walls with player clearance;
visual placement near the computer/ECG workstations still requires browser review.
This marker is not a measured equipment footprint.

## Survey and later box testing

1. Choose a physically identifiable room corner and document how it maps to the
   aligned world axes. Measure offsets along X and Z, plus widths, depths, and
   heights. Record object ID, photos, reference corner, units, and uncertainty.
2. Log P snapshots near visible faces/corners to correlate the survey with the
   splat. Check multiple views; walking positions cannot supply hidden edges.
3. Prepare one AABB per distinct solid footprint (split irregular obstacles to
   preserve open floor): `{ "min": [minX, minY, minZ], "max": [maxX, maxY, maxZ] }`.
   For floor-standing equipment minY is normally 0; measure maxY. Compute min/max
   across measured world corners. Do not use a broad box spanning separate benches.
4. The movement solver ignores Y and expands X/Z by a 0.35 m player radius.
   Any box blocks walking throughout its footprint, including overhead shelves.
   Keep physical passage widths greater than 0.70 m, with practical clearance;
   confirm no expanded box overlaps the spawn or doorway approach.
5. Test measured boxes in the opt-in placeholder preview first, then
   reload the real splat with `?debugEquipment`. Walk every face/corner, check
   sliding, traverse the doorway in both directions repeatedly, and approach each
   NPC within its 2 m horizontal radius and open/close its dialogue. Check the
   spawn separately: normal entry retains hallway position rather than using it.
6. Repeat the tour without the query parameter to verify the normal experience.
   Keep real geometry and alignment fixed while iterating on measured boxes.

## Provisional box editor

No verified equipment footprints or saved player samples were found in the local
repository (including debug.log). Production collision still contains only the
five walls. Do not infer equipment edges from the NPC markers.

1. Run `npm.cmd run dev`. Open `?debugEquipment&equipmentPlaceholder` for the
   aligned placeholder, or `?debugEquipment` for the real scan.
2. Finish the hallway welcome and enter the room. Press P near two diagonally
   opposite corners of one continuous bench or cabinet. These samples are player
   centres, not the actual corners. The editor retains this visit's samples.
3. Press Escape to release the mouse. Expand **Equipment drafts (debug only)**.
   Collapse the panel and click the canvas before recording more samples.
   Enter a unique ID and measured height in metres, then click **Draft from last
   two P samples**. Flat/zero-area samples are rejected. No sample Y is used as
   the object's height. The draft is placed in the JSON editor, not production.
4. Correct min/max X/Z to physical faces using measured observation offsets or
   calibrated scan views. Edit min/max Y as needed. For a continuous bench use a
   single box encompassing the solid footprint and relevant overhangs. Distinct
   free-standing cabinets can have separate IDs. Use the inventory above as the
   survey list; do not fill missing coordinates with guesses.
5. Click **Apply visual preview**. Orange wireframes show draft starts/ends in
   both representations; cyan shows production collisions. The JSON editor lists
   each ID and all six bounds. Applying always turns draft collisions OFF.
6. Optionally enable **Test draft collisions**. The existing movement solver is
   reused unchanged with its 0.35 m player radius. The editor rejects boxes that
   overlap the player/spawn or doorway approach and uses an approximate 10 cm
   floor-plan search to check connected access to the doorway and a nearest-NPC
   interaction point for each marker. This check can reject tight passages and
   does not replace walking or visual inspection. Uncheck to recover immediately
   if movement feels wrong. Never infer physical accuracy from this check.
7. Applied drafts are saved to browser localStorage if available. After reloading
   another representation, they appear in the editor only: click Apply again;
   collision testing never auto-enables from storage. Click **Download drafts and
   samples** before ending the session to retain sample evidence. To import a
   download, paste only its `boxes` array into the editor and Apply. To clear drafts,
   replace the editor contents with `[]` and Apply. Drafts stay outside zones.json.
8. Walk the whole main aisle, both sides of every obstacle, and both directions
   through the doorway. Approach each of the four Johnny markers and Vishan;
   check that each gets the E prompt and opens its own dialogue. Test corner
   sliding and the configured spawn as well as doorway entry. Repeat on the real
   scan and without debug parameters. Normal visits install no editor or shortcut
   and never use these draft collisions.

Supply the downloaded draft/sample file plus each obstacle's ID, physical width,
depth and height, face/corner offsets in aligned world metres, and annotated
visual confirmation. Indicate which devices share a bench and any overhangs,
separate cabinets or shelves. Confirm the doorway/main aisle remain clear and
all five NPC interactions pass. Only then copy verified `{id,min,max}` entries
into printing-room `collision`, after its five untouched walls. IDs are compatible
with the existing min/max solver. There is no automatic promotion button.
