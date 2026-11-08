> Historical plan: final local verification and static preview are in `docs/reviews/2026-11-08-trial-upgrade-native-verification.md`. User superseded the original booking-cancellation scope with fail-closed handling for trial/ambiguous booking history. No application deployment or end-to-end paid upgrade is claimed. Do not repeat the historical alternate Git-artifact workflow below.

# Trial cancellation and paid upgrade implementation plan

Spec: ../TASK.md. Baseline 6ecfbfd. Implement inline in the supplied clean worktree; independent read-only review at finish.

- [ ] PostgreSQL integration tests first: authenticated admin-area roles, exact active seven-day trial, unambiguous purchase/account/booking provenance, atomic cancellation, history/refund preservation, replay, concurrent booking and cancellation. Retain RED/GREEN output.
- [ ] Implement cancelAdminIntroTrial and authenticated server action using shared admin policy and entitlement lock. Acquire occurrence locks before entitlement lock; fail/retry changed roster scopes. Reject ambiguous provenance and financial/attendance side effects. Expire only the trial account; cancel only attributed future bookings/reminders. One atomic audit is the replay receipt.
- [ ] Test and implement exact first-period terms and disabled checkout panel: eligible monthly plans, email, flat amount or explicit percentage, recurring price, hard 14-day policy. No provider/email/purchase side effects. Ordinary checkout cannot stand in for trial upgrade.
- [ ] Build an inert synthetic static preview from actual components and compiled Tailwind. Verify desktop/mobile/narrow-panel controls and static allowlist. Do not deploy the application.
- [ ] Full tests, typecheck, lint, schema validation, build; independent review; local commit; stop any owned database; ../IMPLEMENTATION.md with all actual results and blockers.

Provider finding: current admin helper starts an ordinary subscription and invoice fulfillment activates at payment time. Deferred activation and aligned renewal are unavailable in this source. New trial-upgrade checkout and email stay disabled as TASK.md permits; no financial prerequisite migration.

Environment evidence: initdb currently fails because shmget is forbidden by this sandbox, including explicit mmap configuration. No existing database will be reused; no database guard will be weakened.

## Execution ledger

- Source implementation, UI and synthetic artifact prepared. Related checks pass; actual RED and GREEN logs retained.
- Independent review completed. Three concurrency findings addressed in code; real PostgreSQL assertions remain blocked, so this is not release-ready.
- Full suite, standard build and browser limitations retained in docs/reviews/2026-11-08-trial-upgrade.md and ../IMPLEMENTATION.md.
- Ruling: preserve a portable local Git commit artifact if the linked worktree index remains read-only; do not modify shared repository metadata or another worktree.
