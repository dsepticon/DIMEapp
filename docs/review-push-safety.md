# Review push decision — September 11, 2026

## Approved follow-up — September 12, 2026

The owner approved restricting the patterns and renewing AWS authentication. Applied only `autoBranchCreationPatterns=["main", "codex/react-extension-rebuild"]` to app d90ik3712sg8e in us-east-2. GetApp confirmed these exact patterns; ListBranches confirmed both existing branches still have automatic builds enabled and job ID 2. Automatic branch creation and its build configuration remain enabled. No build/deployment API was called.

`codex/react-extension-rebuild-review` is unequal to both literal patterns, which contain no wildcards, and is not an existing Amplify branch. It is safe under the verified Amplify settings to push only this review ref. GitHub listed no registered workflows; the candidate's sole workflow runs only on pull requests or manual dispatch and performs local validation. No PR, merge or deployment is authorized. The local review branch includes all prior rebuild commits plus the migration preview/tests and release documentation. The inspection below records the original blocker before the approved change.

No push, PR, merge, build, deployment or AWS configuration change was made. GitHub CLI authentication succeeds as dsepticon when network access is available. The initial sandbox authentication failure was not an invalid credential.

Read-only CLI inspection: STS; Amplify GetApp, ListBranches, GetBranch, ListJobs, ListDomainAssociations, ListWebhooks; CloudFront GetDistribution. Account 861738068626, Amplify app **d90ik3712sg8e**, **us-east-2**, repository https://github.com/dsepticon/DIMEapp.

| Setting | Exact observed value |
|---|---|
| Existing branch `main` | `enableAutoBuild=true`, `stage=PRODUCTION`, display name `main` |
| Existing branch `codex/react-extension-rebuild` | `enableAutoBuild=true`, `stage=DEVELOPMENT`, display name `codex-react-extension-rebuild` |
| App `enableBranchAutoBuild` | `false`; do not mistake this for disabling the observed per-branch and creation settings |
| App `enableAutoBranchCreation` | `true` |
| App `autoBranchCreationPatterns` | `["*", "*/**"]` |
| App `autoBranchCreationConfig.enableAutoBuild` | `true` |
| App creation stage / PR preview / basic auth | `DEVELOPMENT` / `false` / `false` |
| Custom domain associations / webhook targets | Both empty |

All new branch names are covered by the catch-all patterns. In particular, `codex/react-extension-rebuild-review` matches `*/**`. It cannot be pushed under the user's no-build condition. The existing rebuild branch already has builds enabled; pushing new commits is configured to enqueue a build/deployment attempt. Event delivery latency and eventual success are not guaranteed. The app's inline build specification runs `npx amplify pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID`, then the frontend build. A failing build or the repository's defensive amplify.yml does not make the push safe.

AWS documents automatic creation/deployment of branches matching these glob patterns: [pattern-based feature branch deployments](https://docs.aws.amazon.com/amplify/latest/userguide/pattern-based-feature-branch-deployments.html).

## Production identification

Amplify `productionBranch.branchName=main`, status SUCCEED, last deployment **2023-11-23T23:55:56.757Z**, job 2, commit **99cf684385284a1e6c4a0e8facb1b92dcf32f535**. Hosting URL: https://main.d90ik3712sg8e.amplifyapp.com. Backend: `amplify-d90ik3712sg8e-main-branch-72c6b188db` in us-east-2.

The custom-domain game is a separate deployment: `destroyaindustriesminingextension.com` → enabled, Deployed CloudFront **EC269D02M2JLD**, `d153tn5zose6mc.cloudfront.net` → `destroyaindustriesminingextension.com.s3-website-us-west-2.amazonaws.com`. No Amplify custom-domain association exists. This is configuration evidence, not a live application health test.

## Smallest proposed change — approval required, not executed

Change only `autoBranchCreationPatterns` from `["*", "*/**"]` to the explicit existing branch allowlist `["main", "codex/react-extension-rebuild"]`. Keep automatic branch creation and all automatic build flags unchanged. This removes wildcard creation for future branches and excludes the exact review branch without disabling builds. It does change future auto-discovery behavior, so requires owner approval.

After approval and that configuration change, re-read the app/branch lists, confirm no review branch has been connected in the meantime, check other repository deployment automation, create the local review branch from the final reviewed work, then push only that ref. Never push the original rebuild branch under its present build settings. Do not use a push dry run as proof of Amplify safety.

The conditional branch creation/push was not performed. No pushed commit hash or remote review URL exists. Existing commits and both worktrees were preserved. This report supersedes handoff.md's former suggestion to disable automatic builds.
