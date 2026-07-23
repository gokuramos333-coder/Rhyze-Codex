-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('INSURANCE', 'CPR');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('UNDER_REVIEW', 'VALID', 'REJECTED');

-- AlterTable
ALTER TABLE "MemberProfile" ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "InstructorCredential" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstructorCredential_instructorId_type_status_idx" ON "InstructorCredential"("instructorId", "type", "status");

-- CreateIndex
CREATE INDEX "InstructorCredential_expiresAt_status_idx" ON "InstructorCredential"("expiresAt", "status");

-- AddForeignKey
ALTER TABLE "InstructorCredential" ADD CONSTRAINT "InstructorCredential_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorCredential" ADD CONSTRAINT "InstructorCredential_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
