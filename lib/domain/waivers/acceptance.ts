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
