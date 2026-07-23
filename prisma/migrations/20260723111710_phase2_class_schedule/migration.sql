-- CreateEnum
CREATE TYPE "ClassIntensity" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'ALL_LEVELS');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "ClassCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTemplate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "intensity" "ClassIntensity" NOT NULL DEFAULT 'ALL_LEVELS',
    "defaultCapacity" INTEGER NOT NULL,
    "dropInPriceCents" INTEGER,
    "tags" TEXT[],
    "equipment" TEXT[],
    "cancellationPolicy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSeries" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "instructorId" TEXT,
    "roomId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "recurrenceRule" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "priceCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassOccurrence" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "seriesId" TEXT,
    "instructorId" TEXT,
    "roomId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "capacity" INTEGER NOT NULL,
    "priceCents" INTEGER,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "publicNotes" TEXT,
    "internalNotes" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassCategory_slug_key" ON "ClassCategory"("slug");

-- CreateIndex
CREATE INDEX "ClassCategory_isActive_name_idx" ON "ClassCategory"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTemplate_slug_key" ON "ClassTemplate"("slug");

-- CreateIndex
CREATE INDEX "ClassTemplate_categoryId_isActive_idx" ON "ClassTemplate"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "ClassTemplate_archivedAt_idx" ON "ClassTemplate"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_locationId_name_key" ON "Room"("locationId", "name");

-- CreateIndex
CREATE INDEX "ClassSeries_templateId_isActive_idx" ON "ClassSeries"("templateId", "isActive");

-- CreateIndex
CREATE INDEX "ClassSeries_instructorId_startsAt_idx" ON "ClassSeries"("instructorId", "startsAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_startAt_status_idx" ON "ClassOccurrence"("startAt", "status");

-- CreateIndex
CREATE INDEX "ClassOccurrence_instructorId_startAt_endAt_idx" ON "ClassOccurrence"("instructorId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_roomId_startAt_endAt_idx" ON "ClassOccurrence"("roomId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_templateId_startAt_idx" ON "ClassOccurrence"("templateId", "startAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_seriesId_startAt_idx" ON "ClassOccurrence"("seriesId", "startAt");

-- AddForeignKey
ALTER TABLE "ClassTemplate" ADD CONSTRAINT "ClassTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClassCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ClassSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
