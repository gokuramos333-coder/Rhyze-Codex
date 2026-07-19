import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import {
  customerPortal,
  ownedMemberships,
  ownedSchedule,
  studioMetrics,
  weekDays,
} from '../lib/rhyze-platform.ts';

test('Rhyze #2 uses local platform data for schedule, memberships, portal, and dashboard', () => {
  assert.ok(ownedSchedule.length >= 5);
  assert.ok(ownedSchedule.every((slot) => slot.bookingHref.startsWith('/book/')));
  assert.ok(ownedMemberships.some((plan) => plan.id === 'full-rhythm'));
  assert.ok(customerPortal.attendanceHistory.length >= 4);
  assert.ok(studioMetrics.some((metric) => metric.label === 'Monthly recurring'));
});

test('homepage schedule and membership teaser no longer use Somble', () => {
  const scheduleSource = readFileSync('components/sections/SchedulePreview.tsx', 'utf8');
  const pricingSource = readFileSync('components/sections/PricingTeaser.tsx', 'utf8');

  assert.match(scheduleSource, /WeeklyCalendar/);
  assert.doesNotMatch(scheduleSource, /Somble|somble|iframe/);
  assert.match(pricingSource, /ownedMemberships/);
  assert.match(pricingSource, /Manage everything inside Rhyze/);
  assert.doesNotMatch(pricingSource, /Somble|somble|target="_blank"/);
});

test('Rhyze-owned schedule renders as a branded weekly calendar', () => {
  const calendarSource = readFileSync('components/sections/WeeklyCalendar.tsx', 'utf8');
  const scheduleSource = readFileSync('components/sections/ScheduleFull.tsx', 'utf8');

  assert.equal(weekDays.length, 7);
  assert.ok(ownedSchedule.filter((slot) => slot.day === 'Mon').length >= 5);
  assert.ok(ownedSchedule.every((slot) => slot.photo.startsWith('/founders/')));
  assert.match(calendarSource, /weekDays/);
  assert.match(calendarSource, /selectedDay/);
  assert.match(calendarSource, /Classes Bookable/);
  assert.match(calendarSource, /In-Person/);
  assert.match(calendarSource, /Book/);
  assert.match(calendarSource, /bg-rhyze-gradient/);
  assert.match(scheduleSource, /<WeeklyCalendar/);
});

test('classes and booking stay inside the Rhyze #2 website', () => {
  const scheduleSource = readFileSync('components/sections/ScheduleFull.tsx', 'utf8');
  const classListSource = readFileSync('components/sections/ClassList.tsx', 'utf8');
  const detailSource = readFileSync('app/classes/[slug]/page.tsx', 'utf8');
  const bookingSource = readFileSync('app/book/[slug]/page.tsx', 'utf8');

  assert.match(scheduleSource, /WeeklyCalendar/);
  assert.doesNotMatch(scheduleSource, /Somble|somble|iframe|full-screen/);
  assert.match(classListSource, /`\/book\/\$\{c.slug\}`/);
  assert.doesNotMatch(classListSource, /somble|Somble|target="_blank"/);
  assert.match(detailSource, /`\/book\/\$\{c.slug\}`/);
  assert.match(bookingSource, /Confirm Booking/);
  assert.match(bookingSource, /Waiver status/);
});

test('join page and pricing cards route through Rhyze-owned memberships', () => {
  const pricingSource = readFileSync('lib/pricing.ts', 'utf8');
  const cardsSource = readFileSync('components/sections/PricingCards.tsx', 'utf8');
  const pageSource = readFileSync('app/join/page.tsx', 'utf8');

  assert.doesNotMatch(pricingSource, /Somble|somble/);
  assert.match(pricingSource, /href: '\/join\?plan=/);
  assert.doesNotMatch(cardsSource, /target="_blank"|rel="noreferrer"/);
  assert.match(pageSource, /Rhyze account/);
  assert.match(pageSource, /member portal/);
  assert.doesNotMatch(pageSource, /Somble|somble/);
});

test('member portal and Studio OS dashboard are available as separate Rhyze #2 routes', () => {
  const siteSource = readFileSync('lib/site.ts', 'utf8');
  const headerSource = readFileSync('components/layout/Header.tsx', 'utf8');
  const mobileSource = readFileSync('components/layout/MobileNav.tsx', 'utf8');
  const portalSource = readFileSync('app/signin/page.tsx', 'utf8');
  const dashboardSource = readFileSync('app/dashboard/page.tsx', 'utf8');

  assert.match(siteSource, /Rhyze #2 New/);
  assert.match(siteSource, /href: '\/dashboard'/);
  assert.match(headerSource, /Rhyze #2 New/);
  assert.match(mobileSource, /Studio OS/);
  assert.match(portalSource, /customerPortal/);
  assert.match(portalSource, /Attendance History/);
  assert.match(dashboardSource, /Class Manager/);
  assert.match(dashboardSource, /Waivers/);
  assert.match(dashboardSource, /Automations/);
  assert.doesNotMatch(portalSource + dashboardSource, /Somble|somble|iframe/);
});

test('Studio OS uses the approved admin shell layout', () => {
  const dashboardSource = readFileSync('app/dashboard/page.tsx', 'utf8');

  assert.match(dashboardSource, /studio-os-shell/);
  assert.match(dashboardSource, /RHYZE FITNESS/);
  assert.match(dashboardSource, /NEXT CLASS/);
  assert.match(dashboardSource, /TODAY AT RHYZE/);
  assert.match(dashboardSource, /INCOME \+ GROWTH/);
  assert.match(dashboardSource, /NEEDS ATTENTION/);
  assert.match(dashboardSource, /ADD, EDIT \+ DELETE CLASSES/);
  assert.match(dashboardSource, /MEMBERSHIP RULES/);
  assert.match(dashboardSource, /Create Membership/);
  assert.match(dashboardSource, /Preview Booking/);
  assert.match(dashboardSource, /Admin View/);
  assert.match(dashboardSource, /Customer View/);
  assert.match(dashboardSource, /Book Class/);
  assert.match(dashboardSource, /Send Reminder/);
  assert.match(dashboardSource, /Image/);
});

test('Studio OS sidebar links have matching dashboard destinations', () => {
  const dashboardSource = readFileSync('app/dashboard/page.tsx', 'utf8');
  const targets = [
    'overview',
    'calendar',
    'booking',
    'classes',
    'memberships',
    'sales',
    'customers',
    'waivers',
    'automations',
    'reports',
    'staff',
    'settings',
  ];

  assert.match(dashboardSource, /href=\{`#\$\{item\.toLowerCase\(\)\}`\}/);
  for (const target of targets) {
    assert.match(dashboardSource, new RegExp(`id="${target}"`));
  }
});

test('site removes opening date copy and Studio OS logo links home', () => {
  const sourceFiles = collectSourceFiles(['app', 'components', 'lib']);
  const combinedSource = sourceFiles
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const dashboardSource = readFileSync('app/dashboard/page.tsx', 'utf8');

  assert.doesNotMatch(combinedSource, /Opening Summer 2026/i);
  assert.match(dashboardSource, /href="\/"/);
  assert.match(dashboardSource, /src="\/brand\/rhyze-logo\.png"/);
  assert.doesNotMatch(dashboardSource, />\s*RZ\s*</);
});

test('gallery uses the approved Elfsight Instagram integration', () => {
  const instagramSource = readFileSync('components/sections/InstagramFeed.tsx', 'utf8');

  assert.match(instagramSource, /next\/script/);
  assert.match(instagramSource, /https:\/\/elfsightcdn\.com\/platform\.js/);
  assert.match(instagramSource, /30afe97e-55a2-4095-9f83-112e1eae34d8/);
  assert.match(instagramSource, /data-elfsight-app-lazy/);
  assert.doesNotMatch(instagramSource, /NEXT_PUBLIC_LIGHTWIDGET_URL|LightWidget|iframe|FallbackTiles/);
});

function collectSourceFiles(roots) {
  const files = [];

  for (const root of roots) {
    for (const entry of readdirSync(root)) {
      const path = `${root}/${entry}`;
      const stat = statSync(path);
      if (stat.isDirectory()) {
        files.push(...collectSourceFiles([path]));
      } else if (/\.(tsx?|jsx?|mjs)$/.test(path)) {
        files.push(path);
      }
    }
  }

  return files;
}
