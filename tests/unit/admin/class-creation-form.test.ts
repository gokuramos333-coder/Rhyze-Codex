import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin class creation form', () => {
  const source = readFileSync(
    'app/(studio)/admin/classes/page.tsx',
    'utf8',
  );

  it('assigns an instructor and first scheduled date while creating a class', () => {
    expect(source).toContain('name="instructorId"');
    expect(source).toContain('name="startAt"');
  });

  it('can repeat the newly created class weekly', () => {
    expect(source).toContain('name="repeatWeekly"');
    expect(source).toContain('name="repeatWeeks"');
  });

  it('defaults the class price to $25 but keeps it editable', () => {
    expect(source).toMatch(
      /<Input\s+name="dropInPrice"\s+label="Single-class price"\s+type="number"\s+value="25"/,
    );
    expect(source).not.toContain(
      '<input type="hidden" name="dropInPrice" value="25" />',
    );
  });
});
