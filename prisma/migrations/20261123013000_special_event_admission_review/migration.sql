BEGIN;

-- A legacy checkout has no ticket row. Keep the charge and any completed or
-- pending reversal in one snapshot for counts, ordinary roster rows and reports.
CREATE VIEW bf_legacy_event_order AS
 SELECT o.id AS "orderId",o."occurrenceId",o."userId",o."customerName",o.status::text AS state,
   p."bookingId",o."createdAt",
   coalesce(p."amountCents",0) AS collected,
   greatest(0,coalesce(p."amountCents"-greatest(p."refundedAmountCents",o."refundedAmountCents"),0)) AS remaining,
   coalesce(o.status='PAID' AND o."paidAt" IS NOT NULL AND o."refundedAmountCents"=0 AND
     p.status='SUCCEEDED' AND p."refundedAmountCents"=0 AND
     (o."stripeCheckoutSessionId" IS NOT NULL OR p."bookingId" IS NOT NULL) AND
     NOT EXISTS (SELECT 1 FROM "CommerceRefund" r WHERE r."commerceOrderId"=o.id AND r.status IN ('PENDING','SUCCEEDED')) AND
     NOT EXISTS (SELECT 1 FROM "PaymentRecord" other WHERE other.id<>p.id AND other.status<>'FAILED'
       AND (other."commerceOrderId"=o.id OR other."stripePaymentIntentId"=o."stripePaymentIntentId"
         OR other."stripeCheckoutSessionId"=o."stripeCheckoutSessionId")),false) AS settled
 FROM "CommerceOrder" o
 LEFT JOIN "PaymentRecord" p ON p."commerceOrderId"=o.id AND p."userId"=o."userId" AND p.kind='EVENT'
   AND p."stripePaymentIntentId"=o."stripePaymentIntentId"
   AND p."stripeCheckoutSessionId" IS NOT DISTINCT FROM o."stripeCheckoutSessionId"
   AND p."amountCents"=o."amountCents" AND p.currency=o.currency AND p.status<>'FAILED'
 WHERE o.kind='EVENT' AND bf_special_occurrence(o."occurrenceId")
   AND NOT EXISTS (SELECT 1 FROM "BlackFridayTicket" t WHERE t."orderId"=o.id);

-- Keep independent VIP and historical rows. For identifiable cash singles,
-- prefer an explicit order/booking binding and require one clean paid seat.
CREATE VIEW bf_ineligible_legacy_booking AS
 SELECT b.id,b."occurrenceId",b."userId" FROM "Booking" b
 JOIN bf_legacy_event_order o ON o."occurrenceId"=b."occurrenceId" AND o."userId"=b."userId"
 WHERE b.source='STRIPE_EVENT' AND NOT EXISTS
   (SELECT 1 FROM "BlackFridayTicket" t WHERE b.id IN (t."buyerBookingId",t."guestBookingId"))
 GROUP BY b.id,b."occurrenceId"
 HAVING count(*) FILTER (WHERE o.settled AND (o."bookingId" IS NULL OR o."bookingId"=b.id)
     AND (b."policySnapshot"->>'commerceOrderId' IS NULL OR b."policySnapshot"->>'commerceOrderId'=o."orderId"))<>1;

CREATE OR REPLACE FUNCTION bf_attendance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked "BlackFridayTicket"; st TEXT;
BEGIN
 IF NOT bf_special_occurrence(NEW."occurrenceId") AND NOT EXISTS (
   SELECT 1 FROM "BlackFridayTicket" WHERE NEW."bookingId" IN ("buyerBookingId","guestBookingId")
 ) THEN RETURN NEW; END IF;
 UPDATE "ClassOccurrence" SET "updatedAt"=clock_timestamp() WHERE id=NEW."occurrenceId" RETURNING status::text INTO st;
 IF NEW.status IN ('ATTENDED','CHECKED_IN') AND EXISTS
   (SELECT 1 FROM bf_ineligible_legacy_booking b WHERE b.id=NEW."bookingId" OR
     (NEW."bookingId" IS NULL AND b."occurrenceId"=NEW."occurrenceId" AND b."userId"=NEW."userId")) THEN
   RAISE EXCEPTION 'Legacy ticket requires settled payment before attendance';
 END IF;
 SELECT * INTO linked FROM "BlackFridayTicket" WHERE NEW."bookingId" IN ("buyerBookingId","guestBookingId")
   OR ("occurrenceId"=NEW."occurrenceId" AND NEW."userId" IN ("userId","guestUserId") AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST'));
 IF FOUND AND (linked.state<>'PAID' OR st<>'SCHEDULED' OR NEW."occurrenceId"<>linked."occurrenceId"
   OR NEW."bookingId" IS DISTINCT FROM (CASE WHEN NEW."userId"=linked."userId" THEN linked."buyerBookingId" WHEN NEW."userId"=linked."guestUserId" THEN linked."guestBookingId" END)) THEN
   RAISE EXCEPTION 'Ticket is not admissible; resolve ticket review first';
 END IF;
 IF linked."guestBookingId"=NEW."bookingId" AND NEW.status IN ('ATTENDED','CHECKED_IN') AND
   (NOT EXISTS (SELECT 1 FROM bf_paid_event_ticket WHERE "orderId"=linked."orderId")
    OR NOT (bf_guest_waiver_valid(linked) OR (TG_OP='INSERT' AND NEW.status='CHECKED_IN'
      AND current_setting('rhyze.transferring_guest_order',true) IS NOT DISTINCT FROM linked."orderId"
      AND linked."guestCheckedInAt" IS NOT NULL AND linked."guestCheckedInById" IS NOT NULL
      AND NEW."checkedInAt" IS NOT DISTINCT FROM linked."guestCheckedInAt"
      AND NEW."markedById" IS NOT DISTINCT FROM linked."guestCheckedInById"))) THEN
   RAISE EXCEPTION 'Current signed waiver required for guest check-in';
 END IF;
 RETURN NEW;
END $$;
-- December was an ordinary event to older artifacts. Their native writers
-- cannot present the new transaction-scoped, exact admission authorization.
CREATE FUNCTION bf_december_occurrence(oid text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT oid IN ('schedule-import-d7e5b1377dccf88d1d90068c557d','schedule-import-e54e7b12d550433a85e6e7f495ec','schedule-import-12cc3b9897966042d0954cb495b0');
$$;
CREATE FUNCTION bf_native_event_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credit text:=NEW."policySnapshot"->>'creditAccountId';
BEGIN
 IF TG_OP='UPDATE' AND OLD.id=NEW.id AND OLD."occurrenceId"=NEW."occurrenceId" AND OLD."userId"=NEW."userId"
   AND OLD.source=NEW.source AND OLD."bookedAt"=NEW."bookedAt" AND OLD.status IN ('CONFIRMED','ATTENDED')
   AND OLD."policySnapshot" IS NOT DISTINCT FROM NEW."policySnapshot" THEN RETURN NULL; END IF;
 IF credit IS NULL OR current_setting('rhyze.native_event_admission',true) IS DISTINCT FROM
     jsonb_build_array(NEW."occurrenceId",NEW."userId",credit)::text THEN
   RAISE EXCEPTION 'Verified native event admission is required';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER bf_native_event_admission AFTER INSERT OR UPDATE ON "Booking" FOR EACH ROW
 WHEN (bf_december_occurrence(NEW."occurrenceId") AND NEW.source IN ('MEMBER','ADMIN_ADDED') AND NEW.status IN ('CONFIRMED','ATTENDED'))
 EXECUTE FUNCTION bf_native_event_admission();

-- Existing captured/expired callbacks never insert a new pending commerce order.
CREATE FUNCTION bf_closed_legacy_cash_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "FinancialRelease" WHERE id='rhyze' AND "enabledDeployId" IS NOT NULL
    AND "sourceSha" IS NOT NULL AND "evidenceHash" IS NOT NULL FOR SHARE)
 THEN RAISE EXCEPTION 'Special event cash checkout is paused'; END IF;
 IF current_setting('rhyze.verified_special_order',true) IS DISTINCT FROM NEW.id THEN
   RAISE EXCEPTION 'Verified special event cash checkout is required';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_closed_legacy_cash_admission BEFORE INSERT ON "CommerceOrder" FOR EACH ROW
 WHEN (bf_december_occurrence(NEW."occurrenceId") AND NEW.kind='EVENT' AND NEW.status='PENDING')
 EXECUTE FUNCTION bf_closed_legacy_cash_admission();
COMMIT;
