export type MembershipChangeRequestInput = {
  membershipId: string;
  type: string;
  requestedProductId: string;
  memberNote: string;
};

export function parseMembershipChangeRequest(input: MembershipChangeRequestInput) {
  const membershipId = input.membershipId.trim();
  if (!membershipId) throw new Error('Choose a membership.');
  if (input.type !== 'CHANGE' && input.type !== 'CANCEL') {
    throw new Error('Choose change or cancel.');
  }
  const requestedProductId = input.requestedProductId.trim() || null;
  if (input.type === 'CHANGE' && !requestedProductId) {
    throw new Error('Select the plan you want to change to.');
  }
  const memberNote = input.memberNote.trim();
  if (input.type === 'CANCEL' && !memberNote) {
    throw new Error('Tell management why you are cancelling.');
  }
  if (memberNote.length > 1_000) {
    throw new Error('Keep your note under 1,000 characters.');
  }
  return {
    membershipId,
    type: input.type,
    requestedProductId: input.type === 'CHANGE' ? requestedProductId : null,
    memberNote: memberNote || null,
  } as const;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export function cancellationNoticeStatus(
  nextBillingDate: Date | null,
  requestedAt = new Date(),
) {
  if (!nextBillingDate) {
    return { meetsNotice: false, daysBeforeRenewal: null } as const;
  }
  const daysBeforeRenewal = Math.max(
    0,
    Math.floor((nextBillingDate.getTime() - requestedAt.getTime()) / DAY_MS),
  );
  return {
    meetsNotice: daysBeforeRenewal >= 14,
    daysBeforeRenewal,
  } as const;
}
