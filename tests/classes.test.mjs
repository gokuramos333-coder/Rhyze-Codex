import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classes } from '../lib/classes.ts';

test('class catalog matches the official recurring Rhyze class formats', () => {
  const expected = [
    ['global-hiit-mackenzie', 'Global HIIT with Mackenzie', 'strength', 50],
    ['yoga-vinyasa-mackenzie', 'Yoga / Vinyasa with Mackenzie', 'yoga', 50],
    ['core-360-carla-rio', 'Core 360 with Carla Rio', 'strength', 50],
    ['pound-mackenzie', 'POUND with Mackenzie', 'strength', 50],
    ['dance-fit-jessica', 'Dance Fit with Jessica', 'dance', 50],
    ['grind-and-grow-carla-reo', 'Grind & Grow with Carla Reo', 'strength', 50],
    [
      'heels-101-walk-with-me-jessica',
      'Heels 101 "Walk with Me" with Jessica',
      'dance',
      50,
    ],
    ['hypnotic-heels-jessica', 'Hypnotic Heels with Jessica', 'dance', 75],
    ['ignite-julie', 'Ignite with Julie', 'strength', 50],
    ['pilates-pulse-adrianna', 'Pilates Pulse with Adrianna', 'yoga', 50],
    [
      'real-riddim-dance-workout-vanessa',
      'Real Riddim Dance Workout with Vanessa',
      'dance',
      50,
    ],
    ['rhyze-ritmo-melissa', 'Rhyze Ritmo with Melissa', 'dance', 50],
    ['rhyze-up-vanessa', 'Rhyze Up with Vanessa', 'dance', 50],
    ['seat-seduction-vanessa', 'Seat Seduction With Vanessa', 'dance', 75],
    ['soul-line-dancing-rachel', 'Soul Line-Dancing with Rachel', 'dance', 50],
    [
      'tcj-hip-hop-happy-hour-tricia',
      'TCJ Hip-Hop Happy Hour with Tricia',
      'dance',
      75,
    ],
    ['yoga-flow-adrianna', 'Flow with Adrianna', 'yoga', 50],
  ];

  assert.deepEqual(
    classes.map(({ slug, name, category, duration }) => [
      slug,
      name,
      category,
      duration,
    ]),
    expected,
  );
});

test('class descriptions use concise one-paragraph Rhyze copy', () => {
  const bySlug = new Map(classes.map((c) => [c.slug, c]));

  for (const cls of classes) {
    assert.ok(cls.description.length > 0, `${cls.name} needs a description`);
    assert.ok(
      cls.description.length <= 420,
      `${cls.name} description is too long`,
    );
    assert.doesNotMatch(
      cls.description,
      /\n/,
      `${cls.name} is more than one paragraph`,
    );
  }

  assert.match(
    bySlug.get('ignite-julie').description,
    /Ready to spark your strength and power up your week\?/,
  );
  assert.match(
    bySlug.get('rhyze-up-vanessa').description,
    /signature dance-fitness experience created to elevate the mind/,
  );
  assert.match(
    bySlug.get('rhyze-ritmo-melissa').description,
    /vibrant spirit and soulful warmth of South America/,
  );
  assert.match(
    bySlug.get('real-riddim-dance-workout-vanessa').description,
    /Caribbean-style, follow-along dance fitness workout/,
  );
  assert.match(
    bySlug.get('pilates-pulse-adrianna').description,
    /inviting blend of challenge, curiosity, and self-discovery/,
  );
  assert.match(
    bySlug.get('global-hiit-mackenzie').description,
    /hits from around the world/,
  );
  assert.match(
    bySlug.get('yoga-vinyasa-mackenzie').description,
    /dynamic physical poses with steady conscious breaths/,
  );
  assert.match(
    bySlug.get('pound-mackenzie').description,
    /cardio, Pilates, isometric movement, plyometrics/,
  );
  assert.match(
    bySlug.get('soul-line-dancing-rachel').description,
    /connection, rhythm, and pure joy/,
  );
  assert.match(
    bySlug.get('seat-seduction-vanessa').description,
    /beginner-friendly chair choreography/,
  );

  assert.equal(bySlug.has('rhyze-and-groove'), false);
  assert.equal(bySlug.has('rhyze-revolution'), false);
  assert.equal(bySlug.has('afternoon-rhyze'), false);
  assert.equal(bySlug.has('strength-class-with-julie'), false);
  assert.equal(bySlug.has('flow-with-adrianna'), false);
  assert.equal(bySlug.has('hip-hop-happy-hour-tricia'), false);
});

test('class model no longer exposes Foundation Signature Peak level metadata', () => {
  const source = readFileSync('lib/classes.ts', 'utf8');

  assert.doesNotMatch(source, /ClassLevel/);
  assert.doesNotMatch(source, /levelLabel/);
  assert.doesNotMatch(source, /levelColor/);
  assert.doesNotMatch(source, /level:/);
});

test('class cards use one booking action and the booking page carries details once', () => {
  const listSource = readFileSync('components/sections/ClassList.tsx', 'utf8');
  const detailSource = readFileSync('app/classes/[slug]/page.tsx', 'utf8');
  const bookingSource = readFileSync('app/book/[slug]/page.tsx', 'utf8');
  const classSource = readFileSync('lib/classes.ts', 'utf8');
  const scheduleSource = readFileSync('lib/rhyze-platform.ts', 'utf8');
  const studioDetailSource = readFileSync(
    'components/sections/StudioOSDetailLayer.tsx',
    'utf8',
  );

  assert.match(listSource, /c\.whatToExpect\.slice\(0, 3\)\.map/);
  assert.doesNotMatch(listSource, /Class Details/);
  assert.doesNotMatch(
    classSource + scheduleSource + studioDetailSource,
    / w\//,
  );
  assert.match(detailSource, /redirect\(`\/book\/\$\{params\.slug\}`\)/);
  assert.match(bookingSource, /Class Details/);
  assert.match(bookingSource, /replace\(\/\\s\+with\\s\+\[\^"\]\+\$\/i/);
  assert.match(bookingSource, /import Image from 'next\/image'/);
  assert.match(bookingSource, /instructorPhoto/);
  assert.match(bookingSource, /object-cover object-top/);
  assert.match(bookingSource, /cls\.whatToExpect\.map/);
  assert.match(bookingSource, /cls\.whatToBring\.map/);
  assert.equal(
    (bookingSource.match(/cls\.whatToExpect\.map/g) ?? []).length,
    1,
  );
  assert.equal((bookingSource.match(/cls\.whatToBring\.map/g) ?? []).length, 1);
});
