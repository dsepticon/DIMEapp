# Legacy save mapping for approval

Status: **proposal and offline preview only; production migration writes are not enabled**. The current state already explicitly uses `schemaVersion: 2`. The new offline preview has `previewSchemaVersion: 1`, retains the complete input in `original`, and never returns a writable PlayerState. It is not imported into the API, stores, frontend or Lambda handler.

Evidence: archived MiningContext.js, Inventory.js, ASOP.js, Refinery.js, WorkOrders.js and StoreTwitchUserData/twitch.js under [recovered](recovered). No production player records were read. Tests contain synthetic anonymized shapes only.

## Release policy

Existing saves must remain readable. Keep the existing frontend/storage accessible until a compatible reader, identity link and conversion have been approved and verified. Do not clear localStorage, start a replacement zero-balance profile for a detected legacy player, bulk modify DynamoDB, or overwrite inventory, cargo, orders, claims or wallet. A failed decode or validation must return a recoverable review status, not initialState.

`server/legacy-preview.ts` accepts **already decoded** JSON field values for mapping review. It keeps any undecoded ciphertext or malformed value verbatim and flags it; it does not include the removed legacy key or implement decryption. Original raw localStorage bytes and integrity fields must be separately preserved by the future reader before decoding. Plaintext JSON cargo/orders and encrypted variants both occurred in the old app. Neither a browser hash nor successful decryption proves identity or authoritative value.

The preview is deterministic for the same source, has no I/O, clones its input, and produces a source SHA-256 for retry comparison. This digest identifies the serialized input, not an authenticated player or a tamper-proof record. No conversion transaction is implemented yet; the retry tests prove preview behavior only.

## Exact field mapping

All source fields are retained in `original`, whether mapped or flagged. No implicit defaults, coercion, rounding, capping, duplicate credit, or name correction is allowed.

| Legacy field | Proposed current target | Conversion / unresolved condition |
|---|---|---|
| Missing schemaVersion | `schemaVersion=2` on a future successful conversion | Unversioned source remains unchanged; explicit unknown versions block conversion. v2 is read through the current reader, never remigrated. |
| wallet | wallet | Same integer aUEC. Invalid/fractional/out-of-range values retained and flagged, never zeroed. |
| ships[type] | ships[type] | Exact recognized type and count; no free default ships. |
| miningHeads[name], crew[name] | equipment[name] | Exact count, disjoint keys only; collisions block, never sum. Unknown equipment needs catalog review before activation. |
| currentShip | currentShip | Exact recognized type; ownership must reconcile before activation. |
| currentLocation, characterLocation | location | Same recognized location if consistent; conflicting values block. No inferred precedence. |
| shipLocations[type] | positions[type] | Exact recognized type/location. Missing locations are unresolved, not assigned to the player. |
| miningInventories.Hand[ore], .Roc[ore] | mining.Hand[ore], .Roc[ore] | Legacy cSCU → integer cSCU unchanged. |
| miningInventories.Prospector[ore], .Mole[ore] | mining.Prospector[ore], .Mole[ore] | Legacy SCU × 100 → cSCU, only exact representable amounts. |
| miningInventories.Ships | positions candidate only after reconciliation | ASOP duplicates shipLocations here. Retain and compare; preview flags rather than merging. |
| miningInventories.Refined | No automatic credit | Refinery duplicates order output here; retain and flag to avoid double credit. |
| cargoInventories[type].Ores[ore] | cargo[type].raw[ore] | SCU × 100 exactly, recognized names only. |
| cargoInventories[type].Refined['Refined '+ore] | cargo[type].refined[ore] | Remove exact `Refined ` prefix, SCU × 100 exactly. |
| cargoInventories[type].Refined[unprefixed ore] | Unresolved | Broken raw transfer wrote to Refined with an unprefixed name. Retain category/amount and flag; do not guess raw/refined. |
| workOrders[].id | Candidate source-order identity | Numeric Date.now ID is not a guaranteed unique transaction key. Preserve; duplicate IDs require reconciliation. |
| workOrders[].inventory | Candidate orders[].source | Exact mining source after validation. |
| workOrders[].method.name | Candidate orders[].method | Recognized method only; retain the complete method object and adjustments. |
| workOrders[].refinedOre['Refined '+ore] | Candidate remaining `refinedUnits` per ore × 100 | Preserve remaining outputs including partial collections. Multi-ore orders need an approved representation, not an automatic split. |
| workOrders[].refinedAmount | Retained aggregate | Can diverge from sum/remaining outputs; never add it as extra cargo or credit. |
| workOrders[].endTime | Candidate readyAt | Only verified finite epoch milliseconds with provenance. Creation code omitted endTime. |
| workOrders[].time | Retained duration/countdown | Mutable countdown cannot establish createdAt/readyAt; never use current time or mark complete by default. |
| workOrders[].cost | Unresolved paid cost | Creation stored a cost label, not previewCost. Never re-charge or infer original payment. |
| workOrders[].userCleared | Retained flag | Not proof of receipt or collection; reconcile with remaining outputs. |
| Missing order rawUnits / createdAt | Unresolved | Do not reverse yield or treat numeric ID as verified creation time. Entire order stays flagged until mapping is approved. |
| claims (any shape) | Retained, flagged | No recovered claim schema and no current claim field; no reset, automatic credit, or loss through schema stripping. |
| walletHash, miningInventoriesHash, cargoInventoriesHash, workOrdersHash | Original provenance only | Preserve exact bytes with raw values; not trusted authentication. |
| selectedMiningHead, selectedMiningHead2/3, selectedCrew1/2/3 and other UI keys | Retained preferences | Do not infer ownership or issue equipment from a selection. |
| travel/mining timers, pending rewards | Unresolved `pending` | Legacy state was transient; do not invent completion, rewards or a null pending state. |
| refineryRates | No stable legacy equivalent | Legacy values were randomized per mount. Approve future rates independently; never recalculate existing order outputs. |
| revision / idempotency receipts | New migration metadata after approval | New profile revision/receipt policy must be explicit; never reuse legacy IDs as action receipts. |
| Any other or invalid field | Retain and flag | Entire source remains available even when current Zod schemas would strip unknown keys. |

## DynamoDB and identity gaps

`DIMEtable` has partition key `twitchUser` (string), but no recovered writer establishes its remaining fields. **No exact DynamoDB item mapping can responsibly be invented.** Obtain an owner-supplied anonymized schema/fixture and key semantics before adding a reader. `TwitchUsers` has key `userId` and recovered writer field `userName`; these are identity metadata, not saves or wallet authority. Retain both, with no mapping to game balances.

Current player key is `CHANNEL#<signed channel_id>#VIEWER#<signed persistent opaque_user_id>`. Legacy localStorage is browser/origin scoped, and legacy DynamoDB keys do not prove this binding. Approve verified identity linking and channel-versus-global save semantics. Moving from the custom domain to a Twitch asset origin prevents direct access to old localStorage: a deliberate export/import or authenticated legacy-origin bridge is required. Do not silently create new profiles across that boundary.

## Lazy migration protocol to implement after mapping approval

1. Authenticate the player and establish the approved legacy identity link before reading a save. Preserve raw source bytes/record and its version or digest; never scan or rewrite all production items.
2. If current state exists, return it without reapplying migration. Otherwise read and decode the legacy record through its version-specific reader, preserving unknown fields and an immutable original. Missing, corrupt or ambiguous values show a recoverable legacy review state and block conflicting economy actions.
3. Generate and validate the full candidate against the approved mapping. Reconcile ownership, capacity, all balances, output quantities, orders and claims; schema validation alone is insufficient. Do not use initialState to fill gaps.
4. On authenticated load or the next normal save, atomically persist candidate plus a stable migration receipt bound to source identity/version/digest and destination identity; condition on no prior conversion and the expected source version. Keep the source unchanged. Cross-region sources require an explicit coordination design; a single DynamoDB transaction cannot be assumed across regions. Preserve backups outside the state item if needed to avoid item size limits.
5. On timeout or race, read the receipt/current state and return the committed result. Never repeat credits, collect orders, or overwrite newer normal saves. Validate totals before acknowledging success; retain the original even after success until approved retention policy allows removal.

Release remains blocked on the decoder/legacy-origin bridge, identity policy, anonymized DynamoDB schema, unresolved order/claim mapping, complete compatibility reader and transactional retry/concurrency tests. The current new-player load path does not discover legacy records; do not cut over existing players to it yet.
