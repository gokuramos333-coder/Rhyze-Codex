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

This is ready for local UI review, **not proof of live Stripe settlement**. Stripe calls and future schedule transitions were tested through mocked Stripe boundaries plus real disposable PostgreSQL transactions. Before a live release, exercise Stripe test-mode immediate upgrade/downgrade, chosen-date phase transition, next-renewal invoice, failed payment/recovery, and refund handling. No real customer may be used for those tests.

Unsupported configurations fail closed: unlinked/manual/imported billing, discounts/taxes or other special Stripe settings, non-monthly products, pending invoices/changes, cancellations, freezes, and external schedules. They require explicit billing reconciliation, not a silent plan-name edit. Schema migration must precede runtime deployment.
