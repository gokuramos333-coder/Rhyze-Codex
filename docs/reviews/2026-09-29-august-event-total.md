# August 3 event receipts correction

Owner correction in Codex on September 29: Tricia’s August 3 event should show USD 480 of preserved Somble sales plus USD 120 of system receipts, total USD 600. No Telegram notifications for this work.

The event card previously counted only active bookings with native commerce orders ($60). It excluded preserved imports and other exactly reconciled receipts. Event totals now use the reconciled ledger across all payment dates; the calendar selects event dates, while cash reports retain collection dates. The event’s financial-entry link covers July 19–August 2 advance sales instead of inheriting the August cash filter.

The owner’s USD confirmation is scoped to the sixteen retained $30 import identities, exact event occurrence, source, original unknown currency and collection type. It runs after provider identity reconciliation, so a subsequently bridged import is replaced by its exact receipt and is not counted again. Confirmation changes reporting provenance/currency only, with no database writes, invented Stripe evidence or new cash. Other events/imports remain unconfirmed unless supported by their own evidence.

Event revenue shows verified net receipts plus owner-confirmed imported sales, before fees/instructor pay. Other unverified records and currencies remain separate. Monthly/annual verified cash totals remain unchanged. Financial entry descriptions/CSV retain the owner-confirmation provenance.

Validation: regression test failed before implementation; focused tests cover presales outside the cash period, confirmation scope, deduplicated rows, refunds, fees, currencies and the $600/$120/$480 display. Offline replay of the retained production snapshot reproduces $600 exactly and preserves $6,241.15 verified cash at the original cutoff. Full guarded release and independent review receipts are recorded separately.
