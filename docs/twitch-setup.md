# Twitch and environment setup

Follow the [Twitch building guide](https://dev.twitch.tv/docs/extensions/building/) and [extension reference](https://dev.twitch.tv/docs/extensions/reference/). Extension JWTs are not Helix user OAuth tokens.

## Required configuration before hosted testing

The owner confirmed these non-secret Developer Console settings for client ID `znaovl2j45idub9k81om1dkatwxnu2`, version `0.4.0`: Panel and Mobile are the supported views; Panel Viewer Path is `panel.html` with height `500`; Mobile Path is `mobile.html`; Config Path and Live Config Path are blank. The exact hosted asset origin is `https://znaovl2j45idub9k81om1dkatwxnu2.ext-twitch.tv`. The current Local Test base URI is `https://destroyaindustriesminingextension.com/`; it is not the hosted asset origin or an approved staging EBS endpoint. An older `assets.zip` uploaded September 27, 2024 remains attached to version `0.4.0`. Do not overwrite it or change Twitch settings during staging preflight. Extension ownership, hosted-test publication state, fetch allowlist and real cross-channel identity behavior still need separate verification.

For the currently supported views, use `panel.html` and `mobile.html` from a future approved static frontend bundle. `index.html` is built but is not a configured Twitch view path in version `0.4.0`. Files use relative asset paths so Twitch's versioned asset base works. Both configured HTML entry points load Twitch's hosted helper.

Set the approved EBS HTTPS origin as an allowed fetch domain in the Twitch extension configuration. Configure image/script/style domains only as required by the bundle. Helper origin: https://extension-files.twitch.tv. The frontend uses no inline application scripts or inline styles, eval, third-party fonts, remote profile images, or embedded authentication secrets.

Twitch controls the iframe CSP for hosted assets. For a separately hosted preview, use restrictive script/style/image/connect policies matching the helper and staging EBS, and allow framing only by the required Twitch origins. Do not set frame-ancestors 'none' or X-Frame-Options DENY on an iframe extension. Review exact domains against the actual extension ID/version before publishing. No live CSP configuration was changed.

The staging EBS must allow the exact hosted origin `https://znaovl2j45idub9k81om1dkatwxnu2.ext-twitch.tv`, not a wildcard, arbitrary twitch.tv suffix, or the Local Test base URI. Staging and production have separate exact allowlists. Local origins belong only to the loopback server. CORS is not authentication; the backend still validates every JWT.

## Variables

| Name | Location | Purpose |
|---|---|---|
| VITE_DIME_MODE | frontend build/dev | twitch, or local in development only |
| VITE_DIME_API_URL | frontend build/dev | Approved EBS base URL, no credentials/query |
| DIME_ENV | backend | local for file server; staging/production for Lambda |
| AWS_REGION | backend | Region for the state table |
| DIME_STATE_TABLE | backend | Approved dime-v2-staging-* or dime-v2-production-* table |
| DIME_ALLOWED_ORIGINS | backend | Comma-separated exact HTTPS origins |
| TWITCH_EXTENSION_SECRET_B64 | backend only | Active extension signing key, supplied securely at runtime |
| TWITCH_PREVIOUS_SECRET_B64 | backend only | Optional previous key during controlled rotation |

Never prefix secrets with VITE_. Do not put secret values into .env.example, build logs, command-line arguments, or Git. Configure secrets through an approved deployment mechanism outside this investigation. No AWS secret values were retrieved.

The helper may arrive late. The client waits indefinitely rather than enabling a demo. onAuthorized updates the in-memory current token on every refresh. onError clears authorization; expired requests wait for a fresh helper token. Anonymous identities cannot transact. Reloading clears tokens and obtains a fresh helper session.

Local mode is not an authentication bypass in Lambda: the deployed handler accepts only staging/production configuration and has no local-user path.
