# Mining formations and targeting — 2026-09-15

## Reproduction and supported cause

The previously released vacuum-fixed production client was tested in Panel and Mobile against an in-memory synthetic v4 API. Deterministic generation in Mica Upper Tunnel produced three hand-tool nodes, sizes 2, 2 and 4. All centers were walkable, reachable from spawn and had clear adjacent sight lines. Physically approaching each to one tile, scanning, analyzing and requesting laser targeting accepted the first two and returned HTTP 409 / MINING_REJECTED for the third. The generator used sizes 1–5 for a hand tool whose catalog supports only 1–3. Neither range inflation nor coordinate adjustment explains or corrects that mismatch.

The old renderer drew every intact size as an identical radius-7 circle. The pointer region was already larger than the circle, but selection could also match a fractured node's pieces and the console had no automatic facing-based acquisition or range/tool explanation.

## Generation and compatibility

New hand nodes draw sizes only from 1–3; ground-rig nodes retain 1–5. Existing node identity, material, resistance, instability, size, yield and respawn deadline are not rerolled. Persisted oversized hand nodes remain inspectable and can be mined with an owned, active, occupied Crawl Rig in the same zone. Beamline One's 2.2-tile range and supported sizes remain unchanged; the rig retains its existing 4.5-tile range. The UI explains the rig requirement when the current tool is ineligible.

Placement uses the authoritative collision map and flood fill from spawn. A center needs a clear 3×3 shoulder, a reachable adjacent interaction cell with clear sight line inside basic range, three-tile separation from interactions/spawn/other nodes, and 1.5-tile separation from persisted uncollected fragments. First Contract placement uses the same rules. Generation fails without mutation if no valid cell exists; there is no fallback to an overlapping spawn tile.

Invalid intact positions are repaired on a revision-controlled scan or zone-entry action, never on a GET or animation frame. Valid centers are reserved first in stable node-ID order; invalid centers move to the nearest available safe center, with distance, row and column tie-breaking. Only x/y change. Fractured/depleted/destroyed nodes and all existing pieces remain untouched by relocation. A live mining/extraction session suppresses relocation. Expired nodes respawn lazily when their zone is scanned, then receive the same placement validation; unvisited zones retain their deadlines. Existing request receipts, generation checks and conditional commit protect replay and stale actions.

## Presentation and targeting

Original code-drawn rock bodies use five distinct widths (20, 24, 28, 32, 36 pixels), irregular silhouettes, outlines, shadows and neutral inclusions. Nine-pixel vacuum shards remain smaller. Undiscovered material never selects the formation palette or shape. Analysis adds a mineral accent and outlined facet; selected/active nodes have corner brackets with a subtle nonflashing effect, static under reduced motion.

In Laser/Scan mode, local acquisition searches the forward 120-degree cone inside legitimate range, excludes obstructed and non-intact/unrelated-zone nodes, then orders by facing angle, distance and stable ID. Manual padded formation hits inspect a node; the signature selector supports explicit inspection. Range feedback distinguishes In range, Move closer and Obstructed. Moving or changing mode updates acquisition; fracture/destruction clears the intact target, while overcharge outcome feedback remains available separately. No new cycle control was needed because the existing signature selector handles explicit selection.

Laser pointer acquisition ignores pieces. Extraction-mode pointer handling cannot select intact nodes, and the working automatic vacuum controller remains unchanged. Server start checks use the same owned-tool range calculation and explicit node-zone membership. Mining resolution still uses server-owned node parameters and existing guarded session/receipt handling. No per-frame API or database writes were added.

## Validation approach

Property tests cover 200 deterministic seeds in each of eight mining zones (1,600 generated worlds), safe interaction cells, separation, persistence, deterministic relocation and preserved parameters. Integration checks cover rejected generation mismatches and idempotent relocation receipts. Compiled browser tests physically approach and target all three generated tunnel nodes in Panel/Mobile/Desktop; Panel/Mobile journeys mine, vacuum, overcharge, refresh and target the survivor. Existing navigation, recovery and vacuum suites remain release gates.

The combined Chromium release configuration runs production and legacy tests with zero retries. A prior fragile legacy fragment test now recognizes body plus facet pixels in its small expected silhouette area, rather than assuming a single camera-rounded pixel has the body color. It still requires the fragment to disappear after collection. Final release acceptance requires one clean complete run.
