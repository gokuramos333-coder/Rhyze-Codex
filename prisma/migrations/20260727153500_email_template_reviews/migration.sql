CREATE TABLE "EmailTemplateReview" (
  "id" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedById" TEXT NOT NULL,
  "approvedByEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailTemplateReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailTemplateReview_template_key" ON "EmailTemplateReview"("template");
CREATE INDEX "EmailTemplateReview_approvedAt_idx" ON "EmailTemplateReview"("approvedAt");
