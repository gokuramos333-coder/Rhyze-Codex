# Assigned Rosters and Member Spend Design

## Scope

Assigned class entries must open the correct attendee roster directly. Instructor routes remain scoped by the authenticated instructor ID, while Admin routes remain inside the owner-only Admin layout. Each class row includes an explicit “View attendees” cue so the destination is clear.

Admin member profiles show current-calendar-year spend and lifetime spend. Totals use the native Rhyze payment ledger plus imported Somble transactions. The native ledger covers product purchases, membership renewals, events, merchandise, and transfer fees. Native amounts are net of refunds and count only succeeded, partially refunded, or refunded records; failed or disputed records do not count. Somble transactions use their preserved transfer date and amount. Both totals link to the member’s Payment History detail, which remains Admin-only.

## Data Flow

- Instructor schedule → `/instructor/classes/[occurrenceId]/roster`; existing roster authorization enforces `instructorId = current user`.
- Admin instructor record → `/admin/schedule/[occurrenceId]/roster`; the Admin layout enforces owner access.
- Member spend helper receives native payment-ledger and Somble records and returns `{ yearlyCents, lifetimeCents }` using the America/New_York calendar year.
- The Admin member page renders both values as linked metrics targeting `#payment-history`.

## Error and Security Behavior

Missing or unauthorized class occurrences continue to return not found. Spending data is never added to member or instructor portals. Imported Somble transactions remain read-only and do not gain native refund capability.

## Verification

Unit tests cover net refunds, excluded pending purchases, current-year filtering, historic lifetime totals, and direct roster destinations. TypeScript, the complete test suite, and the production build must pass.
