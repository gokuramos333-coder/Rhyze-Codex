import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { instructors } from '../lib/instructors.ts';

const expected = [
  ['vanessa-ramos', 'Vanessa', 'Ramos'],
  ['melissa-llanos', 'Melissa', 'Llanos'],
  ['adrianna-jones', 'Adrianna', 'Jones'],
  ['julie-reese', 'Julie', 'Reese'],
  ['jessica-blundetto', 'Jessica', 'Blundetto'],
  ['tricia-johnsen', 'Tricia', 'Johnsen'],
  ['carla-hotrock', 'Carla', 'Hotrock'],
];

test('instructor roster preserves the approved order', () => {
  assert.deepEqual(
    instructors.map(({ slug, firstName, lastName }) => [
      slug,
      firstName,
      lastName,
    ]),
    expected,
  );
});

test('new instructor headings match the approved copy', () => {
  const bySlug = Object.fromEntries(
    instructors.map((instructor) => [instructor.slug, instructor]),
  );

  assert.equal(bySlug['adrianna-jones'].role, 'RYT 500 (YOGA)');
  assert.equal(
    bySlug['adrianna-jones'].descriptor,
    'VINYASA FLOW & FUNCTIONAL MOVEMENT',
  );
  assert.equal(
    bySlug['julie-reese'].role,
    'HIIT INSTRUCTOR / PERSONAL TRAINER',
  );
  assert.equal(
    bySlug['julie-reese'].descriptor,
    'FUNCTIONAL FITNESS & CONDITIONING',
  );
  assert.equal(bySlug['jessica-blundetto'].role, 'DANCE FIT / HEELS');
  assert.equal(bySlug['tricia-johnsen'].role, 'HIP-HOP HAPPY HOUR');
  assert.equal(bySlug['carla-hotrock'].role, 'CORE-WERK');
});

test('new instructors have no invented quote or contact data', () => {
  for (const instructor of instructors.slice(2)) {
    assert.equal(instructor.quote, undefined);
    assert.equal(instructor.instagram, undefined);
    assert.equal(instructor.email, undefined);
  }
});

test('new instructor image assets exist', () => {
  for (const instructor of instructors.slice(2)) {
    assert.equal(
      existsSync(`public${instructor.photo}`),
      true,
      instructor.photo,
    );
  }
});
