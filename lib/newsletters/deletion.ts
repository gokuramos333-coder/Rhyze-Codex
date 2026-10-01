/** Shared UI/server rule. Delivery history must outlive campaign cleanup. */
export const deletableCampaignStatuses = [
  'DRAFT',
  'NEEDS_REVIEW',
  'CANCELLED',
  'FAILED',
] as const;

export function campaignDeletionBlock(c: {
  status: string;
  templateType: string;
  sentSnapshot: unknown;
  sentAt: unknown;
  recipientCount: number;
}) {
  if (
    c.templateType === 'LEGACY' ||
    c.sentSnapshot ||
    c.sentAt ||
    c.recipientCount > 0 ||
    ['SENDING', 'SENT', 'PARTIALLY_SENT'].includes(c.status)
  )
    return 'Campaigns with delivery history cannot be deleted. Their email records are retained.';
  if (c.status === 'SCHEDULED')
    return 'Cancel the scheduled send before deleting this campaign.';
  if (!deletableCampaignStatuses.some((status) => status === c.status))
    return 'This campaign cannot be deleted in its current state.';
  return null;
}
