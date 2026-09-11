# Git versus production reconciliation

Scope: Dsepticon/DIMEapp, branch codex/react-extension-rebuild. No Unity source was accessed.

## What existed in Git

The original main branch was an Amplify/Next 13 starter at 99cf684. The requested branch at 98c8c75 added a branded three-ore prototype and a browser-only wallet/inventory. Twitch failure silently switched to development mode. There was no EBS, test suite, or working lint configuration. The Amplify PlayerState schema permitted browser-owned balance fields and did not match the deployed Todo schema.

An isolated worktree was used to preserve all 24 pre-existing modifications in /mnt/c/projects/DIMEapp. Those changes were end-of-line whitespace under the initial comparison and were not normalized or removed.

## What was recovered from AWS

The active index.html references main.9ada84e7.js and main.8f7f5540.css. Their source maps contain 17 authored source files with sourcesContent. The Lambda packages contain twitch.js and index.mjs. Package downloads were verified against AWS CodeSha256. Each recovered source file has an original SHA-256 and artifact association in recovery-provenance.json.

Original authored files are stored as non-executable .txt reference files in docs/recovered. The browser-side obfuscation key was removed from MiningContext and WorkOrders; those copies are explicitly marked non-exact. The other 17 recovered files are exact in textual content but may have normalized line endings in the archived copy. Hashes refer to the original source contents, not normalized archive bytes.

Recovered features include hand/ROC/Prospector/Mole mining, asteroid weights, locations, ships and equipment, nine refinery methods, transfer/collection, market prices, and travel times. Source maps are authored-source evidence; minified bundles were not relabeled as maintainable source.

## What was broken

- The production React app stored wallet, inventory and orders in localStorage with an embedded shared obfuscation key. This is not server authority.
- The frontend attempted to use an extension JWT with Helix /users, instead of validating it through an EBS.
- Refinery creation did not write endTime, which order countdowns expected.
- Independent timer effects could award ore while scanning and repeat mining updates.
- Raw ship-mined ore transfers were classified as refined.
- Refinery/cargo persistence mixed plaintext JSON and encrypted values.
- Cargo collection ignored raw cargo when checking capacity.
- Refined Aluminium used a mismatched price key.
- The recovered StoreTwitchUserData file is twitch.js, but the deployed handler is index.handler. It accepts a browser-supplied user identity without verification and uses SDK v2.
- DimeLambda's index.mjs combines ESM/CommonJS conventions, expects an S3 event, names a placeholder DynamoDB table and misreads the S3 bucket; API Gateway supplies HTTP events instead. Its deployed handler is index.html.
- Both application Lambdas refer to a missing DimeLambda role.
- The rebuilt branch's owner-editable PlayerState model and simplified economy would not preserve production rules.

## Reconstructed components

The maintained TypeScript domain, state service, DynamoDB transactional adapter, Twitch JWT validation, API client, retry reconciliation, local persistent server, responsive React views, and tests are new code. They reuse recovered catalog values and branding; they are not claimed to be exact original implementations.

The old Amplify sources are archived under docs/legacy-amplify as text and are not part of the active dependency/build graph. No existing AWS stack is imported or replaced. React remains on major version 18. Next/Amplify packages were removed because the extension is a static iframe and does not need SSR, not as an indiscriminate framework upgrade.

## Compatibility and remaining decisions

The legacy APIs do not implement the v2 /state and /actions contract. This frontend must never be uploaded against them. The new table schema is intentionally distinct; no production-record schema was inferred from player records.

The implementation scopes a profile to a persistent Twitch opaque ID and channel. If a global cross-channel economy is desired, approve that product/data migration before launch. Anonymous viewers cannot transact.

The recovered app stores ships as counts by type. This structure is preserved, including one location and cargo hold per type; individually named multiple-ship instances would be a separate migration.

Old balances cannot be trusted merely because they decrypt. Any migration needs an approved policy for verification, user consent, validation, backups, dry-run counts and reconciliation. There is no automatic importer.

Twitch Developer Console configuration and a real shared secret are unavailable here. Hosted-test validation, approved CORS origins, a fresh staging stack and production migration policy remain release gates. None prevents the local game loop and tests from running.
