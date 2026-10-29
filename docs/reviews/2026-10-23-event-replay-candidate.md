# Paid-event replay candidate — NOT RELEASE APPROVED

Base: 9fe5096097f5db9f156f4cfa196358a3b8cf6801. Scope: AUD-1023-02 existing paid event at capacity; no framework changes.

The candidate preserves CONFIRMED/ATTENDED fulfillment without changing booking history, sends cancelled booking/occurrence cases to review instead of reviving them, retains refund guards and serializes READ COMMITTED event checkout writers by occurrence before order/booking locks.

Real PostgreSQL RED reproduced false review, booking history mutation, cancellation revival and two simultaneous READ COMMITTED seats for capacity one. Candidate regression suite now passes, including historical capacity and refund states.

**Do not publish this candidate as fully verified.** Independent review found a mixed SERIALIZABLE webhook / READ COMMITTED member-writer safety gap. A separately retained real PostgreSQL reproduction with an established webhook snapshot and later committed member seat still produced two confirmed bookings for capacity one. The advisory lock does not refresh a preexisting serializable snapshot. The review also flags management cancellation that reads its roster before its transaction and does not participate in the occurrence lock. Those broader coordination paths were not changed by this narrowly scoped candidate.

The introduced ATTENDED demotion finding was reproduced RED and corrected; attendance records and booking history now have regression assertions. Remaining review findings are not waived by the green regular suite.

Evidence/report: ~/Inbox/rhyze-oct23-event-fix/REPORT.md, independent-review.md, mixed-isolation.log and audit-mixed-event-capacity.test.ts. The isolated audit specimen is outside the committed test suite and remains a documented failing acceptance criterion, not a passing test or skipped green gate.

Current production/order remain unchanged. Production release requires both resolving remaining safety criteria and separate explicit hosted-release approval. Exact-order status-only repair must use a reviewed audited application operation with fresh provider proof, not raw SQL or general checkout replay. See the saved REPAIR_PLAN.md. No charge/refund/booking/credit/email changes are authorized for smoke tests.
