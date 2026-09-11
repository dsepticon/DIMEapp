# D.I.M.E. — Destroya Industries Mining Extension

Maintained React/Twitch extension for **Dsepticon/DIMEapp**. This repository is unrelated to the Unity game repository named DIME.

The maintained application is a static React 18/TypeScript frontend and a separate Node.js Lambda backend. Gameplay and catalog values were reconciled with authored source recovered from the October 2024 frontend source maps. AWS production has **not** been replaced by this rebuild.

## Local setup

Use Node.js 22.12 or newer in the Node 22 line, and npm.

```sh
npm ci
cp .env.example .env.local
DIME_ENV=local npm run dev:local
```

In a second terminal, run `npm run dev` and open http://127.0.0.1:5173. Local progress persists in `.local/state.json` across browser/server restarts. Run only one local API process against that file. It uses no AWS credentials and never reads or writes production. The frontend's local mode works only in a development build on localhost/127.0.0.1.

Start with the Nomad at ARC-L1 and zero credits. Travel to Lyria or Wala, hand-mine gems, collect and transfer them into the Nomad, then travel to Area-18 to sell. Earn ships and equipment through the shop; use a Prospector/Mole at Halo, then return to ARC-L1 to refine ore and collect finished work orders. Refined cargo sells at Area-18.

## Validation and builds

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
```

`check` runs lint, strict type checking, unit/integration tests, and both production bundles. Browser tests use mocked API requests and synthetic profiles. No tests contact production.

For a release build, remove the local development env file or override it:

```sh
VITE_DIME_MODE=twitch VITE_DIME_API_URL=https://APPROVED-STAGING-API.example npm run build
```

`dist/frontend/` contains index.html, panel.html, mobile.html and static assets. `dist/server/index.mjs` is the bundled Lambda handler (`index.handler`). Build output is ignored by Git. The URL above is a placeholder, not an operational service.

A build without a backend URL is intentionally unable to connect; it displays a configuration error. A build with local mode is rejected. No build command uploads or deploys anything.

## Documentation

- [Review handoff](docs/handoff.md)
- [AWS inventory](docs/aws-inventory.md)
- [Git/production reconciliation and recovery](docs/reconciliation.md)
- [Architecture and API contract](docs/architecture.md)
- [Gameplay and rule corrections](docs/gameplay.md)
- [Twitch and environment configuration](docs/twitch-setup.md)
- [Testing and baseline failures](docs/testing.md)
- [Staging, deployment, rollback](docs/deployment.md)
- [Infrastructure-as-code plan](infra/README.md)
- [Recovery provenance](docs/recovery-provenance.json)

## Deployment boundary

**Do not push this branch until Amplify automatic builds are disabled with approval.** Both `main` and `codex/react-extension-rebuild` have automatic builds enabled in the observed Amplify app. The repository's new amplify.yml intentionally fails before deployment, but the live app also has an inline build specification that may override it. A push must not be assumed safe.

The v2 backend requires a separately approved table with `pk` and `sk` keys. It refuses the existing legacy table names. Production browser saves and player data are never imported automatically.
