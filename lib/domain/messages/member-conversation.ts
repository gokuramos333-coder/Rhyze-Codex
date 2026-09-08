type MemberReadState = {
  senderId: string;
  memberId: string;
  memberReadAt: Date | null;
};

type ManagementReadState = {
  senderId: string;
  memberId: string;
  managementReadAt: Date | null;
};

export function isUnreadForMember(message: MemberReadState) {
  return message.senderId !== message.memberId && message.memberReadAt === null;
}

export function isUnreadForManagement(message: ManagementReadState) {
  return message.senderId === message.memberId && message.managementReadAt === null;
}

export function messageReadReceipt(readAt: Date | null) {
  return readAt
    ? { status: 'READ' as const, readAt }
    : { status: 'SENT' as const, readAt: null };
}

export function canUnsendMessage(message: {
  actorId: string;
  senderId: string;
  deletedAt: Date | null;
}) {
  return message.actorId === message.senderId && message.deletedAt === null;
}

export function messageSenderLabel(message: {
  senderId: string;
  memberId: string;
  senderName: string | null;
}) {
  const memberAuthored = message.senderId === message.memberId;
  return {
    name: message.senderName || (memberAuthored ? 'Rhyze Member' : 'Rhyze Management'),
    kind: memberAuthored ? 'Member' : 'Management',
  } as const;
}
