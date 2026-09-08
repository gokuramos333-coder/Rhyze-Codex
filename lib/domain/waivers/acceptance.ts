export function parseAgreementAcceptance(input: {
  accepted: FormDataEntryValue | null;
  mediaConsent: FormDataEntryValue | null;
}) {
  if (input.accepted !== 'on') {
    throw new Error('Agreement acceptance is required.');
  }
  return {
    accepted: true as const,
    mediaConsent: input.mediaConsent === 'on',
  };
}

export function parseSignedDate(value: FormDataEntryValue | null): Date {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Signing date is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('Enter a valid signing date.');
  }
  const signedDate = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(signedDate.getTime())) {
    throw new Error('Enter a valid signing date.');
  }
  return signedDate;
}

export function bookingWaiverDestination(occurrenceId: string): string {
  const returnTo = `/member/bookings/new?occurrence=${encodeURIComponent(occurrenceId)}`;
  return `/member/waiver?returnTo=${encodeURIComponent(returnTo)}`;
}

export function membershipWaiverDestination(): string {
  return `/member/waiver?returnTo=${encodeURIComponent('/member/membership')}`;
}

export function eventCheckoutWaiverDestination(slug: string): string {
  return `/member/waiver?returnTo=${encodeURIComponent(`/book/event/${encodeURIComponent(slug)}`)}`;
}

export function waiverCompletionDestination(value: unknown): string {
  const returnTo = String(value || '');
  if (returnTo === '/member/profile' || returnTo === '/instructor/profile') {
    return `${returnTo}?saved=agreement`;
  }
  if (returnTo === '/member/membership') {
    return `${returnTo}?saved=agreement`;
  }
  if (/^\/member\/bookings\/new\?occurrence=[^&]+$/.test(returnTo)) {
    return returnTo;
  }
  if (/^\/book\/event\/[a-z0-9-]+$/.test(returnTo)) {
    return returnTo;
  }
  return '/member/waiver?saved=1';
}
