import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classes } from '@/lib/classes';
import { instructors } from '@/lib/instructors';
import { ownedEvents, ownedSchedule } from '@/lib/rhyze-platform';

describe('Nicole Finley catalog replacement', () => {
  it('publishes Nicole and removes Jessica from the public catalogs', () => {
    const nicole = instructors.find((item) => item.slug === 'nicole-finley');
    const publicCopy = JSON.stringify({ instructors, classes, ownedSchedule, ownedEvents });

    expect(nicole).toMatchObject({
      firstName: 'Nicole',
      lastName: 'Finley',
      role: 'HEELS 101 / HYPNOTIC HEELS',
      photo: '/founders/instructor-nicole-finley.png',
      specialties: ['Heels 101', 'Hypnotic Heels'],
    });
    expect(nicole?.bio).toContain('Bachelor of Fine Arts in Dance from Montclair State University');
    expect(nicole?.bio).toContain('over 20 years of teaching experience');
    expect(publicCopy).not.toMatch(/jessica|blundetto/i);
    expect(existsSync('public/founders/instructor-nicole-finley.png')).toBe(true);
  });

  it('renames the preserved instructor referral code', () => {
    const migrationPath =
      'prisma/migrations/20260725170000_rename_nicole_referral_code/migration.sql';

    expect(existsSync(migrationPath)).toBe(true);
    expect(readFileSync(migrationPath, 'utf8')).toContain('NICOLERZ26');
  });
});
