import { describe, expect, it } from 'vitest';
import {
  canUnsendMessage,
  isUnreadForManagement,
  isUnreadForMember,
  messageReadReceipt,
  messageSenderLabel,
} from '@/lib/domain/messages/member-conversation';

describe('member management conversation rules', () => {
  it('counts only unread management messages for the member', () => {
    expect(isUnreadForMember({ senderId: 'owner-1', memberId: 'member-1', memberReadAt: null })).toBe(true);
    expect(isUnreadForMember({ senderId: 'member-1', memberId: 'member-1', memberReadAt: null })).toBe(false);
    expect(isUnreadForMember({ senderId: 'owner-1', memberId: 'member-1', memberReadAt: new Date() })).toBe(false);
  });

  it('counts only unread member messages for management', () => {
    expect(isUnreadForManagement({ senderId: 'member-1', memberId: 'member-1', managementReadAt: null })).toBe(true);
    expect(isUnreadForManagement({ senderId: 'owner-1', memberId: 'member-1', managementReadAt: null })).toBe(false);
    expect(isUnreadForManagement({ senderId: 'member-1', memberId: 'member-1', managementReadAt: new Date() })).toBe(false);
  });

  it('shows the actual author while identifying management', () => {
    expect(messageSenderLabel({ senderId: 'owner-1', memberId: 'member-1', senderName: 'Vanessa Ramos' })).toEqual({
      name: 'Vanessa Ramos',
      kind: 'Management',
    });
    expect(messageSenderLabel({ senderId: 'member-1', memberId: 'member-1', senderName: 'Gui Ramos' })).toEqual({
      name: 'Gui Ramos',
      kind: 'Member',
    });
  });

  it('shows sent until the recipient opens the portal thread, then read', () => {
    expect(messageReadReceipt(null)).toEqual({ status: 'SENT', readAt: null });
    const readAt = new Date('2026-07-26T20:15:00.000Z');
    expect(messageReadReceipt(readAt)).toEqual({ status: 'READ', readAt });
  });

  it('only lets the author unsend a message that is still present', () => {
    expect(canUnsendMessage({ actorId: 'owner-1', senderId: 'owner-1', deletedAt: null })).toBe(true);
    expect(canUnsendMessage({ actorId: 'owner-2', senderId: 'owner-1', deletedAt: null })).toBe(false);
    expect(canUnsendMessage({ actorId: 'owner-1', senderId: 'owner-1', deletedAt: new Date() })).toBe(false);
  });
});
