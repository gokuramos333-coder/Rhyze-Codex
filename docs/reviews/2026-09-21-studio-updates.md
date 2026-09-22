# Studio updates — local review, September 21, 2026

## Release status

Deployment approved by the user on September 21; not yet deployed. All task reviews and the final independent re-review passed. Production data, payments and emails have not been changed by this batch. Work remains in the existing `fix/sign-in-plan-fallback` worktree; do not reset/clean it or deploy the older `rhyze-fitness-new` checkout.

Deployment preflight at approximately 21:46 EDT passed: 1,063 unit tests, 22 explicit local PostgreSQL integration tests, typecheck, lint, Prisma validation, production-mode Next build and diff whitespace checks. All four migration mirrors match. Production remains deploy `6ab188346604667203434c18` in READY state; five public routes, three anonymous portal redirects and 19 JavaScript/CSS assets passed. Read-only database checks found no case-insensitive duplicate emails, no new identity/artwork schema yet, and the expected Gui/Carmen/Fanny target records. Amy/Kim retain the specifically approved September exception.

Netlify's production-database PAT write-access setting is confirmed OFF. No linked Git build is configured. Release is paused before changing that security-sensitive setting; action-time confirmation was requested to enable it temporarily and restore it immediately after the release. No permission setting, customer record, payment or email was changed during preflight. The preflight build is not a Netlify production artifact and must not be uploaded with `--no-build`.

Local preview: http://localhost:3000/admin. It uses synthetic fixtures and a separate local PostgreSQL database, not live customer records. Preview accounts use `RhyzePreview-0921!`: administrator `automation-admin@rhyze.local`, instructor `instructor@example.test`, member `member@example.test`.

## Requested changes

1. Exact stored cancellation time, including seconds and Eastern timezone, on rosters and relevant history. Missing historical timestamps are not invented.
2. Late-cancelled clients remain visibly tagged in the roster without occupying a confirmed seat.
3. Independent admin class/event artwork controls; an instructor can override only their assigned date. Removal restores inherited artwork/portrait. Shared media is not deleted.
4. Approved active instructors receive ongoing free regular-class access, not free events, without spending purchased credits.
5. Account-name editing and verified email changes. Email remains unchanged until confirmation; existing history and Stripe customer identity remain linked to the same user. Old sessions and recovery tokens are invalidated safely.
6. Guarded, idempotent account corrections are prepared for Gui, Carmen and Fanny. They have been applied only to synthetic local fixtures. No payment provider subscription is cancelled by guess.
7. The withdrawn $199-for-life VIP sentence is removed from current public presentation. Public VIP remains $222; approved Amy/Kim recovery remains $199 and Jolie remains $92.
8. Raised-arms Rhyze symbol replaces the letter R in browser and Apple/mobile icons.
9. VIP booking/display/transfer eligibility is restricted to the paid period. Amy/Kim's specifically approved current September access remains exempt while recovery is pending; this does not create a general unpaid VIP exception.

## Verification record

Final exact-snapshot verification at 18:09 EDT: 1,063 unit tests passed across 260 files; 22 additional local PostgreSQL tests passed (13 account-security and 9 overlapping payment/lifecycle tests). Typecheck, lint, Prisma validation and the production build succeeded. Local built public routes and both PNG icons returned 200; unauthenticated admin/member/instructor routes redirected to sign-in. All 19 referenced assets across the public smoke pages returned 200.

Browser checks passed: instructor PNG chooser/save/public display/removal; restored portrait fallback; red invalid-file feedback below photo controls; independent administrator JPEG save with an unrelated required template field blank; administrator name change; instructor self/admin free regular-class bookings without credit spending; instructor event rejection; expired VIP rejection; historical late-cancel row and exact timestamp.

Independent review identified and prompted regression fixes for stale payment notifications, transfer provenance, same-second failure/success delivery, and preservation of explicit cancelled/paused/expired status. Original purchase dates remain unchanged by renewals; settled invoices remain recorded even when they must not grant access. Task and final review evidence is retained in the implementation ledger. This record is not deployment approval.

Stripe does not guarantee notification delivery order, and separate events can share the same timestamp second; the tests explicitly cover those cases. [Stripe webhook documentation](https://docs.stripe.com/webhooks#event-ordering)

## Before a future approved deployment

- Re-run typecheck, full tests, lint, Prisma validation and production build on the exact release snapshot.
- Rebuild with production configuration; do not publish the local preview build, which deliberately uses localhost URLs and no live provider credentials.
- Apply the four new mirrored Prisma/Netlify migrations before application queries use the new identity/artwork schema. Recheck the named-account guards against current production state; they intentionally stop on unexpected membership/billing changes.
- Review/approve `ACCOUNT_EMAIL_CONFIRMATION` and `ACCOUNT_EMAIL_CHANGED` using the existing email-template approval workflow before live email changes are enabled. This batch does not auto-approve templates or send messages.
- Verify real production storage and authenticated admin/member/instructor routes after release without charging customers or altering attendance for testing.
- Keep pre-existing reliability fixes and all unrelated work intact. Netlify PAT database permissions must remain disabled unless a separately authorized deployment workflow requires otherwise.

Unused replaced artwork files are intentionally retained to avoid deleting media shared elsewhere. Native device/browser icon caching may require a refresh or re-adding an existing home-screen shortcut after deployment.
