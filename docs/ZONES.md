# Zones — CORE first floor

Closes #28. This file and `docs/img/first-floor-zones.svg` are the definition of "every expected
zone" at G3 (Oct 9). A zone that is not listed here was never planned; a zone listed here that is
not primitive on Oct 9 is cut at the G3 review and marked **Cut** below — not deleted.

Topology is a star: the hallway is the hub and the shared reference frame, and every transition is
hallway ↔ room. Boundaries sit at doorway chokepoints so each training run stays inside the 8 GB
VRAM ceiling.

## Marked-up plan

![CORE first floor with zone boundaries](img/first-floor-zones.svg)

Schematic, not to scale: it records which rooms are zones, which wall each door is on, and door
order. It is an SVG so anyone can edit it in a text editor. A photo of the posted evacuation map
can replace it later without changing anything else in this file.

## Zone list

| # | id | Label | Status | Splat file |
|---|----|-------|--------|------------|
| 0 | `hallway` | CORE Hallway | Captured, trained, integrated (hub, reference frame) | `hallway.compressed.ply` |
| 1 | `printing-room` | 3D Printing Room | Captured, trained, aligned, integrated, NPCs in | `printing-room-updated.compressed.ply` |
| 2 | `machine-shop` | Machine Shop | Outstanding — not captured | — |
| 3 | `project-studio` | Project Studio — Room 116 | Integrated at D3; 41/41 pre-reconciliation manual checks passed; NPCs/content deferred | `project-studio.compressed.ply` |
| 4 | `computer-lab` *(optional 5th zone — first cut per PLAN.md §7)* | Computer Lab | Outstanding — not captured | — |

Ids are short, lowercase, hyphenated, and must match the `id` in `public/zones.json` and the splat
filename prefix. The splat must end in `.compressed.ply` or Git silently ignores it.

## Hallway starting experience

The visitor starts at the hallway origin with `spawn: [0, 0, 0]`. The team retained this
middle-of-hallway position because it gives the clearest route into the current tour content instead
of placing the visitor at the physical entrance. `spawnYaw: 180` turns the initial view toward
positive Z, with the 3D Printing Room doorway ahead at z 4.80–6.55.

`spawnYaw` is an optional per-zone angle in degrees. `src/main.js` converts it to radians and assigns
it to `controls.yaw` when the initial zone loads; zones without the field keep the controls' default
yaw of 0 degrees, which faces negative Z. The setting changes horizontal direction only and preserves
the existing camera pitch and mouse-look behavior.

The CORE Guide marker is at `[0, 1.6, -3]`, behind the initial view. Its automatic welcome still
opens when the hallway first loads. After closing it, visitors face the printing room and can turn
around and approach the marker to replay the guide with E.

## Doorways off the hallway

Every doorway listed here is a transition that must be filmed through **from both directions**
(capture protocol step 6) and wired in `zones.json` at G3. A doorway not listed here does not get
a transition — its opening stays behind a hallway collision wall.

Positions are in app coordinates: hallway spawn is the origin, z runs along the hallway
(~−20.2 m to ~19.0 m, the measured 128 ft), the two long walls sit at x ≈ −1.1 and x ≈ +1.1.

| # | Leads to | Wall | z range (m) | Filmed both ways | Wired in `zones.json` |
|---|----------|------|-------------|------------------|-----------------------|
| D1 | `printing-room` | −x | 4.80 – 6.55 | Yes (aligned 2026-09-24) | Yes |
| D2 | `machine-shop` | +x | Measured at G3 — slightly past D1 | No | No |
| D3 | `project-studio` | +x | 16.155668 – 17.923910 (manual jamb picks) | Not reverified | Yes; user verified entry/return before upstream reconciliation |
| D4 | `computer-lab` | +x | Measured at G3 — order along the hallway not yet recorded | No | No |

All three new doors are on the +x wall, opposite the printing room, and all three are inside the
captured hallway (Johnny, 2026-09-29).

**Why z ranges wait until G3:** they are only consumed when a transition is wired, and they are
read off the already-shipped hallway splat, the same way D1 was aligned on 2026-09-24. Measuring
them now would not save that step. What *did* need settling at G2 is that every door is inside the
captured hallway (z ≈ −20.2 to 19.0 m, the full measured 128 ft), because a door beyond either end
would need a second hallway capture before the Oct 16 capture stop.

**D3 wiring (2026-10-29):** corrected room-side jamb labels register Room 116 to the last +x
opening at the positive-z end. The +x main collision wall now ends at z 16.1556675816972; the
widened +x wall resumes at 17.923909531203247 and continues to 19.0. The old 16.33 breakpoint
lies inside this opening. Both end caps, the opposite wall and D1 remain unchanged.

The reciprocal X-plane triggers use threshold x 1.2642833297509717 and the radius-safe player-center
range z 16.505667581697203 – 17.573909531203245. This is narrower than the physical opening by
0.35 m at each jamb, preserving valid camera positions when returning into hallway collision.
Hallway entry crosses +x and intentionally advances to local forward 0.60 m. A minimal lateral
adjustment of at most 11.1 mm at applicable entry positions preserves a clear backward path.
Camera height and facing are preserved; studio return crosses −x with its crossing position unchanged.
The user passed all 41 manual checks across Stages 7, 8B, 9B and 10 before upstream reconciliation;
the combined application requires retesting. Room 116 NPCs and interactive content are deferred.
See `ROOM116_INTEGRATION.md` for the approved transform, boundaries, exclusions and test evidence. D2/D4 remain
unwired behind their existing hallway collision walls; no opening was made for them.
