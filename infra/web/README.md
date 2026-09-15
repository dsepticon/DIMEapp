# Credential-gated standalone web infrastructure

This folder prepares review artifacts; it performs no AWS mutation. Keep the current M4.1 gameplay Lambda until real OAuth and the website release gates pass.

## Reproduce the review

1. Build the separate handler: `node scripts/build-web-server.mjs`.
2. Run the pinned IAM analyzer with telemetry disabled, writing `oauth-iam-analysis.json` into an evidence directory:

   ```sh
   DISABLE_IAM_POLICY_AUTOPILOT_TELEMETRY=true uvx iam-policy-autopilot@0.3.0 generate-policies "$PWD/server/authRecords.ts" "$PWD/server/webHandler.ts" --region us-east-2 --account 861738068626 --service-hints dynamodb --pretty
   ```

3. Run `python prepare_review.py EVIDENCE_DIRECTORY` using the existing cfn-lint Python environment. The generator reads the unchanged staging template and produces an opt-in review template with the combined web handler, separate secret-reference parameters and eleven explicit routes. Linking defaults DISABLED. Conversion is constrained to ENABLED and tester tags to empty.
4. Validate source and offline-translated processed templates with cfn-lint and the web Guard rules. Compare all preserved resources and old routes structurally. Offline translation is not a live CloudFormation change-set review.

## Permission review

The analyzer is a baseline, not authorization. It emitted wildcard table/KMS resources, replication and UpdateItem actions that the application does not use. The review retains existing GetItem/PutItem access and adds only ConditionCheckItem against the exact existing table and DeleteItem constrained to `AUTH#v1#*`, with an explicit non-null LeadingKeys condition. No Scan, Query, table operation, gameplay deletion or new direct KMS permission is included. See `iam-review.json`.

AWS documents transaction authorization per underlying action, including ConditionCheckItem: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html. Runtime synthetic transaction tests must verify the exact IAM conditions before enabling linking.

## Same-origin website forwarding

Preserve distribution EC269D02M2JLD's existing website origin and unrelated behaviors. Add only `/auth/*` and `/api/*` behaviors to the reviewed staging API origin, origin path `/staging`, HTTPS-only. Disable caching entirely. Forward cookies, query parameters needed by callback, and Origin, Content-Type, X-Dime-CSRF and Authorization; do not forward the website Host header to API Gateway. Preserve Set-Cookie. Retain API CORS and throttling unchanged; the web browser calls its own origin.

Access logs must exclude callback query strings, cookies, authorization and response bodies. Keep the existing sanitized API log fields. Add CSP for the web document (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`), nosniff, same-origin framing protection and no-referrer. Do not apply the standalone frame policy to Twitch assets.

Before generating an executable change set, resolve only real approved secret references, confirm distinct credentials, review provider latency against the Lambda timeout, and complete actual OAuth/CSRF/session/linking tests. Then compare deployed/proposed processed resources, inspect `describe-events`, publish privacy, revalidate website ETags and rollback, and deploy conditionally. No DNS change is required by this plan.
