import { describe, expect, it } from 'vitest';
import {
  canManageOccurrence,
  confirmedRecipientIds,
} from '@/lib/domain/class-messages/class-message-service';

describe('instructor class messages', () => {
  it('allows only the assigned instructor', () => {
    expect(canManageOccurrence('instructor-a', 'instructor-a')).toBe(true);
    expect(canManageOccurrence('instructor-a', 'instructor-b')).toBe(false);
    expect(canManageOccurrence('instructor-a', null)).toBe(false);
  });

  it('targets confirmed attendees only and removes duplicates', () => {
    expect(confirmedRecipientIds([
      { userId: 'one', status: 'CONFIRMED' },
      { userId: 'two', status: 'CANCELLED' },
      { userId: 'one', status: 'CONFIRMED' },
      { userId: 'three', status: 'ATTENDED' },
    ])).toEqual(['one']);
  });
});
