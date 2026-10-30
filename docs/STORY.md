# Story flow — Rutgers CORE virtual tour

This document defines the proposed visitor story for Issue #57: the suggested route, the purpose of
each guide, and the hand-off between stops. It is a content plan, not a technical design. Architecture
stays in `DESIGN.md`, zone geometry stays in `docs/ZONES.md`, and task state stays in GitHub Issues.

**Scope confirmed 2026-10-30:** exactly Hallway → 3D Printing Room → Project Studio / Room 116, with free exploration preserved. Machine Shop and Computer Lab are excluded for this cohort; older concepts are retained in the future-cohort section below.

**Copy approval status:** proposed narrative wording is not established as approved by the reviewed records. #57's documentation work is closed, but that alone does not prove approval of every hand-off or script. Keep proposed dialogue separate from the implemented JSON and obtain content review under #20/#56.

## Status and scope

The tour is partly implemented. This distinction prevents the story plan from describing future work
as if visitors can already experience it.

| Element | Status | Notes |
|---|---|---|
| Hallway, printing-room and project-studio zones | **Implemented/published** | Three captured environments; D1 and D3 connect rooms to the hallway. Room 116 boundaries/exclusions, sign and arrival are approved. |
| Printing-room guides | **Implemented** | Four Johnny stations and Vishan have dialogue files and tracker entries. |
| NPC completion reporting | **Implemented** | Dialogue completion is reported once per guide and can be reset. |
| Tour Progress tracker | **Implemented** | The tracker reads every configured zone and NPC, preserves progress, and works in any visit order. |
| Hallway welcome guide | **Implemented on main** | The scripted welcome, one-time automatic opening, and tracker entry use the existing NPC systems. |
| Project-studio guide(s) | **Outstanding current priority — #56** | Room 116 exists, but its NPC list is empty. Identity/permission, facts, scripts, placement and tracker/accessibility tests remain. |
| Hand-off lines in this document | **Proposed** | Existing dialogue JSON is unchanged by Issue #57. |
| Final tracker message in this document | **Proposed** | The tracker works, but its current shorter message must be updated separately after approval. |

Computer Lab is excluded from the current deliverable, not an optional remaining task. Do not add it or Machine Shop to the active route, NPC tracker or current completion criteria. Existing printing-room scripts are implemented but factual/subject-matter approval remains #20; the missing Vishan portrait is #67. Vishan's separate work developing the interactive guide (#47) is ongoing and does not resolve that asset issue.

## Visitor goal

The tour introduces visitors to Rutgers CORE and shows how its engineering spaces connect. Each guide
teaches one distinct part of the story and suggests a useful next stop. Together, the stops move from
orientation, to printing-room topics, to verified Project Studio information once its guide content is developed. No unverified studio purpose, representative or student activity is approved by this plan.

The route is always optional. Visitors may enter rooms, revisit guides, and complete conversations in
any order. No dialogue should block movement or require the suggested sequence, and the Tour Progress
tracker must continue to calculate completion from the configured NPC list rather than route order.

## Suggested route

1. **Hallway — welcome and orientation.** Introduce CORE, movement, guide interaction, and the Tour
   Progress tracker. Recommend the 3D Printing Room as the first stop.
2. **3D Printing Room — prototyping through post-processing.** Visit the four numbered Johnny
   stations, then Vishan's ergonomics station. The printing room is on the hallway's negative-x wall.
3. **Project Studio / Room 116.** Return to the hallway and continue to D3 near the far positive-Z end on the positive-X wall. The environment is implemented; its guide identity, facts and dialogue remain #56 work.
4. **Tour completion.** The tracker displays its implemented message when every currently configured NPC is completed. Room 116 has no NPCs yet, so that message currently reflects the hallway and five printing-room guides, not completed future studio content. Visitors remain free to explore and replay dialogue.

This route describes the narrative order, not a navigation lock. The hallway starts at its origin,
facing positive Z toward the 3D Printing Room doorway.

## Opening beat — hallway guide

The hallway guide from Issue #54 is implemented on main and introduces the visitor using the existing dialogue-node system. Its automatic welcome and replay do not depend on question answering. Vishan's typed-guide work is tracked separately in #47; main's current Johnny prototype only echoes AI TEST, and PRs #48/#59/#61 remain standalone/unmerged. Coordinate future integration with the existing welcome rather than assuming a functioning hallway AI already exists.

The visitor starts at `[0, 0, 0]`, facing positive Z. The guide is centered behind the visitor at
`[0, 1.6, -3]`, where it remains reachable for replay without distracting from the route toward the
3D Printing Room. The middle-of-hallway spawn is intentional: it gives the current tour a clear first
destination while preserving access to both ends of the hallway.

The welcome must:

- introduce Rutgers CORE and the purpose of the tour;
- explain WASD movement, mouse look, and walking up to a guide and pressing E;
- point out the Tour Progress tracker and explain that guides appear throughout the tour;
- recommend the 3D Printing Room as the first stop while making clear that exploration is free; and
- leave the hallway guide available for normal replay and future questions after the automatic welcome.

### Implemented linear welcome

The automatic introduction uses four short nodes in a fixed order. The first three display a Continue
button, and the final node displays Close. Visitors can press Escape at any point to skip the welcome;
only reaching and closing the final node counts as completing the hallway guide.

> Welcome to the Rutgers CORE Building! I'm here to help you explore the spaces our Industrial &
> Systems Engineering students use to learn, design, and work on projects.

> Use WASD or your arrow keys to move, your mouse to look around, and E to talk to guides. The tracker
> in the corner shows who you've met and which guides you still have to visit!

> I recommend starting with the 3D Printing Room, where you can see how students turn their designs
> into real objects. But feel free to explore wherever you'd like!

> Enjoy exploring Rutgers CORE! Feel free to come back if you need a reminder of how the tour works.

The recommendation stays independent of physical directions even though the initial view now faces
toward the 3D Printing Room doorway.

## Guide responsibilities

Each guide owns a distinct part of the story. Question branches may add depth, but they should not
take over another guide's main responsibility.

| Stop | Status | Main responsibility | Avoid repeating |
|---|---|---|---|
| Hallway guide | Implemented on main | Welcome visitors, explain controls and the tracker, describe free exploration, and suggest the printing room. | Detailed room content or equipment explanations. |
| Johnny — Bambu X1E | Implemented | Rapid prototyping, the AMS, the CAD-to-part workflow, and design iteration for student projects. | Detailed explanations of the other printers or the complete support-cleaning process. |
| Johnny — Ultimaker | Implemented | Dual extrusion, the Air Manager, and using two compatible materials for different print needs. | Bambu-specific AMS details, Stratasys-specific material details, or a full cleaning-equipment explanation. |
| Johnny — Stratasys | Implemented | FDM, ABSplus, durable or functional parts, and why soluble support material is used. | The full support-cleaning process, which belongs to the SCA station. |
| Johnny — SCA | Implemented | Support removal, the cleaning apparatus, and post-processing after compatible prints finish. | Detailed operation of the printers or broader ergonomics content. |
| Vishan — Ergonomics | Implemented | Human movement, visual attention, ergonomics, and designing work around people. | 3D-printer specifications or manufacturing-equipment descriptions. |
| Project-studio guide(s) | Current priority, not implemented — #56 | Communicate only room facts and responsibilities verified and approved through #56; no identities or statements are selected here. | Unverified room claims or duplication of printing-room explanations. |

The table describes existing topic assignments and proposed scope, not new factual verification. #20 still needs printing-room content/subject-matter approval evidence. #56 must verify studio facts, permissions and script wording before implementation. Unknown information must not become dialogue by inference. Nonvisual discoverability and actual screen-reader acceptance remain #15/#33; the recorded NVDA failure is unresolved.

## Proposed hand-offs

These lines establish continuity between stops. They are proposed targets for later dialogue issues;
Issue #57 does not overwrite the current JSON scripts.

### Bambu → Ultimaker

> If you want to see another way to 3D print, look for station two. That printer has some different
> features worth checking out!

### Ultimaker → Stratasys

> That's station two! When you're ready, head to number three to learn about another type of printing
> system.

### Stratasys → SCA

> Some printed parts need extra work afterward. Check out station four to see how certain supports are
> removed!

### SCA → Vishan

> Now you've seen how printed parts get finished. Before you leave, check out Vishan's station to see
> how engineers study the people using their designs!

### Printing Room → Project Studio (copy not yet written)

The active next environment is Room 116 via the hallway and D3. Any revised hand-off requires separately reviewed, verified content under #20/#56; this pass invents no replacement dialogue. Earlier Machine Shop hand-offs are preserved below as future-cohort concepts.

### Project Studio → tour completion

> That's the end of our suggested tour! You've seen how engineering involves designing, building,
> testing, and improving. Feel free to revisit any room or guide you want to learn more about!

This line is proposed narrative copy. The project-studio script must use verified room and student-use
details gathered under Issue #56.

## Closing beat — tracker completion

Tour completion is based on the tracker from Issue #53. It occurs after every NPC in the current
configuration has been completed, regardless of visit order. Completion must not disable movement,
hide guides, or prevent any conversation from being replayed.

### Proposed final tracker message

> Tour Complete! You've met every guide in Rutgers CORE. Thanks for exploring with us! Feel free to
> revisit any room or conversation.

The tracker currently displays the implemented placeholder, “Tour complete! You visited every guide.”
Replacing it with the proposed message is a separate application change after team approval; this
documentation-only issue does not change JavaScript.

## Dialogue conventions

Existing and future scripts should preserve the current JSON node-graph style:

- keep the automatic hallway welcome linear so visitors can advance with Continue without choosing a
  response;
- keep each spoken node to approximately two short lines;
- offer a positive continuation, a question, and an option to leave where practical;
- let question branches return to the main conversation instead of trapping the visitor;
- use friendly, replayable wording and provide a route back to the beginning or main menu;
- finish completed branches with terminal nodes so completion reporting can recognize them;
- include a hand-off toward the next suggested stop without requiring the visitor to follow it;
- keep each guide within the responsibility assigned in this document; and
- include only equipment, class, access, and safety information the team has verified.

The current printing-room scripts already use short nodes, branching choices, loops, and terminal
endings. Later script work should revise hand-off wording only through the relevant NPC issue and team
review, preserving those interaction patterns.

## Follow-up issue boundaries

- **Issue #54 — hallway welcome:** implemented on main; preserve automatic opening, replay and completion behavior.
- **Issue #47 — interactive guide:** ongoing development by Vishan; approved knowledge, adapters/UI and browser/accessibility acceptance remain. Preserve the existing scripted guides.
- **Issue #56 — project-studio guide:** choose the representative with permission where required,
  collect verified facts, review terminal dialogue paths, place guides within the already-approved walking area, and test tracker/accessibility behavior while preserving D3.
- **Issue #57 — this document:** documentation proposal is recorded; obtain and record approval of proposed visitor-facing copy/responsibilities before related scripts are finalized. The three-environment scope is already confirmed.

No future issue should copy an unverified detail from this story plan into visitor-facing dialogue.

## Future-cohort story concepts — excluded from current deliverable

The following preserves the earlier Machine Shop route/guide ideas. They are not current requirements, approved scripts or evidence that the room is implemented. #49/#55 remain open for a later reviewed “not planned for current cohort” closure. Computer Lab also remains excluded; any future cohort must verify its own scope, facts and permissions.

Original route concept:

> **Machine Shop — manufacturing.** Continue to the machine shop just past the printing-room door, on the hallway's positive-x wall. All equipment, access, and safety details require verification.

Original guide responsibility: explain the verified purpose of the shop, manufacturing, equipment, access, training and safety without duplicating printing-room additive-manufacturing topics. Original #55 requirements included representative permission, verified facts, terminal dialogue, tracker placement and reviewed hand-offs; no work is scheduled here.

### Vishan → Machine Shop

> Engineering isn't just about making something work. It's also about making it work well for people.
> Next, check out the Machine Shop to learn more about manufacturing!

### Machine Shop → Project Studio

> Now you've seen another side of how engineers turn their ideas into real parts. Head farther down the
> hallway to the Project Studio to see how students bring their ideas together!

This line states only the proposed story transition. The machine-shop script must use verified room
information gathered under Issue #55.
