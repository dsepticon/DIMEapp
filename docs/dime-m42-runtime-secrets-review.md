# Web-only runtime secret retrieval and readiness review

Scope: `codex/dime-m4-graphics-web`, baseline `0e6c84f`. Authentication remains dormant: sign-in DISABLED, linking DISABLED, conversion ENABLED. No invitation or gameplay operation is part of this change.

## Two execution paths

| Boundary            | Previous isolated utility                   | Previous deployed Lambda                                                                  | Proposed deployed Lambda                                                                                         |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Selection           | Explicit key ARN, version ID and AWSPENDING | CloudFormation resolves full SecretString at environment update; implicit AWSCURRENT      | Three exact web ARNs in environment; explicit AWSCURRENT for ordinary requests                                   |
| Readiness selection | Two candidate web keys                      | Injected web keys plus OAuth and two Extension dependencies                               | Two web keys only; direct IAM invocation chooses AWSCURRENT or AWSPENDING                                        |
| Envelope            | Plaintext SecretString                      | Plaintext environment strings; no JSON selector                                           | Plaintext SecretString; reject binary, JSON and unresolved references                                            |
| Parser              | Strict Base64 and decoded length            | Strict Base64 and decoded length, plus other credential parsers                           | One shared strict parser for ordinary authentication and readiness                                               |
| Whitespace          | Rejected                                    | Rejected                                                                                  | Rejected; no trimming                                                                                            |
| Caching             | None                                        | Deployment-time resolution persists in warm/cold environments until configuration refresh | 30-second in-memory current cache, invalidated on web-only configuration revision change; readiness always fresh |
| Output              | Boolean/category results                    | Six broad readiness results or generic failure category                                   | Exactly eleven requested Boolean fields                                                                          |

The old utility and old Lambda did not test the same dependency set or stage-selection mechanism. A generic SECRET_FORMAT from the old Lambda therefore did not establish that either candidate web key was malformed. No claim that CloudFormation trimmed, re-encoded or corrupted a value is supported. The deployed current/pending comparison must establish key-specific results before promotion. The two Extension credentials are deliberately outside this diagnosis.

## Canonical contract

Both web keys are independently generated 32-byte keys encoded as canonical padded Base64 in the entire plaintext SecretString. No JSON envelope/field selector, whitespace, hexadecimal, unpadded Base64 or automatic format guessing is accepted. The OAuth client secret remains a separate Twitch-issued opaque plaintext SecretString and is not rotated.

Identity uses `dime:oauth-subject:v1\0`. Invitation subkeys use HMAC-SHA256 with `dime:web-tester:key:subject:v1\0` and `dime:web-tester:key:signature:v1\0`; subsequent operations use their respective versioned subject/invitation contexts. Subkeys remain in memory. Encryption uses its independent key, never an identity-derived key. The equality-only guard compares decoded key bytes with constant-time equality. It exposes no input or fingerprint. Root rotation invalidates outstanding invitations; authentication remains disabled throughout.

## Runtime boundary and IAM

Normal requests cannot choose a secret stage. The resolver accepts only the three complete owner-approved web ARNs in us-east-2. Identity/encryption retrieval is allowed at AWSCURRENT and AWSPENDING; OAuth retrieval is restricted to AWSCURRENT. The Lambda receives no web secret plaintext in environment configuration. No ListSecrets, wildcard-secret grant, secret administration, additional KMS grant, or Extension secret runtime grant is introduced.

IAM Autopilot 0.3.0 identifies GetSecretValue and a conditional KMS baseline. Its wildcard baseline is not deployed: owner-approved exact ARNs and stage conditions narrow the policy. Metadata confirms AWS-managed Secrets Manager encryption, so no customer-managed KMS permission is needed. AWS documents the [GetSecretValue permissions](https://docs.aws.amazon.com/cli/latest/reference/secretsmanager/get-secret-value.html); the version-stage condition is verified against the [service authorization JSON](https://servicereference.us-east-1.amazonaws.com/v1/secretsmanager/secretsmanager.json).

The two Extension environment references and their existing loading, validation and IAM behavior remain structurally unchanged. Existing linking continues to use that interface. No real Extension credential is resolved, compared or validated by readiness or local diagnostics. Synthetic fixtures exercise its existing checks. Any later live linking requirement involving those credentials needs a separate review.

## IAM-only readiness

Direct Lambda Invoke payload has exactly two fields: `dimeOwnerSelfTest: key-readiness-v2` and `stage: AWSCURRENT|AWSPENDING`. Both authentication modes must be DISABLED. HTTP API v2 integration always supplies its event wrapper; query/body/header spoofing cannot produce this exact direct invocation shape. No new invoke permission, public route or function URL is added.

The response body contains only:

- identity_source_valid, identity_envelope_valid, identity_encoding_valid, identity_length_valid
- encryption_source_valid, encryption_envelope_valid, encryption_encoding_valid, encryption_length_valid
- keys_distinct, derived_invitation_ready, encryption_round_trip_ready

No values, references, version IDs, lengths, hashes, ciphertext, derived material or failure exceptions leave readiness. It does not initialize OAuth, Extension credentials or DynamoDB. Signature and authenticated-encryption tests use disposable synthetic data with no persistent record or invitation-use write. Source failure includes an unavailable reference/stage/access path; subsequent Booleans are false when their prerequisite cannot be established, not a diagnosis that every later stage independently failed.

## Exact deployment boundary

Only WebAuthFunction code/environment and WebAuthExecutionRole's two exact-secret read statements may differ. StagingHttpApi may be reported dynamically only while its complete processed definition remains identical. All other resources, parameters, outputs, permissions, routes, table and gameplay definitions must be structurally identical. Source, packaged and processed lint/Guard checks plus IAM simulations enforce this boundary.

## Promotion and rollback gate

Record original and pending version metadata without retrieving contents. Deploy dormant support, verify artifact and exact resource changes, test current, then test pending using the deployed parser. Promote neither replacement unless all eleven pending results are true and metadata still identifies the reviewed versions. Promote both to AWSCURRENT, retain originals as AWSPREVIOUS, refresh only DIME_AUTH_KEY_REVISION through a reviewed web-only change set, then require all eleven fresh-current results true.

On any promotion/readiness failure, restore original stage labels and the prior web-only configuration revision immediately. Preserve every version. Do not revert to a code artifact that expects plaintext environment values without reverting its template interface in the same reviewed rollback. Never activate TESTERS during this workflow. A current-readiness pass is necessary but does not validate untouched Extension credentials or constitute a live OAuth/linking test.

## Confidentiality and regression checks

Malformed/disabled public paths must not retrieve secrets or write records. Rejected requests retain the reviewed generic errors and safe shutdown behavior. SDK errors are mapped to non-sensitive categories without exception serialization. Readiness emits no application log event. Synthetic telemetry searches use count-only results; no raw log messages, requests, sampled identities or player fields are retrieved. Guest and Extension compatibility are tested with synthetic/in-memory journeys and unchanged gameplay artifact checks, not real saves.
