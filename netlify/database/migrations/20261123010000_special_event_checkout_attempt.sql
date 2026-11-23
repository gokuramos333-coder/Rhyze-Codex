-- Keep retry scheduling independent of the ticket admission and capacity triggers.
CREATE TABLE "SpecialEventCheckoutAttempt" (
  "orderId" TEXT PRIMARY KEY REFERENCES "BlackFridayTicket"("orderId") ON DELETE CASCADE,
  "attemptedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BlackFridayTicket_held_expiry" ON "BlackFridayTicket" ("expiresAt", "orderId") WHERE state='HELD';
