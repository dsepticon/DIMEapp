# DIME scanner Twitch activation checklist

Target: mutable **0.9.0**, or **0.9.1** if Twitch requires a new version. Never replace/delete an immutable version. Do not submit for review or publish publicly.

## Exact artifact

- Linux: `/tmp/DIME-Twitch-0.9.0-scanner-20260915.zip`
- Windows: `C:\Users\dylan\Downloads\DIME-Twitch-0.9.0-scanner-20260915.zip`
- Size: **107,725 bytes**.
- SHA-256: `189c4ac1893d0957cbada62352742952b92cd22fbb75dce7193c413c07d326e8`.
- Source: `17acd1fca6b535c3da2da4a7d44a384267d42fc0`.

## Backend prerequisite

Confirm the deployment report records `UPDATE_COMPLETE`, matching Lambda code hash, conversion `ENABLED`, empty tester tags, unchanged eight routes, and passing unauthenticated/CORS checks. This client uses `analyzeNearby`; do not activate it against the older backend. Local synthetic tests are not a substitute for authenticated live gameplay checks.

## Upload and configuration

1. Sign into the Twitch Developer Console yourself; complete any MFA. Open only **DIME**, client ID `znaovl2j45idub9k81om1dkatwxnu2`.
2. Open mutable 0.9.0. If replacement is prohibited, create 0.9.1, preserving every older version.
3. Upload the exact archive above. Verify filename, byte size and successful asset processing. No wrapper directory is present.
4. Panel viewer path: `panel.html`; height: **500**. Mobile viewer path: `mobile.html`. Keep configuration paths blank.
5. Keep the staging fetch allowlist host `t2la0784p6.execute-api.us-east-2.amazonaws.com`. API base: `https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging`.
6. Privacy URL: `https://destroyaindustriesminingextension.com/privacy`.
7. Enter **Local Test**. Use the configured supported asset preview and an independently authenticated approved test account. Never paste or expose authorization tokens, cookies, player keys or saves.

## Local Test acceptance — Panel and Mobile

Use an approved dedicated test profile. Do not reset an existing real profile. A fresh profile begins in Tessick Station / Crew Ring. Existing valid v4 saves and ground pieces must remain usable.

- Walk with WASD/arrows and touch controls; physical exits, ship assignment and departure remain required. Map selection must not teleport.
- Reach a mining zone physically. Press **P / Ping** while walking: expanding pulse, bounded temporary rock outlines, distance and direction. Unanalyzed material/value/details stay hidden. Repeated pings produce no mutation request.
- Approach several intact rocks. Verify contextual **Analyze / hold F**, **Q** focus cycling, range/obstruction/no-signal/unsupported feedback, and 44px touch targets.
- Release Analyze early; cancel pointer, move off the control, change focus or hide the page. Analysis must stop safely. Complete a hold: movement resumes and confirmed information appears without opening a menu or covering player/target.
- Confirm material, rarity, size, instability, estimated yield, optimal charge band and compatibility. Refresh/reconnect: confirmation persists while the node exists. Ping recalls details; analysis should not need repeating.
- Immediately mine the analyzed node. Verify held charge, release decay, stable optimal-band progress, fracture into 3–8 smaller pieces, and zero-yield overcharge on a separate node.
- Vacuum existing and newly fractured pieces by proximity; verify visible attraction, exact collection, continued-hold retargeting, early release, capacity feedback and persistence across refresh.
- With approved synthetic tooling only, exercise a definitive analysis rejection and lost-response retry using the original request ID: no duplicate action, safe pending-entry clearance on definitive rejection, local walking available during uncertainty, unrelated storage unchanged. Do not forge live tokens or access real save fields to induce failures.
- Check legacy client state/actions/travel/mining/cargo/processing/market/replay with approved synthetic authorization when available; legacy routes must preserve their existing behavior.
- Test Panel 318×500, Mobile 360×640 and desktop keyboard play. No persistent overlay, document scrolling, blocked controls, console/page errors, 404, configuration error or 5xx. Reduced motion remains readable.
- Record only pass/fail, fixed error codes and non-identifying counts. Do not record tokens, identities, item keys or player-field screenshots.

## Hosted Test gate

Only after Local Test passes, move the corrected version to **Hosted Test**. Repeat the same Panel/Mobile flow in real Twitch webviews, including refresh, touch holds and rejection/replay with approved synthetic authorization. Record version, processed archive, status, results and any failures. Leave the version in Hosted Test; **no public review submission or public release**.

If authenticated console control or an approved synthetic session is unavailable, leave activation pending and report that exact blocker. Do not bypass authentication or substitute local fixtures for live verification.
