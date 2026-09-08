import { describe, expect, it } from 'vitest';
import { getClass } from '@/lib/classes';

describe('public class catalog booking routes', () => {
  it('includes scheduled Work & Tone so its public booking detail route does not 404', () => {
    const workTone = getClass('work-tone-mswoy36a');

    expect(workTone).toMatchObject({
      slug: 'work-tone-mswoy36a',
      name: 'Work & Tone with Avery',
      category: 'strength',
      duration: 50,
    });
  });
});
