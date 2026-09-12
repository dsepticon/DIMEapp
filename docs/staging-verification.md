# Staging verification preparation — no resources changed

No compatible DIME v2 staging environment was identified. The earlier same-day inventory covered 17 enabled regions; this follow-up refreshed table lists in ca-central-1, us-east-2 and us-west-2 plus application Lambda/API metadata. Only DIMEtable, TwitchUsers and the Amplify Todo table were found there. Historical dev/staging log groups and API stage names do not prove an isolated compatible environment. Existing DimeLambda/StoreTwitchUserData and their APIs are legacy resources, not approved staging.

Do not create, modify, deploy or invoke resources to fill these gaps. If staging already exists outside this inventory, obtain its account, region and resource identifiers and inspect configuration read-only before testing. No live application endpoints or production player records were used in this follow-up.

## Access and configuration still required

| Requirement | Current status / exact information needed |
|---|---|
| GitHub | Authenticated dsepticon CLI; September 12 recheck found only literal `main` and `codex/react-extension-rebuild` Amplify auto-create patterns. Review branch is not connected. |
| AWS read access | Confirmed account 861738068626. Resource metadata inspection works. |
| Existing staging identity | Account ID, region, stack ARN, table ARN, Lambda ARN/version, HTTPS API URL/stage and resource owner needed; none established. |
| Staging runtime access | Dedicated existing execution role scoped to that table's GetItem/transaction constituent PutItem operations and its log group; metadata review must verify actual role/policies. No new role requested or created. |
| Twitch console | Owner/collaborator access to DIME extension settings is unavailable here. Confirm extension client ID, owner, version, test state, supported panel/video/mobile views, and persistent identity behavior. |
| Twitch testers | Approved test broadcaster/channel IDs, viewer accounts, authorized tester list, mobile devices and console access to existing test version. No tester invitations sent. |
| Twitch signing secret | Existing active key and rotation metadata must be provided to staging runtime securely, never in chat, frontend, Git or logs. No key retrieved or created. |
| Identity/migration | Global saves approved. Verify two-channel U opaque-ID stability in real Twitch hosted staging; establish legacy identity links and field mapping before existing-player tests or production writes. |

Proposed configuration values are deliberately unresolved, not runnable production defaults:

| Variable / setting | Required staging value |
|---|---|
| VITE_DIME_MODE | `twitch` |
| VITE_DIME_API_URL | Exact HTTPS base URL of an existing, verified staging EBS |
| DIME_ENV | `staging` |
| AWS_REGION | Region of verified staging table and Lambda |
| DIME_STATE_TABLE | Existing compatible `dime-v2-staging-*` table, keys `pk` and `sk` strings |
| DIME_ALLOWED_ORIGINS | Exact approved HTTPS Twitch asset origin(s), usually `https://<client-id>.ext-twitch.tv`; confirm actual version configuration |
| TWITCH_EXTENSION_SECRET_B64 | Existing active key supplied backend-only via approved secure mechanism |
| DIME_PLAYER_ID_KEY_B64 | Separate stable backend-only 32+ byte key; preserve across Twitch secret rotations |
| TWITCH_PREVIOUS_SECRET_B64 | Optional existing previous key during its valid rotation window |
| Twitch view paths | `index.html`, `panel.html`, `mobile.html` as applicable to verified supported views |
| Twitch fetch allowlist | Exact staging EBS domain; inspect existing settings, do not add it yet |

Required AWS components: compatible separate state table, bundled EBS Lambda, valid execution role, HTTPS API with GET /state, POST /actions and OPTIONS, exact-origin CORS, log group and staging telemetry. None can be substituted with legacy production tables. Resource creation/deployment remains a separate approval gate; the existing [infrastructure proposal](../infra/README.md) is not authorization to provision it.

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
