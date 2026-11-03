# Outreach / consent transaction protocol

## Scope and writer audit

`lib/newsletters/lead-transaction.ts` is the only transaction entry point for live `CustomerLeadProfile` and `CustomerOutreach` writes:

- `lib/newsletters/repository.ts:logOutreach`: lazy profile creation, version compare-and-set, outreach/status/note insertion and audit. `/api/admin/leads` calls this function.
- `app/api/admin/newsletters/route.ts`, `consent` branch: lazy profile creation, consent/version compare-and-set and audit.

Repository-wide model/delegate and nested `leadProfile`/`outreachEntries` search found no other live writer. The preview seed creates new users with nested lead profiles behind its loopback/capture guard; tests create/delete isolated fixtures. Neither is a concurrent production writer. Migrations define the tables and nullable contact-time column, not a historical rewrite. Any future live writer must use this protocol before its first read or write. Raw maintenance writers require separate coordination.

## Correctness argument

1. Acquire transaction-scoped PostgreSQL advisory lock on `hashtextextended('newsletter-lead:' || userId, 0)` as the first transaction statement. It exists even when the profile does not. All participating writers use the same exact string and seed. A hash collision serializes unrelated leads unnecessarily but cannot break exclusion. No global lock is used.
2. Explicit READ COMMITTED applies only inside this helper. Every statement after the lock wait sees committed state as of that statement, unlike a SERIALIZABLE snapshot established before the wait. SERIALIZABLE produced unrelated-lead B-tree predicate-page SSI conflicts; retaining it with row/advisory locks does not solve that mechanism. Payment and other transaction isolation settings are unchanged.
3. Within one lead, the lock is held across profile creation, version check, contact-time maximum, attempt count, profile update, immutable entry insert, and audit until commit/rollback. No participating same-lead writer can invalidate those reads. Existing profile primary key, operation-key uniqueness, foreign keys and version CAS remain database backstops. Distinct staff requests with the same expected version yield one commit and one explicit stale-version response; the loser must reload rather than have its intent silently merged.
4. Operation replay lookup is AFTER lock acquisition and BEFORE stale-version validation. A duplicate arriving before the first commit waits and then returns the exact stored entry; a later replay does the same. Actor and lead ownership are still checked. Different leads sharing an operation key use different locks, but the global unique index arbitrates at insert: at most one commits, and the other transaction rolls back profile/audit/entry changes. A cross-lead collision is a conflict, not a successful replay.
5. Consent changes write only consent/source/time/version. Outreach writes only its own fields/version (including the existing do-not-contact policy). Neither overwrites unrelated consent state. A winning consent update advances the same version, so stale outreach cannot overwrite it. OPTED_OUT marketing consent and doNotContact remain distinct existing policies; this patch does not redefine them.
6. Entry/contact timestamps and actors retain the preexisting explicit-known-time policy. Unknown old payloads remain unknown; loggedAt is established after waiting; contacted-now is explicit. Replays never mutate dates, notes, actors or audit. Known-contact rollup remains the maximum known contact date, and read presentation chooses date/actor from the same chronological entry. No historical timestamps are fabricated.
7. Atomicity is provided by the single database transaction. A failure after any write rolls back profile, entry and audit and releases the advisory lock. Existing bounded P2034 retry helper (three attempts, no sleeps) is reused unchanged for deadlocks; it is not the mechanism that serializes ordinary same-lead work.

This proof is scoped to lead state. User/staff role checks retain their existing request/statement-time semantics; it does not claim global serialization with unrelated account/role management. Deletion remains constrained by existing foreign keys. An old application instance not using the lock is outside this protocol: deployment coordination must ensure all outreach/consent writers run the new code before claiming the new concurrency availability guarantee. No deployment is performed by this change.

## Verification

Owned local PostgreSQL: `127.0.0.1:55496/rhyze_newsletter_preview`. No existing cluster reset. API tests invoke real Next route handlers and real Prisma/PostgreSQL transactions; only authentication/origin are stubbed, with AsyncLocalStorage separating concurrent staff identities.

The original expanded 89-test parallel workload was reproduced RED (87 passed / 2 failed) before implementation. New lock-wait API regressions were also RED before implementation. Expanded suite adds API lazy-creation, duplicate replay before/after wait, same-lead staff, independent-lead, cross-lead operation-key collision, both deterministic consent/outreach commit orders and post-write rollback tests. Real pg_locks waiters are observed for the exact lead key; no scheduling sleeps or retry inflation.

The existing concurrency test barrier moved from AFTER duplicate reads to BEFORE the first transaction statement. Same-lead readers cannot both reach an after-read barrier under a correct exclusion protocol. Both transactions are still concurrent; assertions, request count and retry budget were retained. Independent-lead requests remain parallel. Known-time/timestamp suites check chronological date/actor alignment and historical immutability.

Logs, manifests, exact worker delta and receipts live under `/Users/gokuramos/Inbox/rhyze-outreach-timeline-fix/protocol-*`. This is local code/API verification, not authenticated browser or production verification.
