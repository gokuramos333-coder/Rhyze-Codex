# Black Friday ticket release transition

Scope: Black Friday `cmvv9bp4g0001gt09ewtk8n57` (November 27, 7:30 PM NJ) and Fishers `cmw026ajl0001jn09jsqpqzij` (November 22, 11 AM NJ). Both: $25 single, $40 buyer + NEW friend, one VIP event credit for one attendee, or one VIP event credit + $15 for the pair. Regular membership/package credits and VIP unlimited standard-class access are excluded. Friend full name, phone and first-visit declaration are mandatory for either pair option. Owner approval permits no-attendance-history plus explicit first-visit declaration. Known attendance is rejected; identity/history ambiguity requires review. Approval is recorded; this document does not request it again.

## Mandatory release boundary — not verified by local tests

The new SQL blocks overselling and legacy mutation of linked ticket bookings. **It cannot undo an external provider fee/refund made by an old deployment before its SQL mutation fails.** New code has pre-provider guards, but old code does not. The unrelated R3 financial ownership migration is intentionally absent.

Before ANY new ticket is admitted, the publisher must establish that all old executions are retired: member/instructor transfer actions, generic commerce refunds, attendance-fee actions, checkout/webhook handlers, background jobs, and in-flight provider requests. This includes old immutable deploy URLs, Next skew-protected action routing, cached pages posting old action IDs, queued retries, and worker/cron targets. A publication lock or checkout-only ingress pause does not establish this condition; neither does an idle database snapshot. Old callbacks must be denied/retried into the new handler rather than acknowledged and dropped. Do not switch off payment credentials as a substitute.

No verified ingress/routing drain mechanism or old-action-denial receipt has been supplied to this worker. Consequently local green checks are NOT permission to open sales or evidence of a production-safe transition. Parent is sole publisher and must resolve this concrete operational release gate. If that boundary cannot be demonstrated, use a separately reviewed compatibility-first rollout before enabling ticket sales; do not silently waive the gate or import unrelated financial code.

## Migration and rollback

### Executable sales gate (November 3 completion)

`RHYZE_BLACK_FRIDAY_SALES_ENABLED` must be exactly `true` to open the new checkout. It defaults closed. The canonical event checkout route returns 503 before order creation/provider access while closed, including legacy single-ticket request payloads; it must not fall through to the old checkout. The booking page only exposes special-ticket choices when enabled. Webhook reconciliation and management are not disabled by this sales gate.

This is a rollout safeguard, not proof that old deployments are retired. Publishing this code with the gate closed also closes canonical cash checkout on that version. Enabling it requires the execution boundary above plus hosted release verification. Never enable it simply to make the option appear on production.

Fresh read-only inventory on November 3 found 355 retained Netlify deployments, including 304 ready production deployments. Production was `6ae4d61808045cd8f4d731be`, source `22fb32ba6d1980ece44010c252e5c9103b8fa58d`. No historical deployments were deleted. Those observed counts are not a substitute for a fresh inventory at release. Destructive retirement is not covered by feature approval.

`20261117160000_special_event_ticket` has identical Prisma and Netlify SQL. It wraps its changes in a transaction and locks Booking, ClassOccurrence and CreditLedgerEntry while initializing counters/installing guards, preventing an initialization gap. Rehearsal uses a fresh owned loopback UTF8 PostgreSQL cluster, not the previous worker's database or live data.

The migration introduces BlackFridayTicket, BlackFridayCapacity, and ClassOccurrence.pendingTicketSeats. pendingTicketSeats is a database-maintained projection of reserved admissions not yet represented by active linked bookings; historicalSignupCount is not repurposed. Capacity decisions add pendingTicketSeats. November 2026 finite VIP event-credit ledger writes serialize on the parent CreditAccount, including legacy writers; Black Friday reservation/release ledger records are immutable.

After ticket creation, do NOT roll back to old application handlers or drop the SQL tables/triggers. Resolve liabilities and prove the old-code boundary again before considering rollback. Preserve orders, receipts, refund records, original credit validity windows and audit logs. Local database fixtures and mocks are not provider or live-routing verification.

## Staff operation

The canonical admin roster displays HELD, PAID, REVIEW, REVERSING and EXPIRED ticket names with order-level controls; inactive expired tickets are visible for reconciliation but do not reserve seats. Each pending guest needs their own active account/current waiver and staff identity verification. No placeholder users or guest waiver inheritance.

- HELD: retry retrieves the same provider session. Only provider-confirmed unpaid expiry releases the hold/credit. Time alone is not terminal proof. If a create response was lost, staff can enter the recovered `cs_...` ID; metadata, amount and ownership are checked before provider expiry. If no provider session can be found, keep the hold and reconcile with the provider—never invent no-payment evidence.
- PAID: buyer booking plus named guest reservation; staff links the guest only after their own waiver. Existing cancelled buyer or guest booking history requires staff review BEFORE accepting another payment; repurchase/relink is not automatically supported.
- REVIEW: no admission. Staff may reconcile provider evidence or cancel/refund; there is deliberately no unreviewed eligibility override. Late paid receipt after verified expiry stays non-capacity review, never reacquires sold seats.
- Refunds: only succeeded provider Refund identities/amounts count toward terminal release, with CommerceRefund records retained. Pending/failed/uncertain refunds retain the liability; repeat cancellation uses the same idempotency key and stops after its bounded window. Original credit expiration is never extended.
- Disputes: open/uncertain disputes retain seats for review. A verified full lost dispute closes the ticket as DISPUTE_LOST while order/payment remain DISPUTED, not falsely REFUNDED. Won disputes do not auto-admit or resurrect bookings; staff may explicitly cancel/refund after verifying provider closure. Partial/mismatched dispute outcomes remain review.

## Production acceptance, owned by publisher

Pin exact reviewed source/migration hashes; obtain independent final review; run repository hosted release gates on the final committed source. Verify the production-context immutable artifact, all old execution-denial/drain receipts, runtime migration presence, protected route and asset health, and exact canonical roster/checkout presentation. Live card charges, refunds, synthetic client creation and production database mutations were not authorized to this worker and were not performed. Do not present disposable database integration results as real Stripe execution.
