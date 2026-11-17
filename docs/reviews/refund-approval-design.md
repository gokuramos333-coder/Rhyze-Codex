# Refund approval and replacement attendance fee — bounded design

Status: DESIGN ONLY / NOT DEPLOYED / NO CHARGE OR REFUND ATTEMPT.
Source pinned to 48460727d4e17484c4826b08e6087d4c18e32283. Fresh Netlify read confirmed published READY locked deploy 6af64c9412c4baaf011a55bf. No policy setting currently enforces the requested rule.

## Verified operational result

Private evidence outside this worktree: ../fresh-readonly.json and ../provider-response.json. Production read at 2026-11-13T01:31:13.604Z: database netlifydb, netlifydb_readonly, transaction_read_only=on. Exact target booking remains NO_SHOW; fee record remains fully REFUNDED, 1000 of 1000 cents. No replacement receipt exists in that application snapshot.

Fresh provider evidence at 2026-11-13T01:32:24.197Z obtained through existing authenticated OWNER `/api/admin/payments/reconcile-history`, explicit dryRun=true, financialOnly enforced by route. No credential extraction or new runtime endpoint. Provider confirms original captured $10 fee is fully refunded; exact refund succeeded, no dispute. One complete page for the bounded charge-created window; synced=0, hasMore=false. This is NOT exhaustive customer PaymentIntent reconciliation: endpoint omits uncaptured/pending intents and original-card attachment proof. It cannot authorize replacement execution alone. Login may update automation-account login state; no client writes performed.

Authorization: Melissa requested exactly one replacement $10 no-show charge following the known full refund. Do not ask for that same amount authorization again. Runtime actor must separately be an authenticated approved admin identity; do not label the automation actor Melissa. Preserve requester/authorization provenance separately.

## Cash-refund writer inventory (pinned source)

Production provider create sites found by repository scan:

| Entry | Authorization / behavior | Required treatment |
| --- | --- | --- |
| `lib/payments/attendance-fee.ts:245-286` | Shared provider refund helper has no admin gate; omits provider amount and marks local REFUNDED without independent final status retrieval | Replace with durable authorization-bound execution, not a boolean parameter; explicit amount and independent provider readback |
| `app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts:131-151` | Existing NO_SHOW clear/change automatically refunds before attendance transaction; instructors included | Correct attendance independently, never refund as an implicit toggle. Transactionally create admin-review obligation with actor/reason/exact fee/version if money is outstanding |
| Same roster `:201-214` | Failed attendance transaction attempts compensating refund | Do not delete and silently retain money. Record urgent correction obligation and require approved handling policy below |
| `app/(portal)/member/bookings/actions.ts:595-607` | Failed cancellation compensating refund | Same urgent correction obligation; distinguish uncertain transaction from proven failed operation |
| `app/(portal)/member/bookings/reschedule/actions.ts:204-211` | Failed move compensation | Same; verify committed transfer ownership before any compensation |
| `app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts:236-243` | Failed instructor move compensation | Same; concurrent duplicates must not compensate successful winner |
| `app/(studio)/admin/payments/actions.ts:72-109` | Direct admin purchase refund, actor not retained, distinct provider namespace | Gate behind shared durable approval; hidden button alone is not server disablement |
| `app/(studio)/admin/members/[userId]/actions.ts:458-538` | Approved-owner purchase refund; audit after provider call; another namespace | Same durable operation keyed to original payment, not independent surface keys |
| `lib/payments/commerce-refunds.ts:997-1199` | Called by two explicit approved-owner actions (`admin/payments/actions.ts:118`, `admin/members/[userId]/actions.ts:550`); existing durable CommerceRefund + reconciliation | Preserve explicit request authorization and existing financial invariants; integrate central approval identity without replacing with legacy purchase helper |

`scripts/verify-plan-changes-stripe-test.ts:467` is test-provider cleanup, not a production customer writer. Do not disable test cleanup. Webhook/sync refund reconciliation reads reflect money already returned at Stripe; do not block accounting of external refunds behind approval, or dashboards will lie. This inventory covers application Stripe refund creation, not manual Stripe Dashboard or provider-initiated disputes. External provider permissions require separate operational policy.

## Proposed strict policy (no automatic-refund exception assumed)

1. Every system-detected refund need persists a correction/review obligation; detection itself NEVER calls Stripe.
2. Attendance correction commits regardless of refund approval and retains correction audit. UI distinguishes “Attendance corrected; fee unchanged; admin review required” from “Refund issued.”
3. An approved admin explicitly approves exact original payment, amount/currency, reason and correction version. Persist approver, authenticated actor, authorization time, original request, operation identity and before-state before provider work.
4. One provider submission owner per original payment/obligation. Deterministic immutable payload and key are saved before submit. Pending/uncertain attempts remain reserved and visible; no automatic replay after provider idempotency expiry, no lease expiry creating a new charge/refund owner.
5. Independent provider retrieval verifies matching final refund identity/amount/currency/charge; only then settle local accounting and send truthful refund confirmation. Pending is not REFUNDED. Webhook-first and lost-ack recovery reconcile the same operation.
6. Failed-service, duplicate-charge and uncommitted-action obligations remain liabilities, not earned revenue. They must enter a monitored urgent queue; denial does not erase an obligation. An overdue/unknown obligation blocks additional collection for the same booking/payment until reviewed. Approval delay can create contractual/card-network/legal risk; owner must assign responsible admins and an escalation deadline before strict deferral is activated. No legal deadline is invented here.
7. Alternative only on explicit owner decision: prior standing admin authorization for narrowly proven failed-service/duplicate-payment corrections. That is an exception to per-case approval, not silently assumed. Default design is per-case approval for all cash refunds.

## Replacement fee action (not currently supported)

Separate “Review replacement no-show fee” from roster controls; no toggle, no reuse of original fee's idempotency key. Existing code contains no safe exposed audited replacement action, so no charge executed.

Preview inputs are server-derived exact booking/user/occurrence, original fully-refunded fee and successful refund, policy purchase/consent version, exact original card, approved admin operation and amount (1000 USD). No client-supplied actor, customer or arbitrary stored-card fallback.

Before eligible preview: retrieve live account/mode, original fee PI/charge and all refunds/disputes, original purchase PI/card ownership/attachment, and all relevant existing customer/booking attempts including pending/uncaptured/unknown states. Match both local and provider identities; fully paginate. Any mismatch, another collected fee, uncertain attempt, ambiguous attribution or changed attendance blocks execution. No latest-card fallback and no silently inferred consent.

Before submit: under shared booking/financial-operation ownership, recheck all exact versions and durable approval. Unique replacement relationship to original refunded PaymentRecord; one replacement operation lifetime per original record. Persist new operation UUID, actor/requester/authorization, source fee+PI+refund, customer/card, $10/currency, payload hash, provider key and timestamps before external call. Browser double submits share this identity. A new provider namespace is allowed ONLY inside the shared legacy-writer exclusion protocol, never as a standalone workaround.

After submit: preserve uncertain state on timeout/ack loss, retrieve exact PI/charge independently, verify paid/captured $10 USD and binding, then atomically record linked replacement PaymentRecord and audit. A replacement that itself is refunded does not unlock another automatic replacement. Original fee/refund remain immutable history. Attendance must not be toggled to collect. Never retry unknown submission.

## Concurrency and rollout prerequisites

Do NOT import the unpublished 20261024120000_attendance_fee_operations migration as a shortcut. It explicitly does not redesign new-NO_SHOW charging, and its old-writer drain is unresolved. Sources: ~/Inbox/rhyze-alert-fixes/payment/financial-fixes.md:64-72 and payment-followup-finalization skill reference.

Before executable code/release acceptance, audit every existing fee charge/refund/compensation/webhook writer into one lock/ownership protocol; prove old deployed invocations cannot resume provider writes after cutover. Publication locking or an idle SQL snapshot is insufficient; skew/immutable routes matter. Access interruption/old-deploy retirement needs separate operational approval and a tested plan. Do not disable payment credentials or widen PAT privileges.

Required native disposable PostgreSQL tests: both roster-correction/refund-approval commit orders; duplicate approvals; duplicate replacements from distinct admin sessions; competing legacy NO_SHOW/late-cancel/transfer charge; webhook-before-local-commit; lost commit acknowledgement; provider success then process loss; timeout without retry; refund pending/failure; changed attendance/card/policy/amount; compensation owed versus successful-winner ownership; rejected actor; expired keys; all cross-surface purchase refunds. Observe actual lock waiters, assert one provider submit and exact durable ledger, preserve original attendance and fees. Provider doubles are not live Stripe proof. No native financial concurrency certification is claimed in this design-only artifact.

## Decisions and exact gates

- Policy decision: strict per-case approval for corrective refunds, with named responder/escalation deadline; or explicitly scoped prior standing authorization for proven corrections. Current deployment remains unchanged pending safe implementation, review and release.
- Operations decision: approved old-writer retirement/quiescence procedure, including interruption if needed, rather than pretending a deploy lock drains actions.
- Release decision: exact final owner preview approval after backend/native concurrency verification and safe inert UI preview. This document and a synthetic preview are not deployment approval or a working charge action.
- Kat charge authorization already received. Remaining blockers are supported audited action, complete fresh provider/card/attempt proof and exact-release approval, not another generic permission to charge $10.
