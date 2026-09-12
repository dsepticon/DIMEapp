# DIME v2 staging parameter preflight — September 12, 2026

This is a read-only worksheet for a **future, separately approved** isolated stack. No value, asset, secret, bucket, stack or change set was created or modified. Metadata was checked in AWS account `861738068626` at approximately 16:51 MDT. Recheck names and permissions immediately before any future creation because availability can change.

## Recommended Region and artifact ownership

Use **`us-east-2`** for the initial synthetic-player staging stack. The account already operates CloudFormation/Amplify there, while the refreshed `us-east-2` metadata showed no DIME v2 or legacy DIME table, application Lambda or HTTP API to attach by accident. This is an isolation and operational-convenience recommendation, not a latency or data-residency guarantee. Keep the new stack and table entirely separate from existing Amplify/CDK and legacy DIME resources.

The account has five buckets: CDK asset buckets in `ca-central-1` and `us-east-2`, two older CDK test API-source buckets in `ca-central-1`, and `destroyaindustriesminingextension.com` in `us-west-2`. **None is a suitable dedicated DIME v2 staging artifact bucket.** Do not reuse the `us-east-2` CDKToolkit asset bucket or the existing site bucket. Candidate new name `dime-v2-staging-artifacts-861738068626-us-east-2` returned HTTP 404 to `HeadBucket` at preflight; this is not a reservation or approval to create it. A dedicated bucket needs separate creation and security review before any future `sam package`.

`ListSecrets` returned **no active Secrets Manager names or ARNs** in `us-east-2`, `ca-central-1` or `us-west-2`. No secret value or version was requested. Consequently neither `TwitchSecretArn` nor `PlayerIdentityKeySecretArn` can be filled from an existing approved secret in the recommended Region. Both require separately approved, same-account/same-Region creation or an owner-provided existing approved ARN discovered later. The Twitch signing-key value must never enter Codex, chat, Git, docs, parameter files or shell history. The player identity key must be a separate stable backend-only secret and must survive Twitch signing-key rotation.

## Proposed names and collision result

Use stack name `dime-v2-review-20260912` and `StagingResourcePrefix=review01`. These are proposals only:

| Resource | Proposed physical name | Metadata result in `us-east-2` |
|---|---|---|
| CloudFormation stack | `dime-v2-review-20260912` | No `dime-v2-*` stack listed |
| DynamoDB table | `dime-v2-staging-review01-dime-v2-review-20260912-player-state` | Not in table list |
| Lambda | `dime-v2-staging-review01-dime-v2-review-20260912-ebs` | Not in function list |
| HTTP API title | `dime-v2-staging-review01-dime-v2-review-20260912-api` | No HTTP API listed |
| Lambda log group | `/aws/lambda/dime-v2-staging-review01-dime-v2-review-20260912-ebs` | No matching log group listed |
| API access log group | `/aws/apigateway/dime-v2-staging-review01-dime-v2-review-20260912` | No matching log group listed |
| Alarms | CloudFormation-generated names | No `dime-v2-staging-*` alarms listed |

The IAM role, Lambda invoke permissions and stage have CloudFormation-generated identifiers or are contained within the new API, so they cannot be reserved by this name check. The proposed Lambda name is 52 characters, within Lambda's 64-character function-name limit. No collision check proves future availability.

## Complete eight-parameter worksheet

| Parameter | Proposed value | Status |
|---|---|---|
| `StagingResourcePrefix` | `review01` | Proposed; no current name collision; requires deployment approval |
| `StagingRegion` | `us-east-2` | Recommended; same Region must be used for the future stack |
| `TwitchAllowedOrigins` | `https://znaovl2j45idub9k81om1dkatwxnu2.ext-twitch.tv` | Owner-confirmed exact hosted origin; one entry, no wildcard |
| `TwitchSecretArn` | **Unresolved** — ARN of a distinct approved `us-east-2` SecretString | No existing secret found; never substitute a key value |
| `PlayerIdentityKeySecretArn` | **Unresolved** — ARN of a separate stable approved `us-east-2` SecretString | No existing secret found; preserve across signing-key rotations |
| `LogRetentionDays` | `14` | Requested default |
| `ApiThrottleRate` | `10` requests/second | Requested default |
| `ApiThrottleBurst` | `20` requests | Requested default |

The stack name and artifact-bucket name are **not** among the eight template parameters; they are separate future deployment inputs. The two secret ARN fields are intentionally unresolved, so this worksheet is not an executable parameter file.

## Confirmed Twitch configuration and remaining gates

The owner confirmed client ID `znaovl2j45idub9k81om1dkatwxnu2`, version `0.4.0`, supported Panel and Mobile views, `panel.html` at height `500`, `mobile.html`, blank Config and Live Config paths, and the exact hosted origin above. Current Local Test base URI `https://destroyaindustriesminingextension.com/` is **not** the hosted origin, staging API, or a value for `TwitchAllowedOrigins`. The older `assets.zip` uploaded September 27, 2024 remains attached to version `0.4.0` and must not be overwritten. The future staging API fetch-domain allowlist, tester accounts/channels, hosted-test publication state and real cross-channel persistent opaque-ID behavior still need verification in the Twitch console and hosted frame before any release.

Separate approval is still needed to create the dedicated artifact bucket, both backend secrets if no suitable existing approved ARNs are supplied, and the 12 resources in the [staging template](../infra/staging/template.yaml): table, Lambda, role, two log groups, HTTP API, stage, two invoke permissions and three alarms. Later packaging, a CloudFormation change set, stack execution and Twitch asset publication each have their own approval gate. Nothing here authorizes migration writes, production/legacy access, or changes to existing Twitch assets.
