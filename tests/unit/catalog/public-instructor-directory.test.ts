import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public instructor directory', () => {
  it('allows published instructor profiles to use placeholder bio copy', () => {
    const source = readFileSync('app/instructors/page.tsx', 'utf8');

    expect(source).toContain(
      'if (!base && !profile.photoUrl) continue;',
    );
    expect(source).toContain(
      "bio: profile.bio || 'Instructor profile details are coming soon.'",
    );
    expect(source).toContain('bioIsPlaceholder: !profile.bio');
  });

  it('publishes only active database profiles instead of restoring removed static instructors', () => {
    const source = readFileSync('app/instructors/page.tsx', 'utf8');

    expect(source).toContain('where: { isActive: true }');
    expect(source).not.toContain('published.push(...instructors.filter');
  });
});
