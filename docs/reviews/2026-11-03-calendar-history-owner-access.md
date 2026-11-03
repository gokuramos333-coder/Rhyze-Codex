# Calendar history and owner-approved access

Owner requested deployment of past schedule visibility and unlimited standard-class access for the affected member. Base is currently published a625485; the separate advance-booking-policy commit 59f4202 remains excluded.

Public calendars now load retained past scheduled/completed occurrences as well as upcoming active formats. Archived and cancelled dates remain excluded. Completed or elapsed dates render Past class/event and Booking not available, without booking links. Existing booking-server start-time guards remain.

A separate owner-only, reasoned, dated unlimited standard-class grant supports the authorized access correction without declaring any unpaid invoice paid or altering subscriptions. It creates an unlimited account, a zero-quantity audit ledger marker, and an actor audit log. Concurrent duplicate submissions return the original grant. Grants cannot buy event admission or book/transfer beyond their expiry. The admin credit list now displays unlimited accounts instead of filtering them out for having zero finite credits.

Verification: original history regressions failed before implementation and now pass. Disposable PostgreSQL integration tests exercise grant concurrency, owner-only authority, actual admin booking, no finite deduction, event/expiry rejection, no billing/email effects, and the real historical schedule query. Typecheck and lint passed. Independent review found no blocker. Browser preview confirmed past cards without booking links on desktop/monthly and mobile/daily. Local preview auth initially lacked a synthetic secret; after configuring local-only auth, no browser or HTTP error occurred on the checked navigation. Full guarded release evidence is in the release receipt and private task evidence folder.

Limit: an owner grant is a documented access exception, not evidence of successful renewal billing. Live customer payment remains separately verifiable. No real booking, payment, refund, or email is a diagnostic test. No new schema/migration or production credential change.

## Runtime follow-up

The first live owner grant attempt returned an error and independent readback confirmed no grant/audit or financial change. Reproduced the exact same-day failure under deployed Node 20: `hour12:false` renders midnight as `24:00`, causing the existing Eastern expiration helper to subtract an extra day. Local Node 25 renders `00:00`, explaining why the initial service tests missed the form conversion. Explicit `hourCycle:'h23'` removes that platform difference. Added actual server-action integration tests spanning daylight-saving transitions and same-day access. Node 20 regression failed before the fix; all 10 grant integration cases passed afterward. The calendar portion is already published; this follow-up corrects the grant date conversion without granting any access automatically.
