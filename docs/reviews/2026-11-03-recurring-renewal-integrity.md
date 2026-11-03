# Recurring membership fulfillment review — November 3, 2026

## Problem and change
A successful invoice accounting record could suppress VIP fulfillment even when the purchase-linked access still covered only the previous period. A delayed older finite-membership invoice could truncate the current service period/reset its credits, and lifecycle/checkout replay could overwrite restrictions. These were reproduced in isolated PostgreSQL tests before their respective changes.

The shared paid-period and lifecycle ordering guard now covers purchase-backed recurring memberships. Paid receipts are separate from completed access; reversed payments remain blocked. Old invoices cannot reset newer entitlements, and old checkout callbacks preserve settled purchase/payment state and cannot reactivate paused/cancelled recurring plans. Managed admin plan changes remain on their existing separate handler; one-time purchases/trials and booking-window policy are unchanged.

## Verification
- 367 test files / 2,171 tests passed, zero skips, using explicit disposable localhost databases with outbound email mocked/captured.
- Typecheck, lint and production build passed. Existing Vite/Next deprecation and simulated browser navigation warnings remain; no new lint errors.
- New integration failures observed before fixes: receipt-before-access, stale finite invoice/lifecycle, old checkout after restriction. Duplicate/concurrent and same-second payment/failure behavior verified across VIP, finite and monthly-unlimited plans, plus CANCELLED/PAUSED/EXPIRED preservation.
- Independent bounded review by renewal_integrity_review; both reported findings fixed and re-reviewed with no remaining blocker. Managed partial-state recovery is not newly implemented or universally proven.

## Production observation and limits
At approximately 15:33 UTC all 11 ACTIVE subscription-linked memberships had accounts covering their latest recorded paid periods. Their latest successful charges matched fresh live Stripe captures in a completely paginated October 1–November 3 window. This is not a provider-wide subscription inventory or verification of every delivery attempt.

The two reported VIP accounts still had current unlimited access and unused November event grants at observation time. Their selected future class dates are unconfirmed. The existing booking rule rejects dates after the current paid-through time; owner clarification about auto-renewing advance booking is pending. Do not claim these reproduced ordering bugs caused those particular reports or that their future-booking restriction is fixed by this patch.

Production remains deploy 6ae9fb668e0d58d1f2d49220 / source 8e98e4fb06f5d1bb1271a54cd376c678ffc9063d until separately approved guarded release. No charges, refunds, credit grants/revocations, booking changes, financial replays or customer messages were used for verification.

Detailed sanitized/private evidence: ~/Inbox/rhyze-vip-renewal-20261103/.

## Daily monitoring
The owner-authorized existing 5 AM Eastern audit was updated separately, retaining its schedule and single destination. It now requires all-member payment/access reconciliation, delivered-invoice deduplication/catch-up, named membership-only confirmations, birthdays within seven calendar days, and only configured milestone rules. The helper produces database-only evidence, never a provider-verified pass or messages. Five helper tests cover DST/year rollover, seven-day boundaries, leap-day omission and bounded windows. No milestone configuration exists in the inspected deployed source; report this gap rather than invent targets.
