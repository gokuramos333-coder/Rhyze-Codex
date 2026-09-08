# Automatic Event Cancellation Credits Design

## Goal

Automatically return one event-only booking credit when a member cancels an event more than six hours before its start, without admin approval or manual credit entry.

## Business rules

- Event cancellations made more than six hours before the event start are `CANCELLED` and receive one event-only credit.
- Event cancellations made six hours or less before the event start are `LATE_CANCELLED` and receive no event credit.
- A returned event credit can book any eligible Rhyze event regardless of the original or replacement event price.
- A returned event credit cannot book a standard class.
- A newly issued event credit is valid immediately and expires exactly 30 days after the cancellation timestamp.
- Re-cancelling an event that was booked with an existing event credit releases that same reservation; it does not extend the credit's original expiration date.
- Issuance is idempotent per cancelled booking through the existing `event-cancellation:<bookingId>` return key.
- The member cancellation email states whether the event credit was returned and gives its expiration date.

## Credit visibility

- Member Home shows separate `Available class credits` and `Available event credits` totals.
- Member Membership shows the same separate totals.
- Admin Client Profile shows the same two totals and keeps each active credit account's expiration detail.
- Event-credit totals include only active, non-expired event-only accounts with positive ledger balances.
- Class-credit totals exclude event-only accounts.

## Gracie correction

- The existing correction utility must identify Gracie Rinkle by `grace481@gmail.com` even if the booking has already been cancelled.
- It must ensure her eligible event booking is `CANCELLED`, ensure exactly one idempotent event-only credit exists, and update that credit to the new end-of-following-month expiration.
- The utility remains guarded by `--apply` and prints the member, event, balance, and expiration after correction.

## Error handling and auditability

- The booking cancellation, credit issuance/release, notification enqueue, and waitlist handling remain inside one database transaction.
- Repeated cancellation requests cannot create duplicate credits.
- Existing ledger entries remain the audit trail; no cash refund is created by this rule.

## Verification

- Unit tests cover the exact six-hour boundary, the 30-day calculation across month/year boundaries, event/class credit separation, and idempotent correction behavior where practical.
- Run focused Vitest tests, the full test suite, TypeScript typecheck, and the production build.
