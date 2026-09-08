# Attendance Cancellation Fees Design

**Date:** August 21, 2026
**Status:** Approved by the owner's standing instruction to use the recommended option without another approval
**Deployment:** Local implementation only until deployment is explicitly requested

## Goal

Make class cancellation, rescheduling, late-cancellation, and no-show outcomes predictable, visible, and enforceable without changing specialty-event cancellation rules.

## Verified Current State

- Standard-class cancellation uses a two-hour cutoff. More than two hours returns a reserved credit; two hours or less loses it. The cancellation action does not charge Stripe.
- Member rescheduling is blocked at two hours, charges non-VIP members $10 between two and six hours, and is free for VIP.
- Staff-marked no-shows attempt $10 for intro-trial members, $5 for standard clients or repeat membership no-shows, and waive the first active-membership no-show.
- Fee charging depends only on the Stripe Customer invoice default payment method, so an attached card without that default can be skipped.
- The intro-trial checkout does not collect a trial-specific cancellation-policy acknowledgement.
- The live policy advertises the old $10 transfer fee and VIP fee waiver.

## Policy Matrix

The time boundaries are inclusive: exactly six hours is inside the transfer window, and exactly two hours is a late cancellation.

| Window | Standard membership, class pack, or single class | Intro trial | VIP |
|---|---|---|---|
| More than 6 hours | Cancellation allowed; reserved credit returned; no fee | Cancellation allowed; no fee | Cancellation allowed; no fee |
| More than 2 through 6 hours | Reschedule to an eligible class within 14 days; $5 charged only on confirmation | Cancellation/reschedule warning; no fee | Reschedule to an eligible class within 14 days with no transfer fee |
| 2 hours or less | Late cancellation; credit not returned; $10 fee | Late cancellation; $10 fee | Late cancellation; $10 fee |
| No-show | $10 fee | $10 fee | $10 fee |

Specialty events keep their existing six-hour cancellation and 30-day event-credit rules. Complimentary owner/staff bookings never receive automatic fees.

## Customer Experience

Every Cancel action opens a confirmation dialog. The server recomputes the rule after confirmation; client-supplied plan names, fee amounts, and time windows are never trusted.

### Dialog copy

- Advance standard cancellation: “Thanks for letting us know early. If you cancel now, your class credit will be returned to your account.”
- Advance unlimited cancellation: “Thanks for letting us know early. You can cancel this booking with no fee.”
- Standard 2–6 hour window: “This class starts within 6 hours. You may move this booking to another eligible class within 14 days. A $5 transfer fee will be charged to your saved card only after you choose and confirm the new class.”
- Trial 2–6 hour window: “This class starts within 6 hours. No fee applies right now, but early notice helps another Rhyzer take the spot.”
- VIP 2–6 hour window: “This class starts within 6 hours. As a VIP member, you may move the booking to another eligible class within 14 days with no transfer fee.”
- Standard late cancellation: “This class starts within 2 hours. If you cancel now, the booking will be marked as a late cancellation and the class credit will not be returned.”
- Trial late cancellation: “This class starts within 2 hours. A $10 late-cancellation fee will be charged to your saved card if you cancel now.”
- VIP late cancellation: “This class starts within 2 hours. A $10 late-cancellation fee will be charged to your saved card if you cancel now.”

Each dialog offers a safe “Keep my class” action. Transfer-window dialogs route to the reschedule picker instead of charging immediately. Fee-bearing late cancellations state the exact amount before confirmation.

## Trial Checkout Consent

The intro-trial purchase form requires a separate checkbox acknowledging:

1. the liability waiver and studio policies;
2. the seven-day trial covers standard classes only;
3. cancellations within two hours and no-shows incur a $10 fee charged to the saved payment method; and
4. the payment method may be saved and used off-session for disclosed attendance fees.

The server rejects intro-trial checkout without this acknowledgement and stores an immutable acceptance timestamp and policy snapshot on the Purchase record. General signup waiver acceptance remains unchanged.

## Billing and Records

- Saved-card resolution first uses the Customer invoice default and then an attached card PaymentMethod.
- Stripe PaymentIntents use `confirm: true`, `off_session: true`, metadata containing booking/member/fee type, and a deterministic idempotency key.
- PaymentRecord distinguishes `TRANSFER_FEE`, `LATE_CANCELLATION_FEE`, and `NO_SHOW_FEE` so revenue and member history remain accurate.
- Successful and failed attempts are recorded. A failed late-cancellation charge does not keep a member trapped in the class; the booking is cancelled and the failure is shown for follow-up.
- A reschedule fee is charged only after the destination passes availability and overlap checks. If the final move loses a race after payment, the payment is refunded.

## Booking Access Snapshot

New bookings store the access product kind in `Booking.policySnapshot`. Existing bookings fall back to the reserved credit's source product and then current active memberships. VIP wins over intro trial only when no booking-time snapshot exists.

## Testing

- Pure policy tests cover every plan/window boundary and complimentary/event exclusions.
- Transfer tests cover $5 standard, free trial, $10 VIP, and the two-hour block.
- No-show tests cover the $10 standard, intro-trial, and VIP fee plus the complimentary exemption.
- UI tests verify every cancellation opens a dialog and uses the correct copy/action.
- Checkout tests verify intro-trial acknowledgement is required and snapshot data is produced.
- Payment gateway tests verify saved-card fallback, exact amount, metadata, idempotency, and failed-attempt recording.
- Full typecheck, Vitest suite, Next production build, and local browser verification are required before completion.
