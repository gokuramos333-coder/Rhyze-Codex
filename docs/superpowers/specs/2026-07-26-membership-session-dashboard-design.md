# Membership, Session, and Dashboard Design

## Goal

Make membership state understandable and manageable for members and owners, keep signed-in members authenticated while browsing, and make admin analytics and booking statuses easier to read without changing the established Rhyze design.

## Membership experience

The member Home and Membership pages show the current plan name, plan status, available credits, and current billing or access period. An active $7 intro trial also shows the number of calendar days remaining. The countdown begins when the first eligible class is booked, using `Membership.activatedAt`; purchasing the trial without booking does not start the countdown.

The Membership page includes a **Change or Cancel Plan** action for active or trialing plans. Until Vanessa finalizes the contractual terms, the action creates an owner-review request. It does not immediately change Stripe, remove credits, pause access, or cancel the membership. The member sees the request status and a clear statement that access continues until an owner acts.

## Owner membership controls

Vanessa and Melissa can review plan-change and cancellation requests from the member record. Owners can pause, unpause, approve cancellation, or deny a request. Every action requires an explicit confirmation and creates an audit record.

For Stripe subscriptions, an owner action must update Stripe successfully before the local membership is changed. A Stripe failure leaves local access unchanged and displays an actionable error. Pausing uses Stripe subscription pause collection and sets the local status to `PAUSED`; unpausing removes Stripe pause collection and returns the local status to the status reported by Stripe. Approved cancellation schedules cancellation at the paid period end unless a separate refund workflow is used. Local-only trial memberships use the same visible statuses but do not call Stripe.

Credits remain attached for audit history. Booking eligibility excludes paused, cancelled, expired, and past-due memberships and their unavailable credit accounts.

## Session persistence

Rhyze keeps the existing one-year JWT session. Authentication cookies remain persistent across navigation, browser refreshes, and returning to the site. Session behavior is verified at the cookie configuration and middleware boundaries; the implementation will not hide genuine account suspension or invalid credentials behind an automatic re-login.

## Dashboard analytics

Admin chart components become interactive client components. Hovering or focusing a point/bar shows its label and exact count or dollar value. Keyboard focus exposes the same information for accessibility. Existing chart destination links remain available without making tooltip interaction navigate unexpectedly.

Sales presents Events and Merchandise as separate sections, each with its own total and records. Both sections continue using the same Stripe-backed commerce ledger, so new orders appear automatically in the correct area.

## Booking status presentation

Status badges use consistent colors everywhere they share the admin status component:

- `CONFIRMED` and `ATTENDED`: light green.
- `CANCELLED`, `LATE_CANCELLED`, and `NO_SHOW`: light red.
- `PAUSED`: light amber.
- Other statuses retain their existing readable fallback style.

## Data changes

Add a membership-change request record containing member, membership, requested action, optional requested product, member note, status, reviewer, review note, and timestamps. Requests are limited to memberships owned by the signed-in member. Only approved owners can review them.

No existing Somble history is rewritten. Stripe identifiers, membership records, credit ledger entries, and audit logs remain the source of truth for their respective concerns.

## Error handling and tests

Test trial countdown boundaries, member request authorization, owner-only actions, Stripe-first pause/cancel behavior, session persistence configuration, chart tooltip formatting, event/merchandise separation, and status colors. Run focused tests during each change, followed by `npm run typecheck`, `npm test`, and `npm run build`.
