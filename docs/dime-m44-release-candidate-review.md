# Milestone 4.4 release-candidate review

## Decision

Prepared from `4675386b422ce0c3547925183e35776efd13a818` on `codex/dime-m4-industrial-services`. Local and remote source matched; the worktree was clean before this review. Application source is unchanged by release preparation. Amplify still connects/automatically creates only `main` and `codex/react-extension-rebuild`.

**No gameplay or web-auth Lambda deployment is required.** The rebuilt gameplay module is byte-identical to the retained ZIP whose hash matches the deployed Lambda. The frontend can use the current API without a backend cutover or save migration.

One guest-asset allowlist change is required before replacing `/game/index.html`. Its CloudFormation change set is **CREATE_COMPLETE / AVAILABLE, unexecuted**. Nothing was deployed, published, uploaded to Twitch or activated.

## Release artifacts

All local files are under `/tmp/dime-m44-rc-4675386/`. [Exact archive/file listings](dime-m44-release-candidate/artifacts.json) and [compiled audit](dime-m44-release-candidate/compiled-audit.json).

| Artifact                                                    |  Bytes | SHA-256                                                            |
| ----------------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `DIME-Twitch-0.9.0-m44-industrial-services-4675386-rc1.zip` | 110303 | `3ebb0549fc585496dc3692dad60220fdc4c96e42e72e634ed0368838ac452d77` |
| `DIME-Web-m44-game-4675386-rc1.zip`                         | 112982 | `4cfd280f4c1256db6f0c5f7acc8ac939834d0c3856ba92b1d2aa264c334d0d0c` |

Twitch ZIP has root `panel.html`, `mobile.html`, `index.html` and two hashed assets, no wrapper. Guest ZIP uses the exact three publication keys in the [publication manifest](dime-m44-release-candidate/publication-manifest.json). Archive CRC, complete listings, sizes and every file hash pass. Rebuilt file hashes match the source review. No maps, tests, fixtures, external artwork files, secret-reference strings, private-key markers or local development endpoints were found. The Twitch API and privacy URLs are correct. Static pattern checks supplement the synthetic browser network tests; they are not a claim to detect arbitrary unknown secrets.

Gameplay module SHA-256: `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`.

Retained deployed gameplay ZIP `/tmp/dime-m42-manifest-review/gameplay-manifest-6bec1b2.zip`: `e246dd9056187c1daf4d26a70dc68ab5cc0e6ef621371a8ba9b6ca0f53a42af6`. This matches deployed CodeSha256 `4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=`. ZIP contains only `index.mjs`; its contents equal the rebuilt module and clean SAM output. No new Lambda upload was made.

## Compatibility

The three application changes at the source commit are `app/original/ServiceConsole.tsx`, `app/original/serviceModel.ts`, and `app/original/original.css`. Full source/tooling/evidence list: [source review](dime-m44-industrial-services-review.md#changed-files). No `shared`, `server`, `infra` or workflow source changed from the preceding gameplay baseline.

- Existing content-v4/save-format-3/quantity-format-2 state, wallet remainder, equipment, cargo, processing orders, generation and revision contracts are unchanged.
- Decimal cSCU inputs become exact integer minor units. Quotes use existing shared economy functions. No balance, rounding, yield or capacity change.
- Pending mutations retain their original request ID on uncertainty; definitive rejection uses existing recovery. Partial processing collection leaves the uncollected output on the order.
- Reset remains the existing server action creating a fresh canonical v4 save and generation. No real reset was performed.
- Explicit old-client test used retained M4.3 scanner ZIP SHA `189c4ac1893d0957cbada62352742952b92cd22fbb75dce7193c413c07d326e8`. On Panel and Mobile, a converted synthetic save transferred 100 minor units from 125, replayed a committed lost response exactly once, retained its existing processing order, loaded unchanged in M4.4, and reset through M4.3 to a new canonical generation. [Evidence](dime-m44-release-candidate/m43-compatibility.json).
- The full suite covers physical navigation, scanner/analysis, charge, fracture, vacuum, cargo, processing, sale, quests and recovery. Guest processing remains memory-only and refresh/tab-isolated.

Authenticated compatibility tests use an in-memory store and the unchanged actual API implementation. They do not inspect or mutate deployed player saves. Live read-only boundary probes confirmed all eight legacy/v4 routes reject unauthenticated requests, correct-origin preflight returns 204, and a foreign origin receives no allow-origin header. [HTTP evidence](dime-m44-release-candidate/public-http.json).

## Exact CloudFormation review

Account `861738068626`; guest stack `dime-guest-game-20260916`, region `us-east-2`.

Change set: `m44-4675386-guest-assets-review-1`.

ARN: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m44-4675386-guest-assets-review-1/30403bbd-da3a-4db1-b3b6-819141e139a0`.

| Action | Resource                                    | Property     | Replacement |
| ------ | ------------------------------------------- | ------------ | ----------- |
| Modify | GuestCapability — AWS::CloudFront::Function | FunctionCode | False       |

**Zero additions, removals, replacements, IAM changes or other resource operations.** API, Lambda, DynamoDB, CORS, authentication, OAuth, WAF, origins, distribution behaviors, cache/header policies, root and privacy remain unchanged.

The deployed processed template and LIVE function match the checked-in baseline exactly. The candidate changes only the allowlist by adding `/game/0.9.0/assets/index-CUW7K6FZ.js` and `/game/0.9.0/assets/index-D7PTPCZK.css`. Every prior allowed path remains. Code outside that array is byte-identical. `AutoPublish: true` is unchanged; executing later would publish the new function to LIVE.

The existing function is associated only with `/game/*` and the four exact guest `/api/v4/` denial paths. No new associations or paths are introduced. Root, privacy, auth/logout/deletion and Twitch API routing remain outside this change.

[Structural comparison](dime-m44-release-candidate/template-comparison.json), [change details](dime-m44-release-candidate/change-set.json), [processed candidate](dime-m44-release-candidate/guest-processed.json), [creation events](dime-m44-release-candidate/change-set-events.json). Proposed processed template equals the local candidate. CloudFormation validation, cfn-lint and all four guest Guard rules pass on candidate and processed output. `describe-events` reports successful change-set creation; no execution occurred.

## Validation

All application builds used locked Node 22 dependencies after `npm ci`.

| Gate                                                          | Result                                 |
| ------------------------------------------------------------- | -------------------------------------- |
| Lint, strict typecheck, formatting, diff whitespace           | Pass                                   |
| Complete Vitest suite                                         | 599 tests, 68 files passed             |
| One clean complete Chromium release run                       | 176 passed, zero retries, 19.3 minutes |
| Complete guest Chromium suite                                 | 5 passed, zero retries                 |
| Compiled standalone web service smoke                         | 3 layouts passed                       |
| Retained M4.3 client compatibility                            | Panel and Mobile passed                |
| Default, Twitch, guest, standalone web and both Lambda builds | Pass                                   |
| Clean Linux-native SAM build and SAM validation               | Pass; gameplay module identical        |
| Source/packaged/offline-processed cfn-lint                    | Pass                                   |
| Source/processed staging Guard                                | 6 / 4 rules passed                     |
| Guest candidate/processed lint and Guard                      | Pass; 4 rules each                     |
| Public unauthenticated API/CORS and guest edge boundaries     | Pass                                   |
| Exact artifacts, compiled-content and rollback integrity      | Pass                                   |

[Machine-readable validation and log hashes](dime-m44-release-candidate/validation.json). SAM source Guard initially rejected short-form YAML `GetAtt` representation; passing the existing cfn-lint intrinsic-normalized JSON representation passed without changing source or rules. An initial sandbox DNS failure during dependency installation was corrected by the complete clean network-enabled validation run. Neither is hidden as a passing first attempt. The final complete browser run passed without isolated reruns.

The source contract, roles, routes and table definitions are unchanged; no new IAM access is proposed. The new guest assets currently return S3 HeadObject 404, confirming create-only publication is appropriate.

## Visual review

Fresh compiled-client screenshots were inspected for readable controls, internal scrolling, touch targets, unobstructed gameplay and layout clipping:

- [318×500 Panel cargo](dime-m44-release-candidate/screenshots/Panel-cargo.png)
- [360×640 Mobile market](dime-m44-release-candidate/screenshots/Mobile-market.png)
- [960×720 Twitch Preview processing](dime-m44-release-candidate/screenshots/Twitch-Preview-processing.png)
- [1280×900 web processing](dime-m44-release-candidate/screenshots/web-1280-processing.png)
- Guest world: [Panel](dime-m44-release-candidate/screenshots/guest-318.png), [Mobile](dime-m44-release-candidate/screenshots/guest-360.png), [desktop](dime-m44-release-candidate/screenshots/guest-1280.png).

Long service screens intentionally scroll inside a paused overlay; they do not become permanent world HUD. Available stock, destination, quote and collection controls remain readable. Guest mode notice remains visible. Touch targets are at least 44 CSS pixels. Preview is local Chromium with a synthetic Extension bridge, not authenticated Twitch console evidence. Web signed-in layouts use synthetic sessions while public sign-in remains disabled.

## Production performance

Fresh Chromium 153 measurements used the exact compiled artifacts, keyboard Panel, touch Mobile and standalone desktop web with synthetic API state. Each layout exercised eight visible nodes, eight fragments, scanner, laser, vacuum and Avenbolt Commodity Hall effects.

| Layout  | Walking frame p95 / worst (ms) | Transition average / p95 / worst (ms) | Transitions |
| ------- | ------------------------------ | ------------------------------------- | ----------: |
| Panel   | 16.7 / 16.8                    | 77.8 / 86.1 / 86.9                    |          36 |
| Mobile  | 16.7 / 16.8                    | 76.1 / 87.4 / 88.5                    |          30 |
| Desktop | 16.7 / 16.8                    | 78.2 / 87.1 / 87.2                    |          36 |

Effect frame p95 was 16.7–16.8 ms; worst 16.8 ms. All layouts retained one canvas, no document scrolling and zero reported errors. Walking made no save writes. DOM changed from 56 to 57 elements as contextual UI appeared, then remained stable during idle; effect views remained bounded at 66–76 elements. Each layout collected the expected 80 synthetic fragment units. Twitch assets total 376,588 bytes (108,894 gzip).

[Full fresh measurements](dime-m44-release-candidate/performance.json). The instrumentation-heavy heap trends rise during travel and fall after the benchmark state is replaced; they do not prove absence of leaks. The retained same-artifact [180-transition heap-isolation review](dime-m44-industrial-services-review/heap-stability.json) measured 117,880 bytes of post-warmup growth with declining increments and stable document/node/listener counts. It was not rerun because no application code or artifact bytes changed. Neither local benchmark substitutes for longer real Twitch webview profiling.

## Deployment/publication plan — requires subsequent authorization

1. Recheck source/artifact hashes, account, disabled sign-in/linking, enabled conversion, deployed function/template, associations and current object ETags. Stop on any unexplained drift. Refresh backups immediately before any write.
2. **Do not deploy either Lambda.** Twitch and guest frontends independently use the existing backend contracts.
3. Guest: upload only the two new hashed assets from the manifest with create-only writes, correct content types, AES256 encryption and `public, max-age=31536000, immutable`. If a key already exists, require exact byte/metadata agreement; do not silently overwrite it. Verify both hashes. Existing guest entry remains untouched and the old function does not serve these assets yet.
4. Execute only the reviewed guest-function change set; wait for guest stack `UPDATE_COMPLETE`, verify LIVE function bytes and all old/new allowlist and denial paths. No distribution update is needed.
5. Replace only `game/index.html`, conditional on the freshly verified current ETag. Preserve encryption; set `text/html; charset=utf-8` and `no-cache, max-age=0, must-revalidate`. Verify bytes.
6. Create one invalidation for `/game/` and `/game/index.html` only. Verify TLS, exact public bytes, immutable assets, scoped CSP, root/privacy hashes, missing-asset behavior and all four edge-generated 401 responses. Run full guest journey, refresh, second-tab independence and no gameplay-storage/authenticated-network checks.
7. Twitch: upload the reviewed ZIP only to a mutable test version; if 0.9.0 is immutable, prepare the next owner-authorized version without altering old versions. Panel path `panel.html`, Mobile `mobile.html`, panel height 500, current staging domain and privacy URL. Local Test first, then Hosted Test, checking exact quantity transfer, processing/partial collection, retry, sale, navigation and mining/vacuum. No public review/release is authorized here.

## Rollback

[Rollback manifest](dime-m44-release-candidate/rollback-manifest.json) records downloaded existing game entry/assets, ETags, content types, cache controls, encryption, hashes and version IDs. Current version IDs were absent; this is a local byte/metadata backup, not an invented S3 version history. Distribution ETag recorded `E15GZDBBQBW2HX`, function ETag `ETVPDKIKX0DER`; these are review-time values, not reusable write authorizations.

`/tmp/dime-m44-rc-4675386/DIME-Guest-m44-rollback.zip`, SHA `6aff72b2dc4f6f128a6c8fd3c13ba223971db86bd1df0adca6f1c3e937e6fff9`, contains the old game entry/assets and function/template backup. Archive CRC and simulated file restoration hashes pass. Old root/privacy bytes were separately downloaded and matched public HTTPS responses; neither is a publication target.

On guest failure, conditionally restore old `game/index.html` against the verified failed-publication ETag. Old assets remain available because the candidate preserves their allowlist. Restore old function code through a separately reviewed function-only CloudFormation update if required, then invalidate only the two entry paths. No distribution, save, table or authentication rollback is necessary. If failure occurs before entry publication, the old entry remains active. Retain hashed assets; do not delete unrelated files.

Twitch rollback is the retained compatible M4.3 v4 scanner ZIP listed above; it lacks the improved service UI but retains valid save contracts. Never use a Milestone 3 client as rollback after conversion. No save snapshot rollback or profile reset is part of this plan.

## Boundaries and remaining limitations

Authenticated live Twitch Local/Hosted Test and real-webview performance remain release-time checks. No real player authorization was used for this review. Local synthetic API success plus deployed bundle identity establishes compatibility without claiming a real-account test.

No deployment, website publication, Twitch upload, secret retrieval/promotion, invitation generation, player read/scan/reset, or auth-mode change occurred. The only AWS write was creation of the explicitly requested unexecuted guest review change set. Sign-in and linking remain DISABLED; conversion remains ENABLED. Existing OAuth activation/rollback artifacts remain untouched.
