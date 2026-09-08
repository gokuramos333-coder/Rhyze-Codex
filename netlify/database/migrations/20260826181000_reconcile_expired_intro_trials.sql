DO $$
DECLARE
  expired_membership_count INTEGER := 0;
  synced_credit_count INTEGER := 0;
BEGIN
  WITH expired_intro AS (
    SELECT
      membership."id" AS membership_id,
      membership."userId",
      membership."purchaseId",
      membership."currentPeriodEnd"
    FROM "Membership" AS membership
    JOIN "Product" AS product ON product."id" = membership."productId"
    WHERE product."kind" = 'INTRO_TRIAL'
      AND membership."status" IN ('TRIALING', 'ACTIVE')
      AND membership."activatedAt" IS NOT NULL
      AND membership."currentPeriodEnd" <= CURRENT_TIMESTAMP
  ), synced_credits AS (
    UPDATE "CreditAccount" AS account
    SET
      "validUntil" = expired_intro."currentPeriodEnd",
      "updatedAt" = CURRENT_TIMESTAMP
    FROM expired_intro
    WHERE account."sourcePurchaseId" = expired_intro."purchaseId"
      AND (
        account."validUntil" IS NULL
        OR account."validUntil" > expired_intro."currentPeriodEnd"
      )
    RETURNING account."id"
  )
  SELECT COUNT(*) INTO synced_credit_count FROM synced_credits;

  WITH expired AS (
    UPDATE "Membership" AS membership
    SET "status" = 'EXPIRED', "updatedAt" = CURRENT_TIMESTAMP
    FROM "Product" AS product
    WHERE product."id" = membership."productId"
      AND product."kind" = 'INTRO_TRIAL'
      AND membership."status" IN ('TRIALING', 'ACTIVE')
      AND membership."activatedAt" IS NOT NULL
      AND membership."currentPeriodEnd" <= CURRENT_TIMESTAMP
    RETURNING membership."id"
  )
  SELECT COUNT(*) INTO expired_membership_count FROM expired;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "after", "createdAt"
  ) VALUES (
    'rhyze-expired-intro-trial-reconciliation-20260826',
    NULL,
    'memberships.expired-intro-trials-reconciled',
    'Membership',
    NULL,
    jsonb_build_object(
      'expiredMemberships', expired_membership_count,
      'syncedTrialCredits', synced_credit_count,
      'deletedRecords', 0,
      'rule', 'Expire intro-trial access after the seven-day trial window while retaining purchase and attendance history.'
    ),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO NOTHING;
END $$;
