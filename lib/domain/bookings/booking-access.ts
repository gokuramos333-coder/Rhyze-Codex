import {
  accessTypeForProductKind,
  type BookingAccessType,
} from '@/lib/domain/bookings/cancellation-policy';

function snapshotValue(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export function bookingAccessType(input: {
  policySnapshot: unknown;
  bookingSource: string;
  reservedProductKind: string | null;
  activeProductKinds: string[];
}): BookingAccessType {
  if (input.bookingSource === 'OWNER_COMPLIMENTARY') return 'COMPLIMENTARY';

  const savedAccessType = snapshotValue(input.policySnapshot, 'accessType');
  if (
    savedAccessType === 'STANDARD' ||
    savedAccessType === 'INTRO_TRIAL' ||
    savedAccessType === 'VIP' ||
    savedAccessType === 'COMPLIMENTARY'
  ) {
    return savedAccessType;
  }

  const savedProductKind = snapshotValue(
    input.policySnapshot,
    'accessProductKind',
  );
  if (savedProductKind) return accessTypeForProductKind(savedProductKind);
  if (input.reservedProductKind) {
    return accessTypeForProductKind(input.reservedProductKind);
  }
  if (input.activeProductKinds.includes('VIP')) return 'VIP';
  if (input.activeProductKinds.includes('INTRO_TRIAL')) return 'INTRO_TRIAL';
  return 'STANDARD';
}

export function bookingPolicySnapshotWithAccess(input: {
  currentSnapshot: unknown;
  accessType: BookingAccessType;
  accessProductKind: string | null;
}) {
  const current = input.currentSnapshot && typeof input.currentSnapshot === 'object'
    && !Array.isArray(input.currentSnapshot)
    ? input.currentSnapshot as Record<string, unknown>
    : {};
  return {
    ...current,
    accessType: input.accessType,
    accessProductKind: input.accessProductKind,
  };
}
