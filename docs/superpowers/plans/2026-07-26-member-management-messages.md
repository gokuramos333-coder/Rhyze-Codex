# Member–Management Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure two-way member/management inbox with unread alerts, then add sign-in password visibility and management-neutral membership copy.

**Architecture:** Store conversation history in dedicated Prisma models and use existing in-app notifications plus the queued email worker for delivery alerts. Keep member and owner authorization at every query/action boundary. Share a small password input component between auth pages.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Prisma/PostgreSQL, Vitest, Resend-backed email queue.

## Global Constraints

- Preserve the existing Rhyze dark/coral/gold styling.
- Approved owners share one management inbox; each message still shows its actual sender.
- Keep email sending outside page requests by queueing records.
- Do not refactor unrelated dirty-worktree files.

---

### Task 1: Conversation domain and database

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260726233000_member_management_conversations/migration.sql`
- Create: `lib/domain/messages/member-conversation.ts`
- Test: `tests/unit/notifications/member-conversation.test.ts`

**Interfaces:**
- Produces: unread predicates/count helpers and Prisma conversation/message records used by both portals.

- [ ] Write failing tests for member-visible messages, management-visible messages, unread counting, and sender labels.
- [ ] Run the focused test and confirm it fails because the helper does not exist.
- [ ] Implement the minimal helper and Prisma models.
- [ ] Generate Prisma Client and run the focused test.
- [ ] Apply the migration to the configured development database.

### Task 2: Management send, inbox, and thread

**Files:**
- Modify: `app/(studio)/admin/members/[userId]/actions.ts`
- Modify: `app/(studio)/admin/messages/page.tsx`
- Create: `app/(studio)/admin/messages/[conversationId]/page.tsx`
- Create: `app/(studio)/admin/messages/[conversationId]/actions.ts`
- Modify: `lib/notifications/email-content.ts`
- Test: `tests/unit/notifications/member-conversation-surfaces.test.ts`

**Interfaces:**
- Consumes: `MemberConversation`, `MemberConversationMessage`, `queueEmail`, `requireApprovedOwner`.
- Produces: `/admin/messages/[conversationId]` and management reply actions.

- [ ] Write a failing surface test for real thread destinations, inbox links, reply action, and email destination.
- [ ] Run it and confirm the missing conversation implementation causes failure.
- [ ] Change admin member messages to upsert the member conversation and create the first message.
- [ ] Add the management inbox list and secured thread page/action.
- [ ] Queue member notifications and email for every management reply.
- [ ] Run the focused tests.

### Task 3: Member thread and unread badge

**Files:**
- Modify: `app/(portal)/member/layout.tsx`
- Create: `app/(portal)/member/messages/page.tsx`
- Create: `app/(portal)/member/messages/actions.ts`
- Modify: `components/app-shell/PortalShell.tsx`
- Modify: `components/member/UnreadNotificationAlert.tsx`
- Modify: `lib/navigation/member-navigation.ts`
- Test: `tests/unit/notifications/member-unread-alert.test.ts`
- Test: `tests/unit/notifications/member-conversation-surfaces.test.ts`

**Interfaces:**
- Consumes: conversation records and approved-owner lookup.
- Produces: member reply action, thread UI, member read transitions, and `unreadCount` portal-shell prop.

- [ ] Extend failing tests for `/member/messages`, sender/time metadata, replies, and the red badge.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Build the secured member thread and reply action.
- [ ] Queue owner in-app notifications and owner email when the member replies.
- [ ] Mark opened management messages read and display the unread count badge.
- [ ] Run the focused tests.

### Task 4: Sign-in password visibility and membership copy

**Files:**
- Create: `components/domain/accounts/PasswordField.tsx`
- Modify: `components/domain/accounts/SignUpForm.tsx`
- Modify: `app/(auth)/sign-in/page.tsx`
- Modify: `app/(portal)/member/membership/page.tsx`
- Create: `tests/unit/accounts/sign-in-password.test.ts`
- Modify: `tests/unit/memberships/change-request.test.ts`

**Interfaces:**
- Produces: reusable `PasswordField` with accessible show/hide behavior.

- [ ] Write failing tests for the sign-in show/hide control and management-neutral copy.
- [ ] Run them and confirm both failures.
- [ ] Extract and reuse the password field on sign-up and sign-in.
- [ ] Replace owner-name-specific membership copy.
- [ ] Run the focused tests.

### Task 5: Full verification

**Files:**
- Verify all modified files.

- [ ] Run `npx prisma validate` and `npx prisma generate`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Review the final diff for unrelated edits and report any external email configuration risk.
