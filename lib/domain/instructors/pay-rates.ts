export const DEFAULT_STANDARD_CLASS_RATE_CENTS = 4000;

export const instructorPayMethods = [
  'STANDARD_CLASS_RATE',
  'SPECIALTY_EVENT_RATE',
  'CUSTOM_RATE',
] as const;

export type InstructorPayMethod = (typeof instructorPayMethods)[number];

export function normalizeInstructorPayMethod(value: FormDataEntryValue | null): InstructorPayMethod {
  return instructorPayMethods.includes(value as InstructorPayMethod)
    ? (value as InstructorPayMethod)
    : 'STANDARD_CLASS_RATE';
}

export function parseDollarCents(value: FormDataEntryValue | null): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const amount = Number(raw.replace(/[$,]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function instructorPayLabel(method: string) {
  if (method === 'SPECIALTY_EVENT_RATE') return 'Specialty rate deal';
  if (method === 'CUSTOM_RATE') return 'Custom class rate';
  return 'Class rate';
}

export function defaultInstructorPayForOccurrence(input: {
  isEvent: boolean;
  standardClassRateCents?: number | null;
  specialtyEventRateCents?: number | null;
}) {
  const method: InstructorPayMethod = input.isEvent ? 'SPECIALTY_EVENT_RATE' : 'STANDARD_CLASS_RATE';
  const cents = input.isEvent
    ? input.specialtyEventRateCents ?? input.standardClassRateCents ?? DEFAULT_STANDARD_CLASS_RATE_CENTS
    : input.standardClassRateCents ?? DEFAULT_STANDARD_CLASS_RATE_CENTS;
  return { method, cents };
}
