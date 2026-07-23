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
