import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sombleProfileUrl, sombleScheduleUrl } from '../lib/somble.ts';

test('Somble URLs point to the approved Rhyze Fitness profile and class schedule', () => {
  assert.equal(sombleProfileUrl, 'https://www.somble.com/vanessaramos');
  assert.equal(
    sombleScheduleUrl,
    'https://www.somble.com/vanessaramos/classes',
  );
});

test('schedule section embeds Somble with a direct fallback link', () => {
  const source = readFileSync(
    'components/sections/ScheduleFull.tsx',
    'utf8',
  );

  assert.match(source, /<iframe/);
  assert.match(source, /sombleScheduleUrl/);
  assert.match(source, /Open Somble Schedule/);
  assert.doesNotMatch(source, /slotsForDay/);
});

test('schedule embed leaves breathing room, removes the gold frame, and limits blank bottom space', () => {
  const source = readFileSync(
    'components/sections/ScheduleFull.tsx',
    'utf8',
  );

  assert.match(source, /somble-frame-shell/);
  assert.match(source, /somble-frame-crop/);
  assert.match(source, /h-\[720px\]/);
  assert.match(source, /h-\[1250px\]/);
  assert.match(source, /-translate-y-\[530px\]/);
  assert.match(source, /bg-rhyze-black/);
  assert.doesNotMatch(source, /border-rhyze-gold/);
  assert.doesNotMatch(source, /shadow-glow-gold/);
});

test('schedule embed opens a full-screen uncropped booking overlay when visitors interact', () => {
  const source = readFileSync(
    'components/sections/ScheduleFull.tsx',
    'utf8',
  );

  assert.match(source, /useState/);
  assert.match(source, /isBookingMode/);
  assert.match(source, /setIsBookingMode\(true\)/);
  assert.match(source, /onMouseEnter=\{activateBookingMode\}/);
  assert.match(source, /onTouchStart=\{activateBookingMode\}/);
  assert.match(source, /fixed inset-0 z-\[100\]/);
  assert.match(source, /h-\[100dvh\]/);
  assert.match(source, /h-\[calc\(100dvh\+80px\)\] w-full -translate-y-\[80px\]/);
  assert.match(source, /Exit full screen/);
});

test('homepage preview no longer renders hard-coded schedule slots', () => {
  const source = readFileSync(
    'components/sections/SchedulePreview.tsx',
    'utf8',
  );

  assert.match(source, /sombleScheduleUrl/);
  assert.doesNotMatch(source, /slotsForDay/);
  assert.doesNotMatch(source, /statusLabel/);
});

test('class detail booking points to Somble instead of the placeholder booking route', () => {
  const source = readFileSync('app/classes/[slug]/page.tsx', 'utf8');

  assert.match(source, /sombleScheduleUrl/);
  assert.doesNotMatch(source, /@\/lib\/schedule/);
  assert.doesNotMatch(source, /`\/book\/\$\{c.slug\}`/);
});

test('class list book buttons point to Somble instead of the placeholder booking route', () => {
  const source = readFileSync('components/sections/ClassList.tsx', 'utf8');

  assert.match(source, /sombleScheduleUrl/);
  assert.doesNotMatch(source, /`\/book\/\$\{c.slug\}`/);
});
