export function isAdminAssignment(policy: unknown) {
  return Boolean(policy && typeof policy === 'object' && 'source' in policy && policy.source === 'ADMIN_ASSIGNMENT');
}

/** Fixed gifts have a bounded class window; paid recurring rollover is separate. */
export function manualAssignmentWindowAllows(input: {
  policyAcceptance: unknown;
  validFrom?: Date;
  validUntil?: Date | null;
  membershipEnd?: Date | null;
  now: Date;
  occurrenceStartsAt?: Date;
}) {
  if (!isAdminAssignment(input.policyAcceptance)) return true;
  const assignment = input.policyAcceptance as { accessEndsAt?: string };
  if (!input.validFrom || !input.validUntil || !assignment.accessEndsAt) return false;
  const end = Math.min(input.validUntil.getTime(), Date.parse(assignment.accessEndsAt), input.membershipEnd?.getTime() ?? Infinity);
  const start = input.validFrom.getTime();
  const occurrence = input.occurrenceStartsAt?.getTime() ?? input.now.getTime();
  return input.now.getTime() >= start && input.now.getTime() < end && occurrence >= start && occurrence < end;
}
