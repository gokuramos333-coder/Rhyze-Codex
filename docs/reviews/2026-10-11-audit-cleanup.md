# October 11 audit cleanup

Owner requested resolving or closing the seven repeated audit findings, with a Telegram result. Starting production: d4c4933688296766ffedc89f4925801c0e7a7fe1 / 6ac7afc1cda0d2cac709b4cd. Preserve unrelated work; no real charges/refunds/credit changes or diagnostic emails.

## Changes

- Owner-only same-origin cleanup API supports a read-only preview and exact SHA-256 snapshot confirmation in a serializable transaction. Cancel only unsent July notices and the pre-October-11 birthday backlog. Preserve per-message audit records. Approve the two inspected stock management birthday templates only when no custom copy exists; never send the backlog. Automatically expire future birthday notices delayed over 24 hours, before template approval filtering.
- Record the exact failed non-trial $10 fee as waived/not collectible in AuditLog. Preserve its FAILED attempt and all money records. Refuse changed identity, amount, eligibility or collected-fee evidence. No Stripe call or retry. Repeated cleanup returns the existing receipt.
- Fresh Stripe TEST API verified 22 exact PaymentIntent/amount/currency matches totaling $2,236.66. A server report provenance table excludes these historical test records; it does not delete them or fabricate webhook receipts. September unmatched review bucket becomes zero; verified revenue is unaffected. Amount/currency mismatches remain reviewable.
- Patch Next 15.5.27, sharp 0.35.5, brace-expansion/source-map-js and Vitest 4.1.11. Vitest migration explicitly transforms JSX and clears mock call history between tests, preserving assertions. Current npm runtime audit: zero advisories. Full audit: nine entries, seven high/two moderate, all development dependency chains stemming from braces and postcss-selector-parser. No compatible braces patch; upgrading Tailwind/ESLint major versions is deferred because it changes the styling/build system. These are tracked risks for trusted local builds, not evidence of an active customer vulnerability. Re-evaluate when patches or exposure change.
- Add limited frame/object/base CSP, SAMEORIGIN frame protection, strict-origin-when-cross-origin referrer policy, route-specific public canonical URLs and noindex account forms. This is not a comprehensive script CSP.

## Review

Self-review: cleanup is atomic, idempotent, authenticated and same-origin; snapshot changes fail closed. No payment/booking/credit mutation. No provider secret changes. Model state has no separate fee-obligation field, so waiver is a durable audit disposition rather than rewriting historical payment status. Retained API evidence excludes only exact test records.

Finance still has July/August provider-verified amounts without reliable product allocation, a manual $7 entry, and Somble imports with incomplete currency/provider provenance. Keep separate; do not invent customer gross or instructor compensation. Recent payment checks and arithmetic do not prove all historical allocation is correct.

Evidence and final release/readback receipts: ~/Inbox/rhyze-audit-cleanup-20261011/. No independent reviewer claimed. Full source tests and guarded release determine deployment status; this file alone is not release evidence.
