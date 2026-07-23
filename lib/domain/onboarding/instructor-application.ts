const INSTRUCTOR_ACCESS_CODE = 'RZTRIBE2026';

export type InstructorCodeResult = 'NONE' | 'PENDING' | 'INVALID';

export function classifyInstructorCode(code: string | null): InstructorCodeResult {
  const normalized = code?.trim().toUpperCase() || '';
  if (!normalized) return 'NONE';
  if (normalized === INSTRUCTOR_ACCESS_CODE) return 'PENDING';
  return 'INVALID';
}
