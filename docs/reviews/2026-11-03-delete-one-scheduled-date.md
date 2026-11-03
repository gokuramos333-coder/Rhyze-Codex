# Delete one scheduled date — November 3

User requested removal of Saturday Work & Tone from visible schedules and a date-specific admin delete control, with email only for signups. Implementation archives one occurrence; it never deletes its template, siblings or historical payment/booking records.

## Behavior and protections
- Admin calendar → Delete this date → explicit Eastern date/time/instructor and required checkbox. Row-version and date checks reject stale forms. No signups means no customer notification.
- Affected confirmed bookings are canceled, original credit reservations released once, waitlist entries expired, and only those people notified. History/attendance and unresolved event payments require review. No provider charge or refund.
- Archived occurrences are excluded from admin/instructor calendar listings; canceled/archived public detail pages return404. The saved status is CANCELLED, preventing legacy scheduled-only booking paths.
- Read Committed transaction takes occurrence advisory + row lock; admission triggers lock the parent and deny new bookings/waitlists after removal. Membership entitlement locks also advance the User MVCC row. This addresses a deterministic stale-snapshot admission race found during independent review.
- Queued confirmations and reminders for this date are canceled. Email delivery rechecks removed-date confirmations, including legacy name/date/time payloads within their booking-year window. Already handed-off provider emails cannot be recalled.
- A delayed paid event receipt is recorded for financial review without restoring a booking or sending a booked confirmation. No unrelated replay-status fix is included.

## Verification
2,166 tests passed, zero failed/pending, including15 deletion integration tests on disposable PostgreSQL. Deterministic concurrency, exact sibling preservation, zero-signup silence, credit idempotency, transaction rollback, auth/stale denial, receipt handling and queued confirmation checks passed. Typecheck/lint/build and diff checks passed. Local browser submitted a real synthetic admin deletion, verified hidden row, retained Wednesday sibling,404 public link and mobile layout. Independent review found and rechecked two corrected issues; no remaining blocker in that reviewed scope.

Evidence: /Users/gokuramos/Inbox/rhyze-delete-occurrence-20261103/ . No production mutation or deployment during these checks.

## Release and requested live cleanup
Current observed live deploy6ae4d61808045cd8f4d731be/source22fb32ba6d1980ece44010c252e5c9103b8fa58d. Fresh pins required for publication. Apply mirrored migration20261103150000_archive_scheduled_occurrence through guarded hosted release. Reverting application code keeps history and prevents admissions but old calendar pages can display CANCELLED rows again; do not drop the archive guards or metadata.

After approved deployment, use the authenticated admin confirmation form to archive ONLY these four zero-booking Saturday11AM Work & Tone occurrences, after fresh count/time checks:
- Nov7: schedule-import-4e73ec78e0f47bf8c205f4434f2e
- Nov14: schedule-import-cb1f3c409e1451b425b5dd05fbab
- Nov21: schedule-import-08618b74f95f23be7481522f12cd
- Nov28: schedule-import-b9649e22c5c5ca5563fde3009164

Sacred Strength with Jena and Wednesday Work & Tone remain. The current published calendar extends through November; no December recurrence changes implied. Save independent production readback and exact source/deploy when released. Black Friday ticket work and other unrelated releases remain separate.
