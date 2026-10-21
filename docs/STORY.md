# Story flow — Rutgers CORE virtual tour

This document defines the proposed visitor story for Issue #57: the suggested route, the purpose of
each guide, and the hand-off between stops. It is a content plan, not a technical design. Architecture
stays in `DESIGN.md`, zone geometry stays in `docs/ZONES.md`, and task state stays in GitHub Issues.

**Approval status:** Proposed — awaiting team approval on Issue #57. Do not treat proposed dialogue
below as final script copy until the team approves the route, responsibilities, and wording.

## Status and scope

The tour is partly implemented. This distinction prevents the story plan from describing future work
as if visitors can already experience it.

| Element | Status | Notes |
|---|---|---|
| Hallway and printing-room zones | **Implemented** | Both zones are loaded from `public/zones.json` and connected by a doorway transition. |
| Printing-room guides | **Implemented** | Four Johnny stations and Vishan have dialogue files and tracker entries. |
| NPC completion reporting | **Implemented** | Dialogue completion is reported once per guide and can be reset. |
| Tour Progress tracker | **Implemented** | The tracker reads every configured zone and NPC, preserves progress, and works in any visit order. |
| Hallway welcome guide | **Future — Issue #54** | Script, placement, and one-time automatic welcome are not implemented yet. |
| Machine-shop guide | **Future — Issue #55** | Facts, representative, script, and final placement still require work. |
| Project-studio guide | **Future — Issue #56** | Facts, representative, script, and final placement still require work. |
| Hand-off lines in this document | **Proposed** | Existing dialogue JSON is unchanged by Issue #57. |
| Final tracker message in this document | **Proposed** | The tracker works, but its current shorter message must be updated separately after approval. |

The optional computer-lab zone is outside the current suggested story. If it survives the project cut
ladder and receives an NPC, the team must add that guide's responsibility and hand-off here. Because
the tracker counts every configured NPC, any such guide would also become part of tour completion.

## Visitor goal

The tour introduces visitors to Rutgers CORE and shows how its engineering spaces connect. Each guide
teaches one distinct part of the story and suggests a useful next stop. Together, the stops move from
orientation, to prototyping, to manufacturing, to applying engineering work in student projects.

The route is always optional. Visitors may enter rooms, revisit guides, and complete conversations in
any order. No dialogue should block movement or require the suggested sequence, and the Tour Progress
tracker must continue to calculate completion from the configured NPC list rather than route order.

## Suggested route

1. **Hallway — welcome and orientation.** Introduce CORE, movement, guide interaction, and the Tour
   Progress tracker. Recommend the 3D Printing Room as the first stop.
2. **3D Printing Room — prototyping through post-processing.** Visit the four numbered Johnny
   stations, then Vishan's ergonomics station. The printing room is on the hallway's negative-x wall.
3. **Machine Shop — manufacturing.** Continue to the machine shop just past the printing-room door,
   on the hallway's positive-x wall. All equipment, access, and safety details require verification.
4. **Project Studio — bringing engineering work together.** Continue to the project studio at the far
   end of the hallway's positive-x wall. Its purpose and student activities require verification.
5. **Tour completion.** When every NPC currently configured in `zones.json` has been completed, the
   tracker displays the approved closing message. Visitors remain free to explore and replay dialogue.

This route describes the narrative order, not a navigation lock. Physical directions must be checked
in the running tour after the new hallway spawn and camera direction from Issue #52 are finalized.

## Opening beat — hallway guide

The future hallway guide from Issue #54 is the visitor's introduction. It is the same guide planned
for the typed-question work tracked separately in Issue #47. The scripted welcome should ship through
the existing dialogue-node system and must not depend on question answering being available.

The welcome must:

- introduce Rutgers CORE and the purpose of the tour;
- explain WASD movement, mouse look, and walking up to a guide and pressing E;
- point out the Tour Progress tracker and explain that guides appear throughout the tour;
- recommend the 3D Printing Room as the first stop while making clear that exploration is free; and
- leave the hallway guide available for normal replay and future questions after the automatic welcome.

### Proposed welcome copy

Keep these as separate short dialogue nodes rather than one long speech:

> Welcome to Rutgers CORE! I'm here to help you explore some of the spaces students use to learn
> engineering.

> You can move with WASD, look around with your mouse, and press E to talk to guides. The tracker in
> the corner shows who you've met!

### Proposed hand-off to the printing room

> Let's start with the 3D Printing Room. Head down the hallway and look for the room on your left!

The phrase “on your left” must be validated against the final Issue #52 spawn position and initial view
direction. If it is not true from that viewpoint, replace it with a verified direction before Issue #54
is finalized.

## Guide responsibilities

Each guide owns a distinct part of the story. Question branches may add depth, but they should not
take over another guide's main responsibility.

| Stop | Status | Main responsibility | Avoid repeating |
|---|---|---|---|
| Hallway guide | Future — #54 | Welcome visitors, explain controls and the tracker, describe free exploration, and suggest the printing room. | Detailed room content or equipment explanations. |
| Johnny — Bambu X1E | Implemented | Rapid prototyping, the AMS, the CAD-to-part workflow, and design iteration for student projects. | Detailed explanations of the other printers or the complete support-cleaning process. |
| Johnny — Ultimaker | Implemented | Dual extrusion, the Air Manager, and using two compatible materials for different print needs. | Bambu-specific AMS details, Stratasys-specific material details, or a full cleaning-equipment explanation. |
| Johnny — Stratasys | Implemented | FDM, ABSplus, durable or functional parts, and why soluble support material is used. | The full support-cleaning process, which belongs to the SCA station. |
| Johnny — SCA | Implemented | Support removal, the cleaning apparatus, and post-processing after compatible prints finish. | Detailed operation of the printers or broader ergonomics content. |
| Vishan — Ergonomics | Implemented | Human movement, visual attention, ergonomics, and designing work around people. | 3D-printer specifications or manufacturing-equipment descriptions. |
| Machine-shop guide | Future — #55 | Explain the verified purpose of the shop, how manufacturing turns designs into parts, and verified equipment, access, training, and safety expectations. | Detailed additive-manufacturing content already covered in the printing room. |
| Project-studio guide | Future — #56 | Explain the verified purpose of the studio and how verified student activities bring engineering work together. | Repeating individual equipment explanations from the printing room or machine shop. |

The table assigns topics; it does not verify new facts. Issue #55 must confirm the machine shop's
equipment, users, training, access, and safety rules. Issue #56 must confirm the project studio's
purpose, users, classes or teams, equipment, and access. Unknown information must remain marked for
verification and must not be converted into dialogue by inference.

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

### Vishan → Machine Shop

> Engineering isn't just about making something work. It's also about making it work well for people.
> Next, check out the Machine Shop to learn more about manufacturing!

### Machine Shop → Project Studio

> Now you've seen another side of how engineers turn their ideas into real parts. Head farther down the
> hallway to the Project Studio to see how students bring their ideas together!

This line states only the proposed story transition. The machine-shop script must use verified room
information gathered under Issue #55.

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

- **Issue #54 — hallway welcome:** implement and place the hallway guide, write the short scripted
  welcome, auto-start it once, and keep the guide available afterward.
- **Issue #55 — machine-shop guide:** choose the representative with permission where required,
  collect verified facts, write terminal dialogue paths, and place the guide after zone alignment.
- **Issue #56 — project-studio guide:** choose the representative with permission where required,
  collect verified facts, write terminal dialogue paths, and place the guide after zone alignment.
- **Issue #57 — this document:** obtain team approval for the route, guide responsibilities, opening,
  hand-offs, and closing beat before the related scripts are finalized.

No future issue should copy an unverified detail from this story plan into visitor-facing dialogue.
