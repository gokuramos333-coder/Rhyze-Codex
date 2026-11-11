# Discount-code capability discovery (bounded RED milestone)

This is a diagnostic test artifact, **not a discount-code implementation or an owner preview**. Production files are unchanged. Source base: `6ecfbfd4352b964513ad5b7e8ff4dafb11e800bf` (fresh canonical receipt verified twice).

Run from the isolated source worktree:

```sh
npx vitest run --config experiments/discount-code-admin/vitest.config.ts --reporter=verbose
```

Expected final result: **11 passed, 2 failed, 0 skipped**. The two deliberately failing tests express the requested general-code monthly and class-pack acceptance paths. Existing checkout rejects them with `referral-invalid` and `referral-ineligible`. They are deliberately outside the default release suite rather than `.skip` or misleading green tests. Do not interpret this experiment as a successful release check.

All identities, codes, purchases, Stripe responses and waiver acceptances are synthetic. Prisma/Stripe/auth are mocked. No provider API or database is contacted. The browser test starts and closes a loopback HTTP diagnostic adapter, renders the real FinancialReportView using empty synthetic financial sources, and submits a clearly labelled diagnostic form to the actual checkout action under those mocks. It is **not** the full Next admin/member app, not a proof of real owner authentication, not a new Discounts UI, and not a Stripe redemption test. External browser traffic is blocked. No screenshot/customer data is collected.

The initial browser test failed because a wrapped select's accessible label included its options; the fixture was corrected to an explicit label/control association. Original failure logs remain outside source. No production UI was changed for that test.

The test amount is 9200 cents; exact 15% is 1380 cents and net 7820 cents. No rounding to whole dollars or reuse of the unrelated Estefany offer.

See `../REPORT.md` relative to the source root's parent for the full blockers, supported alternative and verification receipts. No Black Friday code was created. No deployment/push is authorized.
