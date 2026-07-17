import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classes } from '../lib/classes.ts';

test('class catalog matches the official recurring Somble class formats', () => {
  const expected = [
    ['core-360-carla-rio', 'Core 360 w/ Carla Rio', 'strength', 50],
    ['dance-fit-jessica', 'Dance Fit w/ Jessica', 'dance', 50],
    ['grind-and-grow-carla-reo', 'Grind & Grow w/ Carla Reo', 'strength', 50],
    ['heels-101-walk-with-me-jessica', 'Heels 101 "Walk with Me" with Jessica', 'dance', 50],
    ['hypnotic-heels-jessica', 'Hypnotic Heels w/ Jessica', 'dance', 75],
    ['ignite-julie', 'Ignite w/ Julie', 'strength', 50],
    ['pilates-pulse-adrianna', 'Pilates Pulse w/ Adrianna', 'yoga', 50],
    ['real-riddim-dance-workout-vanessa', 'Real Riddim Dance Workout w/ Vanessa', 'dance', 50],
    ['rhyze-ritmo-melissa', 'Rhyze Ritmo w/ Melissa', 'dance', 50],
    ['rhyze-up-vanessa', 'Rhyze Up w/ Vanessa', 'dance', 50],
    ['soul-line-and-groove-rachel', 'Soul Line & Groove w/ Rachel', 'dance', 50],
    ['tcj-hip-hop-happy-hour-tricia', 'TCJ Hip-Hop Happy Hour w/ Tricia', 'dance', 75],
    ['yoga-flow-adrianna', 'Yoga Flow w/ Adrianna', 'yoga', 50],
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

test('class descriptions use concise one-paragraph Somble-based copy', () => {
  const bySlug = new Map(classes.map((c) => [c.slug, c]));

  for (const cls of classes) {
    assert.ok(cls.description.length > 0, `${cls.name} needs a description`);
    assert.ok(
      cls.description.length <= 420,
      `${cls.name} description is too long`,
    );
    assert.doesNotMatch(cls.description, /\n/, `${cls.name} is more than one paragraph`);
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
    /dynamic, high-energy fusion designed to sculpt, strengthen/,
  );

  assert.equal(bySlug.has('rhyze-and-groove'), false);
  assert.equal(bySlug.has('rhyze-revolution'), false);
  assert.equal(bySlug.has('afternoon-rhyze'), false);
  assert.equal(bySlug.has('strength-class-with-julie'), false);
});
