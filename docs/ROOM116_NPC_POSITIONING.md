# Room 116 placeholder positioning

P1-P6 are temporary project conversations. All six count in Tour Progress
(12 conversations overall); Room 116 starts at 0/6. Guidance follows Project 1
through Project 6, skipping completed stops. All six user-reviewed positions are
now saved in `public/zones.json`, including P6, and load without editor mode.
P2/P3 are beyond the configured left physical edge, P4 is beyond the far edge;
P1/P6 are outside the valid player-centre area. All six have reachable E approach
positions in solver-based checks. Visual wall/splat occlusion still needs Chrome
review; the user coordinates were preserved exactly.

## Placement targets and archived original coordinates

These equipment descriptions are user-provided placement cues, not verified
technical specifications or approved dialogue content.

| NPC | Target | Original position before saved placement [x, y, z] |
| --- | --- | --- |
| `room116-project-1` | Soccer Ball Machine: robotic machine with green components | [4.205036, 1.65, 20.228586] |
| `room116-project-2` | Small Trailer Movement System: metal frame with overhead rail | [4.261449, 1.65, 17.229117] |
| `room116-project-3` | Folding Machine: larger machine on the red frame | [7.204505, 1.65, 20.285] |
| `room116-project-4` | Car Simulator: monitor and racing seat | [7.260919, 1.65, 17.285531] |
| `room116-project-5` | 3D Scanner and Printer: setup near green hanging panel and tall vertical machine | [10.232182, 1.65, 18.841679] |
| `room116-project-6` | Cobots: two blue arms on the worktable with computers and red chairs; above equipment, not chairs | Unmeasured (`null`) |

## One-time accessibility check

Run `node dev/room116-npc-placement-audit.js` in PowerShell to print each NPC's
original/corrected arrays, movement distance, reason and reachable approach point.
The saved report is `docs/ROOM116_NPC_ACCESSIBILITY_REPORT.json`.

All six saved markers are accessible under the keep-if-interactable rule, so no
coordinate correction is necessary. A marker can be outside the player walking
region if a reachable player position is within its existing interaction radius.
The check uses the actual rotated boundary, radius, exclusions and sweep solver;
interaction points pass 2 cm clearance probes. It also checks nearest-NPC selection
so overlapping radii do not make a different guide receive E.

This tool is read-only and never runs in the tour. The 10 cm grid establishes
reachable paths for positive results; missing paths require manual review and do
not prove the continuous area is inaccessible. It does not implement a nearest
projection/automatic relocation for other hypothetical placements. No such
relocation was needed for these six. It does not establish visual visibility
through walls or splats; keep checking that in Chrome.

## Interactive placement (no coordinate entry)

The previous tool only logged camera coordinates with P. The development-only
editor now moves the actual NPC sprites and shared interaction/guidance positions.
It uses camera position and yaw, never raycasts against Gaussian splats.

1. Run `npm.cmd run dev` in PowerShell.
2. Open the URL Vite prints with `?debugRoom116NPCs=1`, for example
   `http://localhost:5173/?debugRoom116NPCs=1`.
3. Finish/close the welcome and enter Room 116 normally. Walk near the soccer
   ball machine and face its green robotic components.
4. Press **O** to open the editor and release the mouse. Alternatively, press
   Escape to release pointer lock, then click **Position Room 116 NPCs (O)**.
5. Select **P1 - Soccer Ball Machine**. Click **Place 1 m Ahead**. The real P1
   marker immediately moves one metre ahead of your current facing direction,
   initially at eye height. **Place Here** instead uses your standing location.
6. Click **Forward / Back / Left / Right** to move the marker by 10 cm per click,
   relative to the direction you faced when opening the panel. Click **Higher**
   or **Lower** to change height independently by 10 cm. Aim above the equipment
   without covering it. No numeric input is required.
7. Click **Walk / Close (Esc)** or press Escape. Click the 3D view to resume
   mouse-look. Walk around to check alignment and E interaction. The moved marker
   stays in place. Face another direction and press O for nudges from that view.
8. Click **Save Positions** to download `room116-npc-positions.json`. Saving
   exports all six entries together, so repeat after further changes. **Copy
   Positions** copies the same JSON; if clipboard permission fails, the read-only
   export is selected so Ctrl+C works.
9. Repeat for P2 (overhead-rail apparatus), P3 (red-frame folding machine),
   P4 (simulator monitor/seat), P5 (scanner/printer by green panel), and P6
   (blue arms on the worktable, not chairs). P6 now has a saved marker. If a future draft has a null position, either
   Place button creates its actual interactive sprite.
10. Send the final downloaded JSON to Codex after visual review. Codex can apply
    each entry's `position` to its matching NPC ID in `public/zones.json`.

**Save Positions downloads a file; it does not write project files.** All edits
remain live in the current tour session, including after leaving and returning
to Room 116. Refreshing or restarting loses those live edits, so download before
refreshing. Existing completion progress continues using its normal localStorage.
The export includes `originalPosition` for every NPC, allowing review and rollback.
**Restore Selected** restores one original; **Restore All** restores all six.
If a session starts with a null position, restoring it removes that marker again. Closing the editor alone
does not undo anything. The table above preserves the earlier placement baseline for reference. Restore
buttons use positions loaded at the start of the current session, now the saved
user-reviewed coordinates.

The panel is a native modal with Tab/Shift+Tab focus navigation and native button
activation. Walking and E interaction pause while it is open. Close it to inspect
from other angles or test dialogue. The editor appears only in Room 116 with the
exact opt-in query value `1`, and is omitted from production builds. Other rooms,
NPCs and geometry are untouched. P still logs the original camera-coordinate
record to the console as an optional diagnostic; it is not needed for placement.

The saved coordinates are covered by `test/room116-npc-positions.test.js`.

Each placeholder has its own `public/dialogue/room116-project-N.json`. Currently
its `start` node contains only the agreed placeholder message, giving the normal
Close button and Escape behavior. When approved content is ready, add `choices`
arrays with `{ "label": "...", "next": "node-id" }` entries and matching nodes,
following the existing Johnny/Vishan three-choice format. Preserve each NPC ID
to retain saved completion and room-local checklist order. Completion of a
placeholder conversation does not establish approval of future project content.

Validate after editing positions:

```powershell
node --test test/dialogue-local.integration.test.js test/npc-discoverability.test.js test/npc-guidance.test.js test/room-navigation.test.js test/room116-npc-debug.test.js test/room116-npc-positions.test.js tests/room116-boundary.test.js tests/room116-exclusions.test.js tests/room116-entry.test.js
npm.cmd run build
```

Browser rendering and physical project alignment require manual review.
