import { describe, expect, it } from 'vitest';
import {
  adminRosterHref,
  instructorRosterHref,
} from '@/lib/admin/assigned-roster-navigation';

describe('assigned roster navigation', () => {
  it('opens an instructor-scoped attendee roster', () => {
    expect(instructorRosterHref('class-123')).toBe(
      '/instructor/classes/class-123/roster',
    );
  });

  it('opens the admin attendee roster', () => {
    expect(adminRosterHref('class-123')).toBe(
      '/admin/schedule/class-123/roster',
    );
  });

  it('encodes occurrence ids before adding them to a URL', () => {
    expect(adminRosterHref('class / 123')).toBe(
      '/admin/schedule/class%20%2F%20123/roster',
    );
  });
});
