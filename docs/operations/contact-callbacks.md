# Contact-page callbacks — local review, not deployed

## Behavior

- `/contact#callback` adds a calendar without replacing the existing contact form.
- Calls last 15 minutes, in America/New_York. Callback availability starts at **9 AM every day**, ending at 8 PM Monday–Friday and 2 PM on weekends. General studio hours remain unchanged. Office-hour display and numeric scheduling settings live together in `lib/site.ts`; update both together if hours change. `callback-availability.ts` applies the callback-only 9 AM minimum.
- Offer the next 30 local dates with at least one hour's notice. Exclude all non-cancelled class/event occurrences (including private/inactive templates), plus 15 minutes before and after. Occupied callback slots are also excluded.
- A fresh database read runs on submission. Serializable transactions, a unique start time, and an idempotent request key prevent competing/double submissions from making duplicate reservations or emails.
- The public availability endpoint returns dates/times only; no names, email addresses, phone numbers, or internal identifiers. POST enforces same-origin JSON, an 8 KB body limit, validated fields, a honeypot, three requests per email per 24 hours, and ten per trusted Netlify connection hash per hour. Raw IP addresses are not stored.

## Notification and staff workflow

- Each request and its queued email are saved atomically. A readable copy is available in Admin → Email Archive even before delivery.
- Attempt delivery to **melissa@rhyzefit.com** immediately after saving; reply-to is the prospect. The subject/body contain the exact Eastern callback date/time, duration, name, phone, email and optional question.
- Reuses the existing reviewed `CONTACT_FORM` template. Requires `EMAIL_DELIVERY_ENABLED=true`, `RESEND_API_KEY`, `EMAIL_FROM`, and the current CONTACT_FORM template approval. It respects the existing email resume cutoff.
- No new cron job or polling interval. The existing five-minute email worker retries callback-only transient failures and recovers sends interrupted for more than five minutes. Existing standard email/reminder handling is unchanged.
- Freeze the approved message before the first send and use the same provider idempotency key on every retry. Up to five attempts; stop ambiguous retries after 23 hours to stay inside [Resend's 24-hour idempotency window](https://resend.com/changelog/idempotency-keys). Exhausted attempts remain FAILED in the archive for staff review.
- The visitor sees the reserved date/time. If notification delivery is pending or failed, the page explicitly says so and provides the studio phone number; it never falsely claims that the team was notified.
- This is a requested phone callback, not a calendar-provider integration. No visitor confirmation email or SMS is sent. Staff call the supplied number. Rescheduling/cancellation is handled by contacting the studio; there is no new callback-management screen.

## Scope limits

- Availability reflects the class schedule at selection/submission. If staff add or move a class/event **after** accepting a callback, they must check for callback conflicts and contact the prospect as needed. This release does not block existing class-management actions or add a class-change notification system.
- No public endpoint can list prospect data. Staff can inspect the Email Archive. Requests do not create users, class bookings, memberships, payments, credits, or authentication changes.
- Office holidays have no separate override in the current office-hours configuration. Add an explicit office-closure feature before advertising closed dates as generally unavailable.

## Preview and verification (September 21, 2026)

- Local preview: `http://localhost:3000/contact#callback`, using the isolated `studio_preview_20260921` PostgreSQL database. Outbound email, live Stripe and live Resend credentials are disabled/absent.
- Disposable integration database: explicit localhost `callback_test`; tests refuse other hosts/database names.
- 56 callback tests cover office hours, DST and winter evening confirmation, class/event buffers, fresh conflict checking, concurrent/idempotent reservations, validation/privacy, immediate-send payload, paused/failed/retried emails, abandoned send recovery, unchanged retry payload, and preservation of the standard email worker.
- Full suite: 1,141 tests across 268 files passed, including 33 explicit PostgreSQL integration tests. Typecheck, lint, Prisma validation, production build and migration mirror comparison passed.
- Browser: synthetic request saved; its slot disappeared after reload; month navigation and time selection worked on desktop and mobile; no callback-widget horizontal overflow or browser console errors. Existing development-only image/smooth-scroll warnings remain outside this change.
- Production homepage and Contact page were checked read-only. **No production migration, deploy, callback reservation, or email was performed.**
- Follow-up review change: earliest callback is now 9 AM Eastern on all seven days. All 63 callback tests, typecheck and production build passed; browser checks confirmed weekday/weekend first slots. Earlier times are rejected server-side as well. General studio hours, existing reservations and closing times are unchanged. Still not deployed.

## Future release gate

1. Obtain explicit deployment approval after the preview review.
2. Follow `docs/operations/production-release.md`; preserve the current production release safeguards. Do not deploy the obsolete `rhyze-fitness-new` worktree.
3. Apply the additive `20260922010000_contact_callbacks` migration through the approved Netlify database release path before serving the new application. Prisma and Netlify migration copies are identical; there are no changes to existing member/payment/booking rows.
4. Verify the four notification prerequisites above and the email-worker health. Do not approve a new template revision or enable email globally as a workaround.
5. Run typecheck, all tests, lint, Prisma validation, and production build again for the final release snapshot. Verify fresh schedule availability and an approved real callback delivery after deployment, without charging or booking a class.
