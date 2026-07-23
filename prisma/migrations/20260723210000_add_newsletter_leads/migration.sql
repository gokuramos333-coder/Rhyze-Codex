CREATE TABLE "NewsletterLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'website-footer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterLead_email_key" ON "NewsletterLead"("email");
CREATE INDEX "NewsletterLead_createdAt_idx" ON "NewsletterLead"("createdAt");
