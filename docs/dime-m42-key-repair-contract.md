# Dormant web-key repair contract

September 18, 2026. Owner confirmed retaining the reviewed domain-separated derived-key design and the equality-only reuse guard. No additional secret, IAM permission or template parameter is introduced.

| Material                  | Representation                                                                                         | Purpose                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Web identity root         | Full plaintext SecretString, canonical padded RFC 4648 Base64 of exactly 32 independently random bytes | Identity HMAC and cryptographic derivation of invitation subkeys                   |
| Authentication encryption | Full plaintext SecretString, same exact encoding and decoded size, generated independently             | AES-256-GCM authentication-record encryption; never derived from the identity root |
| OAuth client secret       | Full plaintext Twitch-issued opaque secret, unchanged                                                  | OAuth provider authentication                                                      |

Whitespace, trimming, JSON wrappers, JSON property selectors, hex, base64url and format guessing are prohibited. There is no JSON field name. Lambda receives CloudFormation-resolved values, not runtime retrieval ARNs. Secret ARNs remain unchanged; current values are refreshed only by a web-auth-specific configuration revision. The shared ConfigurationRevision parameter remains unchanged so gameplay configuration is preserved.

Identity derivation uses `dime:oauth-subject:v1\0`. HMAC-SHA256 derives independent invitation signature and subject subkeys using `dime:web-tester:key:signature:v1\0` and `dime:web-tester:key:subject:v1\0`. Their operations additionally use `dime:web-tester:invitation:v1\0` and `dime:web-tester:subject:v1\0`. These are cryptographic subkeys, not concatenated key strings. They exist only in process memory and are not persisted, logged or returned. The independently generated encryption key is used only for encryption; record-specific authenticated additional data binds ciphertext to its record context. No additional invitation secret is required under the owner's confirmed contract.

The reuse guard compares normalized decoded bytes with Node `timingSafeEqual`, only after format/length validation. It rejects reuse with KEY_REUSE. Format and KEY_LENGTH errors are separate. No inputs, prefixes, fingerprints or derived bytes appear in diagnostics. Tests reject cross-domain substitution and wrong encryption context.

## Secure preparation and validation

`scripts/repair-web-keys.py` is a local owner-only utility restricted to the two existing exact ARNs, account and region. It verifies disabled modes before each operation. Independent OS randomness supplies each key. AWS input uses an anonymous RAM-backed descriptor, never secret-bearing command arguments or an on-disk payload. The descriptor is truncated/closed after use; core dumps are disabled. Metadata files contain only version IDs, ARNs and staging labels. The initial stdin transport was rejected before upload; it was replaced with this tested memory transport.

The pinned asm-exec resolver could not resolve the pending versions. The owner-authorized restricted SDK canary therefore reads only the exact two version IDs with the required AWSPENDING label, verifies returned metadata, and repeats metadata checks afterward. SDK logging is disabled, exceptions are categorized without rendering, and a child with no AWS credentials receives the values over stdin. The child returns an exact Boolean allowlist. It tests canonical keys, decoded-byte reuse, domain separation, synthetic invitation verification and synthetic AES-GCM round-trip. Ciphertext/invitation strings are cleared, byte buffers overwritten, and the short-lived process exits; no cryptographic output is retained. Runtime-managed strings cannot provide a guarantee of physical memory zeroization. No real invitation or identity is used. The same restricted canary may validate the exact promoted current versions.

Promotion moves only these validated version IDs to AWSCURRENT; Secrets Manager retains the old current versions as AWSPREVIOUS. No version or ARN is deleted. The OAuth secret is not rotated. Metadata before/after and category-only results form the rollback record.

## Dormant readiness boundary

A direct Lambda Invoke with only `dimeOwnerSelfTest: key-readiness-v1` is an IAM-controlled owner check. It requires both modes DISABLED. API Gateway events always carry other fields and cannot select this branch; there is no new route or invoke permission. The check validates deployed configuration, all key separation, provider configuration and storage-client construction, then returns six readiness Booleans. It does not fetch provider data, exchange a code, create an invitation, contact DynamoDB or create records. Storage readiness means client initialization plus separately verified IAM/configuration, not a tested database mutation. No real account data is needed.

## Rotation and rollback limits

Root rotation invalidates outstanding invitations (maximum 15 minutes), explicitly accepted while activation is disabled. It also changes identity derivation. Encryption rotation changes decryptability of any records encrypted with the old key. No existing-account inventory, migration or assumption of empty storage is made here. Both prior versions are retained; no old gameplay or authentication records are modified. Any future need to recover a preexisting web account requires a separate compatibility review rather than silently replacing or merging its save.

On initialization/validation failure, restore previous current labels and refresh only web-auth configuration if it has consumed replacements. Keep both modes DISABLED. Restoring labels alone does not refresh CloudFormation-injected environment values. Do not use a rollback that changes gameplay, table, IAM, routes, website, privacy or WAF. TESTERS is prepared as an unexecuted parameter-only change set after successful readiness verification; linking stays DISABLED.
