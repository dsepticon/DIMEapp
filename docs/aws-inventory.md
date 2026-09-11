# DIME AWS inventory and recovery plan

Snapshot: September 11, 2026. Account: 861738068626. Repository: /mnt/c/projects/DIMEapp.

## Decision

The custom-domain frontend is a separate S3/CloudFront deployment containing October 2024 build artifacts. The original main checkout was the November 2023 Next.js/Amplify starter matching Amplify's last successful production commit. The requested branch contained an incomplete rebuild. Neither represented the complete custom-domain application. Recovery and local reconstruction are now documented in [reconciliation.md](reconciliation.md).

No AWS resources were modified, deployed, deleted, uploaded, invoked, or reconfigured. No builds were started and no Git pushes occurred. No application endpoints were visited. Sanitized recovery references, this report, and safe source repairs were written in the isolated working-branch checkout. The original dirty main worktree remains untouched.

CLI 2.36.43 satisfies the requested >=2.32.0 requirement. STS verified arn:aws:iam::861738068626:root. No aws login was run for this task. Some metadata calls experienced credential-refresh failures; a subsequent STS check succeeded and sequential retries completed the detail inventory.

## Scope and evidence

Core discovery covered all 17 enabled commercial regions: ap-northeast-1, ap-northeast-2, ap-northeast-3, ap-south-1, ap-southeast-1, ap-southeast-2, ca-central-1, eu-central-1, eu-north-1, eu-west-1, eu-west-2, eu-west-3, sa-east-1, us-east-1, us-east-2, us-west-1, us-west-2. Regions not opted into were excluded.

Per-region discovery covered Lambda, DynamoDB, REST/HTTP/WebSocket API Gateway, Cognito user/identity pools, Amplify, active CloudFormation stacks, log groups, AppSync, and tagging metadata. Global discovery covered S3 buckets, CloudFront, Route 53 zones, and IAM roles. Supporting discovery covered CodeBuild, CodePipeline, Step Functions, default-bus EventBridge rules, SQS, SNS, ECR, and ACM in these regions. This is not an exhaustive audit of every AWS service, custom event bus, or deleted resource.

Account-wide totals: 5 buckets, 18 Lambda functions, 3 DynamoDB tables, 3 REST APIs, 1 HTTP API, 2 CloudFront distributions, 3 Amplify apps, 8 active CloudFormation stacks, 2 user pools, 2 identity pools, 1 AppSync API, 40 log groups, and 2 Route 53 hosted zones. Some belong to unrelated or historical projects.

Temporary evidence files are under /tmp/dime-aws-inventory, excluded from Git. The sanitized conclusions and resource appendix below are the durable report:
- discovery.json: core discovery, including explicit empty results and per-call errors.
- details.json: configuration, schemas, stack membership, branches, and supporting services.
- final-checks.json: API integrations, build commit/status metadata, application tags, WAF metadata, index.html metadata.
- cloudfront-config.json: domain, origin, certificate, WAF, cache, and logging references.
- static-files.json: 489 static object metadata entries; no object contents.

Only environment-variable names and tag keys were retained, not arbitrary values. No DynamoDB items, Cognito users, logs, SSM parameter values, Secrets Manager values, client secrets, were requested. Known application deployment packages and public source maps were downloaded later for source recovery without executing them. Exception: CloudFormation returned an AppSync API-key identifier within a resource physical ID. That entry was redacted in the saved inventory; it was not used. Future stack exports must exclude sensitive resource physical IDs before printing.

## Regions and related deployments

| Region/scope | Evidence and classification |
|---|---|
| us-west-2 | Confirmed custom-domain S3 frontend; DimeLambda; DIMEapi; dimehttpapi; historical CodeBuild log group. |
| ca-central-1 | DIMEtable, TwitchUsers, StoreTwitchUserData, TwitchAPI. Names and shared role establish DIME association; recovered StoreTwitchUserData targets TwitchUsers; no authoritative mining persistence was found. Also contains CDK experiments and unrelated scminingmom.com resources. |
| us-east-2 | Confirmed repository-linked Amplify DIMEapp, main backend stack family, Todo/AppSync/Cognito, deployment-helper Lambdas, ECR and S3 bootstrap assets. |
| us-west-1 | Historical DIME Amplify app with no branches or backend environments and an old DIME log group. No current serving deployment established. |
| us-east-1 / global | Active CloudFront certificate and WAF in us-east-1; global CloudFront, Route 53, IAM. A disabled distribution references an old us-east-1 API absent from current discovery. |

No DIME-associated resources were identified in the other scanned regions. Presence does not prove current traffic or successful runtime operation.

## Custom-domain frontend and DNS

Confirmed configuration chain:

destroyaindustriesminingextension.com
→ Route 53 zone Z01136963D0LCP4OBJB4K, apex A alias
→ d153tn5zose6mc.cloudfront.net / EC269D02M2JLD
→ destroyaindustriesminingextension.com.s3-website-us-west-2.amazonaws.com
→ S3 bucket destroyaindustriesminingextension.com, index.html.

CloudFront is enabled and Deployed, redirects viewers to HTTPS, uses an HTTP-only S3 website origin, permits GET/HEAD in its default behavior, and uses cache policy 2e54312d-136d-493c-8eb9-b001f22f67d2. Its default root object is empty; the S3 website index is index.html. Legacy distribution logging is disabled. There are no additional cache behaviors, edge function/Lambda associations, or response-headers policy. No CSP is supplied through a CloudFront response-headers policy.

The attached ACM certificate is 6e9edb04-019c-4541-b0ae-aff483a2db73 in us-east-1, status ISSUED. TLS minimum is TLSv1.2_2021. Attached WAF ACL: CreatedByCloudFront-507f6793-f541-4211-a1ea-2105c3a73690, ID 5209e705-d0b7-4259-8052-6254d1840fb7. Five rule names identify rate-based protection and AWS managed reputation/common/bad-input/SQLi rules. No sampled requests were read.

The zone also contains NS/SOA, an ACM validation CNAME, and www CNAME pointing to s3-website-us-west-2.amazonaws.com. The www record differs from the apex route and is not a CloudFront alias on this distribution. Runtime behavior was not tested.

Disabled distribution E1LE8I9E568R8T / d2ubj26lpyybk7.cloudfront.net points to 35fgk2vvmd.execute-api.us-east-1.amazonaws.com. That API was not found. Treat it as a historical reference, not a confirmed active dependency.

Website bucket: no versioning status returned, no tags, no configured S3 notifications. index.html is 748 bytes, LastModified 2024-10-01T03:28:02Z. The static/ prefix contains 489 objects, including 180 .map files and many retained build generations. Do not equate all retained builds with active content.

Other buckets:
- cdk-hnb659fds-assets-861738068626-us-east-2: versioned Amplify/CDK bootstrap asset store.
- cdk-hnb659fds-assets-861738068626-ca-central-1: versioned CDK bootstrap asset store.
- cdkteststack-apisource2285aaed-opprugwcoapc: versioned CdkTestStack bucket.
- cdkteststack-apisource2285aaed-ttlysxuw5gvk: versioned related historical CDK bucket; not in the current CdkTestStack resource list.

The four infrastructure buckets have CloudFormation stack-id/stack-name/logical-id tag keys and no website configuration. No contents were downloaded.

## Backend APIs, Lambda, and DynamoDB

| API | Region and stage | Configured routes and integration |
|---|---|---|
| TwitchAPI / jnzxpr9dtf | ca-central-1, dev | POST / → StoreTwitchUserData (AWS_PROXY); OPTIONS / is MOCK. /user exists without methods. |
| DIMEapi / v0m4wz0s2a | us-west-2, Dev | GET / → DimeLambda (AWS); ANY /DimeLambda → DimeLambda (AWS_PROXY). |
| dimehttpapi / 2nf6qgkim2 | us-west-2, DimeStageHttp | GET /DimeLambda → DimeLambda (AWS_PROXY, payload 2.0); auto-deploy enabled. |
| cdktestendpoint / qvqutanlkf | ca-central-1, prod | ANY / and /{proxy+} → CdkTestStack hit-counter Lambda; experimental association. |

Inspected API methods/routes specify authorization NONE; REST methods do not require API keys. This describes gateway configuration only, not checks implemented in application code. REST method metadata represents current configuration; the exact deployed stage snapshot was not exported, so a stage may differ from undeployed method changes. No requests were made to any API.

| Function | Region | Runtime/handler | Package and last modification |
|---|---|---|---|
| StoreTwitchUserData | ca-central-1 | nodejs20.x, index.handler; 128 MB, 10 s | ZIP, 495 bytes, 2024-05-07T17:46:36Z |
| DimeLambda | us-west-2 | nodejs20.x, index.html; 128 MB, 3 s | ZIP, 916 bytes, 2024-01-04T01:12:37Z |

Both functions report Active / Successful, no environment variables, no aliases, no event-source mappings, and only $LATEST. Both reference arn:aws:iam::861738068626:role/DimeLambda. GetRole and policy-list calls returned NoSuchEntity: the role is missing. Function state alone therefore does not establish health. Recovered ZIPs confirm incompatible handler/file settings: StoreTwitchUserData contains twitch.js; DimeLambda contains index.mjs. Both use x86_64 and have no layers.

DimeLambda has a function URL with auth NONE, recorded in details.json. StoreTwitchUserData has no function URL. Application Lambda and table tag lists are empty.

| Table | Region | Partition key | Other metadata |
|---|---|---|---|
| DIMEtable | ca-central-1 | twitchUser (S) | Active; created 2024-02-27; no listed indexes/replicas/stream; deletion protection false. |
| TwitchUsers | ca-central-1 | userId (S) | Active; created 2024-05-07; no listed indexes/replicas/stream; deletion protection false. |
| Todo-savkasz3hnb3poaa62qn3bam2i-NONE | us-east-2 | id (S) | PAY_PER_REQUEST; NEW_AND_OLD_IMAGES stream; no listed indexes/replicas; deletion protection false. |

No customer records were read. Recovered StoreTwitchUserData explicitly writes TwitchUsers using browser-supplied identity. No recovered authoritative game-state writer targets DIMEtable; its schema beyond the key is unknown. AppSync's TodoTable data source explicitly targets the third table.

DIMEtable uses provisioned 5 read/5 write capacity; TwitchUsers uses 1/1. TTL is disabled on all three tables. DIMEtable and TwitchUsers returned null SSEDescription, which does not mean unencrypted. Todo reports KMS encryption enabled. HTTP API 2nf6qgkim2 returned no CORS configuration. TwitchAPI has an OPTIONS mock, but effective deployed-stage CORS was not tested.

## Amplify, Cognito, and infrastructure

DIMEapp (d90ik3712sg8e), us-east-2:
- Repository https://github.com/dsepticon/DIMEapp; WEB_COMPUTE; default domain d90ik3712sg8e.amplifyapp.com.
- main is PRODUCTION, automatic builds enabled, linked to amplify-d90ik3712sg8e-main-branch-72c6b188db.
- main job 2 SUCCEED on 2023-11-23 at commit 99cf684385284a1e6c4a0e8facb1b92dcf32f535, matching the original main HEAD.
- codex/react-extension-rebuild is DEVELOPMENT with automatic builds enabled. Jobs 1 and 2 FAILED on September 11, 2026 UTC (September 10 locally). Job 2 references commit 98c8c75f740d75783a12cf9bbbf121cc47089ac5. No successful new deployment established.
- Automatic branch creation is enabled, and an inline build specification exists. A branch push may therefore trigger AWS build/deployment actions.
- App environment name: _CUSTOM_IMAGE. Both branches have no environment names returned. No custom domains or legacy backend environments listed.
- Configured service role: AmplifySSRLoggingRole-eb2166c2-40b2-403a-8adf-b35151826c17, absent from current IAM role discovery.

Five related stacks exist: main root, auth, data, Todo nested stack, table-manager nested stack. CDKToolkit in us-east-2 is supporting infrastructure. Exact full names and resource memberships are in the evidence and appendix. Stack statuses are CREATE_COMPLETE or UPDATE_COMPLETE; no drift-detection action was started. The data stack still lists a code-generation bucket absent from current S3 discovery; CdkTestStack similarly lists a hit-counter table absent from current DynamoDB discovery. Stack status is not proof every physical resource still exists.

AppSync amplifyData / savkasz3hnb3poaa62qn3bam2i uses API_KEY as its primary authorization type. Its TodoTable data source references the Todo table and role TodoIAMRolecfd440-savkasz3hnb3poaa62qn3bam2i-NONE. Generated Todo resolvers/functions and schema resource exist in stack metadata. No GraphQL operation or API-key lookup was performed.

Cognito user pool us-east-2_ohynNiBaX: email username and auto-verification, MFA OFF, no Lambda triggers or hosted domain returned. Client ID 6tv5ba7qdc6ta07asqqek0tkcd. Identity pool us-east-2:965ffa01-f6c3-44df-815a-108e02ece41d references authenticated/unauthenticated Amplify roles listed in details.json, also absent from IAM role discovery. No client secret or user list was requested.

Ten us-east-2 Lambdas are Amplify/CDK helper functions, not demonstrated application business logic. They include branch-linker, table-manager, log-retention, and bucket-deployment functions. Their runtime, handler, hash, role, environment names, and layer metadata are in discovery.json. A table-manager Step Functions state machine and ECR bootstrap repository also exist.

DIME (d38w6naii6rt6l), us-west-1: WEB, no repository, branches, backend environments, or custom domain associations. Environment names _CUSTOM_IMAGE and _LIVE_PACKAGE_UPDATES. Treat as a historical shell pending owner confirmation.

scminingmom.com Amplify app d1i93r2gr9ofga, its GitLab repository, ca-central-1 Cognito manager pools, four amplify-login functions, and its Route 53 zone appear to be a separate project. They were listed for account completeness, not classified as DIME production.

## Roles, logging, tags, and gaps

IAM list-roles returned only four AWS service-linked roles (Organizations, ResourceExplorer, Support, TrustedAdvisor). Multiple stacks and service configurations still reference absent application/deployment roles. DimeLambda absence was explicitly confirmed; other absent-role references require reconciliation before any future deployment.

Forty log groups were inventoried by name, retention, ARN, and stored byte count, without reading events. Relevant groups include /aws/lambda/DimeLambda, /aws/codebuild/dime, /aws/amplify/d90ik3712sg8e and its helper Lambda groups. StoreTwitchUserData is configured to log to /aws/lambda/StoreTwitchUserData, but that group was not returned by discovery. Historical amplify-dime dev/staging groups remain in ca-central-1 and us-west-1. The appendix lists every discovered group.

No CodeBuild projects or CodePipeline pipelines were returned in enabled regions, despite /aws/codebuild/dime existing. No queues/topics/default-bus rules were returned by the supporting checks. Custom EventBridge buses, API custom domains/authorizers, bucket policies, complete WAF statements, and every ancillary service were not exhaustively inspected.

Tag keys were inventoried; arbitrary values were intentionally withheld. Full environment values and raw build specifications/templates were not fetched for the report because they can embed secrets. Consequently, exact command-level live build configuration and complete environment parity remain release review items. Application Lambda environment-name lists are empty. Helper names identify downstream function/table references, framework callbacks/waiters, certificate configuration and connection reuse; they are deployment support, not recovered Twitch secrets.

Secrets Manager returned no secret names in the five associated regions. Parameter Store names only: /cdk-bootstrap/hnb659fds/version in ca-central-1 and us-east-2; /amplify/d38w6naii6rt6l/dev/AMPLIFY_function_dimeaa999a74_deploymentBucketName and /amplify/d38w6naii6rt6l/dev/AMPLIFY_function_dimeaa999a74_s3Key in us-west-1. No values were read.

Recent Lambda Errors metric inspection covered September 10 17:29 UTC through September 11 17:29 UTC for both application functions. Neither returned datapoints; this is not evidence of successful execution. Raw application errors remain unreviewed because recovered code logs full events that can include tokens or user data. Use sanitized metrics/error logging after an approved staging deployment.

## Reconciliation and recovery outcome

The original main was 99cf684; the requested branch began at 98c8c75. Its incomplete React prototype and the original Amplify starter both differed from the active S3 app. The recovered app uses browser localStorage for game state and does not establish a working authoritative game backend. Twitch authentication was incorrectly directed at Helix with an extension JWT. See [reconciliation.md](reconciliation.md) for concrete defects and compatibility differences.

The inventory and ordered recovery plan were produced before source edits. Subsequent recovery read the active static index, its two main maps, and the two application Lambda packages. Seventeen authored frontend files and two Lambda source files were recovered as sanitized text references, with original and archive hashes in [recovery-provenance.json](recovery-provenance.json). ZIP hashes matched Lambda CodeSha256. Temporary download URLs were not displayed or retained in Git. No recovered code was executed.

Source maps with sourcesContent supplied authored code; minified bundles remain build artifacts. References: [Chrome source maps](https://developer.chrome.com/docs/devtools/javascript/source-maps), [AWS GetFunction](https://docs.aws.amazon.com/cli/latest/reference/lambda/get-function.html).

Generated Amplify/CloudFormation helper code was not substituted for missing game source. Raw templates/build specifications were not exported because they can embed secret literals, and they concern the starter rather than the custom game. Resource membership and drift references were inspected through metadata. Original Git history, original lockfiles/build toolchain, unpublished source, overwritten unversioned objects and original production account-state semantics cannot be recovered from this evidence alone. Historical bundles are not assumed to represent the active app.

The safe target is a static React/Twitch frontend, separate JWT-validating Lambda EBS, HTTP API and isolated transactional DynamoDB v2 table. No existing resources are imported, replaced or deployed. See [architecture.md](architecture.md), [infrastructure plan](../infra/README.md), and [deployment/rollback plan](deployment.md). Before release, reconcile actual Twitch hosted configuration, legacy-save policy, missing roles and stale stack references. Automatic Amplify builds must be addressed with explicit approval before publishing the branch.

## Exact resource appendix

### lambda

| Region | Resource | Details |
|---|---|---|
| ca-central-1 | amplify-login-create-auth-challenge-42c7f34d | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-login-lambda-42c7f34d; environment names= |
| ca-central-1 | amplify-login-custom-message-42c7f34d | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-login-lambda-42c7f34d; environment names= |
| ca-central-1 | CdkTestStack-fnHitCounterHitCounterHandler98588EFE-uCa1Ma5GQKFZ | handler=hitcounter.handler; role=arn:aws:iam::861738068626:role/CdkTestStack-fnHitCounterHitCounterHandlerServiceRo-1YypTYqgsuCq; environment names=DOWNSTREAM_FUNCTION_NAME, HITS_TABLE_NAME |
| ca-central-1 | StoreTwitchUserData | handler=index.handler; role=arn:aws:iam::861738068626:role/DimeLambda; environment names= |
| ca-central-1 | amplify-login-verify-auth-challenge-42c7f34d | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-login-lambda-42c7f34d; environment names= |
| ca-central-1 | amplify-login-define-auth-challenge-42c7f34d | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-login-lambda-42c7f34d; environment names= |
| ca-central-1 | CdkTestStack-cdktest48E5DE28-CrRfbMbevShM | handler=cdktest.handler; role=arn:aws:iam::861738068626:role/CdkTestStack-cdktestServiceRoleD4E15BE2-uxZmzcHtzpJ4; environment names= |
| us-east-2 | amplify-d90ik3712sg8e-mai-AmplifyBranchLinkerCusto-517JHEjGpzgv | handler=framework.onEvent; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-AmplifyBranchLinkerCustom-VGrfmW6XYTNu; environment names=USER_ON_EVENT_FUNCTION_ARN |
| us-east-2 | amplify-d90ik3712sg8e-mai-LogRetentionaae0aa3c5b4d-BbvRbOunbpTe | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-LogRetentionaae0aa3c5b4d4-RphPvirT73ud; environment names= |
| us-east-2 | amplify-d90ik3712sg8e-mai-TableManagerCustomProvid-J7vta2HCV2B0 | handler=framework.isComplete; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-TableManagerCustomProvide-b8W86f7YNMCA; environment names=USER_ON_EVENT_FUNCTION_ARN, USER_IS_COMPLETE_FUNCTION_ARN |
| us-east-2 | amplify-d90ik3712sg8e-mai-AmplifyBranchLinkerCusto-PMoNTXOoBnd4 | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-AmplifyBranchLinkerCustom-ckcOgutDXTKy; environment names=AWS_NODEJS_CONNECTION_REUSE_ENABLED |
| us-east-2 | amplify-d90ik3712sg8e-mai-CustomS3AutoDeleteObject-Kbd1nzhMsQex | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-CustomS3AutoDeleteObjects-3iUgbVsIM3Gn; environment names= |
| us-east-2 | amplify-d90ik3712sg8e-mai-TableManagerOnEventHandl-v3Y8oVNq8W3i | handler=amplify-table-manager-handler.onEvent; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-TableManagerOnEventHandle-OBvDQSBxmuk6; environment names= |
| us-east-2 | amplify-d90ik3712sg8e-mai-CustomCDKBucketDeploymen-du2GdQouzjRl | handler=index.handler; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-CustomCDKBucketDeployment-nEWRW228lmkt; environment names=AWS_CA_BUNDLE |
| us-east-2 | amplify-d90ik3712sg8e-mai-TableManagerIsCompleteHa-8i0g9ViYTqsK | handler=amplify-table-manager-handler.isComplete; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-TableManagerIsCompleteHan-zsbMLYsIyIo6; environment names= |
| us-east-2 | amplify-d90ik3712sg8e-mai-TableManagerCustomProvid-t1nWdu7udKvX | handler=framework.onTimeout; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-TableManagerCustomProvide-Yx5xwomxkUzk; environment names=USER_ON_EVENT_FUNCTION_ARN, USER_IS_COMPLETE_FUNCTION_ARN |
| us-east-2 | amplify-d90ik3712sg8e-mai-TableManagerCustomProvid-VXmtEqnK6uet | handler=framework.onEvent; role=arn:aws:iam::861738068626:role/amplify-d90ik3712sg8e-mai-TableManagerCustomProvide-su1fssqIVU1j; environment names=USER_ON_EVENT_FUNCTION_ARN, WAITER_STATE_MACHINE_ARN, USER_IS_COMPLETE_FUNCTION_ARN |
| us-west-2 | DimeLambda | handler=index.html; role=arn:aws:iam::861738068626:role/DimeLambda; environment names= |

### cloudformation

| Region | Resource | Details |
|---|---|---|
| ca-central-1 | CdkTestStack | UPDATE_COMPLETE |
| ca-central-1 | CDKToolkit | CREATE_COMPLETE |
| us-east-2 | amplify-d90ik3712sg8e-main-branch-72c6b188d-amplifyDataTodoNestedStackTodoNestedStackR-1RZC9WVO3L791 | CREATE_COMPLETE |
| us-east-2 | amplify-d90ik3712sg8e-main-branch-72c6b188d-amplifyDataAmplifyTableManagerNestedStackA-1762NE2RZ45ON | CREATE_COMPLETE |
| us-east-2 | amplify-d90ik3712sg8e-main-branch-72c6b188db-data7552DF31-2TMUS6H943SS | UPDATE_COMPLETE |
| us-east-2 | amplify-d90ik3712sg8e-main-branch-72c6b188db-auth179371D7-W3WVTBPK15RZ | CREATE_COMPLETE |
| us-east-2 | amplify-d90ik3712sg8e-main-branch-72c6b188db | UPDATE_COMPLETE |
| us-east-2 | CDKToolkit | CREATE_COMPLETE |

### logs

| Region | Resource | Details |
|---|---|---|
| ca-central-1 | /aws/amplify/d18xrls060f40w | retention days=None; stored bytes=2230 |
| ca-central-1 | /aws/amplify/d3tajqzwl9a3uq | retention days=None; stored bytes=2316 |
| ca-central-1 | /aws/lambda/CdkTestStack-cdktest48E5DE28-CrRfbMbevShM | retention days=None; stored bytes=4460 |
| ca-central-1 | /aws/lambda/CdkTestStack-fnHitCounterHitCounterHandler98588EFE-uCa1Ma5GQKFZ | retention days=None; stored bytes=23467 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-AmplifyBranchLinkerCusto-M3oOgKYRikhN | retention days=None; stored bytes=5214 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-AmplifyBranchLinkerCusto-zp2EOYAyneRv | retention days=None; stored bytes=1776 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-CustomCDKBucketDeploymen-Lw95Z0573NYB | retention days=None; stored bytes=3934 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-CustomS3AutoDeleteObject-wYDu0yJRs6aY | retention days=None; stored bytes=2080 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-LogRetentionaae0aa3c5b4d-Y7fKazj8BUfC | retention days=1; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-TableManagerCustomProvid-8sj2f68Q0KlY | retention days=30; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-TableManagerCustomProvid-ZF6P4iKnyOPN | retention days=30; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-TableManagerCustomProvid-cgz2KcHHYQaK | retention days=30; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-TableManagerIsCompleteHa-5VyM5ID3HBgs | retention days=None; stored bytes=3619 |
| ca-central-1 | /aws/lambda/amplify-d18xrls060f40w-ma-TableManagerOnEventHandl-3i7Hgo3r676u | retention days=None; stored bytes=3051 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-AmplifyBranchLinkerCusto-QYFz0oLqwNYs | retention days=None; stored bytes=1947 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-AmplifyBranchLinkerCusto-xwJlyqv8hSsv | retention days=None; stored bytes=5624 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-CustomCDKBucketDeploymen-z6HUAJJghhLg | retention days=None; stored bytes=3509 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-CustomS3AutoDeleteObject-DjpF5UMsxoyI | retention days=None; stored bytes=2188 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-LogRetentionaae0aa3c5b4d-s9W21L8HTbFD | retention days=1; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-TableManagerCustomProvid-0TM1TyMQ2I0A | retention days=30; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-TableManagerCustomProvid-7c0R58SMukjt | retention days=30; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-TableManagerCustomProvid-B1yoaE2RYsQC | retention days=30; stored bytes=0 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-TableManagerIsCompleteHa-gV49aUQwHVBQ | retention days=None; stored bytes=3627 |
| ca-central-1 | /aws/lambda/amplify-d3tajqzwl9a3uq-ma-TableManagerOnEventHandl-WbcZ8r7dvlvY | retention days=None; stored bytes=2715 |
| ca-central-1 | /aws/lambda/amplify-dime-dev-170511-UpdateRolesWithIDPFunction-CnnCQx4fW2wP | retention days=None; stored bytes=1808 |
| ca-central-1 | /aws/lambda/amplify-dime-staging-3575-UpdateRolesWithIDPFuncti-TokS23tr2rc9 | retention days=None; stored bytes=1816 |
| us-east-2 | /aws/amplify/d90ik3712sg8e | retention days=None; stored bytes=1659 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-AmplifyBranchLinkerCusto-517JHEjGpzgv | retention days=None; stored bytes=2600 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-AmplifyBranchLinkerCusto-PMoNTXOoBnd4 | retention days=None; stored bytes=1263 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-CustomCDKBucketDeploymen-du2GdQouzjRl | retention days=None; stored bytes=2011 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-CustomS3AutoDeleteObject-Kbd1nzhMsQex | retention days=None; stored bytes=1099 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-LogRetentionaae0aa3c5b4d-BbvRbOunbpTe | retention days=1; stored bytes=0 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-TableManagerCustomProvid-J7vta2HCV2B0 | retention days=30; stored bytes=0 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-TableManagerCustomProvid-VXmtEqnK6uet | retention days=30; stored bytes=0 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-TableManagerCustomProvid-t1nWdu7udKvX | retention days=30; stored bytes=0 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-TableManagerIsCompleteHa-8i0g9ViYTqsK | retention days=None; stored bytes=2439 |
| us-east-2 | /aws/lambda/amplify-d90ik3712sg8e-mai-TableManagerOnEventHandl-v3Y8oVNq8W3i | retention days=None; stored bytes=1523 |
| us-west-1 | /aws/lambda/amplify-dime-dev-211830-UpdateRolesWithIDPFunction-8qqhkG5F9mUJ | retention days=None; stored bytes=1807 |
| us-west-2 | /aws/codebuild/dime | retention days=None; stored bytes=6988 |
| us-west-2 | /aws/lambda/DimeLambda | retention days=None; stored bytes=101749 |

### amplify

| Region | Resource | Details |
|---|---|---|
| ca-central-1 | scminingmom.com | d1i93r2gr9ofga |
| us-east-2 | DIMEapp | d90ik3712sg8e |
| us-west-1 | DIME | d38w6naii6rt6l |

### cognito-idp

| Region | Resource | Details |
|---|---|---|
| ca-central-1 | amplify_backend_manager_d1i93r2gr9ofga | ca-central-1_8OkaU9DlJ |
| us-east-2 | amplifyAuthUserPool4BA7F805-SuJTc19VUfqW | us-east-2_ohynNiBaX |

### cognito-identity

| Region | Resource | Details |
|---|---|---|
| ca-central-1 | amplify_backend_manager_d1i93r2gr9ofga | ca-central-1:9f2860bb-e748-48ff-a7fd-a608bbebaddc |
| us-east-2 | amplifyAuthIdentityPool3FDE84CC_F1DPeWGAkldm | us-east-2:965ffa01-f6c3-44df-815a-108e02ece41d |

Null retention means no retention period was returned. Stack membership and configuration projections remain in the temporary JSON evidence; the key relationships and release limitations are recorded above.
