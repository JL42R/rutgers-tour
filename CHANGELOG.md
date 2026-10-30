# Changelog

Newest entry first. This records what changed and when — for schedule and gates see `docs/PLAN.md`, for architecture see `DESIGN.md`, for task state see GitHub Issues.

## 2026-10-30

### PR #46 discoverability review corrections
- Shortened the control hint to describe floating guide markers, including portraits and badge fallbacks. WASD, mouse-look and Escape instructions remain.
- Preserved Vishan's distance-scaling implementation, NPC positions/radii and image fallback. Added eight focused headless checks for hint, scaling, selection, images and dialogue gating.
- Visual acceptance of marker overlap, doors/signs and narrow-screen readability is still required before merging #46; automated checks do not establish that acceptance.

### Final three-environment scope and documentation synchronization

- Confirmed the current cohort's deliverable as **hallway, printing-room and project-studio (Room 116)** only. Machine Shop and Computer Lab are excluded for this team; earlier capture/reconstruction research, story concepts and schedules remain as clearly labeled future-cohort/history material. See issues #49/#55/#32.
- Synchronized current startup, assets, D1/D3, NPC counts, approved Room 116 oriented solver/exclusions and printing-room AABB descriptions across the project guides. Current priorities are Room 116 NPCs (#56), Vishan's interactive guide (#47), then three-zone visual quality/performance. Dates and original gate evidence are preserved; G2's still-open GitHub status is distinguished from recorded acceptance.
- Recorded the completed release: Room 116 feature `bc0b62323b2ecb881e5c17039a8223c297914e1e`, integrated main `b2a18e5d8cb840c7a37226871f4cc412542b17a3`, user-reported **41/41 pre-integration** and **14/14 post-integration Chrome approvals**, **55/55 tracked tests**, **10/10 ignored local equipment probes**, **8/8 ignored local integration probes**, and a successful production build. [Pages run 40986520793](https://github.com/JL42R/rutgers-tour/actions/runs/40986520793) completed successfully for b2a18e5.
- Kept unfinished work explicit: studio NPCs (#56), standalone unmerged PRs #46/#48/#59/#61 and Johnny's AI TEST prototype (#47), missing Vishan image (#67), regression tests absent from CI (#68), permanent printing equipment boxes (#66), content approvals (#20), actual NVDA failure (#33), and planned quality/SH/performance measurements (#8/#23/#24/#25/#34). No production defect is resolved by these documentation edits.
- Historical entries below describe their original checkpoints. Later release acceptance/publication above supersedes earlier “manual walkthrough/publication pending” notes without rewriting those records. This documentation branch is local review work only; no commit, push or deployment is authorized in Phase 3A.

## 2026-10-29

### Room 116 integrated with latest main locally
- Integrated upstream main `ae252293` into the Room 116 feature branch. Retained both main.js
  imports/wiring and both changelog histories; preserved printing-room equipment tools,
  placeholder alignment, Vishan placement and all approved Room 116 data.
- The integrated code passes all **55** permanent Room 116 tests, **10** equipment compatibility
  checks against working-tree modules, and **8** additional local startup/welcome/progress,
  dialogue/NPC and equipment-persistence probes: **73/73**, zero failures. DOM probes use stubs;
  they do not establish browser rendering or pointer-lock acceptance.
- Production build passes with the existing large-bundle warning. Startup remains hallway;
  the combined application still requires the user's manual walkthrough before publishing.

### Room 116 final manual acceptance and local integration preparation
- Recorded the user's completed Chrome checks: Stage 7 **8/8**, Stage 8B **11/11**,
  Stage 9B **13/13**, and Stage 10 **9/9** — **41/41 manual checks passed**.
- These approvals cover the Room 116 implementation before upstream reconciliation.
  Integrated automated results are recorded above; a new combined manual walkthrough remains required.
- Retained the approved PLY/transform, bidirectional D3, oriented walking rectangle, yellow/orange
  exclusions, hallway sign and D3-only 0.60 m inward arrival with its small lateral safety adjustment.
  Room 116-to-hallway returns preserve their existing crossing position and camera orientation.
- Room 116 NPCs, dialogue and interactive information are deferred to another teammate.

### Room 116 Stage 10 hallway sign and inward arrival
- Recorded the user's confirmation that all 13 Stage 9B manual Chrome checks passed.
- Added one hallway PROJECT STUDIO — ROOM 116 entrance sign at the verified D3 jamb midpoint,
  facing hallway -X. Reused the existing 1.20 × 0.42 m white/red sign renderer and typography;
  the original printing-room sign and renderer are unchanged.
- Added a D3-context-only arrival target at local forward 0.60 m. Preserved camera height,
  yaw and pitch; retained local lateral position except for a maximum 11.1 mm leftward edge
  correction that keeps a direct backward path within D3's existing safe Z interval.
- All 55 tests pass, including 84,810 actual-context entry/return crossings, 1,028 landing/return
  samples and repeated D3/D1 routes. Build passes with the existing large-bundle warning.
- All Stage 8B/9B collision geometry/code, transforms and PLYs are unchanged. The user subsequently
  confirmed all nine Stage 10 Chrome checks passed, including sign visibility and arrival feel.

### Room 116 Stage 9B approved invisible exclusions
- Implemented the user's visually approved final Stage 9A draft as two Room 116-only local
  rectangles: entrance-right forward 0–1.9 m / left 0.3–4.236812761805356 m, and right-wall
  strip forward 1.9–11.049 m / left 0–1.2192 m. No geometry was resized or moved.
- Extended the oriented solver with swept disk contacts against finite faces/rounded corners,
  one shared 0.35 m radius, union behavior at the junction and simultaneous-contact sliding.
  Normal gameplay has no debug meshes; hallway/printing-room AABBs and D1/D3 are unchanged.
- All 42 tests pass: the original 20 Stage 8B groups plus 22 Stage 9B groups, including 84,810
  updated-runtime D3 crossings, repeated D3/D1 routes, corridor widths, corners and no tunneling.
  The conservative 10.026 mm D3 margin stays positive without any new physical safety inset.
- Production build passes with the existing large-bundle warning. Normal port 5175 starts in
  hallway; the user subsequently confirmed all 13 Stage 9B Chrome movement/visibility checks passed.

### Room 116 Stage 9A entrance-table survey and local preview
- Recorded the user's approval of Stage 8B: all 11 manual browser checks passed.
- Inspected decoded RGB projections of the entrance-right rectangular object. Prepared an
  explicitly unapproved table estimate and a 1.2192 m right-wall strip beginning at its
  estimated back edge, not at the entrance threshold. Object identity and edges need confirmation.
- Added an ignored, adjustable survey preview under tmp/room116-stage9 on strict port 5178,
  with colored guides, local draft saving/readback, connection and D3 clearance calculations.
  The preview uses existing Spark/ZoneManager; it does not override zones.json.
- No application source/configuration, approved boundaries, transitions, transforms or PLYs
  changed. New exclusions remain OFF. Existing 20 boundary tests and production build pass;
  the new preview's actual Chrome rendering remains unverified by the agent.

### Room 116 Stage 8B oriented walking rectangle
- Implemented the explicitly authorized Room 116-only 6.0960 × 11.0490 m invisible boundary
  from the verified Stage 8 corners, using continuous plane sweeps and tangential sliding.
- Preserved D3 with a doorway corridor using its existing radius-safe range and transition;
  no camera teleport, extra inset, arbitrary hallway margin or stepped AABB joints.
- Added explicit studio walkingBoundary data, a small dedicated module and minimal controls/main
  routing. Exported the existing radius constant; the legacy AABB resolver is unchanged.
- All 20 test groups pass, including 100 simulated D3 crossings, 20 D1 crossings, portal edges,
  corner exits, previous AABB traps and randomized probes. Build passes; actual post-8B browser
  movement/rendering remains unverified and requires the documented walkthrough.
- Preserved all prior zone data/transforms, PLYs, welcome/progress, and other-zone collisions.
  No equipment, NPC, sign, rendering/dependency or deployment work was included.

### Room 116 Stage 8 boundary feasibility; working connection preserved
- Recorded the user's confirmation that all eight Stage 7 Chrome checks passed.
- Calculated the approved 6.0960 by 11.0490 m footprint from the converted right-wall point,
  verified threshold and approved room basis; documented exact world corners and radius clearance.
- Rejected a conservative world-axis enclosure: up to 20.78 cm side inset and a trapped D3 entry.
  Stepped side-wall trials with 6/12/24 boxes per side also trap diagonal sliding at artificial
  joints using the actual resolver, despite smaller geometric error and continuous expanded walls.
- Stopped before applying boundaries as requested when AABB approximation is inadequate.
  Application configuration/source, assets, D1/D3 and hallway startup are unchanged. A room-only
  oriented-boundary extension or explicit approximation acceptance remains a separate decision.

### Room 116 Stage 7 manual doorway registration and D3 connection
- Preserved all eight original clicks and backed them up locally; swapped only the two room
  inside-jamb labels in a derived mapping, per the user's screen-left/right clarification.
- Applied a proper rigid horizontal fit: -91.07746 degrees world-Y adjustment, 11.76 mm jamb
  residuals and a 1.19 mm independent threshold check. Retained uniform scale, leveling and Y origin.
- Opened only D3 across the two positive-X hallway collision segments and added reciprocal
  X crossings with a radius-safe center range. Preserved D1, both end caps, existing features,
  all PLYs and application source. Restored hallway startup.
- Build and numerical collision/movement checks pass, including simulated D3/D1 round trips.
  Browser welcome, progress, visual registration and rendered transitions remain unverified.
  No custom walking boundaries, equipment collisions, signs or NPCs were added.

## 2026-10-28

### Room 116 Stage 6 corrected door references and targeted verification tool
- Superseded Stage 5's reversed A/B interpretation: A is the 6 ft 2 in (1.8796 m) moving-door
  opening; B is 13 ft 6 in (4.1148 m) from the finished right wall to the outside right frame
  corner, not an inside jamb. Corrected the current integration notes and conditional clearance.
- Targeted the hallway frame pair near Z = 16.09/17.97 and room raw X = -0.273/+0.049;
  widths agree approximately, but inside-jamb/threshold identity is still unverified.
- Added an ignored local landmark-capture view on port 5176 using the existing application
  systems. It saves reference-floor picks and camera coordinates without production source or
  zone changes. Browser/manual verification remains pending; no D3 opening or transition added.
- Retained the 6.0960 by 11.0490 m future right-wall-anchored strip, scale, leveling, startup,
  all assets and existing hallway/printing-room behavior. No walking boundaries were implemented.

### Room 116 Stage 5 doorway analysis and walking-width revision
- Accepted the user's identification of the last positive-X opening toward the printing-room
  end as the D3 search target; Candidate 4 is the strongest match, but its exact moving-door
  jambs and threshold remain unverified.
- Corrected A/B units following the user's clarification: 13 ft 6 in = 4.1148 m, and 6 ft 2 in
  = 1.8796 m. The discrepancy with the reconstructed brown-door envelope remains unresolved;
  no scale adjustment or substitute clear width was applied. Stage 6 corrects the reversed A/B
  labels and endpoints used in that interpretation; its width-discrepancy claim is superseded.
- Replaced the planned 15-foot width with **20 ft (6.0960 m)**, retaining the 36 ft 3 in
  (11.0490 m) depth and finished-right-wall anchor. Recorded conditional 0.35 m radius clearance.
- Preserved all runtime configuration, isolated inspection startup, splats and existing features.
  No D3 transition, hallway opening, walking boundary or upstream integration was implemented.

### Room 116 references confirmed; D3 placement remains unverified
- Recorded confirmed visible-ceiling height, finished-wall width, threshold-to-back-wall length,
  brown-door hallway connection and inward raw +Y direction.
- Preserved uniform scale, leveling and runtime placement. Calculated an unapplied heading
  composition but did not assign a hallway doorway or cut an opening.
- Documented the future 4.5720 m by 11.0490 m walking strip anchored to the finished right wall;
  no strip boundaries or equipment collisions were implemented.
- Corrected current inspection instructions to the actual temporary `project-studio` start on
  ordinary Vite port 5175. Runtime code, hallway/D1 data, startup and PLY assets were unchanged
  during this stage. No upstream integration was performed.

## 2026-10-27

### Project Studio Room 116 added for isolated inspection
- Verified the unchanged 68,849,656-byte `project-studio.compressed.ply`: 1,123,473 Gaussians,
  4,389 chunks, SH band 3, and the supplied SHA-256. Spark 2.1.0's installed PLY reader decoded
  all Gaussian and SH records without non-finite attributes; browser rendering remains unverified.
- Added an unconnected `project-studio` zone with geometry-derived trial leveling and height-based
  uniform scale. `docs/ROOM116_INTEGRATION.md` records the evidence, competing scale estimates,
  trial values and missing D3 alignment information. Calibration is not final.
- Retained hallway startup and both existing zone configurations. No D3 wall opening, transitions,
  signs, movement boundaries, equipment collisions or NPCs were authored.
### Provisional equipment box workflow (Issue #12)
- Added a debug-only editor to turn pairs of P snapshots into editable drafts,
  preview orange AABBs, download drafts/samples, and save applied drafts locally.
- Added explicit draft-collision testing with spawn/doorway clearance and sampled
  floor-plan checks for NPC and exit access. Production collision is untouched.
- No verified equipment measurements were found; production equipment boxes await
  physical/visual calibration. Preserved local Vishan and all previous debug work.

### Provisional Vishan placement (Issue #12)
- Moved only Vishan's marker to `[-0.90, 1.80, 0.372]`, inside the printing-room
  walls opposite Johnny. Workstation alignment awaits visual inspection; dialogue,
  portrait, interaction radius, other NPCs, collisions, and debug tools are unchanged.

### Printing-room placeholder alignment (Issue #12, Stage 2)
- Corrected preview floor X/Z dimensions and centre from the existing wall inner
  faces; fitted the rectangular grid to those bounds without moving wall meshes.
- Added `?debugEquipment&equipmentPlaceholder` for printing-room-only preview.
  Production placeholder remains false; real splat transforms and all collision,
  NPC, dialogue, transition, and control data remain unchanged.

### Equipment mapping preparation (Issue #12)
- Added opt-in `?debugEquipment`: P logs printing-room world coordinates and yaw,
  and existing collision boxes appear as cyan overlays. Dialogue/editable fields
  suppress snapshots; normal visits do not install the shortcut.
- Documented the aligned axes, placeholder-floor mismatch, survey inventory, and
  existing Vishan marker reachability concern in `docs/EQUIPMENT_MAPPING.md`.
- No equipment boxes, wall edits, or alignment changes were made.

## 2026-10-21

### Hallway start direction finalized (Issue #52)
- Retained the hallway spawn at `[0, 0, 0]` and added `spawnYaw: 180`, which starts the visitor
  facing positive Z toward the 3D Printing Room without changing camera pitch or other zones.
- Moved the CORE Guide marker from `[0, 1.6, 3]` to `[0, 1.6, -3]`, behind the initial view but
  centered and reachable in the hallway. The automatic welcome and normal E interaction are preserved.
- Removed the temporary Stage A P-key camera snapshot tool and documented the final placement.

## 2026-09-29

### Zone list fixed; G2 passed (Issue #28)
- Added `docs/ZONES.md` and the schematic `docs/img/first-floor-zones.svg`: the definition of
  "every expected zone" at G3. Five zones: `hallway` (hub), `printing-room`, `machine-shop`,
  `project-studio`, and `computer-lab` (optional fifth zone, first on the `PLAN.md` §7 cut ladder).
- Doorways: D1 printing room on the −x wall (wired); D2 machine shop, D3 project studio, and D4
  computer lab all on the +x wall, all inside the captured hallway. Their z ranges are measured
  from the hallway splat at G3 wiring, as D1 was.
- G2 marked passed in `PLAN.md` §3 and §4. Non-gate issues re-milestoned: #17, #23, and #30 to G3;
  #31 closed on the evidence of the Sep 22 `ns-export`.

### Dialogue keyboard accessibility implemented; NVDA verification pending
- Contained Tab and Shift+Tab navigation within enabled, visible dialogue controls while preserving
  native Enter/Space activation, number-key choices, and Escape-to-close behavior.
- Restored focus to a valid previous target after dialogue closes, with the labeled `#app` 3D-tour
  region as a programmatically focusable fallback that does not automatically reacquire pointer lock.
- Connected the dialog to its current text with `aria-describedby` and made the existing polite live
  region atomic so dialogue-node updates expose one coherent message to assistive technology.
- Visible-browser keyboard testing passed for focus wrapping and restoration, Enter, Space, number
  shortcuts, Escape, narration controls, multi-step dialogue, movement afterward, and pointer-lock
  release/reacquisition behavior.
- **NVDA verification remains pending, so Issue #33 stays open.** Nonvisual NPC discoverability was
  not changed here and remains separate work in Issue #15.

## 2026-09-24

### Hallway integrated and connected to the printing room
- Integrated the 19,617,110-byte hallway Compressed PLY. Runtime calibration used the measured
  128 ft length, 6 ft 4 in standard width, 10 ft 4 in standard ceiling, 8 ft 8 in widened end,
  and 12 ft 11 in taller end section to level, scale, and place the hallway through `zones.json`.
- Authored and browser-validated hallway collision boundaries, including full-width caps that
  prevent walking beyond both captured ends into empty space.
- Aligned the printing-room doorway between the two independent reconstructions and rigidly
  transformed the room's collision boxes, NPC positions, and spawn with its world placement.
- Added automatic directional hallway↔printing-room transitions that preserve player position
  and view direction, with outgoing splat and NPC resources disposed during repeated switches.
- Added data-driven doorway guidance signs and disabled both collision debug overlays after
  visual and movement validation.

## 2026-09-23

### Repository status and documentation reconciled
- Reconciled repository documentation with the merged NPC and GitHub Pages deployment state;
  corrected `AGENTS.md`, `README.md`, and the obsolete `.MOV` warning in the capture protocol.
- No architecture or runtime behavior changed.
- Identified two unresolved NPC asset/content inconsistencies: the missing Vishan portrait asset
  and duplicate Bambu dialogue filename. Issue-board cleanup is still required separately.

## 2026-09-22

### Hallway captured, processed, and trained (Issue #27, #30)
- **Capture:** 11:25.66 video, 3840×2160, 30 fps, H.264 High, `yuv420p`/`bt709` (SDR, no DOVI),
  ~45 Mbps. Note: 4K/30 H.264, not the 4K/60 HEVC the printing room used — cause unknown, ask
  Hamza before assuming a setting. Stored locally at `~/work/captures/hallway/<name>`; original on
  Google Drive.
- **COLMAP** (`ns-process-data`, `--matching-method sequential`, `--num-frames-target 720`):
  Nerfstudio samples every `floor(20568/720)=28`th frame, so it overshoots the target — 735
  extracted, ~0.93s apart (the printing room's 450→452 was the same overshoot behavior).
  **684/735 registered — 93.06%.**
- Missing frames scattered, not contiguous: 127, 144–145, 151, 153–157, 267–268, 280–283,
  386–392, 499–502, 596–602, 610–611, 618–623, 726–735. Weakest stretches: 596–623 (15 of 28
  lost, ~9:15–9:41) and 144–157 (8 of 14 lost, ~2:13–2:26). 726–735 is the tail of the clip.
- Stage timings: extraction 4m42s, features 11m01s, matching 131m07s, bundle adjustment 21m32s,
  refine intrinsics 1m54s. **Total wall 170m26s, user 1819m (~10.7x parallel).**
- **vs. the Sep 9 printing room:** 1.63× the frames cost 1.25× total time and 1.17× matching
  time — well under the 1.46×→5.6× figure recorded from the earlier 309-vs-452 comparison. That
  comparison mixed matching method and footage quality along with frame count, so it was never a
  clean measurement of frame count alone; today's runs share both matching method and roughly
  comparable footage, and the result is a much smaller time cost per added frame. See the
  capture-protocol and SETUP_TRAINING corrections below.
- Confirmed: `~/.local/share/nerfstudio/` does not exist after two sequential-matching runs —
  sequential matching does not fetch or use a vocab tree. The pipeline has no internet dependency.
- **Training** (splatfacto, 30k iterations): ~43 ms/iter, ~12 M rays/s (printing room: ~23 ms,
  ~22 M). ~20 min wall. Output at `outputs/hallway-proc/splatfacto/2026-09-22_181026/`.
- Raw PLY exported to `~/work/exports/hallway/` and uploaded to Google Drive for the team.
- **PENDING:** Gaussian count, PLY size, viewer inspection result, `sparse/` model count,
  SuperSplat compressed export, alignment to the hallway reference frame (#27). Nothing from
  this session is committed to the repo or wired into `zones.json` yet.

### GitHub Pages deployment live and verified (Issue #11, PR #40)
- Added `.github/workflows/deploy.yml`; pushes and merges to `main` now run the Vite production build
  and publish `dist/` to https://jl42r.github.io/rutgers-tour/ through GitHub Pages.
- The deployed page, `zones.json`, and 62,132,080-byte compressed printing-room PLY return HTTP 200.
  The raw uncompressed PLY is not in the repository or deployment. The deployed scene loaded and
  rendered all 1,013,854 splats successfully.
- Manual public-site testing on a non-Johnny Windows machine over normal Wi-Fi reached a usable room
  in approximately 12 seconds. WASD, mouse-look, pointer lock/Esc release, collision, boundary
  sliding, and the disabled cyan collision overlay all behaved as expected, with no major visual
  problems observed.
- Chrome and Edge have deployment test coverage. Firefox is still unverified; Safari is still
  unverified and requires an Apple device. Known non-blocking observations are a missing
  `favicon.ico` request and a Three.js shader warning.

## 2026-09-21

### Printing-room collision debug overlay disabled and manually verified (Issue #26)
- Changed the printing room's `debugCollision` setting from `true` to `false`, so the translucent
  cyan collision wireframes are no longer enabled for public/deployment use.
- Collision AABBs and runtime behavior are unchanged, and the reusable debug rendering support
  remains available in `src/zones.js` for future zone authoring.
- Manual browser testing confirmed that the splat loads without the overlay while normal movement,
  collision blocking, and sliding along collision boundaries continue to work.

### Dialogue audio narration implemented and manually verified (Issue #14)
- Added opt-in Web Speech API narration for the currently displayed dialogue text. Advancing or
  closing dialogue cancels speech, disabling narration stops it immediately, and the On/Off setting
  persists while dialogue is closed and reopened during the page session.
- Audible narration was manually verified in normal Chrome through the existing dialogue system,
  using a temporary browser-only fixture because production NPC placement is not yet integrated.
  The fixture did not change repository files, and full NPC-triggered end-to-end testing is not claimed.
- This completes the audio-narration scope of Issue #14 only. Broader accessibility work remains in
  Issue #33, including focus behavior, keyboard-only verification, screen-reader testing, and
  pointer-lock accessibility limitations; none of those items is claimed complete here.

## 2026-09-17

### Docs synced, gates rewritten, board rebuilt (PR #22, merged as f32f882)
No code or pipeline changes — the docs described blockers already solved and a scope we'd moved past.

- **Zone 1 is the printing room**, official, not a test capture. Compressed PLY ships in the repo,
  so a fresh clone renders it — the "download from Drive" steps are gone from all five docs.
- **Scope: 4–5 zones, star topology.** The hallway is the hub and the shared reference frame:
  every transition is hallway↔room, and it is aligned before anything is positioned against it.
- **Gates now each measure one thing** — G3 breadth (every zone primitive), G4 depth (every surviving
  zone finished), G5 the stranger test. Cuts are taken at the Oct 9 G3 review; milestones match §3.
- **Unmaintained checklists deleted** (PLAN.md §4, AGENTS.md status block) — both had drifted into
  describing a project we weren't running. GitHub Issues is the task-level record.
- **`.gitignore`:** added `*.MOV`/`*.mov`; generalized the splat negation to `!public/splats/*.compressed.ply`,
  which had named one file — the next zone would have been silently ignored. Removed `demo-guide.json`.

### Board rebuilt — 14 issues opened, #23–#36
#23 SH bands · #24 FPS baseline · #25 cleanup regression · #26 debugCollision · #27 hallway align ·
#28 zone list · #29 testers · #30 frame count · #31 venv patch · #32 primitive checklist · #33 a11y
· #34 performance · #35 demo prep · #36 push local NPC work

**Three decisions left open on purpose, each now an issue rather than a guess in a doc:** the SH
band standard (#23 — blocks every zone export), the `ns-process-data` frame target (#30 — 250 vs
the 450 that worked), and the cleanup quality regression (#25 — cause undiagnosed).

## 2026-09-15

### Compressed PLY works — delivery format resolved (012a723)
The `.spz` blocker is resolved on the load side. SuperSplat's **Compressed PLY** export loads in
Spark 2.1.0, so the format question from #8 is answered; `.spz` stays dead (SuperSplat writes v4,
no released Spark decoder reads it) and is not worth revisiting unless PR #332 lands.

- `public/splats/printing-room-updated.compressed.ply` committed at **62,132,080 bytes**
  (1,013,854 splats, SH bands 3). First splat file ever to enter the repo.
- `.gitignore` gained a negation past the blanket `*.ply` rule. (As originally written it matched
  one filename only; generalized to a pattern on 2026-09-17.)
- `zones.json` switched the printing room to the compressed file. Alignment, collision, and spawn
  settings were preserved unchanged.
- Spark LOD enabled: `lod: true` on the `SplatMesh`, `lodSplatCount: 500000` on the
  `SparkRenderer`.
- Renderer pixel ratio pinned to `1`, down from `Math.min(devicePixelRatio, 2)`. This is a real
  tradeoff, not a pure win: on a HiDPI display the scene now renders at 1x and looks softer, in
  exchange for a large fill-rate saving.

### Still over budget
62 MB misses the < 50 MB target. SH is ~74% of the file, so band selection is the lever — band 1
projects to ~26 MB, band 0 to ~16.5 MB. Neither has been exported or looked at yet. #8 stays open
for the size problem rather than the format problem.

### SuperSplat cleanup skipped — it made quality worse
The team cleaned the printing room in SuperSplat and observed visual quality **decreasing**
against the uncleaned export, so the shipped file has no cleanup applied. **Cause never
diagnosed.** Until someone does, treat cleanup as a change requiring an A/B look in the browser
rather than an automatic improvement, and do not rely on it to hit the size budget.

## 2026-09-14

### Printing-room alignment completed
- Tape-measured room: 40.8 × 14.3 × 10.8 ft = 12.43584 × 4.35864 × 3.29184 m.
- Independent analysis parsed 1,013,854 splats from the original PLY. The long axis is approximately raw Z, width raw X, and upward raw -Y. Fitted raw dimensions: length ≈ 4.3077, width ≈ 1.6839, height ≈ 1.1445 units.
- Length and height measurements were used to derive a uniform scale of `2.881555849683783`.
- Final browser-verified runtime transform in `public/zones.json`: `origin: [-0.4239378102298068, 0.074344140921842, 3.17070150997874]`, `rotation: [180, 91.78889410373753, 0]`, `scale: 2.881555849683783`.
- Four collision boundary walls now use the measured physical room dimensions. Temporary `debugCollision: true` support draws a translucent cyan wireframe over the real splat; collision still uses only the AABB data.
- `npm run build` passes.

### Next work
- Measure an FPS/load-time baseline, then test SuperSplat Compressed PLY for delivery. The raw PLY remains approximately 240 MB and outside Git.

## 2026-09-09

### G1 passed — full pipeline validated end to end
Capture -> ffmpeg -> COLMAP -> splatfacto (RTX 5060) -> ns-export -> SuperSplat ->
.ply -> Vite -> Spark -> rendering and walkable. Validated first on a deliberately
poor apartment capture, then on the real printing-room capture.

### Printing room captured and trained
- 7:16, 4K/60, HEVC, yuv420p/bt709, 48 Mbps, no HDR
- COLMAP registered 451 of 452 frames (99.78%), using --num-frames-target 450
  --matching-method sequential
- 135m53s wall, 1712m CPU (~12.6x parallelism). Feature matching alone was 112 of 136
  minutes and is CUDA-accelerable
- Trained at the full 30000-iteration default, ~23 ms/iteration, ~22 M rays/sec
- Exported .ply: 240 MB
- Room measured by tape: 40.8 x 14.3 x 10.8 ft = 12.44 x 4.36 x 3.29 m

### BLOCKER: splat files cannot be committed at current size
GitHub blocks pushes containing files over 100 MB. At 240 MB the printing-room .ply
cannot enter the repo at all, so *.ply stays in .gitignore and splat files are shared
through Google Drive until compression is solved (#8). This also blocks static
hosting — visitors download a zone before they can walk it.

### Spark rejects SuperSplat .spz
SuperSplat v3.0.0-alpha's .spz export (6.0 MB, 13x compression) fails in Spark with
"Worker error: Invalid gzip header". SuperSplat reads the same file back fine, so it is
not corrupt — Spark's decompressor does not recognise this .spz variant. Uncompressed
.ply is the workaround and the cause of the size blocker above.

### Rotation and scale moved into the zone schema
Orientation correction is now config in zones.json rather than baked into the splat
file (#7). Baking required re-exporting 240 MB per attempt, which blocked parallel
work. rotation is Euler degrees, scale is a uniform multiplier. This supersedes rather
than resolves the earlier open question of whether SuperSplat bakes transforms into
its export — that was never tested, and now doesn't matter, since the correction lives
in zones.json instead of the exported file.

### Fixed silent splat load failure in src/zones.js
new SplatMesh({ url }) returns before its fetch completes, so load errors landed
outside the try block and the catch never fired. Now awaits mesh.initialized, logs
success, and falls back to the placeholder on failure. This fix is what surfaced the
gzip error above — the same failure was completely silent before it.

### Capture protocol validated by measurement
Registration across three captures: 0.63% (HDR on) -> 18.45% (HDR off, 4K/30, dim
evening light) -> 99.78% (4K/60, exposure locked, slow pace, lab lighting).

### Environment fixes
- Ubuntu 24.04 has no python3.11 package; requires the deadsnakes PPA
- PyTorch 2.6+ flipped torch.load's weights_only default, which BLOCKS ns-export.
  Patched in eval_utils.py. This patch lives inside the venv, is not version
  controlled, and must be reapplied if the venv is rebuilt
- gsplat JIT-compiles CUDA kernels on first GPU use. That compile was killed at
  MAX_JOBS=4 because WSL2 allocates only about half of host RAM. Fixed with MAX_JOBS=2
  and a .wslconfig raising WSL2 to 12 GB with 4 GB swap
- sm_120 execution confirmed: PyTorch 2.11.0+cu128 reports (12, 0)

### Still open
- Printing-room splat renders but is not correctly positioned; rotation, scale, and
  floor offset not yet derived (#6)
- The rotation/scale schema change (#7) is committed but NOT YET VERIFIED IN THE APP —
  no page load has confirmed that a non-zero rotation actually moves the splat
- 240 MB per zone is above the 50 MB target and above GitHub's hard limit (#8).
  Cheapest untested lever is SuperSplat's SH Bands export setting, currently 3
- Cleanup (floaters, cropping) skipped on the printing-room splat
- Static hosting never tested
