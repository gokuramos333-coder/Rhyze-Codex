-- Erika Rivera has private unlimited VIP access through February 1, 2027.
-- Remove only the obsolete six-class manual grant so it is not displayed as
-- a second, expiring credit balance on her profile.

DELETE FROM "CreditLedgerEntry"
WHERE "creditAccountId" IN (
  SELECT ca."id"
  FROM "CreditAccount" ca
  JOIN "User" u ON u."id" = ca."userId"
  WHERE lower(u."email") = 'erikamun78@gmail.com'
    AND ca."id" = 'cmsouq01o0086lc090yfax13o'
    AND ca."id" <> 'rhyze-erika-gifted-vip-credit-2026'
    AND ca."label" = 'Class credit — Manual admin grant — expires 2026-08-17'
    AND ca."isUnlimited" = false
);

DELETE FROM "CreditAccount" ca
USING "User" u
WHERE u."id" = ca."userId"
  AND lower(u."email") = 'erikamun78@gmail.com'
  AND ca."id" = 'cmsouq01o0086lc090yfax13o'
  AND ca."id" <> 'rhyze-erika-gifted-vip-credit-2026'
  AND ca."label" = 'Class credit — Manual admin grant — expires 2026-08-17'
  AND ca."isUnlimited" = false;
