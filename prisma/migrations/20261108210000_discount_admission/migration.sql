CREATE TABLE "DiscountCheckoutAdmission" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE RESTRICT,
 "purchaseId" TEXT NOT NULL UNIQUE REFERENCES "Purchase"("id") ON DELETE RESTRICT,
 "productId" TEXT NOT NULL,
 "code" TEXT NOT NULL,
 "params" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "sessionId" TEXT,
 "url" TEXT
);
