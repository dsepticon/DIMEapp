# DIME 2D RPG Milestone 2 — The First Shift

## Milestone 2.2 source correction (not deployed)

The current branch now has a source-only 2.2 correction; the 2.1 refinery tutorial described below is the deployed historical behavior, not the new source behavior. Dolivine is a gem in the recovered DIME catalog (`gem: true`, refined price zero), so a new First Shift mines 4 cSCU and sells those same 4 cSCU raw at the Lyria supply exchange. No gem refinery order, refined output or refinery charge is created. The sale amount comes from the existing DIME raw price: `round(4 × 130000 / 100) = 5200` aUEC. With the existing 500 aUEC quest reward and a starting wallet of zero, the new source final wallet is `0 + 5200 + 500 = 5700` aUEC; counters are mined 4, refined 0, sold raw 4. The old 300 aUEC tutorial sale conflicts with the source price and is removed for new version-2 quests.

New accepted quests carry `version: 2` and `reconciliation: NONE`. Older quests have no version. The client sends one generic `firstShift/reconcile` request on loading an older quest; it cannot choose a branch or submit quantities. The server verifies the existing quest stage, counters, named tutorial order, inventory and reward flag, then atomically writes version 2 with `CORRECTED`, `LEGACY_SOLD`, `LEGACY_COMPLETE` or `SUPPORT_REQUIRED`. Ambiguous records receive the last status without touching inventory, orders or wallet; unrelated game actions remain available. Existing saves without any quest field still start normally. The [mineral/world reference](star-citizen-world-reference.md) contains the full source-derived rarity and price review, official workflow study and future map design direction. No 2.2 source or frontend has been deployed or uploaded.

| Legacy stage | Required verified evidence | One-time result |
|---|---|---|
| Completed | `status=COMPLETE` | Keep objective, counters, wallet and reward; mark `LEGACY_COMPLETE`, never pay again. |
| Accepted, tool check or mine not yet confirmed | Zero quest counters and no tutorial order ID | Keep objective and all inventory; mark `CORRECTED`. |
| Mined, not returned | Mined 4, refined/sold 0, at least 4 raw Dolivine in Hand hold, no tutorial order ID | Keep `RETURN_TO_OUTPOST`; mark `CORRECTED`. |
| Ready to start old refinery | Same raw/counter evidence as above | Move to `SELL_MINED_GEM`; mark `CORRECTED`. |
| Pending or ready old tutorial order | Exact stored order ID, Hand/Dolivine/Cormack order, raw 4 → refined 3, cost 0, 3-second duration, and room to restore 4 raw | Remove only that order, restore 4 raw, move to `SELL_MINED_GEM`; mark `CORRECTED`. |
| Collected old tutorial output | Mined 4/refined 3/sold 0, stored tutorial ID, order absent, exactly 3 refined Dolivine in Nomad and nowhere else, and room for 4 raw | Remove exactly 3 refined Dolivine, restore 4 raw, reset invalid refined counter, move to `SELL_MINED_GEM`; mark `CORRECTED`. |
| Old refined tutorial output sold | Mined 4/refined 3/sold 3, tutorial order absent, reward unclaimed | Preserve historical 300 aUEC sale and counters; move to `RETURN_TO_FOREMAN`, mark `LEGACY_SOLD`; normal 500 aUEC reward remains claimable once. |
| Missing, mixed or inconsistent evidence | Any required check fails | Mark `SUPPORT_REQUIRED`, leave all accounting untouched, show “Contact support” for the quest while other game actions work. |

The order ID is the original tutorial start request ID, not a client-selected identifier. After collection, the work order is gone; the strict quest-stage/counter/exact-inventory checks are the available attribution evidence. Mixed Dolivine output is rejected instead of guessed. Reconciliation and its request receipt share the existing revision-controlled transactional save; replaying that request returns the already reconciled state. No read, write or import of real player data is part of this work. This quest-schema correction does not activate the disconnected identity-migration module.

This branch is a local release candidate only. It does not change the deployed Twitch extension, Lambda, DynamoDB table, or AWS stack. The frontend and server bundle must be deployed together in a future reviewed release because the chapter introduces a new action type.

## Save and compatibility

The existing version 2 global-player state gains an **optional** `firstShift` object. Absence is interpreted in memory as `{status: NOT_STARTED, objective: SPEAK_TO_FOREMAN}`; reading an older save does not rewrite it. The field is first persisted when a verified player accepts the chapter. It contains the fixed ID `first-shift`, status, objective, mined/refined/sold counters, accepted/completed timestamps, reward-claimed flag, one-time Hand tool recovery flag, limited dialogue flags, a tutorial work-order ID, and unlocked quest IDs. No walking coordinates are saved. The existing verified global identity key, revision condition, and per-player idempotency receipt remain unchanged. Anonymous Twitch identities still cannot create permanent saves.

Existing and new saves that are still at ARC-L1 keep that authoritative location. The tracker and foreman direct the player to the existing travel console to reach Lyria before accepting the assignment; no chapter action teleports the player or rewrites an old save merely for viewing the map.

## Transition and action contract

Every chapter mutation uses the existing `POST /actions` envelope: `{requestId: UUID, expectedRevision, action: {type: "firstShift", step}}`. The mining step additionally requires `depositId: "dolivine"`; all other steps reject a deposit ID. The server derives the next objective; there is no setter, client price, quantity, reward, or destination in the action. Every operation requires an authenticated global player through the existing API, active chapter status, exact preceding objective, Lyria location, and no other pending operation. The action receipt and state commit are one conditional transaction. A replayed request returns the current state; a new request for an already completed step fails.

| Current objective        | Step          | Server effect                                                        | Next objective           |
| ------------------------ | ------------- | -------------------------------------------------------------------- | ------------------------ |
| SPEAK_TO_FOREMAN         | accept        | record accepted time                                                 | CHECK_EQUIPMENT          |
| CHECK_EQUIPMENT          | checkTool     | require owned Hand tool                                              | ENTER_MINE               |
| CHECK_EQUIPMENT          | recoverTool   | grant one non-sellable Hand tool only if missing                     | ENTER_MINE               |
| ENTER_MINE               | enterMine     | allowlisted mine checkpoint, no coordinates                          | MINE_ASSIGNED_ORE        |
| MINE_ASSIGNED_ORE        | mineDolivine  | require tool and Hand capacity; grant fixed 4 cSCU Dolivine          | RETURN_TO_OUTPOST        |
| RETURN_TO_OUTPOST        | returnOutpost | allowlisted outpost checkpoint                                       | START_REFINERY_ORDER     |
| START_REFINERY_ORDER     | startRefinery | consume 4 cSCU raw once; create 3-second, zero-cost order for 3 cSCU | COLLECT_REFINED_MATERIAL |
| COLLECT_REFINED_MATERIAL | collect       | require ready matching order and Nomad capacity; collect once        | SELL_REFINED_MATERIAL    |
| SELL_REFINED_MATERIAL    | sell          | consume 3 cSCU refined once; server credits 300 aUEC                 | RETURN_TO_FOREMAN        |
| RETURN_TO_FOREMAN        | complete      | credit 500 aUEC once; unlock `lyria-next-shift`                      | COMPLETE                 |

The fixed tutorial recipe is deliberately separate from the existing ARC-L1 ore refinery and Area-18 market rules. It does not change regular prices, methods, or inventory contracts. The Hand tool is an equipment key absent from the sellable catalog; a new save starts with one, and an older save missing it can receive one replacement during CHECK_EQUIPMENT. The once-only quest flag and objective gate prevent repeated grants.

## Play and presentation

The player meets Shift Foreman Mara Voss, Supply Officer Neri Vale, and Refinery Technician Ivo Sen. Each has a distinct programmatic coat palette and dialogue portrait. Their responses and quest markers depend on the authoritative objective. React renders a collapsible tracker, Quest Log, choice dialogue, tutorial refinery/market actions, and extraction feedback. The Canvas engine continues to own movement and animation; it never writes on frames or tiles. Crossing the mine threshold sends at most one meaningful checkpoint action for the relevant objective. The client cannot prove physical position to the server, so the backend treats the checkpoint as a chapter intent, never as a source of inventory or currency.

At the assigned Dolivine seam, holding E, Space, or the touch cutter charges energy to 100% in about two seconds while stability falls. Releasing pauses charge and can eventually fail through instability. Cancelling or failing sends no action and awards nothing. Success submits one `mineDolivine` action; the server decides the only allowed mineral and amount. The mining window pauses movement and blocks duplicate submission. No random, paid, or premium mechanic is involved.

## Security and limits

The quest action schema is strict. Invalid order, wrong location, absent tool, full holds, early collection, missing ship, and missing inventory fail without a save mutation. The tutorial order is linked by server-generated request ID. The fixed sale and final reward are credited only as part of conditional state transitions. The browser does not modify authoritative inventory. Existing authentication, global identity derivation, same-player cross-channel save behavior, and no-anonymous-save rules are unchanged. Tests use synthetic identities and in-memory state only. Logs remain on the existing allowlisted diagnostic scheme; no token, player key, request body, or inventory is added to logs. Migration remains disabled.

Deferred: full NPC schedules, subsequent quests, physical-position attestation, server-side map coordinates, combat, new planets, and deployment. Before a real rollout, review current players' location/tool compatibility and plan a matched frontend/Lambda update. Do not deploy the new frontend against the old Lambda; it will reject `firstShift` actions.

## Local validation and visual review — 13 September 2026

Node v22.23.2 `npm ci` installed 245 packages with zero audit vulnerabilities. `npm run check` passed lint, strict typecheck, 115/115 Vitest tests in 12 files, the frontend build, and the Lambda bundle. Playwright Chromium passed 21/21 cases. `npm run format:check` and `git diff --check` passed. All browser tests used synthetic identities and in-memory/local services; they did not read AWS tables, secrets, logs, Twitch tokens, or player data. The bundle script rejected migration-module markers and generated no source map.

The unchanged staging template passed SAM CLI 1.166.2 `sam validate --lint`, cfn-lint 1.56.3, all six `staging.guard` rules on normalized exact-source YAML, and all four `processed.guard` rules on a 12-resource offline translation made from that same YAML by aws-sam-translator 1.113.0. No packaging, change set or deployment occurred. `sam build` was attempted against the repository and an identical tmpfs copy, but both hung in a WSL `p9_client_rpc` filesystem wait before producing output; those attempts were canceled. This environmental validation gap remains for a future deployment review. The copied template and Lambda file hashes matched the repository before translation.

The exact starting commit's Twitch-mode build measured 287,768 JavaScript bytes, 19,029 CSS bytes and 469,323 total frontend bytes. This milestone's Twitch-mode build measured 298,993 JavaScript bytes, 20,014 CSS bytes and 481,533 total frontend bytes: increases of 11,225, 985 and 12,210 bytes. No runtime or development dependency was added.

The earlier M2 review generated 22 disconnected chapter screenshots at 318×500 Panel and 360×640 Mobile. Those images are superseded by the continuous 2.1 sequence below; ordinary gameplay did not scroll the document. The screenshots are local review artifacts only.

## Milestone 2.1 accounting verification

The earlier screenshot test seeded a different quest objective and sometimes inserted cargo before each image. It skipped the actual refinery, collection, and sale mutations. Its final 500 aUEC wallet and zero refined/sold counters therefore describe its disconnected fixtures, not a complete First Shift save. The backend transitions retain the counters and credit both the sale and reward. The Quest Log previously displayed only the reward, which made the final wallet change ambiguous.

`tests/e2e/continuousFirstShift.spec.ts` now drives one old/default save for one synthetic persistent identity through every chapter mutation in a single `MemoryStore`, `GameService`, and browser context per layout. It never replaces the state between steps. It checks each inventory, order, counter, wallet, and revision change; refreshes the app; then replays every original request ID against the same service and proves the entire state is unchanged. A second synthetic identity remains isolated. The server contract defines 4 cSCU mined and consumed, 3 cSCU produced, collected, and sold, a zero-cost tutorial order, 300 aUEC sale revenue, and a 500 aUEC quest reward. From the default starting wallet of 0 aUEC, the verified equation is **0 + 300 - 0 + 500 = 800 aUEC**. Final quest counters are **mined 4, refined 3, sold 3 cSCU**; raw and refined Dolivine balances and work orders are zero.

The test writes `test-results/m2-panel-manifest.json` and `test-results/m2-mobile-manifest.json`. Each manifest records the action, objective, wallet, raw/refined inventory, counters, and filename for six continuous-flow screenshots: mining success, refinery collection, market sale confirmation, quest completion, final reward summary, and final Quest Log after refresh. All artifacts are ignored local review files. The UI shows the sale revenue, zero refinery cost, quest reward, net wallet change, final wallet, and verified counters. A queued notification occupies a separate anchor below the tracker; only one is visible, and dialogue and mining windows hide it.

Node v22.23.2 validation for 2.1: `npm ci` installed 245 packages with zero vulnerabilities; lint, strict typecheck, 116/116 Vitest tests, frontend and Lambda builds, 22/22 Playwright Chromium cases, formatting, and `git diff --check` passed. A clean `sam build --no-cached` succeeded from a Linux-native `/tmp` copy of the unchanged staging template and current Lambda bundle. cfn-lint passed; all six source Guard and four offline-translated Guard rules passed on 12 expected resources. The live read-only Amplify check found literal auto-creation patterns `main` and `codex/react-extension-rebuild`, and only those two connected branches. `codex/dime-2d-rpg-m2` is excluded. No deployment, package upload, AWS mutation, Twitch access, website change, privacy-page change, or real player-data access occurred.
