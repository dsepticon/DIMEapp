# Milestone 2.3: authenticated gameplay reset

This is a local source candidate on `codex/dime-2d-rpg-m23-reset`, based on `fb025afee0d39e7d59f6dbe5227d45481ba36db0`. It has not been deployed or uploaded to Twitch. The reset is scoped to the single global DIME save derived from a verified persistent Twitch U identity; the channel is signed request context and does not select a different save.

Profile separates **Reset Game Progress** from routine status controls. The game pauses in a confirmation window. The player must type `RESET MY DIME PROFILE` exactly and click **Reset All My Game Progress**; Enter does not submit. A second click during an in-flight request is ignored. Failure keeps the window open and retries the same request ID. Success installs the fresh authoritative snapshot, clears only the player's DIME pending-action session entry, returns to the initial RPG scene, and shows **Game progress reset.**

## Canonical state inventory

The reset creates state only with the server's `initialState` factory. The field-inventory test fails if a new top-level state field or First Shift field is added without classification.

| Classification | Fields and behavior |
|---|---|
| Reset to factory defaults | `wallet`, `location`, `currentShip`, `ships`, `equipment`, `positions`, `mining`, `cargo`, `orders`, `refineryRates`, `pending`, `firstShift` |
| Nested quest data cleared with `firstShift` | Status/objective, mined/refined/sold counters, accepted/completed times, reward claim, recovered tool, dialogue flags, unlocked quests, tutorial order link, legacy version/reconciliation/support state |
| Technical state | `schemaVersion` remains 2; `revision` advances by one; `saveGeneration` changes to a new random UUID |

The fresh profile starts at `ARC-L1` with 0 aUEC, its normal starter Nomad and Hand tool, empty holds/orders, no pending operation, and First Shift interpreted as `NOT_STARTED`. Factory refinery rates are regenerated. The renderer's current 2D Lyria scene remains the existing initial visual scene even when the authoritative starting location is `ARC-L1`; location-specific maps are future work.

The STATE item retains the same derived global player key. Existing `REQUEST#<UUID>` technical receipts remain until their 30-day TTL eligibility, with asynchronous DynamoDB expiry. Logs and PITR follow their existing retention/recovery settings; reset does not delete those records. This is **gameplay reset, not privacy erasure**. A verified privacy-deletion request remains a separate process.

## API, atomicity and compatibility

`POST /profile/reset` uses the existing Twitch JWT verifier, global HMAC-derived player key, Lambda, table and transactional receipt writer. The strict body is `{requestId: UUID, expectedRevision: nonnegative integer, expectedGeneration: UUID, confirmation: "RESET MY DIME PROFILE"}`. Client-supplied identity, key, starting state, economy, location, quest or reward fields fail validation. Anonymous or invalid JWTs fail before state access. The existing POST/Authorization CORS policy covers the new route; the staging SAM template adds only its HTTP API event and generated route permission. Existing DynamoDB GetItem/PutItem transaction permissions suffice; there is no Scan or cross-player permission.

The transaction conditions STATE on both old revision and old generation, writes the fresh state at `revision + 1`, and creates a unique request receipt in the same transaction. Identical retries return the current canonical state. Conflicting reuse of an ID returns `IDEMPOTENCY_CONFLICT`; competing resets at the same revision cannot both commit. Monotonic revisions reject pre-reset actions even after receipt TTL cleanup. Existing old-action receipts replay the **current** state, never their historical snapshot. The client additionally fences delayed pre-reset snapshots by revision and generation.

Existing v2 saves without `saveGeneration` acquire a random marker through a conditional write that leaves revision and gameplay fields unchanged. The reset request then includes that marker. The old frontend does not expose this route, and the new frontend needs the new backend route; deploy backend first in a separately approved coordinated release. No identity migration module is imported or activated.

## Synthetic verification and release boundary

Vitest covers the complete field inventory, factory result, JWT and persistent identity, two-channel one-save behavior, other-player isolation, invalid input, revision/generation conflicts, concurrent reset, duplicate receipt, old-action replay and normal post-reset actions. Playwright covers Panel 318×500 and Mobile 360×640, exact phrase/Enter/double-click behavior, a delayed resetting state, failure retry with the same ID, targeted sessionStorage cleanup, and the fresh profile/quest state. Screenshots are generated under `test-results/m23-reset/` by the continuous local in-memory scenario for each layout.

The [published privacy policy](https://destroyaindustriesminingextension.com/privacy) already describes the global save, progression, request receipts, their TTL, logging and PITR. Before public release it should explicitly distinguish this new self-service gameplay reset from verified privacy deletion, because the former leaves technical receipts and recoverable backups; its statement that no automated *deletion* endpoint exists remains accurate for privacy erasure. The policy itself is not changed in this milestone.
