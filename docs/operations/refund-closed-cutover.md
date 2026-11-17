# Refund approval and two-event closed cutover

This explicit protocol replaces neither ordinary pre-publication HTTP checks nor
operator review. Netlify now blocks every unpublished deploy, including the new
candidate. A blocked candidate cannot pass authenticated HTTP checks. We therefore
publish only a reviewed **closed** artifact, record `VERIFIED_CLOSED`, verify its
canonical hosted receipt, all three roles and assets, then separately authorize
financial activation. No candidate HTTP success is claimed.

1. Confirm current locked production source and all old immutable/canonical skew
   ingress exclusions. Preserve the site's unpublished Block-all rule with no IP
   exception. Build from the clean reviewed production branch and managed DB
   binding, with exact expiring approval, full local checks and pinned dependencies.
2. Publish the BRIDGE based on `48460727d4e17484c4826b08e6087d4c18e32283`.
   It has no SQL changes. Its central Stripe client unconditionally rejects cash
   refunds/direct PaymentIntent creation. It also blocks new checkout and member/
   staff admissions for the two exact event occurrences. Other recurring billing
   and unrelated checkout remain unchanged. The runtime manifest pins all bridge
   application files; no environment flag can reopen these operations.
3. Lock publication and verify the exact published build receipt, canonical roles,
   assets, and exclusion of the formerly-live artifact. Inspect actual scheduled
   function transition and in-flight executions. Reconcile Stripe refunds/payment
   requests and both events' pre-existing payable sessions. Elapsed time, GET 404,
   idle SQL or a source flag alone is never drain proof. Any unresolved request or
   open payable session blocks the FINAL build; preserve evidence and stop safely.
4. Save fresh provider receipts and their hashes in a BRIDGE_RECONCILED record.
   Only then build FINAL with its active event triggers and refund schema. The
   FinancialRelease row defaults to disabled and is never enabled by migration.
   The FINAL runtime must gate reservations and each provider write; 20-second
   non-retrying writes require 25 seconds left on a live 60-second transaction.
5. Publish FINAL closed, lock, verify receipt, exact runtime identity and all HTTP
   checks. Confirm provider/data evidence again. The authenticated approved owner
   release endpoint changes only the exact current DEPLOY_ID/COMMIT_REF and expected
   generation, under an exclusive row lock, with an immutable AuditLog entry and
   evidence hash. Activation is distinct from cash-refund approval, which is still
   restricted to Vanessa or Melissa. Verify the state independently afterward.
6. If publication outcome is uncertain, inspect the provider before any retry. If
   published checks fail, leave financial activation closed and report the exact
   stage. Never revert to an unsafe pre-bridge financial writer. The bridge remains
   a possible non-financial rollback only before incompatible active SQL changes;
   after FINAL SQL, prefer a reviewed forward repair with the gate closed.

No live charge, refund, credit grant, customer email or booking is a test.

Activation boundary: the endpoint records an authenticated owner assertion; a
64-character hash alone is not verification. The release operator MUST validate
the complete `VERIFIED_CLOSED` receipt, its exact hosted identity, configuration,
all passed HTTP roles/assets, unchanged provider evidence, and current closed DB
generation before submitting activation. The operator must retain all four typed
receipt categories (ingress, scheduler, provider operations, event sessions),
the actual enumerated objects/executions, their observation interval and an
explicit reviewed conclusion. The scheduler receipt retains paginated canonical request IDs, timestamps, status
and duration, source-reviewed canonical-only wrappers, provider runtime bounds,
and before/after locked publication identities. Logs do not expose per-request
deploy IDs: runtime attribution is explicitly an inference from that interval.
Provider operation reconciliation and ingress exclusion are also mandatory; there
is no timeout-only or manually asserted-count fallback. Fully refunded event
history may instead retain verified refund identities and reconciled accounting.
