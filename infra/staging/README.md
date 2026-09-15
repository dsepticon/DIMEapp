# Isolated DIME v2 staging stack — review only

September 12, 2026 status: the owner-approved CREATE change set was executed once and stack `dime-v2-review-20260912` reached `CREATE_COMPLETE`. The five outputs include API URL `https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging`. Resource configuration and exact-origin OPTIONS preflight matched review, but an unauthenticated GET returned HTTP 503 with generic Lambda `configuration_error`. Runtime verification is blocked; no frontend ZIP was built or uploaded. See [staging verification](../../docs/staging-verification.md). The prerequisite and deployment instructions below describe the pre-creation review and are historical for this stack.

The reviewed follow-up adds required, non-secret `ConfigurationRevision`. Use `twitch-secret-fix-20260912-1` for the proposed UPDATE. Its `DIME_CONFIG_REVISION` Lambda environment variable forces CloudFormation to update Lambda configuration and resolve both existing versionless Secrets Manager references again. The supplied Twitch signing-secret ARN matches the deployed stack parameter exactly; no secret value was read. The Lambda now records only fixed configuration diagnostic codes (`missing_setting`, `invalid_environment`, `invalid_table`, `invalid_origin`, `invalid_revision`, `invalid_twitch_key`, `invalid_identity_key`, `invalid_previous_key`, `unexpected_configuration_error`); it still returns a generic 503 externally. Do not call the API until a separately approved update is executed.

`template.yaml` is a SAM/CloudFormation definition for a new synthetic-player staging environment. Nothing in this directory deploys on branch push. The template creates no legacy access, migration trigger, frontend bucket, CloudFront distribution, Amplify branch, custom domain or production stage. The Lambda entry point is the existing `dist/server/index.mjs` bundle (`index.handler`, Node.js 22). `server/migration-gate.ts`, `server/migration-dynamo.ts` and the offline preview are not imported by the Lambda handler or included in its bundle.

## Parameters and prerequisites

| Parameter                    | Needed from operator                                                                                         | Constraint                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `StagingResourcePrefix`      | Unique staging slug, such as `review01`                                                                      | 3–20 lowercase letters, digits, hyphens; no production or legacy name        |
| `StagingRegion`              | Approved staging AWS Region                                                                                  | Must match `--region`; a CloudFormation rule enforces equality               |
| `TwitchAllowedOrigins`       | Exact comma-separated extension asset origins from the Twitch console                                        | HTTPS `<client-id>.ext-twitch.tv` origins only; no wildcard/trailing slash   |
| `TwitchSecretArn`            | ARN of an **existing approved** Secrets Manager SecretString with the base64 Twitch extension signing secret | Same account/Region as stack; never supply the secret value                  |
| `PlayerIdentityKeySecretArn` | ARN of a **different existing** SecretString with a stable base64 32+ byte HMAC key                          | Same account/Region; preserve permanently across Twitch signing-key rotation |
| `LogRetentionDays`           | 7, 14, 30, 60 or 90                                                                                          | Default 14                                                                   |
| `ApiThrottleRate`            | 1–100 requests/second                                                                                        | Default 10                                                                   |
| `ApiThrottleBurst`           | 1–200 requests                                                                                               | Default 20                                                                   |

The owner confirmed Twitch client ID `znaovl2j45idub9k81om1dkatwxnu2`, version `0.4.0`, Panel Viewer Path `panel.html` (height `500`) and Mobile Path `mobile.html`; both config paths are blank. Use only `https://znaovl2j45idub9k81om1dkatwxnu2.ext-twitch.tv` for `TwitchAllowedOrigins`. The current Local Test base URI `https://destroyaindustriesminingextension.com/` is not a hosted origin or staging API. The September 27, 2024 `assets.zip` attached to version `0.4.0` must remain untouched. The signing-key value is owner-visible and must never enter this repository, chat, shell history or a parameter file.

The [September 12 read-only parameter preflight](../../docs/staging-parameter-preflight.md) recommends `us-east-2` with prefix `review01` and stack name `dime-v2-review-20260912`. It found no suitable dedicated artifact bucket or existing Secrets Manager secret ARN in that Region. The two secret ARN fields remain unresolved; the worksheet is not deployable.

The deployer/CloudFormation execution role needs permission to resolve both existing secrets, plus `kms:Decrypt` if they use customer-managed KMS keys. CloudFormation resolves the versionless Secrets Manager dynamic references into **Lambda environment configuration** when the function is created or updated. This is encrypted Lambda configuration protected by IAM, **not runtime Secrets Manager retrieval**; the Lambda execution role needs no Secrets Manager permission. A secret value change alone does not refresh Lambda configuration; a reviewed function update is needed. Rotate the Twitch signing secret without changing `PlayerIdentityKeySecretArn` or its value. Never put secret values in parameter files, outputs, logs, commands, Git, or chat. Resolved values can be exposed through function configuration, so restrict `lambda:GetFunctionConfiguration` and Lambda-console access to approved operators. Keep the signing and identity-key secrets separate. [CloudFormation's dynamic-reference guidance](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-secretsmanager.html) notes that a resolved value may appear in the target service.

The deployment identity also needs the permissions to configure HTTP API access-log delivery to the new log group; these are **deployer** permissions, not additions to the Lambda execution role. [API Gateway's HTTP API logging guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html) lists the relevant CloudWatch Logs delivery and resource-policy actions. Review that identity separately before a future stack operation.

A **new, separately approved staging-only artifact bucket** is required for packaging the Lambda ZIP before stack creation. This template does not create or reference an existing DIME/prod/legacy bucket. The artifact bucket and its cost are outside this stack's resource list; its creation/selection needs a separate reviewed action. Do not use `sam deploy --resolve-s3`, which could create an unreviewed managed bucket. The backend must remain disconnected from all frontend assets until a separate hosted-test approval.

## Exact stack resources

The source template defines:

- 1 DynamoDB `PlayerStateTable` with string `pk`/`sk`, on-demand capacity, KMS encryption, PITR, deletion protection, and Retain on deletion/replacement. `expiresAt` TTL is used only by ordinary `REQUEST#` idempotency receipts. `STATE` and reserved `MIGRATION#`/`LEGACY#` receipts have no TTL. Migration code is unreachable from this Lambda.
- 1 Node.js 22 `EbsFunction` (256 MiB, 10 seconds, reserved concurrency 5), 1 dedicated `EbsExecutionRole` with one inline policy, and 1 retained Lambda log group.
- 1 HTTP API, 1 `staging` stage, Lambda integration and route-scoped Lambda invoke permissions for the three legacy routes and five `/v4` routes, plus 1 retained API access log group. API Gateway handles exact-origin OPTIONS preflight via CORS; the Lambda's OPTIONS response remains a defensive fallback. No custom domain or production stage.
- 3 CloudWatch alarms: Lambda errors, Lambda throttles and HTTP API 5xx. They have no notification target; an operator must inspect alarm state or attach an approved staging notification path later.

Expected processed resource inventory: 1 DynamoDB table, 1 Lambda function, 1 IAM role with inline policy, 2 CloudWatch log groups, 1 API Gateway HTTP API, 1 API Gateway stage, 8 route-scoped Lambda invoke permissions, and 3 CloudWatch alarms: **18 AWS resources**. Five new permissions correspond exactly to the original state, action, preview, conversion and reset routes. The offline SAM translator produced exactly these 18 resources; the future CloudFormation-processed change set remains the authoritative deployment review. SAM embeds route integrations in the generated OpenAPI definition. The only IAM data-plane actions in the execution role are `dynamodb:GetItem`, `dynamodb:PutItem`, `logs:CreateLogStream` and `logs:PutLogEvents`, scoped to this stack's table or Lambda log streams. The log ARN's trailing `log-stream:*` is limited to dynamically named streams in this one log group; there is no wildcard action, table ARN or account-wide resource. Conditional `TransactWriteItems` with Put members uses `dynamodb:PutItem`; no Scan, Query, Delete, table wildcard or administrative action is granted. The API invokes only this function. [DynamoDB transactional IAM guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html) confirms that a transaction containing Put members uses `dynamodb:PutItem`.

SAM-generated Lambda permissions use the staging API ID plus the three legacy routes and five exact `/v4` routes, but wildcard the **stage within that API**. No other API can invoke the function through those statements. The only stage defined here is `staging`; inspect the generated SourceArns again before any future change set. API CORS is defined in the inline OpenAPI body because SAM's `CorsConfiguration` drops the other CORS fields when `AllowOrigins` is a parameter reference in the locally tested translator version. The transformed definition retains exact parameterized origins, allowed methods and headers, and `allowCredentials: false`.

The Lambda execution-role trust uses only `Allow`, `lambda.amazonaws.com` and `sts:AssumeRole`, matching [AWS's Lambda execution-role example](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html). Do not put `aws:SourceArn` or `aws:SourceAccount` on this trust relationship without explicit Lambda-specific support: the future function ARN may not be in the context when Lambda assumes the role and could block invocation. [IAM's confused-deputy guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html) places these controls on applicable service/resource policies and says to check service-specific support. Review the SAM-generated Lambda **resource-based invoke permissions** separately for API Gateway source scoping; do not blindly transfer those conditions to the execution-role trust.

Outputs are the staging API URL, table name, function ARN and two log-group names. No secret, token, player ID or player state is output.

Original-content conversion is server-gated by `ContentConversionMode`, whose default is `DISABLED` and whose only values are `DISABLED`, `TESTERS` and `ENABLED`. `TESTERS` accepts at most 20 unique keyed 64-character eligibility tags computed for separately approved synthetic/staging testers using the domain-separated message `dime:v4:conversion-tester:<derived-player-key>` inside the existing identity-key boundary. The environment string is limited to 2,048 characters; empty entries are removed and an empty list permits nobody. Never put opaque Twitch IDs or derived player keys in the parameter or logs. `NoEcho` reduces incidental display in CloudFormation interfaces but is not a substitute for secret storage and does not protect every downstream interface. No mode adds IAM permissions or scans player data. Treat any non-default mode and tag-provisioning procedure as a separately reviewed configuration update.

## Repeatable local template checks

With SAM CLI, cfn-lint and Guard installed, run these from the repository root after the Node 22 Lambda bundle is built:

```sh
sam validate --lint --template-file infra/staging/template.yaml
cfn-lint infra/staging/template.yaml
sam build --template-file infra/staging/template.yaml
cfn-guard validate --data .aws-sam/build/template.yaml --rules infra/staging/staging.guard --show-summary all
```

`sam build` copies the bundle and expands short-form intrinsics, but its template is **still SAM**, not the final CloudFormation transform. For an optional offline view of generated resources, install `aws-sam-translator` and PyYAML in an isolated Python environment, then run:

```sh
python infra/staging/translate_offline.py .aws-sam/build/template.yaml /tmp/dime-staging-translated.json
cfn-guard validate --data /tmp/dime-staging-translated.json --rules infra/staging/processed.guard --show-summary all
```

The script substitutes an inert S3 URI **in memory only** because the translator requires a packaged-style CodeUri; it never packages, uploads, creates a bucket or contacts AWS. The local transform is a review aid and cannot replace inspection of a future CloudFormation-processed template. Neither the translated JSON nor `.aws-sam/build` should be committed.

## Pre-deployment review checklist

- [ ] Obtain explicit separate approval for the new staging stack and a new staging-only artifact bucket. Confirm account, Region, stack name and resource-prefix ownership. Compare all generated names with existing resources; no import/replacement/legacy ARN is acceptable.
- [ ] Confirm the Twitch client ID, exact extension asset origin(s), current hosted-test version, supported view paths, test broadcasters/viewers, EBS fetch-domain allowlist and signing-secret reference from the Twitch console. Do not paste secret values.
- [ ] Confirm both SecretString ARNs are existing, distinct, same-account/same-Region, approved for this use, and the identity HMAC key will remain stable. Verify deployment-role secret/KMS permissions without reading values.
- [ ] Confirm `dist/server/index.mjs` is built from the reviewed commit with Node 22; inspect its hash and confirm the build-time guard excluded migration modules, frontend local mode, secret literal, or legacy table name.
- [ ] Confirm prefix, origins, log retention, rate/burst and region parameter values. Review IAM trust/resource ARNs, Retain/deletion-protection consequences, Lambda resource policy and API CORS in the processed template.
- [ ] Set an account-level staging budget/alert if desired; none is created by this template. Review the price estimate below for the selected Region and expected traffic.

## Package and review a change set — instructions only, not executed

From the repository root, after separate approval and creation of a **staging-only** artifact bucket, set `STAGING_ARTIFACT_BUCKET`, `STAGING_REGION`, `STAGING_STACK_NAME`, `REVIEW_NAME` and `PARAMETERS_JSON` in the operator shell. The JSON parameter file must contain only non-secret identifiers/ARNs and must stay outside Git:

```sh
nvm use 22
npm ci
npm run check
npm run test:e2e
sam validate --lint --template-file infra/staging/template.yaml
sam build --template-file infra/staging/template.yaml
COMMIT_SHA=$(git rev-parse --short HEAD)
sam package --template-file .aws-sam/build/template.yaml --s3-bucket "$STAGING_ARTIFACT_BUCKET" --s3-prefix "dime-v2/$COMMIT_SHA" --output-template-file /tmp/dime-staging-packaged.yaml
aws cloudformation validate-template --template-body file:///tmp/dime-staging-packaged.yaml --region "$STAGING_REGION"
```

`sam package` uploads the Lambda artifact; **do not run it during source review**. Pass parameter values through a secure, operator-controlled parameter file that contains only identifiers/ARNs, never secret values. Create a _CREATE_ change set (not an execution) after approval:

```sh
aws cloudformation create-change-set --region "$STAGING_REGION" --stack-name "$STAGING_STACK_NAME" --change-set-name "$REVIEW_NAME" --change-set-type CREATE --template-body file:///tmp/dime-staging-packaged.yaml --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --parameters "file://$PARAMETERS_JSON"
aws cloudformation describe-change-set --region "$STAGING_REGION" --stack-name "$STAGING_STACK_NAME" --change-set-name "$REVIEW_NAME"
aws cloudformation get-template --region "$STAGING_REGION" --stack-name "$STAGING_STACK_NAME" --change-set-name "$REVIEW_NAME" --template-stage Processed
```

Review **every** Add/Modify/Remove, generated API/Lambda permission, role statement, dynamic reference, package bucket/key and output against the resource list. A change set can create backend processing resources and may incur charges; do not execute it without a separate approval. No change set or stack was created for this source task.

## Package the Twitch frontend offline — no publication

From a clean Node 22 checkout, set only non-secret build inputs and build the static hosted-test package. Use the exact HTTPS API URL from an **approved future staging stack** for a publishable artifact. The example below uses a non-routable placeholder for packaging review only; do not present that archive as ready to upload. `VITE_DIME_MODE` must be `twitch`, never `local`.

```sh
nvm use 22
npm ci
VITE_DIME_MODE=twitch VITE_DIME_API_URL='https://example.invalid/staging' npm run build
COMMIT_SHA=$(git rev-parse --short HEAD)
cd dist/frontend
zip -r /tmp/dime-v2-twitch-frontend-$COMMIT_SHA.zip .
sha256sum /tmp/dime-v2-twitch-frontend-$COMMIT_SHA.zip
```

Inspect the archive manifest and built JavaScript for accidental local-mode URLs, secret values and unintended assets. This produces only a local ignored/temporary artifact. It does **not** upload to Twitch, S3, CloudFront or Amplify. The Twitch console must separately confirm asset paths and the staging API fetch allowlist before any approved hosted-test publication.

## Post-deployment verification checklist — future approved staging only

- [ ] Verify table key schema, PAY_PER_REQUEST, SSE, PITR, deletion protection, TTL attribute and Retain policies. Check only new staging ARNs are referenced.
- [ ] Verify Lambda runtime, bundle hash, reserved concurrency, memory/timeout, JSON logging, exact table/secret-reference configuration, and no migration import. Do not print resolved environment values.
- [ ] Verify API GET/POST routes, exact-origin OPTIONS preflight, denied-origin behavior, throttling, access-log fields, and no custom domain/production stage.
- [ ] Use synthetic authenticated viewers on two test channels: confirm the same verified `U` player keeps one global save and revision; different players remain isolated; anonymous and forged identities fail. Confirm this in a real Twitch hosted-test frame before release.
- [ ] Exercise ordinary idempotency, stale revision, concurrent actions, retry after a lost response, TTL of ordinary receipts and permanence of state. Do not test migration against production or legacy records.
- [ ] Check alarms, sanitized logs, spend and rollback readiness. No existing player should be routed here.

## Rollback and removal — future separate approval

First disconnect the hosted-test frontend and stop synthetic traffic. Disable or roll back the staging Lambda/API artifact through a reviewed change set; preserve the table and migration/state receipts. A stack deletion retains the protected table and both log groups; deletion protection blocks table removal until separately disabled, and Retain leaves them billable. Record their ARNs and PITR status. Any eventual data deletion, deletion-protection disablement, log-group removal or artifact-bucket removal is a separate explicitly reviewed action. Never copy staging state into production or overwrite legacy saves. The current source-only change requires no AWS rollback.

## Illustrative monthly cost

At **10,000 HTTP requests**, 10,000 Lambda invocations averaging 100 ms at 256 MiB, roughly 10,000 strongly consistent reads, 10,000 transactional item writes, 1 GiB of stored table data, 1 GiB PITR protected data and under 0.1 GiB logs, expect a **low-single-digit USD monthly staging bill** (roughly $1–$5 before free-tier effects, Region-dependent). The three standard alarms form a small recurring floor; API requests, Lambda requests/GB-seconds, DynamoDB request units/storage/PITR, CloudWatch ingestion/storage and data transfer scale with use. Transactional writes and item size can raise DynamoDB units. A separate staging artifact bucket and any customer-managed KMS key have additional charges. Recalculate in AWS Pricing Calculator for the selected Region and current rates before approving execution: [DynamoDB](https://aws.amazon.com/dynamodb/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [HTTP API](https://aws.amazon.com/api-gateway/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/).
