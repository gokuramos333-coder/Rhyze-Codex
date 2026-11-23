BEGIN;
LOCK TABLE "Booking", "ClassOccurrence", "CreditLedgerEntry", "BlackFridayTicket" IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION bf_special_occurrence(oid text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT oid IN ('cmvv9bp4g0001gt09ewtk8n57','cmw026ajl0001jn09jsqpqzij','schedule-import-d7e5b1377dccf88d1d90068c557d','schedule-import-e54e7b12d550433a85e6e7f495ec','schedule-import-12cc3b9897966042d0954cb495b0');
$$;
ALTER TABLE "BlackFridayTicket"
 DROP CONSTRAINT "BlackFridayTicket_occurrenceId_check", DROP CONSTRAINT "BlackFridayTicket_check",
 ADD CHECK (bf_special_occurrence("occurrenceId")),
 ADD CHECK (seats=1 OR ("guestName" IS NOT NULL AND "guestPhone" IS NOT NULL AND
   ("occurrenceId" IN ('schedule-import-d7e5b1377dccf88d1d90068c557d','schedule-import-e54e7b12d550433a85e6e7f495ec') OR "declaredAt" IS NOT NULL))),
 ADD CHECK ("creditAccountId" IS NULL OR (seats=2 AND "occurrenceId" NOT IN ('schedule-import-d7e5b1377dccf88d1d90068c557d','schedule-import-e54e7b12d550433a85e6e7f495ec'))),
 ADD COLUMN "paperWaiverVersionId" text REFERENCES "WaiverVersion"(id),
 ADD COLUMN "paperCollectedAt" timestamp(3), ADD COLUMN "paperCollectedById" text REFERENCES "User"(id),
 ADD COLUMN "guestCheckedInAt" timestamp(3), ADD COLUMN "guestCheckedInById" text REFERENCES "User"(id),
 ADD CHECK (num_nonnulls("paperWaiverVersionId","paperCollectedById","paperCollectedAt") IN (0,3)),
 ADD CHECK (num_nonnulls("guestCheckedInAt","guestCheckedInById") IN (0,2)),
 ADD CHECK (seats=2 OR ("paperCollectedAt" IS NULL AND "guestCheckedInAt" IS NULL));

CREATE FUNCTION bf_immutable_purchase_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."occurrenceId",NEW."orderId",NEW."userId",NEW.seats,NEW."guestPhone",NEW."guestName",NEW."declaredAt",NEW."creditAccountId")
 IS DISTINCT FROM (OLD."occurrenceId",OLD."orderId",OLD."userId",OLD.seats,OLD."guestPhone",OLD."guestName",OLD."declaredAt",OLD."creditAccountId")
 THEN RAISE EXCEPTION 'Ticket purchase identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_immutable_purchase_identity BEFORE UPDATE ON "BlackFridayTicket"
 FOR EACH ROW EXECUTE FUNCTION bf_immutable_purchase_identity();

INSERT INTO "BlackFridayCapacity" SELECT o.id,count(b.id)::int FROM "ClassOccurrence" o
 LEFT JOIN "Booking" b ON b."occurrenceId"=o.id AND b.status IN ('CONFIRMED','ATTENDED')
 WHERE bf_special_occurrence(o.id) GROUP BY o.id ON CONFLICT DO NOTHING;
CREATE FUNCTION bf_initialize_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "BlackFridayCapacity" VALUES (NEW.id,0) ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER bf_initialize_capacity AFTER INSERT ON "ClassOccurrence" FOR EACH ROW
 WHEN (bf_special_occurrence(NEW.id)) EXECUTE FUNCTION bf_initialize_capacity();

-- Every reader uses the same definition of a clean, settled ticket.
CREATE VIEW bf_paid_event_ticket AS
 SELECT t.* FROM "BlackFridayTicket" t JOIN "CommerceOrder" o ON o.id=t."orderId"
 JOIN "PaymentRecord" p ON p."commerceOrderId"=o.id AND p."userId"=t."userId" AND p.kind='EVENT'
 AND p."stripePaymentIntentId"=o."stripePaymentIntentId" AND p."stripeCheckoutSessionId"=o."stripeCheckoutSessionId"
 AND p.status='SUCCEEDED' AND p."amountCents"=o."amountCents" AND p.currency=o.currency AND p."refundedAmountCents"=0
 WHERE t.state='PAID' AND o.status='PAID' AND o."paidAt" IS NOT NULL AND o."refundedAmountCents"=0
 AND o."userId"=t."userId" AND o."occurrenceId"=t."occurrenceId" AND o.kind='EVENT'
 AND NOT EXISTS (SELECT 1 FROM "CommerceRefund" r WHERE r."commerceOrderId"=o.id AND r.status IN ('PENDING','SUCCEEDED'))
 AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" other WHERE other.id<>p.id AND other.status<>'FAILED'
  AND (other."commerceOrderId"=o.id OR other."stripeCheckoutSessionId"=o."stripeCheckoutSessionId" OR other."stripePaymentIntentId"=o."stripePaymentIntentId"));

CREATE FUNCTION bf_current_waiver() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT id FROM "WaiverVersion" WHERE "isActive" AND "requiresSign" ORDER BY "effectiveAt" DESC,id DESC LIMIT 1;
$$;
CREATE FUNCTION bf_guest_waiver_valid(t "BlackFridayTicket") RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM (SELECT bf_current_waiver() AS id) w WHERE w.id IS NOT NULL
 AND (w.id=t."paperWaiverVersionId" OR EXISTS (SELECT 1 FROM "WaiverAcceptance" a WHERE a."waiverVersionId"=w.id AND a."userId"=t."guestUserId")));
$$;

CREATE OR REPLACE FUNCTION bf_capacity_delta(oid TEXT, delta INTEGER) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE cap INTEGER; historical INTEGER; st TEXT;
BEGIN
 IF NOT bf_special_occurrence(oid) OR delta=0 THEN RETURN; END IF;
 SELECT capacity,"historicalSignupCount",status::text INTO cap,historical,st FROM "ClassOccurrence" WHERE id=oid FOR UPDATE;
 INSERT INTO "BlackFridayCapacity" VALUES (oid,0) ON CONFLICT DO NOTHING;
 UPDATE "BlackFridayCapacity" SET used=used+delta WHERE "occurrenceId"=oid AND used+delta>=0 AND (delta<0 OR (st='SCHEDULED' AND used+delta+historical<=cap));
 IF NOT FOUND THEN RAISE EXCEPTION 'Event seats unavailable'; END IF;
END $$;

-- Check both roles while an unregistered guest seat is still owned by the ticket.
CREATE FUNCTION bf_active_ticket_person(oid text, uid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
  SELECT 1 FROM "BlackFridayTicket" t JOIN "User" u ON u.id=uid LEFT JOIN "MemberProfile" p ON p."userId"=uid
  WHERE t."occurrenceId"=oid AND t.state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST')
  AND (uid IN (t."userId",t."guestUserId") OR (t.seats=2 AND t."guestUserId" IS NULL AND (
   lower(regexp_replace(trim(normalize(t."guestName",NFKC)),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(normalize(u.name,NFKC)),'[[:space:]]+',' ','g'))
   OR regexp_replace(p.phone,'[^0-9]','','g')=substr(t."guestPhone",2)
   OR (t."guestPhone" LIKE '+1%' AND regexp_replace(p.phone,'[^0-9]','','g')=substr(t."guestPhone",3))
  ))));
$$;
CREATE OR REPLACE FUNCTION bf_booking_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked "BlackFridayTicket"; old_count INTEGER:=0; new_count INTEGER:=0;
BEGIN
 SELECT * INTO linked FROM "BlackFridayTicket" WHERE "buyerBookingId"=COALESCE(NEW.id,OLD.id) OR "guestBookingId"=COALESCE(NEW.id,OLD.id);
 IF FOUND THEN
   IF TG_OP='INSERT' THEN
     IF linked.state<>'PAID' OR NEW."occurrenceId"<>linked."occurrenceId" OR NEW."userId" IS DISTINCT FROM (CASE WHEN NEW.id=linked."buyerBookingId" THEN linked."userId" ELSE linked."guestUserId" END) THEN RAISE EXCEPTION 'Invalid ticket booking'; END IF;
   ELSIF (NEW.status IN ('CONFIRMED','ATTENDED') AND linked.state NOT IN ('PAID','REVIEW')) OR (NEW.status='ATTENDED' AND linked.state<>'PAID') OR TG_OP='DELETE' OR NEW."occurrenceId"<>OLD."occurrenceId" OR NEW."userId"<>OLD."userId" OR (NEW.status IN ('NO_SHOW','LATE_CANCELLED') AND linked.state<>'PAID') OR (NEW.status NOT IN ('CONFIRMED','ATTENDED','NO_SHOW','LATE_CANCELLED') AND linked.state<>'REVERSING') THEN
     RAISE EXCEPTION 'Use the ticket cancellation/refund workflow';
   END IF;
   -- Absence is not a refund: the ticket still owns every seat. Pending seats
   -- replace the non-confirmed booking in public capacity projections.
   PERFORM bf_refresh_pending(linked."occurrenceId");
   RETURN NULL;
 END IF;
 IF TG_OP<>'DELETE' AND bf_special_occurrence(NEW."occurrenceId") AND NEW.status IN ('CONFIRMED','ATTENDED') AND bf_active_ticket_person(NEW."occurrenceId",NEW."userId")
 THEN RAISE EXCEPTION 'Use reserved ticket fulfillment'; END IF;
 IF TG_OP<>'INSERT' AND OLD.status IN ('CONFIRMED','ATTENDED') THEN old_count:=1; END IF;
 IF TG_OP<>'DELETE' AND NEW.status IN ('CONFIRMED','ATTENDED') THEN new_count:=1; END IF;
 IF TG_OP='UPDATE' AND NEW."occurrenceId"=OLD."occurrenceId" THEN
   PERFORM bf_capacity_delta(NEW."occurrenceId",new_count-old_count);
 ELSE
   IF old_count=1 THEN PERFORM bf_capacity_delta(OLD."occurrenceId",-1); END IF;
   IF new_count=1 THEN PERFORM bf_capacity_delta(NEW."occurrenceId",1); END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION bf_attendance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked "BlackFridayTicket"; st TEXT;
BEGIN
 IF NOT bf_special_occurrence(NEW."occurrenceId") AND NOT EXISTS (
   SELECT 1 FROM "BlackFridayTicket" WHERE NEW."bookingId" IN ("buyerBookingId","guestBookingId")
 ) THEN RETURN NEW; END IF;
 UPDATE "ClassOccurrence" SET "updatedAt"=clock_timestamp() WHERE id=NEW."occurrenceId" RETURNING status::text INTO st;
 SELECT * INTO linked FROM "BlackFridayTicket" WHERE NEW."bookingId" IN ("buyerBookingId","guestBookingId")
   OR ("occurrenceId"=NEW."occurrenceId" AND NEW."userId" IN ("userId","guestUserId") AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST'));
 IF FOUND AND (linked.state<>'PAID' OR st<>'SCHEDULED' OR NEW."occurrenceId"<>linked."occurrenceId"
   OR NEW."bookingId" IS DISTINCT FROM (CASE WHEN NEW."userId"=linked."userId" THEN linked."buyerBookingId" WHEN NEW."userId"=linked."guestUserId" THEN linked."guestBookingId" END)) THEN
   RAISE EXCEPTION 'Ticket is not admissible; resolve ticket review first';
 END IF;
 IF linked."guestBookingId"=NEW."bookingId" AND NEW.status IN ('ATTENDED','CHECKED_IN') AND
   (NOT EXISTS (SELECT 1 FROM bf_paid_event_ticket WHERE "orderId"=linked."orderId")
    OR NOT (bf_guest_waiver_valid(linked) OR (linked."guestCheckedInAt" IS NOT NULL AND
      NEW."checkedInAt"=linked."guestCheckedInAt" AND NEW."markedById"=linked."guestCheckedInById"))) THEN
   RAISE EXCEPTION 'Current signed waiver required for guest check-in';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION bf_occurrence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE occupied INTEGER;
BEGIN
 IF NOT bf_special_occurrence(OLD.id) THEN RETURN NEW; END IF;
 SELECT used INTO occupied FROM "BlackFridayCapacity" WHERE "occurrenceId"=OLD.id FOR UPDATE;
 IF NEW.capacity < COALESCE(occupied,0)+NEW."historicalSignupCount" THEN RAISE EXCEPTION 'Capacity below reserved seats'; END IF;
 IF NEW.status<>'SCHEDULED' AND COALESCE(occupied,0)>0 THEN RAISE EXCEPTION 'Resolve admissions before cancelling occurrence'; END IF;
 IF NEW.status<>'SCHEDULED' AND EXISTS(SELECT 1 FROM "BlackFridayTicket" WHERE "occurrenceId"=OLD.id AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST')) THEN RAISE EXCEPTION 'Resolve ticket liabilities before cancelling occurrence'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION bf_credit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid TEXT; balance INTEGER;
BEGIN
 IF TG_OP<>'INSERT' AND OLD."sourceReturnKey" LIKE 'bf:%' THEN
   IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Immutable ticket credit ledger'; END IF;
 END IF;
 FOR aid IN SELECT id FROM "CreditAccount" WHERE id IN (CASE WHEN TG_OP<>'DELETE' THEN NEW."creditAccountId" END,CASE WHEN TG_OP<>'INSERT' THEN OLD."creditAccountId" END)
   AND NOT "isUnlimited" AND label IN ('Event credit — November 2026 VIP complimentary event credit — expires 2026-11-30','Event credit — December 2026 VIP complimentary event credit — expires 2026-12-31') ORDER BY id
 LOOP
   UPDATE "CreditAccount" SET "updatedAt"=clock_timestamp() WHERE id=aid;
   SELECT COALESCE(sum(quantity),0) INTO balance FROM "CreditLedgerEntry" WHERE "creditAccountId"=aid;
   IF balance<0 THEN RAISE EXCEPTION 'Monthly event credit exhausted'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
-- Serialize order creation from a still-running legacy checkout and the new admission.
-- The parent revision also invalidates a new serializable checkout's stale snapshot.
CREATE FUNCTION bf_fence_event_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW."occurrenceId"));
 UPDATE "ClassOccurrence" SET "updatedAt"=clock_timestamp() WHERE id=NEW."occurrenceId";
 IF bf_active_ticket_person(NEW."occurrenceId",NEW."userId") THEN
  RAISE EXCEPTION 'Existing ticket already owns this admission';
 END IF;
 IF NEW.status='PENDING' AND current_setting('rhyze.verified_special_order',true) IS DISTINCT FROM NEW.id
 AND EXISTS (SELECT 1 FROM "CommerceOrder" o WHERE o.kind='EVENT' AND o."occurrenceId"=NEW."occurrenceId"
   AND o."userId"=NEW."userId" AND o.status IN ('PENDING','PAYMENT_FAILED','PAID','FULFILLMENT_REVIEW')
   AND NOT EXISTS (SELECT 1 FROM "BlackFridayTicket" t WHERE t."orderId"=o.id)) THEN
  RAISE EXCEPTION 'An earlier checkout requires verified reconciliation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_fence_event_order BEFORE INSERT ON "CommerceOrder" FOR EACH ROW
 WHEN (NEW.kind='EVENT' AND bf_special_occurrence(NEW."occurrenceId")) EXECUTE FUNCTION bf_fence_event_order();
COMMIT;
