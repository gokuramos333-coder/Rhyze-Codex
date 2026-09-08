INSERT INTO "MemberConversation" ("id", "memberId", "subject", "createdAt", "updatedAt")
SELECT
  'legacy-conv-' || md5(source."userId"),
  source."userId",
  source."subject",
  source."createdAt",
  source."createdAt"
FROM (
  SELECT DISTINCT ON (email."userId")
    email."userId",
    email."subject",
    email."createdAt"
  FROM "EmailMessage" email
  WHERE email."template" = 'ADMIN_MESSAGE' AND email."userId" IS NOT NULL
  ORDER BY email."userId", email."createdAt" ASC
) source
ON CONFLICT ("memberId") DO NOTHING;

INSERT INTO "MemberConversationMessage" (
  "id",
  "conversationId",
  "senderId",
  "subject",
  "body",
  "memberReadAt",
  "managementReadAt",
  "createdAt"
)
SELECT
  'legacy-msg-' || email."id",
  conversation."id",
  owner."id",
  email."subject",
  COALESCE(email."payload"->>'body', email."subject"),
  notification."readAt",
  email."createdAt",
  email."createdAt"
FROM "EmailMessage" email
JOIN "MemberConversation" conversation ON conversation."memberId" = email."userId"
CROSS JOIN LATERAL (
  SELECT "id"
  FROM "User"
  WHERE "role" = 'OWNER' AND "status" = 'ACTIVE'
  ORDER BY "createdAt" ASC
  LIMIT 1
) owner
LEFT JOIN "InAppNotification" notification
  ON notification."id" = email."payload"->>'notificationId'
WHERE email."template" = 'ADMIN_MESSAGE' AND email."userId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "MemberConversation" conversation
SET "updatedAt" = latest."createdAt"
FROM (
  SELECT "conversationId", MAX("createdAt") AS "createdAt"
  FROM "MemberConversationMessage"
  GROUP BY "conversationId"
) latest
WHERE conversation."id" = latest."conversationId";

UPDATE "InAppNotification" notification
SET "link" = '/member/messages'
FROM "EmailMessage" email
WHERE email."template" = 'ADMIN_MESSAGE'
  AND notification."id" = email."payload"->>'notificationId';
