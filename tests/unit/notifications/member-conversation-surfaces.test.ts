import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('member management conversation surfaces', () => {
  it('stores admin messages in a real conversation and links the member to it', () => {
    const action = readFileSync('app/(studio)/admin/members/[userId]/actions.ts', 'utf8');
    expect(action).toContain('memberConversation.upsert');
    expect(action).toContain('memberConversationMessage.create');
    expect(action).toContain("link: '/member/messages'");
  });

  it('provides secured member and management thread pages with replies', () => {
    const memberPage = readFileSync('app/(portal)/member/messages/page.tsx', 'utf8');
    const memberActions = readFileSync('app/(portal)/member/messages/actions.ts', 'utf8');
    const adminPage = readFileSync('app/(studio)/admin/messages/[conversationId]/page.tsx', 'utf8');
    const adminActions = readFileSync('app/(studio)/admin/messages/[conversationId]/actions.ts', 'utf8');
    expect(memberPage).toContain('replyToManagementAction');
    expect(memberPage).toContain('sender.name');
    expect(memberPage).toContain('createdAt');
    expect(memberActions).toContain("template: 'MEMBER_REPLY'");
    expect(adminPage).toContain('replyToMemberAction');
    expect(adminPage).toContain('conversation.member.name');
    expect(adminPage).toContain('message.memberReadAt');
    expect(memberPage).toContain('message.managementReadAt');
    expect(adminPage).toContain('✓✓ Read');
    expect(memberPage).toContain('✓✓ Read');
    expect(adminActions).toContain("template: 'ADMIN_MESSAGE'");
  });

  it('lists member conversations in the admin inbox', () => {
    const page = readFileSync('app/(studio)/admin/messages/page.tsx', 'utf8');
    expect(page).toContain('MEMBER CONVERSATIONS');
    expect(page).toContain('/admin/messages/');
    expect(page).toContain('requireApprovedOwner');
    expect(page).toContain('userId: actor.id');
    expect(page).toContain("link: { startsWith: '/admin/messages/' }");
  });

  it('keeps owner read state separate and records the replying owner', () => {
    const thread = readFileSync('app/(studio)/admin/messages/[conversationId]/page.tsx', 'utf8');
    const action = readFileSync('app/(studio)/admin/messages/[conversationId]/actions.ts', 'utf8');
    const layout = readFileSync('app/(studio)/admin/layout.tsx', 'utf8');

    expect(thread).toContain('userId: actor.id');
    expect(thread).toContain('Replying as {actor.name || actor.email}');
    expect(action).toContain('senderId: actor.id');
    expect(action).toContain("senderName: actor.name || 'Rhyze Management'");
    expect(layout).toContain('userId: user.id');
    expect(layout).toContain("link: { startsWith: '/admin/messages/' }");
  });

  it('renders direct thread links in conversation emails', () => {
    const email = readFileSync('lib/notifications/email-templates.ts', 'utf8');
    expect(email).toContain('ADMIN_MESSAGE:');
    expect(email).toContain('MEMBER_REPLY:');
    expect(email).toContain("text(p, 'messageUrl'");
  });
});
