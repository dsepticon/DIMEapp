# Menu-free scanner — Milestone 4.3

## Player flow

- **P / Ping:** send one local expanding pulse from the player's current position while continuing to walk. At most eight intact signals within eight tiles receive temporary outlines, direction arrows and distances. No material, price, rarity or yield is displayed by an unidentified signal.
- **F / hold Analyze:** an eligible unidentified target exposes a 44px-high contextual control. Hold for 900ms. Movement pauses only during the hold; release, cancellation, focus loss, hidden page, range loss, changed target, generation change or overlay opening cancels it.
- **Q / next target:** cycle multiple eligible forward signals. Nearest distance wins automatic selection, then facing-angle difference and stable node ID. Explicit selection takes precedence over movement queued before that selection. The cone is the existing 60-degree half-angle.
- After server confirmation, a temporary card fits into the larger clear band above or below the player and target, scrolling internally if necessary. It shows material, rarity, size, instability, estimated integer yield, optimal charge band and current tool compatibility. Ping recalls confirmed information; cycling to another analyzed target also opens its information. The existing saved analyzed-ID set persists confirmation across refresh/reconnect. Mining uses the same server-owned node parameters immediately.
- Analyze replaces Mine for unidentified rocks. Once confirmed, Mine starts the existing laser controller. No menu is required. The touch Analyze target remains through pointer release to prevent the release from clicking Mine underneath it. Starting mining removes the information card from the control area.

## Geometry and authority

`shared/originalScanner.ts` defines a 2.2-tile analysis range, reachable-position and line-of-sight checks against authoritative collision geometry, tool ownership, source/zone eligibility, and intact-node identity checks. Larger nodes remain inspectable; the confirmed card explains incompatible mining equipment.

The additive `analyzeNearby` action requires `nodeId` and finite `player` coordinates through `/v4/actions`. It uses the existing revision, save-generation, request-ID, fingerprint, transactional commit and receipt replay machinery. It records analysis and the scanned-zone marker in one normal server action. It neither generates nodes nor changes their identity, position, material, yield, respawn or fragments.

Position remains locally walked and submitted at an interaction boundary, matching the existing mining/navigation contract; this is geometry validation, not a server-simulated movement history. The older `analyze` action remains accepted for compatibility with older clients. The new HUD and existing analysis menu both use `analyzeNearby`; there is no fallback to the older action when new validation rejects.

Definitive rejection uses the existing non-mutating `ACTION_REJECTED` handling and canonical refresh. Unknown outcomes retain the exact request for original-ID retry. Walking and Ping remain local and available while recovery is pending. No optimistic analyzed state is committed in the browser.

## Presentation and accessibility

Ping shares the previous wallet/cargo footprint; Analyze replaces the existing Mine footprint. The cycle target splits the 120px action area into 76px and 44px controls. Every touch target remains at least 44×44 CSS pixels. Safe-area offsets, idle restoration and keyboard controls are retained.

One pulse, at most eight markers, and a 3.5-second marker lifetime bound the effect. Reduced motion uses a stationary ring. The pulse and indicators use original canvas primitives in the existing single canvas. No external artwork or audio was introduced.

The normal gameplay rectangle-union coverage remains unchanged: minimum **80.7% Panel**, **86.7% Mobile**, **97.3% desktop**. Transient feedback and expanded confirmed information intentionally occupy additional space; their screenshots are reviewed separately.

## Release dependency

The replacement 0.9.0 client requires the matching backend artifact for `analyzeNearby`. **Do not activate it against the previous backend.** This task prepares source, tests, local Lambda/Twitch/web artifacts and offline infrastructure validation only. No backend deployment, infrastructure change, upload to Twitch, public publication, table wipe or real-player inspection is performed.
