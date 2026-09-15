# Milestone 4 physical navigation and recovery correction

## Supported causes

The previously prepared `DIME-Twitch-0.8.0-movement-fixed-20260915.zip` (SHA-256 `274fa1ce9067a368672f560e43ede29b6337b7e3244ef43e88afe01ca7ccdfb5`) reproduced both failures in Panel and Mobile using isolated synthetic identities and the pre-change API service. No owner browser storage or real player record was inspected.

Production `.exits` buttons submitted `moveZone` immediately. This was ordinary production UI, not a development menu. The server checked adjacency and paired exits, but did not require a position near an exit. The old browser regression clicked these controls and accepted immediate travel, so it encoded the regression.

An out-of-range `startLaser` received `MINING_REJECTED` (409), with the synthetic state unchanged. The client persisted its version-4, generation-bound request before sending, reduced error responses to generic exceptions, and only cleared the record on success. Reload resent the same rejected action and displayed recovery attention. The reproduced pending record had request ID, generation and revision markers; an old pre-wipe record was not necessary to cause the bug. Only technical presence/classification information was recorded.

## Physical interaction contract

Map location and zone buttons select objectives only. The objective provides a next-step label and a canvas marker. Exit interactions appear only within 1.6 tiles and a clear line to the paired exit; ship assignment, boarding and rig retrieval/stow require the appropriate local service. The existing ownership, assignment, departure-zone and safe-arrival checks remain in force. The arrival faces inward from the paired exit.

`moveZone`, `assignDeparture`, `completeDeparture`, `retrieveGroundRig` and `stowGroundRig` now require a finite, walkable local position in `/v4/actions`. The server validates its proximity and line of sight. As with the existing mining position contract, this is an interaction check, not a server-verified history of every walking frame. Walking remains local with no per-frame writes. No debug teleport control ships in production.

A fixed interaction row prevents appearing doorway buttons from moving the Mobile touch pad beneath a held finger. Laser cancellation safely ends an interrupted session without yield, using the existing action route and idempotent transaction.

## Shared pending policy

`app/original/recovery.ts` supplies parsing and outcome classification for startup, refresh, normal actions, conversion and reset.

- Confirmed success/replay: adopt the canonical snapshot; compare-and-remove only the matching DIME session entry.
- Known non-mutating 4xx rejection: fetch canonical state, then clear only that entry and show a concise result. If refresh fails, retain the entry.
- Different save generation: remove as obsolete without sending it against the new generation.
- Explicitly older-format, generationless request: obsolete only against strict direct-created v4 state—schema 3, content 4, save format 3, revision zero, no conversion receipt, canonical starter holdings/location, and no progress, nodes, mining sessions, orders or cargo. Conversion and reset produce revision >= 1. This proof uses the factory invariants and request format; it does not infer a trusted wipe timestamp from browser storage. A same-version generationless action remains ambiguous.
- Timeout, network error, 5xx, unknown response or idempotency conflict: retain the original body/request ID. Block new mutations; keep walking, maps and inspection available.
- Explicit discard: explain that discarding does not undo an accepted action, require typed `DISCARD`, refresh canonical state, and remove only the matching DIME entry. Never clear other storage.

A conversion request may legitimately target a legacy snapshot. Reset recovery observes the new generation and never resubmits the old-generation reset. Both cases have browser coverage for lost responses; a never-sent conversion also recovers once.

## Profile and compatibility scope

The existing deployed `/v4/state` factory already creates a canonical v4 profile directly, with a new generation and no conversion receipt. It is retained and covered by synthetic tests. Reset creates a new canonical generation; synthetic legacy conversion remains explicit and idempotent. Legacy endpoints and legacy state behavior are unchanged. There is no table scan or second wipe.

The corrected frontend is required with the tightened physical action contract. Older Milestone 4 clients omit required positions and can receive a non-mutating validation rejection. Upload the corrected ZIP before treating the Twitch release as verified. No public Twitch submission is authorized or performed.
