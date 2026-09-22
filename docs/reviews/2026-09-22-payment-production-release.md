# September 22 payment recovery production release

## Published

- Production: https://www.rhyzefitness.com
- Source: `6c20eaa96d720dc17053625376c7bf48dc6d814c` (997 tracked snapshot files compared before publication).
- Deploy: `6ab2a8b3789eb5b336e1a842`, READY, published `2026-09-22T16:12:59.304Z` (12:12:59 EDT).
- Netlify API confirms this is the published deploy and its actual context is `production`, not a promoted preview.
- Full Netlify production build, Next.js adapter, native bindings, functions, middleware, and 143 uploaded assets completed successfully. No `--no-build` or draft promotion was used.
- Includes the already-approved callback calendar (9 AM earliest), admin membership plan changes, and first-touch attribution, as well as the Stripe-mode isolation/recovery fix.

## Safety and verification

- User explicitly approved temporary production database permission for this release. Restored OFF after publication; subsequent Netlify API request returned the `netlifydb_readonly` deployment-token binding. No credentials were rotated or printed.
- An initial attempt stopped before upload with project-link resolution failure. Access was restored OFF while diagnosing. Linked the isolated snapshot, confirmed site identity using `status --json`, and checked production build/database/Next.js setup with `build --dry` before retrying.
- Fresh pre-release checks: 279 test files / 1,227 tests passed, including disposable PostgreSQL integration suites; typecheck, lint, Prisma validation, `git diff --check`, and production build passed.
- Authenticated HTTP checks, using existing automation credentials, passed OWNER, INSTRUCTOR, and MEMBER allowed routes and cross-role restrictions. Login updates only those automation accounts' normal last-login timestamps. No customer credentials were used or changed.
- The production-rendered admin integrations page reports Stripe **Mode: live**, checkout ready, and webhook secret configured.
- Nine public routes/icons returned 200; 24 discovered generated JS/CSS assets returned 200. Anonymous admin/member/instructor routes redirected to sign-in.
- Browser inspection confirmed styled memberships and the selected $7 trial form in the existing owner's member portal. No waiver/fee authorization was accepted and no Buy button was submitted.
- Read-only production schema inspection confirms CallbackRequest, MembershipPlanChange, membership billing-lock/plan-change fields, and all ten nullable User source fields. Prisma/Netlify SQL mirrors matched before publication.
- Live first-touch cookie capture retained `utm_source=meta` and `fbclid=abc123`; a subsequent request did not overwrite it. No test account was created in production.
- Live callback availability endpoint returned 200 with 15-minute slots in America/New_York.

## Customer payment follow-up

No customer was charged, no paid membership was created, and no booking or customer email was sent by these checks. The runtime configuration is corrected; actual card approval and post-payment fulfillment still require customer payment.

- Susan: retry the $7 trial from `/member/membership?plan=intro-offer#available-plans`. Six earlier failed attempts did not create a Stripe session/payment intent.
- Lori: retry Single Class from the member membership page. Her recorded failed attempt did not create a Stripe session; the precise old provider error was not independently captured.
- Amy: use the original Rhyze recovery invitation (not the expired direct Stripe test checkout), authorize $199 September recovery and recurring billing. The guarded test-customer/session repair runs on consent. Next renewal October 4, then monthly on the 4th.
- Kim-Marie: original Rhyze recovery invitation, $199 September recovery, next renewal October 3 and monthly on the 3rd.
- Jolie: original Rhyze recovery invitation, $92 September OG recovery, next renewal October 3 and monthly on the 3rd. Eight-class allowance reconciles prior usage rather than adding duplicate credits.
- August payments are not charged again. Completing checkout is required before these accounts gain a Stripe-backed recurring subscription.

## Limitations

- No live card transaction was submitted. Unit/integration tests plus live configuration/portal checks do not guarantee a customer's bank will approve their payment.
- Webhook secret presence was checked, not a new live signed payment delivery. Live catalog existence was established during incident diagnosis, not an independent live-secret API retrieval during this release.
- Previously imported sandbox ledger records were preserved for audit; no financial-history cleanup was included. See the incident report for this separate follow-up.
