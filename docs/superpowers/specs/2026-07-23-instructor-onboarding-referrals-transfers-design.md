# Rhyze Instructor Onboarding, Referrals, and Transfers Design

## Scope

This design upgrades account creation, member and instructor profiles, instructor approval, private credential storage, referrals, commissions, booking transfers, instructor class controls, and class communications.

## Account creation and access

- Signup collects full name, email, phone, password, password confirmation, optional referral code, and optional instructor access code.
- Passwords require at least nine characters, one uppercase letter, one number, and one symbol.
- Password and confirmation fields provide accessible show/hide controls.
- Normal signup creates an active `MEMBER`.
- Entering `RZTRIBE2026` creates an active member account plus a pending instructor application. It never grants instructor access directly.
- Admin approval changes the account role to `INSTRUCTOR`, creates or activates the instructor profile, generates a referral code, queues document reminders, and sends approval notifications.
- One universal sign-in form routes users by approved database role: owner/admin/manager to `/admin`, instructor to `/instructor`, and member to `/member`.

## Authorization

Instructor access is enforced server-side for every query and mutation. An instructor may access only:

- Class occurrences where `instructorId` equals their user ID.
- Bookings, rosters, attendance, messages, and transfers belonging to those occurrences.
- Their own profile and credential documents.
- Customers attributed to their referral code and their own commission records.

Instructors never receive access to another instructor’s class data, roster, referral customers, earnings, or documents. Admin roles retain studio-wide access.

## Profiles and notification defaults

- Signup phone populates the member profile.
- Member profile supports profile-photo upload, preview, replacement, and removal.
- `Studio News and Offers` defaults to selected at signup and remains user-controlled afterward.
- Instructor profile supports public photo, bio, referral-code card, insurance, and CPR certification.

## File storage and credentials

- Profile photos use public object storage.
- Insurance and CPR documents use private object storage and short-lived signed download links.
- Accepted file types are PDF, JPG, and PNG with server-verified size and content-type limits.
- Credential records include type, storage key, original filename, upload timestamp, expiration date, review status, reviewer, review timestamp, and rejection note.
- Status values are `MISSING`, `UNDER_REVIEW`, `VALID`, `EXPIRING`, `EXPIRED`, and `REJECTED`.
- Background reminders are queued 48 hours after approval when documents are missing, then 30, 7, and 1 day before expiration, and when expired.

## Referral code and lifetime redemption rule

- Approval generates a normalized uppercase code based on the instructor’s first name: `TRICIARZ26`.
- Collisions receive a deterministic numeric suffix such as `TRICIARZ26-2`.
- The instructor dashboard displays the code, Copy Code, and Copy Referral Link controls.
- Admin may deactivate or rotate a compromised code without changing historical attribution.
- A customer may enter a referral code during signup or before their first purchase.
- Each member account may successfully redeem any discount code only once during its lifetime.
- Failed or abandoned payments do not consume the lifetime redemption.
- A successful first eligible purchase receives 5% off.
- Referral attribution remains with the acquiring instructor regardless of who teaches the purchased class.

## Commissions

- A successful referred single-class purchase earns the instructor $5 once.
- A successful referred membership purchase earns the instructor $20 once.
- One referred customer can create at most one commission.
- Commission creation and discount redemption occur idempotently from the successful Stripe webhook.
- Refunded purchases reverse the corresponding commission.
- Instructor reporting supports weekly, monthly, yearly, and lifetime periods and shows referred customer, purchase type, gross purchase, discount, commission, status, and date.

## Booking transfers and cancellation policy

- A confirmed member may transfer to any eligible scheduled class within 14 days of the original start.
- The destination must have capacity, satisfy membership eligibility, avoid overlap, and remain active.
- More than six hours before class: transfer with no fee.
- Between six and two hours: charge $10 immediately to the member’s saved Stripe payment method before completing the transfer.
- Two hours or less: transfer is blocked and the booking is marked late cancelled or no-show as appropriate.
- VIP Access members never pay the transfer fee.
- Failed or missing payment methods leave the original booking unchanged.
- Transfer operations use a database transaction and occurrence locks so capacity and credits remain consistent.

## Instructor occurrence controls and communications

- An instructor may request or execute transfer actions only for bookings in their assigned occurrences.
- An instructor may cancel only an occurrence assigned to them.
- Emergency cancellation requires a reason and confirmation.
- Confirmed attendees receive an email and an in-app notice.
- Instructor class updates may be sent only to confirmed attendees of that occurrence.
- Every message, transfer, payment attempt, cancellation, and attendance change is written to the audit log.

## Interfaces

- Signup retains the split branded account design and adds compact fields without changing the overall visual language.
- Admin People adds role/status controls, pending instructor approval, and instructor document compliance.
- Instructor dashboard adds assigned-class metrics, roster links, referral-code card, referral earnings, credential status, and class-message controls.
- Member profile adds photo upload and defaults marketing email to selected for newly created accounts.

## Error handling

- Invalid instructor codes never grant or imply instructor access.
- Invalid or inactive referral codes show a neutral validation error.
- Upload failures preserve existing files and metadata.
- Stripe charge or webhook failures do not complete transfers, discounts, or commissions.
- Idempotency keys prevent duplicate charges, redemptions, commissions, and notifications.
- Authorization failures return redirects or not-found responses without leaking whether another instructor’s resource exists.

## Testing

- Unit tests cover password rules, instructor-code recognition, referral-code generation, lifetime redemption, commissions, document reminder dates, and transfer windows.
- Integration tests cover pending approval, row-level instructor access, atomic transfers, idempotent Stripe fulfillment, commission reversal, and upload authorization.
- Browser checks cover signup show/hide controls, admin approval, instructor referral copy controls, profile upload states, scoped roster navigation, and class messaging.

## Delivery sequence

1. Signup, pending instructor application, role routing, notification default.
2. Member photo and instructor credential storage/review/reminders.
3. Referral attribution, lifetime redemption, Stripe discount fulfillment, commissions.
4. Transfer policy, automatic fees, instructor class cancellation, email and in-app messaging.
5. Dashboard reporting, end-to-end verification, and production integration checklist.
