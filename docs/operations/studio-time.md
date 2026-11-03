# Rhyze studio time rule

Owner confirmed November 3, 2026: use whatever time is currently on the New Jersey studio clock.

- Use the IANA zone `America/New_York` for business dates, schedule inputs, calendar ranges, reports and customer-facing times. It automatically follows EST (UTC−5) in winter and EDT (UTC−4) in summer. Never hard-code a fixed EST offset or use the Mac/browser/server's local zone implicitly.
- Store instants in UTC. Preserve the exact stored instant for an edit that does not explicitly change date/time. A name change must never parse or rewrite a date/time field.
- Interpret local date/time inputs through the existing studio-time helpers. “Today”, week boundaries and future-only edit cutoffs must use the same studio clock. Recheck the server clock and occurrence version during writes; a stale form cannot edit a class that already started.
- Recurring weekly classes retain the same New Jersey wall-clock time across DST; their UTC offset changes. Test winter, summer, midnight, month boundaries and both DST transitions on the production Node runtime.
- Payment timestamps, subscription renewal anchors, invoice finalization and credit activation are distinct facts. Render all in studio time but retain authoritative provider instants. Do not move billing anchors, fabricate payment success, grant access or retry charges simply to make a displayed date match.
- A paid renewal must be reconciled to the matching membership and correct standard/event entitlements. A pending or failed invoice is not a confirmed paid renewal. Investigate provider billing delay separately from timezone conversion, webhook delay and credit-grant failure; flag the exact stage and customer impact.

## Daily audit

Check renewals due and paid in the Eastern reporting window against actual Stripe payments, application processing records and entitlements, including boundary-day cases. Distinguish known grace/courtesy access from ordinary paid membership access. Retain the existing safeguards against double grants, synthetic webhook evidence, real diagnostic purchases and manual financial repair without authorization.

## Class editor

Admin → Classes → Edit a Class lists formats with the next genuinely upcoming date first. Within a format, select exact future dates, then choose the fields to change. Name-only edits leave the timestamps, capacity, prices, instructor, bookings and historical template untouched. Past/cancelled dates are listed separately and cannot be selected. Shared format description/artwork settings are explicitly separate because they apply to all dates using that format, including history.
