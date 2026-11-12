-- Directory visibility only; authentication and historical records are unchanged.
ALTER TABLE "User" ADD COLUMN "archivedAt" TIMESTAMP(3);
