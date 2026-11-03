# Approved absence email release — November 3, 2026

Base: production source `10430cea83945369a07f69687ae76ab16e8f1084`.

Owner approved the absence email to send, with the recipient’s name after “We miss you” instead of “Rhyze Tribe”. The subject and heading now use the existing escaped first-name personalization. Once per absence, re-eligible after another checked-in standard class; existing opt-outs/suppression, future-booking checks and delivery gates remain.

This branch contains ONLY the absence-email candidate plus personalization. The pending trial repair, class editor, and unapproved membership booking-policy changes are excluded.

The former independent absence review resolved pause-gate, daily deduplication and status-reporting issues. Current verification adds actual queued-recipient rendering and HTML escaping tests. Tests use isolated databases with outbound providers captured/mocked. No customer communication is a diagnostic test.

Initial catch-up audience decision, launch flags, guarded release, owner-report approval and real delivery readback are tracked in `~/Inbox/rhyze-absence-launch-20261103/`. Names/contact data remain in private audience evidence, not source.
