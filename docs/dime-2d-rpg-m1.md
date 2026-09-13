# DIME 2D RPG Milestone 1

This branch starts at reviewed commit `39b03db03822ecd509cbf2d00d72b4afb55d03d2`. It does not publish a Twitch ZIP or modify the existing website, Twitch version 0.4.0, AWS, player data, migration code or the privacy page.

## Engine decision

Use a small custom Canvas engine for this first, single-map milestone. [Phaser](https://docs.phaser.io/phaser/concepts/input) provides a larger game framework with built-in [tilemaps](https://docs.phaser.io/phaser-editor/scene-editor/game-objects/tilemap-object); [PixiJS](https://pixijs.com/8.x/guides/concepts/scene-graph) provides a renderer/scene graph and [ticker](https://pixijs.com/8.x/guides/concepts/render-loop), leaving this game's collision and interaction rules to implement. The current scene needs only a 34×22 tile grid, six interactables, a following camera and four-direction movement. Native Canvas and DOM input meet those needs with no new package, remote asset fetch, worker, shader, dynamic code generation or autoplay media. This keeps the Twitch iframe/CSP integration within the existing React/Vite build. Reconsider a library if later milestones require many maps, authored animation pipelines or complex physics; do not extend this small engine into an unreviewable framework.

The Canvas has a fixed 320×208 logical resolution, scaled with CSS and pixelated interpolation. The drawing loop and movement state stay outside React; React rerenders only when the nearby prompt or server/UI state changes. The engine attaches keyboard/focus/visibility listeners once and removes them with its animation frame on unmount. React Strict Mode remounts the component safely. Four touch directions use pointer capture and `touch-action: none`; on narrow panels, the large touch controls overlay the lower corners of the map to remain visible within a 500px viewport. Escape closes dialogue. Window blur and hidden visibility clear held movement. Reduced-motion preference freezes decorative walking animation. No sound is used.

The map is an original programmatic outpost and mine: solid perimeter/building/shaft walls, a two-tile mine entrance, three mineral seams, refinery and market terminals, and a ship/travel terminal. “Dolivine,” “Aphorite” and “Hadanite” are labels from DIME's existing resource catalog, not guaranteed rewards. The server chooses any hand-mining reward. Walking and camera position are local and discarded when leaving the tab. Away from Lyria, the scene is explicitly marked as a preview and deposits cannot submit. A deposit at Lyria sends one existing `mine` action through the action adapter and `useGame`, which retains revision, retry and idempotency behavior. Current pending actions or unavailable Twitch authorization block another submission. Extraction completion, balances and inventory remain server-owned. Refinery/Market terminals open the existing React tabs; the travel terminal opens the existing claim selector below the map. The previous mining controls remain in a collapsed section for all existing modes. Moving the existing travel strip below the Mining scene keeps the map and controls higher in the 318×500 Panel viewport; other tabs retain the strip above their content.

## Bundle and schema

Measured with Node v22.23.2, the same Twitch-mode Vite build, and no package changes:

| Asset measure | Before | After | Increase |
|---|---:|---:|---:|
| JavaScript bytes | 257,384 | 268,263 | 10,879 |
| JavaScript gzip bytes | 78,770 | 82,447 | 3,677 |
| CSS bytes | 7,620 | 10,415 | 2,795 |
| CSS gzip bytes | 2,252 | 2,983 | 731 |
| Total `dist/frontend` bytes, including unchanged images/HTML | 449,205 | 462,879 | 13,674 |

Runtime and development dependency counts are unchanged. No player-state schema or backend route changed. A later position-persistence proposal should add an optional, validated `worldCheckpoint` with a map ID and coarse spawn checkpoint to a new backward-compatible schema version, defaulting old saves to the outpost spawn. Only explicit transitions/checkpoints should write, guarded by the existing revision/idempotency transaction. It must not persist every step or tile, and requires separate backend tests, migration review and deployment approval. Milestone 1 leaves all positions local.

## Validation and review boundary

World and adapter unit tests cover four-direction movement, solid collision, exact mine entrance, interaction radius, keyboard mapping, no local inventory mutation, pending duplicate rejection and failed submission. Chromium tests cover the existing full economy loop, new zero-balance flow, retry, invalid session storage, local walking without POSTs, Strict Mode remount, focus pause, pointer and real mobile touch controls, server submission from a seam, and Panel/Mobile/preview layouts. Screenshots are generated only in ignored `test-results/` and are not committed. Synthetic local fixtures are used; no tests connect to production AWS or Twitch. The real Hosted Test v2 bundle remains unchanged. Live two-channel global-save verification remains a separate release gate.

Final Node v22.23.2 validation: `npm ci` installed 245 packages with zero audit vulnerabilities. `npm run check` passed ESLint, strict TypeScript, 103/103 Vitest tests in 11 files, Twitch-mode frontend build and Lambda bundle. Playwright Chromium passed 10/10 tests. `npm run format:check` and `git diff --check` passed. The first sandboxed `npm run check` had one local-server readiness failure; the complete suite passed outside that sandbox without source changes to the local server. The six viewport/full-page screenshots are `test-results/rpg-panel-318x500*.png`, `test-results/rpg-mobile-360x640*.png` and `test-results/rpg-preview-1024x768*.png`. Visual inspection found no horizontal overflow, clipped labels or unreadable controls; the narrow-panel D-pad and Interact button remain within the visible map viewport.

The compiled Twitch-mode output references the approved staging API once and contains no literal JWT, player ID, secret name/ARN, localhost or old public-site URL, source map or migration marker. No image, audio or other third-party asset was added; all new pixels are drawn by source code. This is a local build inspection, not a replacement Hosted Test bundle.
