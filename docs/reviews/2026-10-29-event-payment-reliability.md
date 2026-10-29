# Event payment replay and status correction — release review

Base: production `0f9e2d1ef33933ffba29f741ee98d5a9aeef2602`, deploy `6ae0e269f234dda13603a4ec` (freshly read October 29).

Problem: reconciliation treated a customer's existing last seat as unavailable capacity and changed the already-paid order to FULFILLMENT_REVIEW. Replay could also overwrite booking history. The original October 23 candidate exposed a mixed SERIALIZABLE/READ COMMITTED capacity race and was never released.

Change: preserve confirmed/attended bookings; check capacity only for new fulfillment; preserve cancellations and refunds. Coordinate all affected occurrence/order/booking writers with parent-first locks and row write fences, so an old serializable snapshot retries rather than oversells. Read cancellation rosters within the transaction. Keep current production's waitlist and schedule changes. Refund locks also acquire the occurrence first, preventing an inversion when opening notifications are queued. Successful StripeEvent insertion is conflict-safe; duplicate processing still uses the transactional processed gate. Payment sync cannot overwrite a concurrently committed refund/dispute.

Existing false label: a new same-origin, approved-owner-only POST `/api/admin/payments/reconcile-event-review` defaults to a read-only preview. It checks live account, intent, charge, Checkout binding, amount, currency, refund/dispute absence, paid payment record, exact order/booking versions, existing event booking, and absence of credit/transfer/conflicting-order history. A confirmed correction changes only order status plus updatedAt and atomically writes an AuditLog. It never calls checkout fulfillment, creates a financial transaction, changes a seat/credit/attendance, or sends email. Duplicate correction is a no-op. Cancelled/ambiguous bookings remain in review.

Verification before release:
- Fresh published-source PostgreSQL reproduction: 9 failing / 6 passing cases, including the own-seat regression.
- Integrated candidate: 367 files, 2,174 tests pass, zero failures/skips; actual PostgreSQL races and signed synthetic local webhook requests included.
- 30 paid-event replay cases; 18 status-correction PostgreSQL cases including concurrent duplicate requests, refund/cancellation drift, read-only preview and audit-write rollback; five route permission/origin/configuration cases.
- Earlier candidate lint/type/schema/build passed; the guarded check must repeat checks for this final source.
- Self-review only for this integration; do not claim fresh independent review. Historical independent review applies to its original candidate only. High-risk release requires human review/authorization under the product-engineer skill.

Email: current production already has bounded connection-only retries and a five-minute worker. Fresh runtime and read-only queue evidence confirms recovery, no backlog/failures. No blind resend or retry policy change. Browser Stripe login is active; provider-side live delivery was inspected separately. Login does not operate payment processing and cannot be guaranteed permanent.

No schema/configuration/provider destination changes. PAT full production DB access must stay OFF. Use only the guarded Git-hosted release with fresh live pins, then verify the exact artifact and current payments/queue. No synthetic production financial events. Preserve all unrelated checkouts.

Evidence and execution plan: `/Users/gokuramos/Inbox/rhyze-reliability-fix-20261029/`.
