export type ActiveWaiver = {
  id: string;
  requiresSign: boolean;
};

export function hasAcceptedRequiredWaiver(
  activeWaiver: ActiveWaiver | null,
  acceptances: ReadonlyArray<{ waiverVersionId: string }>,
): boolean {
  if (!activeWaiver) return false;
  if (!activeWaiver.requiresSign) return true;

  return acceptances.some(
    (acceptance) => acceptance.waiverVersionId === activeWaiver.id,
  );
}
