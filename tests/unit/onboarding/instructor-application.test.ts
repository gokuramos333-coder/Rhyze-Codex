import { describe, expect, it } from 'vitest';
import { classifyInstructorCode } from '@/lib/domain/onboarding/instructor-application';

describe('instructor application code', () => {
  it('treats a blank code as a normal member signup', () => {
    expect(classifyInstructorCode('')).toBe('NONE');
    expect(classifyInstructorCode(null)).toBe('NONE');
  });

  it('creates a pending application for the approved code', () => {
    expect(classifyInstructorCode(' rztribe2026 ')).toBe('PENDING');
  });

  it('rejects any other instructor code', () => {
    expect(classifyInstructorCode('RZTRIBE2025')).toBe('INVALID');
  });
});
