# Gates 2 and 3 — privacy candidate and Twitch callback

2026-09-16. **Review only. No policy publication, real invitation, OAuth flow or console configuration change occurred.**

## Gate 2: exact privacy candidate

Published object: `s3://destroyaindustriesminingextension.com/privacy`.

- Published HTML: 8,502 bytes, SHA-256 `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c`.
- Current ETag: `"36b650808ecff4e13988e43a3159e62d"`. S3 returned no VersionId for this object; do not invent one. Metadata: `text/html; charset=utf-8`, inline disposition, `public, max-age=300`, AES256.
- Candidate HTML: 15,372 bytes, SHA-256 `8d99be55d7b4d198d8918c9667d977e604214e184d598e6e99d7b6f1c5123d7e`.
- Proposed effective date: September 16, 2026. If actual publication is later, update the date and re-review the resulting hash before publication.

Review [published HTML](dime-m42-testers-dormant-review/privacy/before.html), [candidate HTML](dime-m42-testers-dormant-review/privacy/candidate.html), [exact HTML diff](dime-m42-testers-dormant-review/privacy/html.diff), [exact text diff](dime-m42-testers-dormant-review/privacy/text.diff), and [all text/HTML hashes](dime-m42-testers-dormant-review/privacy/hashes.json).

The diffs use zero context so blank context lines do not introduce trailing whitespace; complete before/after documents are linked above.

Changes disclose the memory-only guest experience; separate Twitch OAuth identity and minimum openid scope; secure authentication cookies; encrypted server tokens; intended-tester invitations and digest-only use records; independent sign-in/linking gates; conflict-preserving shared saves; bounded deletion manifest; reset/unlink/deletion differences; and resumable verified deletion. The old statement that no automated deletion mechanism exists is corrected while explaining that access depends on the relevant authenticated interface being available. The obsolete conversion-disabled wording is replaced with server-controlled conversion wording.

Exact retention: invitation use ≤15 minutes; OAuth login ≤5 minutes/earlier invitation expiry; session/grant ≤8 hours with 30-minute idle limit; link intent 5 minutes; successful link outcome 24 hours; gameplay request receipts 30 days; deletion tombstone/recovery protection and existing PITR window 35 days. Logical expiry is immediate; DynamoDB TTL cleanup is asynchronous. Rejected/conflicting links create no persistent mapping/manifest entry. Existing contact, AWS processing, encryption, log retention, support-email retention, PITR, children and unrelated wallet/gameplay wording remain intact. Both verified mailto links are unchanged.

Local mobile (360 px) and desktop (1280 px) rendering passed with no horizontal overflow, script or network request. [Mobile screenshot](dime-m42-testers-dormant-review/privacy/candidate-360.png), [desktop screenshot](dime-m42-testers-dormant-review/privacy/candidate-1280.png), [render results](dime-m42-testers-dormant-review/privacy/render-results.json).

**Publication remains blocked pending owner review.** A future authorized publication must re-fetch and back up the actual object/metadata, verify its ETag/hash, use an If-Match conditional write, preserve content metadata/encryption, invalidate only `/privacy`, and verify public bytes. None of those write actions occurred here. Preserve the current policy until approval; the candidate is a committed review artifact only.

## Gate 3: configured callback versus provider registration

Verified deployed configuration:

- Web OAuth public client ID: `4228okut24ll35bisjmygbquaf6svm`.
- Callback constructed by reviewed code: `https://destroyaindustriesminingextension.com/auth/callback`.
- Extension client ID: `znaovl2j45idub9k81om1dkatwxnu2`; it is distinct and is not used for web OAuth.
- Owner OAuth secret reference: `arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/oauth/client-secret-s5kwbq`.
- Owner web identity reference: `arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/identity-key-kL7iYK`.
- Owner encryption reference: `arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/auth-encryption-key-hAAuXq`.

All three references exist and are not scheduled for deletion, verified with DescribeSecret metadata only. The OAuth secret ARN is distinct from the Extension signing-secret ARN. No secret value was retrieved, compared, displayed or regenerated. This verifies configured credential-reference separation, not a plaintext-value audit. Existing runtime key-separation checks remain unchanged.

**Owner-verified in Twitch Developer Console on 2026-09-16.** The owner replied “yes” to the specific check that public client ID `4228okut24ll35bisjmygbquaf6svm` has exactly `https://destroyaindustriesminingextension.com/auth/callback` registered. This is owner console attestation; no authenticated browser-control tool is available for an independent automated confirmation, and no OAuth flow was performed. [Callback evidence](dime-m42-testers-dormant-review/callback-review.json).

The registered callback check is satisfied by that owner confirmation. If configuration changes before activation, recheck the separately registered web application in [Twitch Developer Console applications](https://dev.twitch.tv/console/apps). Preserve the exact URL without trailing slash, wildcard or alternate unreviewed callback. Do not expose or regenerate a secret, and do not substitute Extension configuration as OAuth evidence.

## Activation order

Dormant support is deployed, but this does not approve activation. First resolve the [routing/WAF confidentiality gate](dime-m42-auth-routing-activation-review.md), approve/publish the reviewed privacy candidate, and retain/reconfirm the owner-verified registered-callback evidence. Only then review the parameter-only TESTERS change set and a designated account test plan. Linking remains DISABLED; no real invitation is generated until the sign-in activation itself has been approved and verified.
