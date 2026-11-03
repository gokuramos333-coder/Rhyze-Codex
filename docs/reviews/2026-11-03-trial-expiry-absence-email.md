# Trial expiry and absence email review

Baseline: 10430cea83945369a07f69687ae76ab16e8f1084. Local candidate only; owner requests email preview before deployment. No production mutation or sending authorized by this review.

Independent reviewer: `/root/trial_absence_review`, November 3, 2026. Review covered current tracked/untracked diffs, migration guards and read-only isolated diagnostic execution. The primary agent ran regression/integration checks; the reviewer did not claim a full-suite run.

Resolved findings:
- Pausing absence outreach now excludes queued absence campaigns from delivery without interfering with other newsletters.
- Hourly recovery is allowed from 9 AM through 5 PM Eastern, but an atomic daily-report guard prevents additional same-day outreach after successful preparation.
- Owner CSV uses recipient status and exclusion reason, prioritizing current contact restrictions; campaign SENT alone is never represented as delivery.
- Trial diagnostics distinguish untagged historical admin attendance from explicitly separately funded attendance. Both positive and negative regression cases are present.

The reviewer found no remaining implementation blocker after correction. A final requested negative assertion for separately funded attendance was added. The actual diagnostic query ran successfully against an isolated database in a read-only transaction.

Behavioral verification includes first admin trial activation, exact seven-day expiry, repeat advance booking within the window, trial event rejection, reminder singleton, legacy repair idempotency/competing-access rejection, absence concurrency, return reset, historical/opt-out exclusion, provider-pause protection, accurate exclusion reporting, job authentication and Eastern timing. No real customer booking, email or financial action was used as a test.

Guarded release, approved copy, owner-report template approval, configured launch boundary and independent production readback remain required. Full logs and preview artifacts are under `~/Inbox/rhyze-trial-absence-20261103/`.
