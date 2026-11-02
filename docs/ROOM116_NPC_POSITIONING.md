# Room 116 placeholder positioning

P1–P5 are provisional project stops, not identified or approved student projects.
They use `availability: "coming-soon"`, remain interactive, and appear as **Coming
Soon** in Tour Progress. They do not count toward completion or NPC guidance.

Run in PowerShell:

```powershell
npm.cmd run dev
```

Open the local URL Vite prints with `?debugRoom116NPCs=1` appended, for example
`http://localhost:5173/?debugRoom116NPCs=1`. Open the browser console (F12), enter
Room 116 through its existing hallway doorway, and stand where the marker should
be. Close dialogue and other modals, return focus to the tour, face the project,
and press **P**. Repeated/modified keys and typing in inputs are ignored.

The console prints `[Room 116 NPC position]` with `zone`, world `x`, `y`, `z`, a
copyable `position` array, `yawDegrees`, and `allowed`. These are aligned scene
metres, not raw splat coordinates. `allowed: true` means the current player centre
passes the existing Room 116 walking-boundary/exclusion validator. It does not
establish project alignment or visual visibility. Y is the camera/marker height
(normally 1.65 m), not floor height. Heading is camera yaw: 0 faces -Z, 90 faces
-X, 180 faces +Z, and 270 faces +X.

In `public/zones.json`, find the `project-studio` NPC with the desired ID
(`room116-project-1` through `room116-project-5`) and replace only its `position`
array with the logged array. Save and reload the browser. Keep its ID, radius,
and other data unchanged. Sprite markers always face the camera, so the logged
heading is a placement note; there is no NPC heading field to edit. P only logs
data and never writes files or moves markers. Check all five placements from
multiple angles and test E at each stop after every adjustment.

The recorder loads only in Vite development mode and only with the exact query
value `1`. It operates solely in `project-studio`; the printing-room equipment
debug P shortcut retains its own zone and behavior. Published builds omit the
Room 116 recorder even if the query parameter is supplied.

Each placeholder has its own `public/dialogue/room116-project-N.json`. Currently
its `start` node contains only the agreed placeholder message, giving the normal
Close button and Escape behavior. When approved content is ready, add `choices`
arrays with `{ "label": "...", "next": "node-id" }` entries and matching nodes,
following the existing Johnny/Vishan three-choice format. Keep the availability
flag until content is approved. Removing that flag enables ordinary required
completion and room-local ordered guidance without changing the NPC ID.

Validate after editing positions:

```powershell
node --test test/dialogue-local.integration.test.js test/npc-discoverability.test.js test/npc-guidance.test.js test/room-navigation.test.js test/room116-npc-debug.test.js tests/room116-boundary.test.js tests/room116-exclusions.test.js tests/room116-entry.test.js
npm.cmd run build
```

Browser rendering and physical project alignment require manual review.
