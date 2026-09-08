DO $$
DECLARE
  target RECORD;
  membership_row RECORD;
  affected_count INTEGER;
  jolie_user_id TEXT;
  jolie_credit_account_id TEXT;
  deletion_actor_id TEXT;
BEGIN
  FOR target IN
    SELECT *
    FROM (VALUES
      ('jolielampkin@gmail.com', 'OG Rhyze Tribe'),
      ('amyanjum2@gmail.com', 'The VIP Access Pass'),
      ('kimrusbach@gmail.com', 'The VIP Access Pass')
    ) AS requested(email, product_name)
  LOOP
    SELECT COUNT(*)
    INTO affected_count
    FROM "Membership" m
    JOIN "User" u ON u."id" = m."userId"
    JOIN "Product" p ON p."id" = m."productId"
    WHERE LOWER(u."email") = target.email
      AND p."name" = target.product_name
      AND m."status" = 'ACTIVE'
      AND m."stripeSubscriptionId" IS NULL;

    IF affected_count <> 1 THEN
      RAISE EXCEPTION 'Somble renewal correction expected exactly one membership for %', target.email;
    END IF;

    SELECT
      m."id",
      m."currentPeriodStart",
      m."currentPeriodEnd",
      m."activatedAt"
    INTO membership_row
    FROM "Membership" m
    JOIN "User" u ON u."id" = m."userId"
    JOIN "Product" p ON p."id" = m."productId"
    WHERE LOWER(u."email") = target.email
      AND p."name" = target.product_name
      AND m."status" = 'ACTIVE'
      AND m."stripeSubscriptionId" IS NULL;

    INSERT INTO "AuditLog" (
      "id", "actorId", "action", "entityType", "entityId", "before", "after", "createdAt"
    ) VALUES (
      'rhyze-somble-renewal-' || replace(split_part(target.email, '@', 1), '.', '-'),
      NULL,
      'membership.somble-cycle-corrected',
      'Membership',
      membership_row."id",
      jsonb_build_object(
        'currentPeriodStart', membership_row."currentPeriodStart",
        'currentPeriodEnd', membership_row."currentPeriodEnd",
        'activatedAt', membership_row."activatedAt"
      ),
      jsonb_build_object(
        'reason', 'Pre-opening Somble subscription begins with the August 3 studio opening',
        'currentPeriodStart', '2026-08-03T04:00:00.000Z',
        'currentPeriodEnd', '2026-09-03T04:00:00.000Z',
        'activatedAt', '2026-08-03T04:00:00.000Z'
      ),
      CURRENT_TIMESTAMP
    );

    UPDATE "Membership"
    SET
      "currentPeriodStart" = '2026-08-03T04:00:00.000Z',
      "currentPeriodEnd" = '2026-09-03T04:00:00.000Z',
      "activatedAt" = '2026-08-03T04:00:00.000Z',
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = membership_row."id";
  END LOOP;

  SELECT u."id"
  INTO jolie_user_id
  FROM "User" u
  WHERE LOWER(u."email") = 'jolielampkin@gmail.com';

  IF jolie_user_id IS NULL THEN
    RAISE EXCEPTION 'Jolie Lampkin was not found';
  END IF;

  SELECT ca."id"
  INTO jolie_credit_account_id
  FROM "CreditAccount" ca
  WHERE ca."id" = 'cmt0yi470004ql209129cxhtv'
    AND ca."userId" = jolie_user_id
    AND ca."sourcePurchaseId" IS NULL
    AND ca."isUnlimited" = false
    AND ca."label" = 'Class credit — Manual admin grant — expires 2026-08-22'
    AND EXISTS (
      SELECT 1
      FROM "CreditLedgerEntry" cle
      WHERE cle."creditAccountId" = ca."id"
        AND cle."type" = 'GRANT'
        AND cle."quantity" = 3
        AND cle."reason" = 'Manual admin credit grant: extra'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditLedgerEntry" cle
      WHERE cle."creditAccountId" = ca."id"
        AND cle."bookingId" IS NOT NULL
    );

  IF jolie_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Jolie Lampkin unused three-credit test grant was not found';
  END IF;

  SELECT al."actorId"
  INTO deletion_actor_id
  FROM "AuditLog" al
  WHERE al."action" = 'credit.manual-grant'
    AND al."after"->>'creditAccountId' = jolie_credit_account_id
  ORDER BY al."createdAt" DESC
  LIMIT 1;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "before", "after", "createdAt"
  ) VALUES (
    'rhyze-jolie-test-credit-delete-20260820',
    deletion_actor_id,
    'credit.manual-delete',
    'CreditAccount',
    jolie_credit_account_id,
    jsonb_build_object(
      'userId', jolie_user_id,
      'label', 'Class credit — Manual admin grant — expires 2026-08-22',
      'quantity', 3,
      'reason', 'Manual admin credit grant: extra'
    ),
    jsonb_build_object(
      'deleted', true,
      'reason', 'Owner requested removal of unused test grant'
    ),
    CURRENT_TIMESTAMP
  );

  DELETE FROM "CreditLedgerEntry"
  WHERE "creditAccountId" = jolie_credit_account_id;

  DELETE FROM "CreditAccount"
  WHERE "id" = jolie_credit_account_id;
END $$;
