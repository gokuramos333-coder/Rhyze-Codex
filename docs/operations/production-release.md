# Rhyze production release

Production: `https://www.rhyzefitness.com` · Netlify project `rhyze-fitness-rhyze-2` · site `e7002b82-50f2-4760-8a35-e4f9591bec4f`.

## Git-hosted releases (new default)

`npm run deploy:production -- --expected-deploy DEPLOY_ID --base-ref SOURCE_COMMIT`
now uses `scripts/release/hosted.ts`. `npm run release:hosted` is an alias. Supply
fresh provider pins and the same explicit disposable PostgreSQL test connections
listed below. The command runs the complete existing `release:check` before it
allows a hosted build. It does not enable PAT production database access.

The existing Netlify site is connected to `gokuramos333-coder/Rhyze-Codex`, branch
`production-reviewed`, using a repository-only read-only deploy key. `main` is
not the production branch. No push webhook or GitHub status token is required:
the command explicitly requests each hosted build through the Netlify API.
Netlify automatic publication must remain locked between releases.

The hosted command checks the current source/site/configuration, PAT access OFF,
and the repository/branch/lock settings. It then runs the full existing checks,
pushes only an ancestor-preserving revision with an explicit remote lease, and
sets a temporary production/build-only approval for that exact SHA and nonce.
The hosted guard verifies source contents against Git before and after the build,
LIVE payment configuration, and managed database privileges in a read-only
transaction. A SHA-256 identity derived from the existing database endpoint/name
must match the managed connection; credentials are not included in that identity
or in the public build receipt.

Only the exact READY **production-context** Git artifact with the matching
`/_rhyze-release.json` receipt may be published. Live/configuration pins and PAT
restriction are rechecked before publication. This is not preview promotion.
The new production deploy is locked immediately, authenticated live checks run,
and the temporary approval is removed. Cleanup attempts approval removal,
publication locking and PAT verification independently, even after errors.

A `VERIFIED` receipt under `.releases/hosted-*/release.json` means all required
checks completed. `BLOCKED` means publication was not attempted; it may still
leave a branch push or hosted build. `REQUIRES_ATTENTION` means publication or
cleanup needs inspection. Never retry an uncertain publication automatically.
The provider publication API is not compare-and-swap; other administrators must
not publish/unlock/change production settings during a guarded release.

One-time configuration: preserve the current live source, lock its deployment,
connect the dedicated branch with builds stopped, then enable hosted builds after
review. Do not attach divergent `main` to production. Deploy keys are scoped to
read this repository; the GitHub CLI token is never copied to Netlify.

## Legacy local CLI procedure (explicit exception only)

The following documents the older local upload path and its temporary PAT
permission requirement. It is no longer the default npm publishing command.
To use it for an explicitly approved recovery, invoke
`npx tsx scripts/release/production.ts publish` with the pinned inputs. Do not
silently fall back to it when the hosted workflow is blocked.

## Local check and legacy workflow details

Use the reviewed `rhyze-sign-in-plan-repair` repository, not the obsolete `rhyze-fitness-new` checkout. `npm run deploy:production` now runs the guarded release workflow; invoking it without the pinned release inputs does **not** publish anything. Do not bypass it with a raw CLI upload, preview promotion, or `--no-build`.

```sh
# One-time CLI setup, if the pinned version is not already cached.
npm exec --yes --package=netlify-cli@27.8.0 -- netlify --version

# Set the explicit disposable PostgreSQL test connections in your process.
# DATABASE_URL and CALLBACK_TEST_DATABASE_URL use callback_test;
# IDENTITY_TEST_DATABASE_URL and VIP_TEST_DATABASE_URL use identity_migration;
# PLAN_CHANGE_TEST_DATABASE_URL uses membership_plan_test.
# Only localhost/127.0.0.1 and those exact test databases are accepted.
# Tests require the current schema and the case-insensitive User-email index.
# The script does not migrate, seed, reset, or recreate any database.

# Read the actual currently published deploy ID and its source commit first.
# Replace the uppercase placeholders below; do not reuse yesterday's values.
npm run release:check -- --expected-deploy DEPLOY_ID --base-ref SOURCE_COMMIT

# Only after explicit release approval and the temporary DB permission approval:
npx tsx scripts/release/production.ts publish --expected-deploy DEPLOY_ID --base-ref SOURCE_COMMIT

# Restore PAT database access OFF immediately, even after a failed command.
# Verify the NEW published deploy ID, or the existing ID for a read-only check:
npm run release:verify -- --expected-deploy PUBLISHED_DEPLOY_ID
```

`check` makes no deployment, does not obtain a privileged application DB binding, and does not change Netlify permissions. It builds a committed clean-source archive with its own `npm ci`, runs the complete test suite (zero skipped tests), typecheck, lint, Prisma validation, and production build. The actual source directory is created in OS temporary storage **outside all ancestor package/Git roots**: Netlify CLI otherwise can silently select a parent checkout. It compares newly added migration mirrors, refuses edits to previously deployed SQL, checks the existing project's identity/configuration, runs safe authenticated HTTP checks, links only the local isolated snapshot, verifies the CLI resolves that snapshot's configuration, and inspects the Netlify build configuration. It ends `CHECKED_NOT_DEPLOYED`, not “ready to charge customers.” Normal automation-account logins update their session/last-login state; no client purchase, booking, or email is created.

`publish` repeats those checks and then requires an actual writable application binding, verifies its privileges in a **read-only transaction**, rechecks source/config/deploy identity, and runs the complete Netlify production build. Database URLs are held in memory and passed only to that deploy, never saved in the report. Netlify CLI requires deploy-scoped secret values as process arguments: run only on a trusted machine, never copy the command line into chat/history, and do not enable process/debug logging. The script does not grant database access itself. If permission remains enabled after publication, the result is `REQUIRES_ATTENTION` until it is restored OFF and `release:verify` passes.

Recovery source archives, checksums, a Git recovery bundle, test results, and a sanitized `release.json` receipt are retained under ignored `.releases/` with a private directory; the receipt identifies the separate temporary build directory. No cleanup/reset is performed. Keep the recovery files until the release has been reviewed and backed up; they consume local disk, not Netlify deployment credits. A failed/uncertain publish is never retried or rolled back automatically—inspect the actual published deploy and migration results first.

A per-site lock under `~/.cache/rhyze-releases/` serializes supported releases on this machine, across checkouts. A crashed process leaves its lock behind intentionally: inspect whether it is still running and the actual Netlify state before removing that **specific** stale lock. The local Netlify safety plugin checks the exact source file set, regular-file types, hashes, resolved build root, current published deploy ID, and environment fingerprint both before the build and in `onPostBuild` (after function bundling, before deployment). An added route, symlink substitution, or a competing release/configuration change detected there aborts publication. Production builds without the guarded manifest are rejected. Provider-side publication is not atomic compare-and-swap: do not publish manually or from a second machine during a release; a tiny final upload/publication race remains outside the local lock's control. See [Netlify build-event ordering](https://docs.netlify.com/extend/develop-and-share/develop-build-plugins/#plug-into-events).

**Masked credentials:** Netlify's API does not reveal the Stripe secret. The preflight rejects visible test keys, missing production scopes, a wrong site URL, and relevant settings changed since the running release was created. For masked values, it also requires the existing authenticated admin integrations page to report LIVE checkout/webhook configuration. This is configuration evidence, not an API-key authentication test or a card transaction. Key rotations/new configuration require a separately reviewed procedure; do not bypass the guard or silently approve the changed baseline. After publication, runtime checks run again.

**Coverage limits:** HTTP smoke checks verify expected pages, role boundaries, JS/CSS MIME types and nonempty bodies, icons, and LIVE configuration. They do not exercise a real card charge, settlement, email delivery, browser interactions, or every possible user flow. External bank/provider outages remain possible. This workflow cannot prevent someone with Netlify access from bypassing it manually. No continuous jobs or extra scheduled deployments were added.

## Release checklist

1. Inspect the currently published deploy and the reviewed source worktree. Preserve all uncommitted work. Never deploy the obsolete `rhyze-fitness-new` checkout by assumption.
2. Run the full tests, explicit disposable PostgreSQL integration tests when relevant, typecheck, lint, Prisma validation and build. Commit the reviewed source and retain a recovery archive. Do not merge, reset or clean unrelated worktrees.
3. Recheck production migration prerequisites read-only. Keep Prisma and Netlify SQL mirrors identical. Netlify applies pending migrations immediately before publication; do not also run them manually or edit its migration ledger.
4. Check the database permission **before starting an upload**. The current CLI release needs an actual production application database binding, not the monitoring/read-only binding. A missing or read-only binding is a release blocker, never a reason to publish anyway.
5. Any temporary change to **Allow personal access tokens full access to the production database** requires explicit confirmation for that release. Keep the window short, and restore OFF even if the build/upload fails. Never persist the retrieved owner connection in source, shell history, logs or global environment settings. Use deploy-scoped secrets only.
6. Build in an isolated source snapshot with its own dependencies and production configuration. Link that snapshot with `netlify link --id e7002b82-50f2-4760-8a35-e4f9591bec4f`, verify `netlify status --json` reports the expected linked site, and inspect `netlify build --dry --context production` before opening the permission window. If a site-ID deploy falls back to project-name resolution, stop and verify the link; do not create a new project or publish an offline-resolved configuration. Run the complete Netlify/Next adapter pipeline; **never use `--no-build`** or upload a localhost preview build. Preserve existing Stripe, Resend, auth and storage configuration.
7. Publish through the guarded `npm run deploy:production` command above. Internally it uses `netlify deploy --prod --context production` and the full build, after inspecting the source, output, and migration bundle. **Never promote a draft/Deploy Preview to the production domain.** `--context production` alone selects build variables, not the deployed function runtime context; a promoted draft retains preview Stripe secrets. Hosted previews deliberately refuse sandbox checkout because they can be promoted. Run payment simulations locally with an isolated test database and Stripe sandbox; use previews for non-payment review. Netlify applies the release migrations during production publication.
8. Confirm the new deploy is READY, is the published deploy, and its API `context` is exactly `production`. Verify public pages, generated JS/CSS, browser/mobile icons, anonymous portal redirects, and authenticated owner/member/instructor routes. Verify runtime Stripe mode is LIVE, a live catalog price resolves, and the live webhook secret is selected. Check new schema and approved account corrections read-only. Do not charge customers, send test messages or modify attendance for smoke testing.
9. Confirm PAT database access is OFF again. Record the source commit, deploy ID, tests, migration results and any remaining gates in `docs/reviews/`.

## Why the permission step exists

Before the Git-hosted migration, the site had no linked Git build. The CLI's managed database binding has previously been read-only or invalid for the running application when PAT production access is disabled. That caused a draft failure; publishing such an artifact would break the live site. Do not leave broad PAT write access enabled permanently to avoid this check.

The Git-hosted workflow above replaces this manual CLI binding step. Its repository connection and deployment changes were separately approved by the owner; permanent PAT production database write access is not part of that approval.

Provider references: [migration lifecycle](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/), [database access control](https://docs.netlify.com/build/data-and-storage/netlify-database/access-control/).
