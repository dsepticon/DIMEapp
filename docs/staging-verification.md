# Staging verification preparation — no resources changed

No compatible DIME v2 staging environment was identified. The earlier same-day inventory covered 17 enabled regions; this follow-up refreshed table lists in ca-central-1, us-east-2 and us-west-2 plus application Lambda/API metadata. Only DIMEtable, TwitchUsers and the Amplify Todo table were found there. Historical dev/staging log groups and API stage names do not prove an isolated compatible environment. Existing DimeLambda/StoreTwitchUserData and their APIs are legacy resources, not approved staging.

Do not create, modify, deploy or invoke resources to fill these gaps. If staging already exists outside this inventory, obtain its account, region and resource identifiers and inspect configuration read-only before testing. No live application endpoints or production player records were used in this follow-up.

## Access and configuration still required

| Requirement | Current status / exact information needed |
|---|---|
| GitHub | Authenticated dsepticon CLI; September 12 recheck found only literal `main` and `codex/react-extension-rebuild` Amplify auto-create patterns. Review branch is not connected. |
| AWS read access | Confirmed account 861738068626. Resource metadata inspection works. |
| Staging target | Account `861738068626`; recommend `us-east-2`, prefix `review01`, stack `dime-v2-review-20260912`. No name collision was found at the [read-only parameter preflight](staging-parameter-preflight.md). A dedicated staging-only artifact bucket and stack still require approval; no endpoint exists. |
| Staging runtime access | The template defines a new dedicated role scoped to its own table and log streams. Review the processed change set before creating it. |
| Twitch console | Owner confirmed client ID `znaovl2j45idub9k81om1dkatwxnu2`, version `0.4.0`, Panel/Mobile views and paths, and exact hosted origin. Owner, test state, fetch allowlist and persistent identity behavior still need verification. Existing September 27, 2024 `assets.zip` must remain untouched. |
| Twitch testers | Approved test broadcaster/channel IDs, viewer accounts, authorized tester list, mobile devices and console access to existing test version. No tester invitations sent. |
| Twitch signing secret | No Secrets Manager secret name/ARN was listed in the proposed `us-east-2` Region. A separately approved existing ARN or approved secret creation is needed; never provide the key value in chat, frontend, Git, logs, parameters or shell history. A different stable global player identity-key secret is also missing. |
| Identity/migration | Global saves approved. Verify two-channel U opaque-ID stability in real Twitch hosted staging; establish legacy identity links and field mapping before existing-player tests or production writes. |

Proposed configuration values are deliberately unresolved, not runnable production defaults:

| Variable / setting | Required staging value |
|---|---|
| VITE_DIME_MODE | `twitch` |
| VITE_DIME_API_URL | Exact HTTPS base URL of an existing, verified staging EBS |
| DIME_ENV | `staging` |
| AWS_REGION | Region of verified staging table and Lambda |
| DIME_STATE_TABLE | Existing compatible `dime-v2-staging-*` table, keys `pk` and `sk` strings |
| DIME_ALLOWED_ORIGINS | `https://znaovl2j45idub9k81om1dkatwxnu2.ext-twitch.tv` (owner-confirmed hosted origin) |
| TWITCH_EXTENSION_SECRET_B64 | Existing active key supplied backend-only via approved secure mechanism |
| DIME_PLAYER_ID_KEY_B64 | Separate stable backend-only 32+ byte key; preserve across Twitch secret rotations |
| TWITCH_PREVIOUS_SECRET_B64 | Optional existing previous key during its valid rotation window |
| Twitch view paths | Panel Viewer Path `panel.html`, height `500`; Mobile Path `mobile.html`; Config and Live Config blank. `index.html` is not a configured view path. |
| Twitch fetch allowlist | Exact staging EBS domain; inspect existing settings, do not add it yet |

The [staging SAM template](../infra/staging/template.yaml) now defines the separate state table, bundled EBS Lambda, dedicated execution role, HTTPS API with GET /state, POST /actions and automatic OPTIONS/CORS, log groups and alarms. It has not been deployed. No legacy production table can substitute for it. The [staging review guide](../infra/staging/README.md) lists prerequisites and post-deployment checks; resource creation and deployment remain separate approval gates.

## Checklist for an existing, approved staging environment

- [ ] Verify resource ownership/isolation, table schema, endpoint route integrations, Lambda handler/version, runtime configuration names, role permissions, CORS and telemetry read-only. Confirm no production ARN, endpoint or table is referenced.
- [ ] Inspect Twitch extension version, supported views, view paths, asset origin, fetch allowlist and authorized testers. Uploading assets or changing console settings requires separate authorization under this task.
- [ ] With a compatible build already deployed, use synthetic staging players to verify signed identity, anonymous rejection, expired/wrong-key rejection, token refresh, player/channel isolation and no token logging.
- [ ] Verify CSP/helper loading and API preflight in the real Twitch frame; test panel/video/mobile on actual Twitch clients, including iOS/Android and narrow layout. Confirm no local-mode fallback.
- [ ] Verify mine → transfer/refine → collect → sell, reload, server deadlines, stale revision handling, lost-response retry and duplicate requests against staging persistence. Check exact before/after totals and receipts, including partial orders and insufficient cargo capacity.
- [ ] Run approved anonymized legacy fixtures only: preserve original, round-trip readability, precise quantities, unknown fields/claims, incomplete orders, corrupt decode, conflicting identities, concurrent migration and retry after an uncertain commit. Currently blocked on complete reader/writer implementation and mapping approval.
- [ ] Inspect staging errors/throttles and verify rollback to the prior approved code artifact without rewinding balances or replaying migration. Do not perform failure injection or configuration changes without authorization.

Local tests verify domain behavior, mocked DynamoDB operations and synthetic JWTs. They cannot prove actual IAM, Twitch settings, deployed integration, CSP or production compatibility. [Twitch's building guide](https://dev.twitch.tv/docs/extensions/building/) describes helper loading, EBS token validation/refresh and real mobile testing.

[Current Twitch documentation](https://dev.twitch.tv/docs/extensions/reference/#jwt-schema) says signed persistent `U` opaque IDs persist across channels; identity sharing is needed only for the numeric Twitch ID. No compatible staging EBS or two-channel hosted test was available, so this assertion has not yet been verified in a real DIME staging session. Test the same signed player in two broadcaster channels and verify one state/revision/receipt set, then test two players in one channel and anonymous rejection. If Twitch behavior differs from documentation, stop release and require an explicitly shared, signed numeric identity before linking saves.
