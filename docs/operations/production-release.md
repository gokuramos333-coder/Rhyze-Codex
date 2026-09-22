# Rhyze production release

Production: `https://www.rhyzefitness.com` · Netlify project `rhyze-fitness-rhyze-2` · site `e7002b82-50f2-4760-8a35-e4f9591bec4f`.

## Release checklist

1. Inspect the currently published deploy and the reviewed source worktree. Preserve all uncommitted work. Never deploy the obsolete `rhyze-fitness-new` checkout by assumption.
2. Run the full tests, explicit disposable PostgreSQL integration tests when relevant, typecheck, lint, Prisma validation and build. Commit the reviewed source and retain a recovery archive. Do not merge, reset or clean unrelated worktrees.
3. Recheck production migration prerequisites read-only. Keep Prisma and Netlify SQL mirrors identical. Netlify applies pending migrations immediately before publication; do not also run them manually or edit its migration ledger.
4. Check the database permission **before starting an upload**. The current CLI release needs an actual production application database binding, not the monitoring/read-only binding. A missing or read-only binding is a release blocker, never a reason to publish anyway.
5. Any temporary change to **Allow personal access tokens full access to the production database** requires explicit confirmation for that release. Keep the window short, and restore OFF even if the build/upload fails. Never persist the retrieved owner connection in source, shell history, logs or global environment settings. Use deploy-scoped secrets only.
6. Build in an isolated source snapshot with its own dependencies and production configuration. Run the complete Netlify/Next adapter pipeline; **never use `--no-build`** or upload a localhost preview build. Preserve existing Stripe, Resend, auth and storage configuration.
7. Publish with `netlify deploy --prod --context production`, after inspecting the locally built output and migration bundle. **Never promote a draft/Deploy Preview to the production domain.** `--context production` alone selects build variables, not the deployed function runtime context; a promoted draft retains preview Stripe secrets. Hosted previews deliberately refuse sandbox checkout because they can be promoted. Run payment simulations locally with an isolated test database and Stripe sandbox; use previews for non-payment review. Netlify applies the release migrations during production publication.
8. Confirm the new deploy is READY, is the published deploy, and its API `context` is exactly `production`. Verify public pages, generated JS/CSS, browser/mobile icons, anonymous portal redirects, and authenticated owner/member/instructor routes. Verify runtime Stripe mode is LIVE, a live catalog price resolves, and the live webhook secret is selected. Check new schema and approved account corrections read-only. Do not charge customers, send test messages or modify attendance for smoke testing.
9. Confirm PAT database access is OFF again. Record the source commit, deploy ID, tests, migration results and any remaining gates in `docs/reviews/`.

## Why the permission step exists

The site currently has no linked Git build. The CLI's managed database binding has previously been read-only or invalid for the running application when PAT production access is disabled. That caused a draft failure; publishing such an artifact would break the live site. Do not leave broad PAT write access enabled permanently to avoid this check.

A future move to a connected Git/managed-build workflow can remove the manual CLI binding step, but linking a repository and changing deployment permissions is a separate configuration change, not implicitly authorized by a routine deploy.

Provider references: [migration lifecycle](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/), [database access control](https://docs.netlify.com/build/data-and-storage/netlify-database/access-control/).
