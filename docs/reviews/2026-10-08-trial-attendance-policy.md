# Trial attendance policy — implementation review

Found: Published source b6a6ae1bfb6eedff43bb48c01dee8d228be8b4d0 already charges trial late cancellations at <=120 minutes and trial no-shows $10. Its fee gateway selected a default/first saved card instead of proving the card used for the trial.

Changed:
- Exact owner-supplied policy and authorization wording shared between UI, persisted purchase consent, and transactional emails. New consent version; historical consent is not rewritten.
- Required, initially unchecked authorization checkbox retains waiver/policy links and records the exact accepted text.
- Trial purchase confirmation requires an owned, paid Checkout-linked trial purchase with its TRIALING membership; query-string success alone cannot show activation. Policy appears directly below the confirmation header.
- Activation and receipt payloads carry product kind; trial emails render a bold callout even if editable email copy overrides try to remove it. Other products retain existing copy.
- Trial fees resolve the booking credit account to its owned paid, unrefunded, consented purchase, then retrieve its original Stripe PaymentIntent and still-attached card. Validate amount, currency, customer/card attachment and metadata ownership. Do not use an unrelated default card or fallback after decline. Legacy trial bookings without a credit-account snapshot qualify only through an unambiguous owned trial purchase.
- Existing fee amount/window, Stripe idempotency keys, payment accounting, other membership policies, and administrative correction/refund paths preserved. No schema migration.

Verified:
- Red regression: six new assertions failed on the old behavior, including wrong card selection and missing disclosures.
- Final 1,881 tests / 335 files passed, zero failures/skips, using a newly created isolated local PostgreSQL cluster. No production credentials or outbound delivery.
- Typecheck, lint, Prisma validation and production build passed; git diff --check passed.
- First full run retained: three unrelated route tests rejected the test harness's localhost4331 origin. Corrected harness to their explicit localhost3000 test contract; no application guard changed. Final full run passed.
- Checked actual component rendering at mobile/desktop sizes and email callout in synthetic preview. Native screenshot used after full-page browser capture distorted sizing; DOM/actual viewport were normal. Preview is not a paid checkout or inbox delivery test.
- Self-review: owned source lookup, fail-closed card provenance, unchanged nontrial branch, provider/customer-data protection and no historical consent rewrite checked. No independent reviewer claimed.

Production unchanged: deploy6ac5b6852d2f322cbf1cc388, sourceb6a6ae1bfb6eedff43bb48c01dee8d228be8b4d0 verified2026-10-08T14:20:05Z. Changes are local only, not deployed. No customer charges, messages or data edits performed. No production permission changes.

Risk/limits: A saved card can still be declined or detached, or require authentication. Those cases produce a failed fee, not a claim of payment. A no-show fee is triggered when attendance is marked NO_SHOW; this change does not invent unattended-visit detection. Missing/ambiguous legacy consent/payment provenance requires staff review. Authorization evidence supports the disclosed use; it does not guarantee winning a card dispute. Production deployment requires separate approval and guarded release verification with fresh pins.

Evidence: /Users/gokuramos/Inbox/rhyze-trial-policy/ (red.log, targeted-final.log, verification.json, tests.log, build.log, first-verification/, production-base.json, confirmation-desktop.png, confirmation-mobile.png, email-mobile.png).
