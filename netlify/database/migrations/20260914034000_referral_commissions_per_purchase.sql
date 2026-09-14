-- Allow instructor referral commissions/discount redemptions to be recorded per qualifying purchase.
-- Previously these were unique per customer, which hid later discounted purchases from instructor/admin commission views.
ALTER TABLE "DiscountRedemption" DROP CONSTRAINT IF EXISTS "DiscountRedemption_userId_key";
ALTER TABLE "ReferralCommission" DROP CONSTRAINT IF EXISTS "ReferralCommission_referredUserId_key";

CREATE INDEX IF NOT EXISTS "DiscountRedemption_userId_createdAt_idx" ON "DiscountRedemption"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReferralCommission_referredUserId_earnedAt_idx" ON "ReferralCommission"("referredUserId", "earnedAt");
