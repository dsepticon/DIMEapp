# Milestone 4 vacuum correction — 2026-09-15

## Supported cause

The previously packaged navigation/recovery client was reproduced with a fresh synthetic v4 profile in Panel and Mobile. Physical travel, scanning, analysis and fracture succeeded. Both clicking Vacuum and holding its keyboard control produced startVacuum followed by cancelVacuum, with no collection or browser error. The busy state disabled the focused hold button while its start request ran; the resulting blur cleared the hold before completion. Per-node controls and placeholder dots also obscured proximity targeting and tool mode.

## Correction

A persistent hold control retains focus during its own request. Extraction mode automatically selects the nearest eligible ground fragment, with stable piece-ID ties. It uses the existing radial 360-degree field, hand radius 2.2 tiles and occupied-rig radius 4.5 tiles; authoritative geometry blocks walls. Client and server share tile-center, eligibility, capacity and duration calculations. No exact pixel overlap is required.

Original canvas pixel art supplies silhouettes, outlines, mineral palettes and subtle reduced-motion-aware glints. Local attraction and a connecting beam run until the collection threshold; only server acceptance removes the authoritative piece and credits its exact integer quantity. Continued hold retargets after 180 ms. Release, slide-off, pointer cancellation, focus loss and page hiding stop attraction. Walking retains the existing local behavior and remains available during uncertain pending recovery.

The server validates zone, owned tool, range, geometry, remaining piece and capacity alongside existing generation, revision and receipt checks. Full capacity rejects without mutation. Unknown outcomes restore the visual ground position and retain the original request for recovery. Existing shared pending classification handles definitive rejection and receipt replay.

## Compatibility and scope

No incorrect persisted coordinates were demonstrated. Existing pieces use integer tile positions and both sides use the same +0.5 center. Converted legacy node IDs use the mapped zone prefix followed by a hyphen; both that format and native v4 dotted IDs remain accepted. No piece normalization, respawn, yield change, save reset, table scan or migration is needed. Static geometry caching contains catalog maps only, never player data.

Synthetic tests cover persisted pieces, exact quantity conservation, replay, capacity, walls, cancellation, uncertain start/finish responses, safe physical navigation and First Contract sale/completion. Live Twitch verification requires authenticated Developer Console control; local production-browser evidence does not substitute for Hosted Test.
