# Instructor, Referral, Credential, and Transfer Operations

## Instructor onboarding

1. Applicant signs up with the shared instructor access code.
2. Their user remains an active member and their instructor application is `PENDING`.
3. An owner/admin opens `/admin/instructors`, confirms identity, and approves or rejects the application.
4. Approval changes the role to `INSTRUCTOR`, creates the instructor profile, generates the referral code, and queues approval and missing-document messages.
5. The instructor’s next login routes to `/instructor`.

Never grant instructor permissions solely because a shared code was entered. Approval is the security boundary.

## Instructor scope

Instructor roster, transfer, messaging, cancellation, schedule, credential, referral, and commission queries must include the authenticated instructor ID. Cross-instructor resources return not found or redirect without revealing member information.

## Credentials

- Profile photos are stored locally under ignored `public/uploads/profiles/` during development.
- Insurance and CPR files are stored locally under ignored `.storage/credentials/` during development.
- Production must replace the local adapter with S3-compatible public/private buckets before launch.
- Private downloads are authorized for the owning instructor or owner/admin/manager.
- Admin reviews credentials from `/admin/instructors/[userId]`.
- Call `POST /api/jobs/credentials` with `Authorization: Bearer $JOB_SECRET` daily.
- Missing reminders run after 48 hours; expiration reminders run 30, 7, and 1 day before expiry and after expiry.

## Referrals and commissions

- Instructor approval generates a collision-safe code and referral signup link.
- Signup attribution does not consume the discount.
- A successful Stripe checkout consumes the member’s one lifetime discount redemption.
- Discount is 5% of the first eligible purchase.
- Commission is $5 for drop-in/class-pack/trial purchases or $20 for membership/VIP purchases.
- Database unique constraints prevent multiple redemptions or commissions for one member.
- Full refunds mark the corresponding commission `REVERSED`.

## Transfers

- The source booking must belong to an occurrence assigned to the authenticated instructor.
- Destination must be scheduled, available, non-overlapping, and within 14 days.
- More than 6 hours: free.
- 6 to 2 hours: charge the saved Stripe payment method $10 before moving the booking.
- 2 hours or less: block and mark late cancelled.
- VIP members skip the fee but not the two-hour block.
- Payment failure leaves the original booking unchanged.

## Class messages and emergency cancellation

- Only the assigned instructor can message or cancel an occurrence.
- Updates target confirmed attendees only.
- Messages produce email-queue records and in-app notifications.
- Emergency cancellation records a reason, cancels confirmed bookings, restores reserved credits, and notifies attendees.
- All material actions create audit records.

## Production activation checklist

- Configure PostgreSQL backups and apply all Prisma migrations.
- Configure Stripe secret/webhook keys and ensure Checkout creates reusable customer payment methods.
- Configure a verified Resend sending domain, `EMAIL_FROM`, and scheduled email worker.
- Configure `JOB_SECRET` and the scheduled credential and email jobs.
- Replace development file storage with an S3-compatible adapter and private signed URLs.
- Test webhook replay, refund reversal, transfer charge decline, and cross-instructor authorization in staging.
