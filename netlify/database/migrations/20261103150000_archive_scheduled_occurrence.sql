-- Remove from schedules without destroying bookings or financial history.
ALTER TABLE "ClassOccurrence" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "archived_occurrence_not_scheduled"
  CHECK ("archivedAt" IS NULL OR status = 'CANCELLED');
CREATE FUNCTION rhyze_reject_archived_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE archived TIMESTAMP(3);
BEGIN
  IF (TG_TABLE_NAME = 'Booking' AND NEW.status::text IN ('CONFIRMED','ATTENDED','NO_SHOW'))
     OR (TG_TABLE_NAME = 'WaitlistEntry' AND NEW.status::text IN ('WAITING','PROMOTED')) THEN
    SELECT "archivedAt" INTO archived FROM "ClassOccurrence" WHERE id = NEW."occurrenceId" FOR SHARE;
    IF archived IS NOT NULL THEN RAISE EXCEPTION 'This scheduled date was removed'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_archived_booking BEFORE INSERT OR UPDATE OF status, "occurrenceId" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION rhyze_reject_archived_admission();
CREATE TRIGGER reject_archived_waitlist BEFORE INSERT OR UPDATE OF status, "occurrenceId" ON "WaitlistEntry"
  FOR EACH ROW EXECUTE FUNCTION rhyze_reject_archived_admission();
