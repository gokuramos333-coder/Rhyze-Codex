-- Scoped to the approved canonical occurrence. No fee-operation ownership changes.
-- Admission must remain OFF until ALL old actions, callbacks, workers, skew routes,
-- immutable endpoints and in-flight provider operations have been retired/drained.
-- Checkout ingress alone is NOT sufficient. See docs/operations/black-friday-transition.md.
BEGIN;
LOCK TABLE "Booking", "ClassOccurrence", "CreditLedgerEntry" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "ClassOccurrence" ADD COLUMN IF NOT EXISTS "pendingTicketSeats" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "BlackFridayTicket" (
 "orderId" TEXT PRIMARY KEY REFERENCES "CommerceOrder"(id) ON DELETE RESTRICT,
 "occurrenceId" TEXT NOT NULL REFERENCES "ClassOccurrence"(id) ON DELETE RESTRICT,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "state" TEXT NOT NULL CHECK (state IN ('HELD','PAID','REVIEW','REVERSING','EXPIRED','REFUNDED','DISPUTE_LOST')),
 "seats" INTEGER NOT NULL CHECK (seats IN (1,2)),
 "buyerName" TEXT NOT NULL,
 "guestName" TEXT, "guestPhone" TEXT, "declaredAt" TIMESTAMP(3),
 "guestUserId" TEXT REFERENCES "User"(id),
 "buyerBookingId" TEXT UNIQUE, "guestBookingId" TEXT UNIQUE,
 "creditAccountId" TEXT REFERENCES "CreditAccount"(id),
 "refundStartedAt" TIMESTAMP(3),
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "parameters" JSONB NOT NULL,
 CHECK ("occurrenceId" IN ('cmvv9bp4g0001gt09ewtk8n57','cmw026ajl0001jn09jsqpqzij')),
 CHECK (seats=1 OR ("guestName" IS NOT NULL AND "guestPhone" IS NOT NULL AND "declaredAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "BlackFridayTicket_active_buyer" ON "BlackFridayTicket"("occurrenceId","userId") WHERE state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST');
CREATE UNIQUE INDEX "BlackFridayTicket_active_guest" ON "BlackFridayTicket"("occurrenceId","guestPhone") WHERE state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST');
CREATE TABLE "BlackFridayCapacity" ("occurrenceId" TEXT PRIMARY KEY REFERENCES "ClassOccurrence"(id), used INTEGER NOT NULL CHECK (used>=0));
INSERT INTO "BlackFridayCapacity" SELECT o.id, count(b.id)::int FROM "ClassOccurrence" o LEFT JOIN "Booking" b ON b."occurrenceId"=o.id AND b.status IN ('CONFIRMED','ATTENDED') WHERE o.id IN ('cmvv9bp4g0001gt09ewtk8n57','cmw026ajl0001jn09jsqpqzij') GROUP BY o.id;
CREATE FUNCTION bf_capacity_delta(oid TEXT, delta INTEGER) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE cap INTEGER; historical INTEGER; st TEXT;
BEGIN
 IF oid  NOT IN ('cmvv9bp4g0001gt09ewtk8n57','cmw026ajl0001jn09jsqpqzij') OR delta=0 THEN RETURN; END IF;
 SELECT capacity,"historicalSignupCount",status::text INTO cap,historical,st FROM "ClassOccurrence" WHERE id=oid FOR UPDATE;
 INSERT INTO "BlackFridayCapacity" VALUES (oid,0) ON CONFLICT DO NOTHING;
 UPDATE "BlackFridayCapacity" SET used=used+delta WHERE "occurrenceId"=oid AND used+delta>=0 AND (delta<0 OR (st='SCHEDULED' AND used+delta+historical<=cap));
 IF NOT FOUND THEN RAISE EXCEPTION 'Event seats unavailable'; END IF;
END $$;
CREATE FUNCTION bf_refresh_pending(oid TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 UPDATE "ClassOccurrence" o SET "pendingTicketSeats"=(
 SELECT COALESCE(sum(t.seats - (SELECT count(*) FROM "Booking" b WHERE b.id IN (t."buyerBookingId",t."guestBookingId") AND b.status IN ('CONFIRMED','ATTENDED'))),0)::int
 FROM "BlackFridayTicket" t WHERE t."occurrenceId"=o.id AND t.state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST'))
 WHERE id=oid;
END $$;
CREATE FUNCTION bf_ticket_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_count INTEGER:=0; after_count INTEGER:=0;
BEGIN
 IF TG_OP <> 'INSERT' AND OLD.state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST') THEN before_count:=OLD.seats; END IF;
 IF TG_OP <> 'DELETE' AND NEW.state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST') THEN after_count:=NEW.seats; END IF;
 PERFORM bf_capacity_delta(COALESCE(NEW."occurrenceId",OLD."occurrenceId"),after_count-before_count);
 PERFORM bf_refresh_pending(COALESCE(NEW."occurrenceId",OLD."occurrenceId"));
 RETURN NULL;
END $$;
CREATE TRIGGER bf_ticket_capacity AFTER INSERT OR UPDATE OR DELETE ON "BlackFridayTicket" FOR EACH ROW EXECUTE FUNCTION bf_ticket_capacity();
CREATE FUNCTION bf_booking_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF TG_OP<>'DELETE' AND NEW."occurrenceId" IN ('cmvv9bp4g0001gt09ewtk8n57','cmw026ajl0001jn09jsqpqzij') AND NEW.status IN ('CONFIRMED','ATTENDED') AND EXISTS (
   SELECT 1 FROM "BlackFridayTicket" WHERE "userId"=NEW."userId" AND "occurrenceId"=NEW."occurrenceId" AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST')
 ) THEN RAISE EXCEPTION 'Use reserved ticket fulfillment'; END IF;
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
-- AFTER avoids double accounting on INSERT ON CONFLICT paths.
CREATE TRIGGER bf_booking_capacity AFTER INSERT OR UPDATE OR DELETE ON "Booking" FOR EACH ROW EXECUTE FUNCTION bf_booking_capacity();
-- CHECKED_IN maps to a CONFIRMED Booking, so Booking guards alone cannot
-- enforce admission. The parent write serializes with reversals and invalidates
-- stale repeatable-read/serializable snapshots, including raw attendance writers.
CREATE FUNCTION bf_attendance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked "BlackFridayTicket"; st TEXT;
BEGIN
 IF NEW."occurrenceId" NOT IN ('cmvv9bp4g0001gt09ewtk8n57','cmw026ajl0001jn09jsqpqzij') AND NOT EXISTS (
   SELECT 1 FROM "BlackFridayTicket" WHERE NEW."bookingId" IN ("buyerBookingId","guestBookingId")
 ) THEN RETURN NEW; END IF;
 UPDATE "ClassOccurrence" SET "updatedAt"=clock_timestamp() WHERE id=NEW."occurrenceId" RETURNING status::text INTO st;
 SELECT * INTO linked FROM "BlackFridayTicket" WHERE NEW."bookingId" IN ("buyerBookingId","guestBookingId")
   OR ("occurrenceId"=NEW."occurrenceId" AND NEW."userId" IN ("userId","guestUserId") AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST'));
 IF FOUND AND (linked.state<>'PAID' OR st<>'SCHEDULED' OR NEW."occurrenceId"<>linked."occurrenceId"
   OR NEW."bookingId" IS DISTINCT FROM (CASE WHEN NEW."userId"=linked."userId" THEN linked."buyerBookingId" WHEN NEW."userId"=linked."guestUserId" THEN linked."guestBookingId" END)) THEN
   RAISE EXCEPTION 'Ticket is not admissible; resolve ticket review first';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_attendance_guard BEFORE INSERT OR UPDATE ON "AttendanceRecord" FOR EACH ROW EXECUTE FUNCTION bf_attendance_guard();
CREATE FUNCTION bf_occurrence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE occupied INTEGER;
BEGIN
 IF OLD.id  NOT IN ('cmvv9bp4g0001gt09ewtk8n57','cmw026ajl0001jn09jsqpqzij') THEN RETURN NEW; END IF;
 SELECT used INTO occupied FROM "BlackFridayCapacity" WHERE "occurrenceId"=OLD.id FOR UPDATE;
 IF NEW.capacity < COALESCE(occupied,0)+NEW."historicalSignupCount" THEN RAISE EXCEPTION 'Capacity below reserved seats'; END IF;
 IF NEW.status<>'SCHEDULED' AND COALESCE(occupied,0)>0 THEN RAISE EXCEPTION 'Resolve admissions before cancelling occurrence'; END IF;
 IF NEW.status<>'SCHEDULED' AND EXISTS(SELECT 1 FROM "BlackFridayTicket" WHERE "occurrenceId"=OLD.id AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST')) THEN RAISE EXCEPTION 'Resolve ticket liabilities before cancelling occurrence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_occurrence_guard BEFORE UPDATE ON "ClassOccurrence" FOR EACH ROW EXECUTE FUNCTION bf_occurrence_guard();

-- Serialize every writer to the eligible November bucket, including old deployments
-- that do not take the application entitlement lock. Updating the parent also makes
-- stale REPEATABLE READ / SERIALIZABLE snapshots abort, rather than overspend.
CREATE FUNCTION bf_credit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid TEXT; balance INTEGER;
BEGIN
 IF TG_OP<>'INSERT' AND OLD."sourceReturnKey" LIKE 'bf:%' THEN
   IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Immutable ticket credit ledger'; END IF;
 END IF;
 FOR aid IN SELECT id FROM "CreditAccount" WHERE id IN (CASE WHEN TG_OP<>'DELETE' THEN NEW."creditAccountId" END,CASE WHEN TG_OP<>'INSERT' THEN OLD."creditAccountId" END)
   AND NOT "isUnlimited" AND label='Event credit — November 2026 VIP complimentary event credit — expires 2026-11-30' ORDER BY id
 LOOP
   UPDATE "CreditAccount" SET "updatedAt"=clock_timestamp() WHERE id=aid;
   SELECT COALESCE(sum(quantity),0) INTO balance FROM "CreditLedgerEntry" WHERE "creditAccountId"=aid;
   IF balance<0 THEN RAISE EXCEPTION 'November event credit exhausted'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER bf_credit_guard AFTER INSERT OR UPDATE OR DELETE ON "CreditLedgerEntry" FOR EACH ROW EXECUTE FUNCTION bf_credit_guard();
COMMIT;
