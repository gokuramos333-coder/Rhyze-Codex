# Member, Payment, and Instructor Operations Design

## Scope

This change removes redundant membership launch copy, tightens conversation layout, makes member transactions actionable, formalizes cancellation requests, and expands instructor operations without changing the existing Rhyze visual system.

## Money and credits

Native Rhyze purchases remain the authoritative source for Stripe refunds. A full native refund reverses the remaining payment amount, cancels related membership access when applicable, expires credits granted by that purchase, and reverses its referral commission. Imported Somble transactions remain read-only payment history because the new platform does not own their original Stripe charge.

“Return 1 class credit” is separate from a refund. It creates an audited credit account with one credit, a validity start of the action time, and an expiration exactly 14 days later. A unique transaction reference prevents the same purchase or Somble transaction from receiving the same returned credit twice.

## Membership cancellation

Cancellation remains management-approved. The member must provide a reason, sees a confirmation dialog before submission, and sees the 14-day notice rule. The server stores the reason and rejects blank cancellation reasons. The request and admin review show whether it was submitted at least 14 days before the current renewal date. Stripe monthly subscriptions keep their default billing anchor, so a membership opened on August 11 renews on September 11.

## Instructor operations

Instructor access can be approved or revoked by an owner. Revocation disables the public instructor profile, referral code, and instructor role access. Each instructor profile stores optional standard-class and specialty-event pay rates editable only by Admin. Operational “booked class value” and redundant waiver status are removed.

Referral dashboards show one selected range at a time: weekly, bi-weekly, monthly, or custom dates. Each result lists the referred client, purchased item, commission, status, and date. Referral codes remain usable once per member account; paid monthly memberships earn $20 and a $25 drop-in earns $5.

## Rosters

Assigned-class links open the instructor-owned roster. Each named attendee shows their booking status, payment/access source, and current plan. No instructor can query another instructor’s occurrence.

## UI cleanup

The “Memberships are open” promo blocks and redundant member-portal sentence are removed. Member and admin chat bubbles stay visually grouped by using a modest indentation instead of pushing replies to opposite screen edges. Client pages remove lifetime/spending-period summaries and expose transaction details directly in Payment History.

## Verification

Business-rule tests cover cancellation reason and notice timing, 14-day returned-credit expiration, referral eligibility/commission values, referral ranges, roster payment labels, instructor status transitions, and monthly billing anchoring. Existing tests, TypeScript validation, and the production build must pass before completion.
