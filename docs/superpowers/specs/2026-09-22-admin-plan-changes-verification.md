# Admin membership-change preview — verification

Verified locally September 22, 2026. Production was not deployed or mutated. Baseline: `49361a3`; the callback work already on that baseline remains intact.

## Result

- Approved option 2: keep the original renewal date; prorate only the remaining-period difference.
- Client Memberships card offers now, next renewal, or a future date within the currently paid period; requires a Stripe quote and explicit confirmation.
- Approved-owner authorization, paid-price/customer verification, single-operation uniqueness, durable uncertainty lock, exact-key recovery, and payment-confirmed benefit changes.
- Historical purchases remain unchanged; separate invoice payment records snapshot the plan label.
- Credit conversion preserves prior use, overuse debt, cancellations, and duplicate-event idempotency. Full current-period reversals restrict access, including while paused; older-period refunds do not revoke newer paid access.
- Independent code review findings were fixed and covered with regression tests.

## Evidence

- Full Vitest run: **273 files / 1,191 tests passed**, all four local integration databases enabled, no live provider credentials.
- `npm run typecheck`: passed.
- `npm run lint`: passed, no ESLint warnings/errors.
- `npm run prisma:validate`: valid schema.
- Mirrored Prisma and Netlify additive migration SQL: byte-identical.
- `npm run build`: passed, 95 static pages generated; separate `.next-build` directory preserved the running dev preview.
- `git diff --check`: clean.
- Browser: synthetic admin client loaded; current plan, new-plan selection, start-date controls, and disconnected-Stripe inline error verified. No preview console errors. No payment request was sent to Stripe.
- Browser screenshot/viewport capture was unreliable for the full panel; do not claim a completed mobile visual sweep. Form-control widths were checked against their containers, and the temporary viewport override was reset.

## Preview

`http://localhost:3000/admin/members/preview-plan-change#memberships`

Synthetic data only. Stripe/email providers are disconnected. Review change intentionally reports that no membership/payment changed; this is not a production error.

## Release boundary

The initial review used mocked Stripe boundaries plus real disposable PostgreSQL transactions. The follow-up release check below now covers real Stripe test-mode calls. Neither is proof of live customer settlement; no real customer may be used for those tests.

Unsupported configurations fail closed: unlinked/manual/imported billing, discounts/taxes or other special Stripe settings, non-monthly products, pending invoices/changes, cancellations, freezes, and external schedules. They require explicit billing reconciliation, not a silent plan-name edit. Schema migration must precede runtime deployment.

## Real Stripe sandbox release check — September 22

`scripts/verify-plan-changes-stripe-test.ts` ran successfully against the existing Stripe test account and the explicitly guarded local `membership_plan_test` database. It used only synthetic customers, test clocks and test payment methods; no live keys, real customers, production data or outgoing studio email.

- Immediate upgrade and downgrade: actual Stripe paid proration invoices processed by the application; original monthly billing anchor retained; prior credit usage retained.
- Chosen-date schedule: actual phase transition and paid adjustment; original renewal anchor retained.
- Next-renewal change: actual renewal invoice charged the exact new price, then the application granted the full new allowance.
- Failed immediate payment: no unpaid upgrade; payment retry and duplicate processing applied access once.
- Failed renewal: expired paid period remained restricted; successful payment activated the new paid period and proper credits.
- Full refund of current funding: actual test refund updated the financial record and restricted membership access.
- Real test Checkout Session accepted the first-touch attribution metadata.

Successful run: `rhyze-test-9a2981d3-f32f-47f3-9b54-1fabcea9daa8`, exit 0. Its five test clocks were deleted and two synthetic products archived. A preceding run passed its billing assertions but encountered Stripe's restriction against archiving a product's default price during cleanup; its two products were subsequently archived and verified. No default price or live catalog was changed. The harness now reports cleanup failures instead of falsely claiming successful cleanup.

Full current suite: 276 files / 1,212 tests passed with all four disposable PostgreSQL databases enabled. Typecheck, lint, Prisma validation and optimized production build passed. **Still not deployed:** Netlify returned `netlifydb_readonly` with INSERT/UPDATE denied; publishing awaits the release-specific temporary database permission confirmation.
