# First-touch attribution and combined release readiness

September 22, 2026. Implementation and local/provider tests complete; **not published**.

## Changes

- Edge-safe middleware captures the first page visit in `rhyze_attribution`: fbclid, five UTM fields, referrer, landing pathname and captured timestamp. Cookie expires in 90 days, SameSite=Lax, Path=/, readable by client JavaScript, Secure on HTTPS. Any existing cookie, including malformed/empty values, is never overwritten.
- Static assets, API requests and prefetches do not claim the first visit. No database request or background job was added to middleware. Responses setting the cookie are private/no-store.
- New public member signups save the ten requested nullable `source_*` fields. Labels follow the supplied priority. Invalid input cannot control the label or break signup; long values are bounded for cookie and Stripe limits. Credentials/account-link tokens are redacted from captured URLs.
- Existing member records are not backfilled or changed. Staff-created/imported accounts do not inherit a staff browser's source. Unknown historical sources display `—`, not a manufactured Direct label.
- Membership, event, admin-assisted membership and legacy-recovery Checkout Session creation include the saved member fields as flat Stripe metadata, when available. Existing price, return URL, pixel and analytics behavior is unchanged. No localStorage added.
- Admin → Clients has a visible Marketing source column.
- Additive migration `20260922030000_member_first_touch_attribution` is mirrored byte-for-byte for Prisma and Netlify; no UPDATE/backfill statements or defaults.

## Evidence

- Browser first visit on isolated `127.0.0.1:3000`: `/join?utm_source=meta&utm_medium=paid_social&utm_campaign=test&fbclid=abc123`.
- Created only `attribution-browser-0922@example.test` in the local synthetic preview database. Server-side record: Meta Ad / abc123 / meta / paid_social / test / `/join`, captured at `2026-09-22T04:42:14.480Z`.
- Revisited `/join` without parameters. The stored label, click ID, campaign and captured timestamp were unchanged. Admin client row visibly showed Meta Ad.
- Focused tests verify cookie attributes/immutability, label ordering, invalid input, size bounds, new-account persistence, duplicate-signup protection, existing-null records and all relevant checkout metadata boundaries.
- Full Vitest run: **276 files / 1,212 tests passed**; callback, identity, VIP and membership-plan PostgreSQL integration suites enabled against explicit disposable local databases.
- Typecheck, lint, Prisma validation, optimized production build (95 pages), migration mirror comparison and `git diff --check`: passed.
- Independent read-only review found no actionable attribution issues. A follow-up test-harness cleanup reporting issue was fixed.
- Actual Stripe test-mode membership-change/recovery/refund checks and test Checkout Session metadata passed. See `docs/superpowers/specs/2026-09-22-admin-plan-changes-verification.md`.

## Production state and remaining release gate

- Production stayed on READY deploy `6ab1dfc34adb574a165542e3`. No production deployment, migration, payment, email or member-data write was performed.
- Today's combined release includes contact callbacks with a 9 AM earliest time, admin membership plan changes, and first-touch attribution. Pending migrations: `20260922010000`, `20260922020000`, `20260922030000`.
- Read-only production inspection confirmed these schema additions are not present yet. Callback prerequisites are configured: EMAIL_DELIVERY_ENABLED=true, Resend key and sender present, CONTACT_FORM approval matches `2026-07-27-v3`.
- Netlify owner-binding request returned `netlifydb_readonly`; PostgreSQL confirmed INSERT and UPDATE denied. Upload/publication must not use this binding.
- Requested explicit confirmation for temporarily enabling PAT production database access for this release, restoring OFF immediately afterward. Awaiting response. This is a security-permission gate, not missing general deployment approval.
- After confirmation: build full Netlify adapter from an isolated committed snapshot with application write binding; inspect immutable artifact/migrations; publish once; restore permission OFF; run production asset, route, schema and authenticated portal checks before announcing completion on Telegram.

## Reproduction

Use existing clean local test configuration for `npm test -- --reporter=dot`, `npm run typecheck`, `npm run lint`, `npm run prisma:validate`, and `npm run build`.

For the explicit Stripe release check, run `scripts/verify-plan-changes-stripe-test.ts` with `PLAN_CHANGE_TEST_DATABASE_URL` pointing only to `127.0.0.1/.../membership_plan_test` and EMAIL_DELIVERY_ENABLED=false. Supply an existing test key through non-echoed stdin; never store it in source, logs, shell history or production configuration. The script rejects live keys and verifies the expected test account before creating fixtures.
