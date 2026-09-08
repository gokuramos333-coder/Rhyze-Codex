CREATE TABLE "MemberConversation" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "memberReadAt" TIMESTAMP(3),
    "managementReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberConversation_memberId_key" ON "MemberConversation"("memberId");
CREATE INDEX "MemberConversation_updatedAt_idx" ON "MemberConversation"("updatedAt");
CREATE INDEX "MemberConversationMessage_conversationId_createdAt_idx" ON "MemberConversationMessage"("conversationId", "createdAt");
CREATE INDEX "MemberConversationMessage_senderId_createdAt_idx" ON "MemberConversationMessage"("senderId", "createdAt");
CREATE INDEX "MemberConversationMessage_conversationId_memberReadAt_idx" ON "MemberConversationMessage"("conversationId", "memberReadAt");
CREATE INDEX "MemberConversationMessage_conversationId_managementReadAt_idx" ON "MemberConversationMessage"("conversationId", "managementReadAt");

ALTER TABLE "MemberConversation" ADD CONSTRAINT "MemberConversation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberConversationMessage" ADD CONSTRAINT "MemberConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MemberConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberConversationMessage" ADD CONSTRAINT "MemberConversationMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
