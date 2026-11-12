# Safe archive and phone implementation plan

Spec: /Users/gokuramos/Inbox/rhyze-archive-phone-task.md. Existing isolated checkout at ccac834; implement inline. Parent performs independent review after commit.

Architecture: nullable User.archivedAt only; owner-authorized archive/restore writes only that field and an audit entry. A shared parameterized SQL obligation predicate determines both archive blocking and effective directory visibility. Existing accounting, authentication and roster queries stay intact. Phone validation shares one punctuation/digit policy and omits unchanged stored phone values from profile patches.

Constraints: no publish/push, customer writes, deletion controls, lifecycle fences/triggers/projections, reference-tree edits or gift-credit changes. New mirrored migration sorts after 20261112210000. Native tests use a newly owned PostgreSQL cluster with declaration and server-identity checks.

- [x] Phone RED/GREEN: reject emails/letters at signup, creation, contact and callback; accept punctuation/international numbers; optional blank; unchanged invalid historical phones and omitted fields survive unrelated profile edits. UI validates new/changed phone values.
- [x] Archive implementation and unit checks (native execution BLOCKED by sandbox shmget): native exact service/SQL tests for authorization, idempotent archive/restore, default/archive/all visibility, reappearance after obligations, future booking/waitlist, finance, credits and history preservation. Add only nullable field migration.
- [x] Wire owner controls, directory selector and release test environment; native guard rejection tests and portable owned fixture runner.
- [ ] Run focused native suites, unit suite, typecheck, lint, Prisma validation; inspect diff, commit and write requested implementation report. Stop owned processes.

Review focus: overlapping search/filter predicates; membership/credit obligations added after archive; unchanged malformed stored contacts; unauthorized/repeated operations; retention of gift and historical records. Full supported release remains parent's gate.

Actual verification: 137 focused tests passed; broad unit suite 2363 passed and 2 environment failures (tsx IPC EPERM; npm registry ENOTFOUND). Typecheck, lint, Prisma validation, migration mirror comparison and diff whitespace checks passed. Native runner failed during initdb before a server or fixture mutation. Parent must run native/release gates; no deployment performed.
