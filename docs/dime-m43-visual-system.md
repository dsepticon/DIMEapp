# Destroya Industries visual system — Milestone 4.3

Original code-native artwork; no external tiles, sprites, fonts, images or audio were added. The renderer does not own collision, node parameters, yield, fragment positions or player saves.

## Logical grid and scale

- 24×24 logical-pixel tiles; one on-screen canvas, no hidden atlas canvases.
- Worker silhouette: approximately 14×24 logical pixels including outline and grounding shadow. Four directions use the same proportions and original mint/ochre industrial work clothing. Ambient workers are generic fictional staff; none depicts Dorathaadestroya.
- Node widths: 20/24/28/32/36 logical pixels for existing sizes 1–5. Three original irregular silhouettes per tier, selected by stable node ID. Hand-tool generated sizes remain 1–3. Nine-pixel fragments stay smaller than every intact formation.
- Camera scale is an integer multiple of 24 pixels per tile, enlarged only enough to cover the viewport. Camera translation snaps to screen pixels and clamps to authoritative map bounds. Device pixel ratio is capped at 2; interpolation is disabled.
- Panel 318×500 and Mobile 360×640 retain 44-pixel walking and vacuum touch controls. Desktop web expands to 1440 pixels and uses the same tool range, physical movement and server rules.

## Environment families

| Region | Construction and visual language |
| --- | --- |
| Tessick Station / Crew Ring | Layered blue-grey deck plates, inset grilles, structural bulkheads, horizontal conduits, amber floor arrows and mint equipment screens. |
| Loam Crescent | Broad ochre sediment shelves, worked-ground strips, irregular rock shoulders and olive claim equipment accents. |
| Mica Slope | Offset diagonal slate strata, pale crystal facets and stepped tunnel-wall geometry. Its texture construction differs from Loam rather than merely changing the palette. |
| Avenbolt | Connected catalog districts retain their physical entrances and transit. Dark street paving, lane edges/crosswalk pattern, district-specific window banks, vertical signs, ribbed machinery and service fronts differentiate the city. |
| Far Shards | Sparse cold ground, isolated worked pads, dark rock edges and warm claim-equipment markers. Lower surface detail leaves targets readable. |

Every existing catalog zone receives its location family, collision-derived edge treatment, paired exit marker, service terminals and named HUD landmark. Existing map dimensions, exits, service coordinates and travel rules are unchanged.

## Lighting, materials and hierarchy

Lighting comes from the upper left. Solid terrain has a bright upper edge and dark lower footprint. Walkable terrain uses subdued contrast; workers and minerals have dark outlines plus bright edges. Target brackets and objective markers use the highest contrast. Amber means structural direction; mint means active tool feedback, with labels, patterns and shapes carrying the meaning independently of colour.

Undiscovered material never chooses a node's silhouette or mineral colour. Analysis reveals coloured inclusions with outlined facets. No visual change rerolls a node or alters its quantity. Service glyphs distinguish ships, trade, processing and ground vehicles; paired directional arrows identify physical exits.

## Layers and animation

1. Ground, seams, edge transitions and directional floor decals.
2. Physical exit pads.
3. Y-sorted solid terrain, service consoles, workers, player, nodes and fragments.
4. Tool beams, bounded dust and target/objective feedback.

Solid foreground tiles fade near a worker crossing behind their edge so the local player remains readable. Their collision footprint remains the shared map tile. Workers have grounding marks; the local player has directional helmet/visor, boots and a carried tool.

Walking uses four 140 ms stride phases; idle changes at 1200 ms. At most four ambient workers use tiny workstation movement loops; at most twelve terminals animate at 600 ms intervals. No ambient actor blocks or writes gameplay state.

Laser beams originate near the visible tool and react to charge. Stable progress draws cracks. The optimal band uses both an outlined hatched region and a diamond label; danger uses a warning label and a steady border, never rapid flashing. Fracture interpolates only newly created visual pieces from the source to their authoritative ground positions over 450 ms. Overcharge creates dust without collectible pieces. At most two 16-particle bursts remain for 700 ms. Vacuum adds a connection field and six bounded travelling motes while preserving the existing controller and server-accepted collection threshold.

## Accessibility and performance

Reduced motion suppresses strides, idle changes, terminal animation, workstation movement, fracture travel and dust. Functional tool beams, targeting and server timing remain available. High contrast increases panel edges, text and label backgrounds. Menus remain internally scrollable; gameplay never scrolls the document. Focus outlines are explicit. World labels have `pointer-events: none` and do not intercept controls.

The renderer has no API/store dependency. Walking remains local. Effects expire rather than accumulate; zone changes dispose the animation loop and listeners. The frame performs bounded work over visible map tiles and active-zone objects. The release performance report records measured frame and transition timing separately from these design budgets.

## Silent audio preparation

`audioEvents.ts` provides subscribe/unsubscribe hooks for footsteps, terminals, laser, optimal charge, danger, fracture, vacuum, collection, transit and UI. No audio files, network requests, browser audio devices or autoplay are used. Later original sound production can subscribe without changing authoritative gameplay.
