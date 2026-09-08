import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { instructors } from '../lib/instructors.ts';

const expected = [
  ['vanessa-ramos', 'Vanessa', 'Ramos'],
  ['melissa-llanos', 'Melissa', 'Llanos'],
  ['tricia-johnsen', 'Tricia', 'Johnsen'],
  ['adrianna-jones', 'Adrianna', 'Jones'],
  ['julie-reese', 'Julie', 'Reese'],
  ['nicole-finley', 'Nicole', 'Finley'],
  ['rachel', 'Rachel', ''],
  ['mackenzie-heffernan', 'Mackenzie', 'Heffernan'],
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

  assert.equal(bySlug['adrianna-jones'].role, 'RYT 500 (YOGA & PILATES)');
  assert.equal(
    bySlug['adrianna-jones'].descriptor,
    'VINYASA FLOW, PILATES & FUNCTIONAL MOVEMENT',
  );
  assert.equal(
    bySlug['julie-reese'].role,
    'HIIT INSTRUCTOR / PERSONAL TRAINER',
  );
  assert.equal(
    bySlug['julie-reese'].descriptor,
    'FUNCTIONAL FITNESS & CONDITIONING',
  );
  assert.equal(bySlug['nicole-finley'].role, 'HEELS 101 / HYPNOTIC HEELS');
  assert.equal(bySlug['rachel'].role, 'SOUL LINE-DANCING');
  assert.equal(
    bySlug['mackenzie-heffernan'].role,
    'GROUP FITNESS / YOGA / POUND',
  );
  assert.equal(bySlug['tricia-johnsen'].role, 'HIP-HOP HAPPY HOUR');
  assert.equal(bySlug['carla-hotrock'].role, 'CORE-WERK');
});

test('updated instructor bios include approved additions', () => {
  const bySlug = Object.fromEntries(
    instructors.map((instructor) => [instructor.slug, instructor]),
  );

  assert.match(bySlug['adrianna-jones'].bio, /yoga and Pilates/);
  assert.match(bySlug['adrianna-jones'].specialties.join(' '), /Pilates/);
  assert.match(bySlug['nicole-finley'].bio, /Dance has been my absolute world/);
  assert.match(bySlug['nicole-finley'].bio, /Being a mom to my little girls/);
  assert.deepEqual(bySlug['nicole-finley'].specialties, [
    'Heels 101',
    'Hypnotic Heels',
  ]);
  assert.match(bySlug['rachel'].bio, /Soul Line-Dancing/);
  assert.match(bySlug['rachel'].bio, /connection, rhythm, and pure joy/);
  assert.match(bySlug['mackenzie-heffernan'].bio, /PRETTY GIRLS SWEAT/);
  assert.match(bySlug['mackenzie-heffernan'].bio, /Moksha Yoga Amazonica/);
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

  assert.deepEqual(bySlug['vanessa-ramos'].specialties, [
    'RHYZE UP',
    'Dance',
    'HIIT',
  ]);
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
    '/founders/instructor-nicole-finley.png':
      'f6566eb730d6817386debbeb2ded422556fe8e5e9a2eb3dba5b0acfd721f822d',
    '/founders/instructor-julie.jpg':
      '1615a6efe0c7355f818fb76951354267b296262fa531fd0088a72593f8d27596',
    '/founders/instructor-tricia.jpg':
      '9c8285d5a9355888b47ff54a6a6cb3dd36c619757ec53dd0a6debfda638f369b',
    '/founders/instructor-rachel.jpg':
      '23471d38dd91ff5d73c3118c8dcfd8e9b77aa70982b1cbe15d5b6397b0b20ccf',
    '/founders/instructor-mackenzie-heffernan.jpg':
      '416be83a5f4909eb9a45f0da73898a0f56c5bac166855a2d1422f0ac337bd04b',
  };

  for (const [photo, expectedHash] of Object.entries(expectedHashes)) {
    const actualHash = createHash('sha256')
      .update(readFileSync(`public${photo}`))
      .digest('hex');

    assert.equal(actualHash, expectedHash, photo);
  }
});
