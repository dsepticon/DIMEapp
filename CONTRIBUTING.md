# Contributing to DIMEapp

This repository is the React/Twitch extension, not the separate Unity project named DIME.

Work on a feature branch; preserve unrelated changes. Keep production resources read-only unless the owner approves a concrete deployment/change plan. Do not push a branch attached to an automatic deployment until that trigger is resolved.

Run npm ci, npm run check and npm run test:e2e. Tests use synthetic state and mocks, never production tables. Keep shared rules typed and transaction-safe. Update recovery provenance when incorporating AWS-authored source.

Never commit secrets, JWTs, production exports, .env files, downloaded ZIP packages or build artifacts. Report sensitive findings privately to the repository owner; do not publish tokens or player records in issues.

Pull requests should explain behavior, evidence, validation and production compatibility. Do not merge or deploy without review.
