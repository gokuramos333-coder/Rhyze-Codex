import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  customerPortal,
  ownedMemberships,
  ownedSchedule,
  studioMetrics,
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

  assert.match(scheduleSource, /ownedSchedule/);
  assert.match(scheduleSource, /Reserve on Rhyze/);
  assert.doesNotMatch(scheduleSource, /Somble|somble|iframe/);
  assert.match(pricingSource, /ownedMemberships/);
  assert.match(pricingSource, /Manage everything inside Rhyze/);
  assert.doesNotMatch(pricingSource, /Somble|somble|target="_blank"/);
});

test('classes and booking stay inside the Rhyze #2 website', () => {
  const scheduleSource = readFileSync('components/sections/ScheduleFull.tsx', 'utf8');
  const classListSource = readFileSync('components/sections/ClassList.tsx', 'utf8');
  const detailSource = readFileSync('app/classes/[slug]/page.tsx', 'utf8');
  const bookingSource = readFileSync('app/book/[slug]/page.tsx', 'utf8');

  assert.match(scheduleSource, /ownedSchedule/);
  assert.match(scheduleSource, /Book spot/);
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
