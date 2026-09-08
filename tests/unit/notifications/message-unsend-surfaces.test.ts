import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('conversation message unsend surfaces', () => {
  it('stores deletion state without removing the thread record', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('deletedAt        DateTime?');
  });

  it('allows members and owners to unsend only their own messages', () => {
    const memberAction = readFileSync('app/(portal)/member/messages/actions.ts', 'utf8');
    const adminAction = readFileSync('app/(studio)/admin/messages/[conversationId]/actions.ts', 'utf8');
    const memberPage = readFileSync('app/(portal)/member/messages/page.tsx', 'utf8');
    const adminPage = readFileSync('app/(studio)/admin/messages/[conversationId]/page.tsx', 'utf8');
    const confirmation = readFileSync('components/messages/UnsendMessageForm.tsx', 'utf8');

    for (const source of [memberAction, adminAction]) {
      expect(source).toContain('canUnsendMessage');
      expect(source).toContain("body: ''");
      expect(source).toContain('deletedAt: new Date()');
    }
    expect(memberPage).toContain('unsendMemberMessageAction');
    expect(adminPage).toContain('unsendAdminMessageAction');
    expect(memberPage).toContain('This message was unsent');
    expect(adminPage).toContain('This message was unsent');
    expect(confirmation).toContain("window.confirm('Unsend this message?");
  });
});
