# Standalone website deployment gate — 2026-09-15 America/Edmonton

## Result: stopped before publication

Requested source: `codex/dime-m4-graphics-web` at `5cfed1f107091ecfab5e1270ed7bb75629bfb465`. Local and remote HEAD matched and the worktree was clean at preflight.

**The game was not published.** The owner explicitly required stopping if OAuth credentials were not configured. The reviewed deployment configuration still has no standalone OAuth client ID or the three required runtime secret references. Read-only Secrets Manager metadata filtered to DIME names in us-east-2 returned only the existing Extension signing and player-identity secrets. No values were retrieved. This does not rule out an owner-created secret under an undisclosed name; its reference must be supplied and verified before use.

No website object, privacy object, CloudFront configuration, gameplay Lambda, OAuth infrastructure, IAM policy or player record was changed. No CloudFormation change set, S3 replacement/backup version or CloudFront invalidation was created. There are therefore no deployment change-set ARNs, changed-object version IDs or invalidation IDs to report.

## Verified prerequisites and remaining gates

| Check                     | Result                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS account               | `861738068626`, verified with STS                                                                                                                                                                    |
| Website bucket            | `destroyaindustriesminingextension.com`, expected-owner check succeeded; region us-west-2                                                                                                            |
| S3 versioning             | No enabled versioning status returned; do not assume old objects have recoverable versions                                                                                                           |
| CloudFront                | `EC269D02M2JLD`, ARN belongs to expected account, Deployed, exact domain alias                                                                                                                       |
| Viewer TLS                | ACM certificate `6e9edb04-019c-4541-b0ae-aff483a2db73`, us-east-1, ISSUED, exact domain covered; expires 2026-11-30; TLSv1.2_2021, redirect-to-HTTPS                                                 |
| Static origin TLS         | Existing S3 website origin remains HTTP-only; authenticated executable content requires the reviewed HTTPS origin correction                                                                         |
| Callback                  | Required exact URL: `https://destroyaindustriesminingextension.com/auth/callback`; actual Twitch registration cannot be verified without authenticated console access                                |
| API                       | Existing gameplay base is `https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging`; web requires same-origin `/auth/*` and `/api/*`, neither routed by the current distribution              |
| CSP                       | No response-headers policy on the current default behavior; reviewed web CSP remains a deployment gate, not a verified live header                                                                   |
| Cookies / CSRF / rotation | Source uses Secure HttpOnly host-only SameSite=Lax cookies, exact-origin CSRF validation and rotating sessions; existing synthetic checks passed, real OAuth/CloudFront verification remains blocked |
| Account linking           | Disabled until every writer is binding-aware; live conflict/replay/isolation tests remain required                                                                                                   |
| Responsive layout         | Reviewed scanner web build has local Panel/Mobile/desktop production evidence; public-domain gameplay is not tested or deployed                                                                      |
| Privacy                   | `/privacy` untouched; OAuth disclosure must be separately finalized before publication, without silently replacing the preserved policy                                                              |
| Rollback                  | Prior review artifacts exist; current object backups, distribution snapshot and tested publication rollback are NOT completed for this blocked attempt                                               |
| Amplify                   | Only `main` and `codex/react-extension-rebuild` are connected/auto-created; report branch excluded                                                                                                   |

The reviewed web artifact is `/tmp/dime-m43-scanner/DIME-Web-0.9.0-scanner-candidate.zip`, **106,746 bytes**, SHA-256 `56ac62c6908d098d60dab82efb19e9e47482ecb7cb1ebf703973cff3d71fe71b`. It contains `index.html` and versioned assets under `dime-web/releases/m43-ffa4a7abd9308f4d/`. The Twitch ZIP is not a website artifact and was not used.

## Exact owner action

1. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), register or identify the standalone DIME OAuth application, separate from Extension client `znaovl2j45idub9k81om1dkatwxnu2`. Complete login, MFA and any CAPTCHA normally. Register the exact callback above. The reviewed server uses authorization-code/OIDC with only `openid`. See [Twitch registration](https://dev.twitch.tv/docs/authentication/register-app/) and [OIDC authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/).
2. In AWS account `861738068626`, region **us-east-2**, securely provision three separate Secrets Manager SecretString values through an owner-controlled console or secure provisioning workflow:
   - `OAuthClientSecretArn`: the standalone application's client secret.
   - `WebIdentityKeySecretArn`: a stable, independent random 32-byte key, base64 encoded.
   - `AuthEncryptionKeySecretArn`: another independent random 32-byte key, base64 encoded.
     Keep both keys distinct from each other and from all existing Extension credentials. For the current template, each reference resolves the entire SecretString, not a JSON field.
3. Supply only the **public OAuth client ID and those three secret ARNs** through deployment configuration. If already provisioned under different names, provide their ARNs instead of rotating them. Do not paste secret values, JWTs, tokens or cookies into chat, files, command arguments or logs. Do not regenerate the existing Extension signing or identity keys.
4. Make an authenticated approved synthetic OAuth test session available for actual consent/callback, refresh/revocation, logout, CSRF, session rotation and account-link conflict/replay verification.

No secret provisioning or Twitch registration was attempted by the agent after the missing-credential gate was established.

## Additional implementation constraint before resuming

`infra/web/prepare_review.py` currently generates a **combined replacement for EbsFunction**, adds auth/web routes to that function, and expands its role for authentication transactions. That existing plan is incompatible with this task's explicit **do not change the gameplay Lambda** restriction and cannot be executed as-is.

After credential provisioning, a revised separately reviewed OAuth/web infrastructure plan is required that preserves the gameplay Lambda. Do not enable account linking against old non-binding-aware Extension writers: the existing security design requires every writer to honor bindings. No weakening of that requirement or implicit permission to replace the gameplay handler is inferred from the website publication request. Full shared-save linking remains a release gate if it cannot be satisfied within the unchanged-gameplay constraint.

## Resume and rollback requirements

Before any object replacement, capture each exact key's bytes, ETag, SHA-256, content/cache/encryption metadata and any VersionId into immutable versioned backup objects with a manifest. Use create-only writes for backup/assets and ETag-conditional replacement for the entry point. Preserve `/privacy` and unrelated objects. Do not rely on bucket versioning that is not enabled. Test restoration from the backup using a conditional write tied to the currently deployed object's ETag; preserve asset versions referenced by the restored index.

Review new source/packaged/processed templates and CloudFormation change sets, including the distribution ownership/update strategy, HTTPS origin, CSP and uncached auth/API cookie/header forwarding. No unreviewed import or direct infrastructure update is authorized by this report. Back up the current distribution configuration/ETag and define its reviewed rollback. Invalidate only changed paths after successful deployment.

Then test the actual domain's desktop/mobile sign-in, movement, physical travel, Ping/Analyze, mining/fracture/vacuum, refresh, logout, privacy links, cookies and security behavior. Existing 355-unit/152-Chromium source results and synthetic production-web checks are historical local evidence, not live website results. No new gameplay tests were run for this metadata-only blocked attempt; report formatting and whitespace checks passed.

Requested final URL: **https://destroyaindustriesminingextension.com**. Its existing contents remain unchanged; this report does not claim the new game is available there. No rollback is needed for this attempt because nothing was deployed.
