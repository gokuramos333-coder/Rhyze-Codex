const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const maxBytes = 8 * 1024 * 1024;

export function validateUploadMetadata(file: { type: string; size: number }) {
  if (!allowedTypes.has(file.type)) return { valid: false, error: 'Use a PDF, JPG, or PNG file.' } as const;
  if (file.size <= 0 || file.size > maxBytes) return { valid: false, error: 'File must be 8 MB or smaller.' } as const;
  return { valid: true } as const;
}

export function credentialReminderDates(approvedAt: Date, expiresAt: Date) {
  const day = 24 * 60 * 60 * 1000;
  return {
    missingAt: new Date(approvedAt.getTime() + 2 * day),
    expiration: [30, 7, 1].map((days) => new Date(expiresAt.getTime() - days * day)),
  };
}
