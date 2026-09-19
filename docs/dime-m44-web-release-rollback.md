# Milestone 4.4 web release — stopped and rolled back

## Outcome

The approved guest-function change set executed successfully, then the publication helper rejected a changed CloudFront distribution ETag. **No S3 objects were written.** The prior guest function was restored immediately, the stack returned to `UPDATE_COMPLETE`, and restoration checks passed. Milestone 4.4 is **not published**; the prior Guest Demo remains available at <https://destroyaindustriesminingextension.com/game/>.

Source remains `4675386b422ce0c3547925183e35776efd13a818`, reviewed by `c8a8be1dea94b54993465c21c12442b0a0533ea2`, on `codex/dime-m4-industrial-services`. Source and remote matched and the worktree was clean before the attempt. No application code changed.

## Failing boundary

The reviewed artifacts, current account, regions, stack modes, original function and distribution metadata all passed preflight. The publication helper then incorrectly required the **pre-update distribution ETag** to remain identical after the authorized LIVE function update. That assertion failed before the first S3 write.

[Comparison](dime-m44-web-release-rollback/distribution-comparison.json) found only the ETag changed: `E15GZDBBQBW2HX` → `E2TKNP7HFBRULI` at comparison time. Every reviewed routing, origin, behavior, policy, logging, default-document, error-response and certificate field remained identical. This establishes the failing comparison; it does not claim an unrelated routing change or a gameplay defect.

Per the owner's explicit failure instruction, the prior function was restored rather than retrying publication with a relaxed check. No alternate routing or new change set was attempted. A later release needs a reviewed deployment guard that rechecks structural configuration after function publication, records the fresh ETag, and still stops on any actual unauthorized configuration difference. A fresh function-only change set is required because the approved one was already executed and subsequently rolled back.

## Executed resources and rollback

AWS account `861738068626`; guest stack `dime-guest-game-20260916`, `us-east-2`; website bucket `destroyaindustriesminingextension.com`, `us-west-2`; distribution `EC269D02M2JLD`.

Executed once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m44-4675386-guest-assets-review-1/30403bbd-da3a-4db1-b3b6-819141e139a0`

- One non-replacing Modify: `GuestCapability.FunctionCode`.
- Zero additions, removals, replacements or other resource changes.
- Deployment operation `2408b49f-e320-48d5-a538-f3490e1808fb`: `SUCCEEDED`, stack `UPDATE_COMPLETE`.
- LIVE candidate hash verified: `310ce1a1bf865313e827a7eff7ac4632d106be21c7429f3deea5c6327c3ef716`.
- Rollback operation `9cf0f360-b3c2-11f1-9a7e-063362c69eb7`: `SUCCEEDED`, stack `UPDATE_COMPLETE`; only the previous function code restored.
- Restored LIVE hash: `2ce9863f1e3e3b54248291e5d241d7f6c5a20bdbd2676a046838851d43db5251`, byte-identical to the backup.
- Restored processed stack template equals the complete predeployment template.
- No failed CloudFormation resource events: the stop was a local publication assertion after successful stack execution.

[Execution and rollback events](dime-m44-web-release-rollback/stack-events.json). [Final metadata](dime-m44-web-release-rollback/final-state.json).

Rollback invalidation `I4I51JBPSVYZ3INRJ10XV2W3LD` is `Completed`, containing **only `/game/` and `/game/index.html`**. Distribution is `Deployed`. No root, privacy or wildcard invalidation was requested.

## Website and artifacts

Zero website PUTs or deletes occurred. The entry and old hashed assets retained their original ETags, metadata and bytes; both new asset keys remain absent. No new object version IDs exist. Existing S3 version IDs were absent and are recorded as such rather than invented.

Fresh backups and exact metadata are under `/tmp/dime-m44-web-release/`, with the [rollback manifest](dime-m44-web-release-rollback/rollback-manifest.json). Prior release rollback archive remains preserved at `/tmp/dime-m44-rc-4675386/DIME-Guest-m44-rollback.zip`, SHA-256 `6aff72b2dc4f6f128a6c8fd3c13ba223971db86bd1df0adca6f1c3e937e6fff9`.

The candidate artifacts remain unchanged and unpublished:

| Artifact                                                    |  Bytes | SHA-256                                                            |
| ----------------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `DIME-Web-m44-game-4675386-rc1.zip`                         | 112982 | `4cfd280f4c1256db6f0c5f7acc8ac939834d0c3856ba92b1d2aa264c334d0d0c` |
| `DIME-Twitch-0.9.0-m44-industrial-services-4675386-rc1.zip` | 110303 | `3ebb0549fc585496dc3692dad60220fdc4c96e42e72e634ed0368838ac452d77` |

Both are in `/tmp/dime-m44-rc-4675386/`. Archive/file hashes were revalidated before execution.

## Restoration verification

Three public Chromium tests passed, zero retries: 318×500 Panel-sized, 360×640 Mobile-sized with touch/reduced motion, and 1280×900 desktop. Each used real public HTTPS with an allowlist that blocked any unexpected or credential-bearing request. Screenshots were visually inspected.

- Old Guest Demo is immediately playable, with its progress-not-saved notice.
- Local walking, physical exit transition and paused menu work.
- Refresh starts fresh; a second tab remains independent.
- One canvas, no document scrolling, empty local/session storage and no cookies.
- Zero browser console, page, failed-network or unexpected-request errors.

Screenshots: [Panel](dime-m44-web-release-rollback/screenshots/restored-318.png), [Mobile](dime-m44-web-release-rollback/screenshots/restored-360.png), [desktop](dime-m44-web-release-rollback/screenshots/restored-1280.png).

[Public HTTP checks](dime-m44-web-release-rollback/restored-public-http.json) confirm root, privacy and game entry bytes match the predeployment backups over valid HTTPS; `/privacy` returns 200. Guest CSP remains scoped to `/game/`. Existing content types/cache settings remain unchanged. Four exact guest API paths return edge-generated 401; all eight legacy/v4 gameplay routes reject anonymous requests; valid Extension-origin preflight succeeds and foreign-origin preflight lacks an allow-origin header. `/auth/status` reports sign-in/linking unavailable.

The new industrial-services public journey was **not run**, because the new bundle was never published. Existing release-candidate local validation remains valid (599 unit, 176 complete Chromium, five guest, three web-layout and two old-client compatibility checks). Those results are not presented as public Milestone 4.4 verification.

## Telemetry

Initial count-only CloudWatch Logs Insights queries across the three existing log groups returned zero synthetic-sentinel matches and zero selected configuration/runtime error categories. Six WAF sampling interfaces returned zero samples; all six sampling flags remain disabled while aggregate metrics remain enabled. Standard and real-time CloudFront logging are disabled; WAF full logging is not configured. API access logs remain limited to request ID, route key, status and latency. No raw request samples or log messages were retrieved.

A synthetic sentinel was sent only to `/game/status`; it did not invoke OAuth or persistent gameplay endpoints. The delayed check began 373 seconds after the sentinel. Both initial and delayed checks passed: six queries each, zero sentinel/configuration-error matches and zero WAF samples. [Initial results](dime-m44-web-release-rollback/telemetry-initial.json), [delayed results](dime-m44-web-release-rollback/telemetry-delayed.json). These checks establish the observed window and do not guarantee that no future log event can arrive.

## Final modes and next release boundary

Sign-in **DISABLED**; linking **DISABLED**; conversion **ENABLED**. Both Lambdas' hashes, revisions and last-modified metadata are unchanged. No secret access, promotion, invitation, real player read/scan/reset, gameplay write, OAuth configuration change, website-root/privacy change or Twitch upload occurred.

The web release success condition was not reached, so Twitch activation remains blocked. The candidate ZIP and paths (`panel.html`, `mobile.html`, 500px panel) remain in the prior review. Do not upload until a successful separately resumed web release and the owner's authenticated Twitch-console session. No public Twitch release is authorized.
