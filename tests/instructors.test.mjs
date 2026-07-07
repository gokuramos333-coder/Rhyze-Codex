import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

test('founder specialties include approved branded prefixes', () => {
  const bySlug = Object.fromEntries(
    instructors.map((instructor) => [instructor.slug, instructor]),
  );

  assert.deepEqual(bySlug['vanessa-ramos'].specialties, ['RHYZE UP', 'Dance', 'HIIT']);
  assert.deepEqual(bySlug['melissa-llanos'].specialties, [
    'RITMO',
    'Latin Dance',
    'Choreography',
  ]);
});

test('replacement instructor photos match the approved files', () => {
  const expectedHashes = {
    '/founders/instructor-carla.jpg':
      '91792ec220824b16a4f6739ef6c044431a8765cc5ae2d45389fdab8284fb7cb6',
    '/founders/instructor-jessica.jpg':
      'afa21cc9716154eb333c063e84e3b0c76f725531111dee704e1ccac5abc8e4c8',
    '/founders/instructor-julie.jpg':
      '1615a6efe0c7355f818fb76951354267b296262fa531fd0088a72593f8d27596',
    '/founders/instructor-tricia.jpg':
      '9c8285d5a9355888b47ff54a6a6cb3dd36c619757ec53dd0a6debfda638f369b',
  };

  for (const [photo, expectedHash] of Object.entries(expectedHashes)) {
    const actualHash = createHash('sha256')
      .update(readFileSync(`public${photo}`))
      .digest('hex');

    assert.equal(actualHash, expectedHash, photo);
  }
});
