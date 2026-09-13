# DIME 2D RPG Milestone 2 — The First Shift

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

Ignored `test-results/` contains 22 chapter screenshots, each scenario at 318×500 Panel and 360×640 Mobile: `foreman-introduction`, `assignment-acceptance`, `objective-tracker`, `quest-log`, `mine-entrance`, `mining-interaction`, `mining-success`, `refinery-tutorial`, `market-sale`, `quest-completion`, and `reward-summary`, named `m2-panel-<scenario>.png` and `m2-mobile-<scenario>.png`. Visual inspection found the miner, NPCs, mine, tool window, tracker, quest log and tutorial windows readable and unclipped at both sizes; ordinary gameplay did not scroll the document. The screenshots are local review artifacts only.
