import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import {
  customerPortal,
  ownedEvents,
  ownedMemberships,
  ownedSchedule,
  studioMetrics,
  studioSignups,
  weekDays,
} from '../lib/rhyze-platform.ts';
import { openingBillingNote, tiers } from '../lib/pricing.ts';

test('Rhyze #2 uses local platform data for schedule, memberships, portal, and dashboard', () => {
  assert.ok(ownedSchedule.length >= 5);
  assert.ok(
    ownedSchedule.every((slot) => slot.bookingHref.startsWith('/book/')),
  );
  assert.ok(
    ownedMemberships.some(
      (plan) => plan.id === 'full-rhythm' && plan.name === 'Ritual',
    ),
  );
  assert.ok(customerPortal.attendanceHistory.length >= 4);
  assert.ok(ownedEvents.length >= 3);
  assert.ok(
    studioSignups.some((signup) => signup.purchase === 'Email updates only'),
  );
  assert.ok(
    studioMetrics.some((metric) => metric.label === 'Monthly recurring'),
  );
});

test('homepage copy uses approved Rhyze title, description, and event section', () => {
  const siteSource = readFileSync('lib/site.ts', 'utf8');
  const heroSource = readFileSync('components/sections/Hero.tsx', 'utf8');
  const homeSource = readFileSync('app/page.tsx', 'utf8');
  const classesPageSource = readFileSync('app/classes/page.tsx', 'utf8');
  const pillarsSource = readFileSync(
    'components/sections/ThreePillars.tsx',
    'utf8',
  );

  assert.match(siteSource, /In Rhythm, We Rise/);
  assert.match(
    heroSource,
    /IN <span className="rhyze-gradient-text">RHYTHM,<\/span>/,
  );
  assert.match(
    heroSource,
    /Elevate your mind, energize your body, and evolve your soul/,
  );
  assert.match(heroSource, /Activates with first booked class/);
  assert.match(classesPageSource, /Seventeen official formats/);
  for (const imagePath of [
    'public/founders/main-intro.jpg',
    'public/founders/classes.jpg',
  ]) {
    assert.equal(
      createHash('sha256').update(readFileSync(imagePath)).digest('hex'),
      'a670714c45648301ce61184264fdf88dad96777a7fa31a6e445bc9a944f40ea3',
      imagePath,
    );
  }
  assert.match(homeSource, /EventsPreview/);
  assert.ok(
    homeSource.indexOf('<SchedulePreview />') <
      homeSource.indexOf('<EventsPreview />'),
  );
  for (const image of [
    'pillar-dance.jpeg',
    'pillar-yoga.jpeg',
    'pillar-strength.jpeg',
  ]) {
    assert.match(pillarsSource, new RegExp(image));
  }
  assert.match(pillarsSource, /opacity-28/);
  assert.match(pillarsSource, /bg-rhyze-black\/70/);
  assert.match(pillarsSource, /href: '\/classes#dance'/);
  assert.match(pillarsSource, /href: '\/classes#yoga'/);
  assert.match(pillarsSource, /href: '\/classes#strength'/);
});

test('homepage schedule and membership teaser no longer use Somble', () => {
  const scheduleSource = readFileSync(
    'components/sections/SchedulePreview.tsx',
    'utf8',
  );
  const pricingSource = readFileSync(
    'components/sections/PricingTeaser.tsx',
    'utf8',
  );

  assert.match(scheduleSource, /WeeklyCalendar/);
  assert.doesNotMatch(scheduleSource, /Somble|somble|iframe/);
  assert.match(pricingSource, /ownedMemberships/);
  assert.match(pricingSource, /Manage everything inside Rhyze/);
  assert.match(pricingSource, /t\.details\.map/);
  assert.doesNotMatch(pricingSource, /Somble|somble|target="_blank"/);
});

test('events are first-class public pages and booking routes', () => {
  const siteSource = readFileSync('lib/site.ts', 'utf8');
  const eventsPreviewSource = readFileSync(
    'components/sections/EventsPreview.tsx',
    'utf8',
  );
  const eventsPageSource = readFileSync('app/events/page.tsx', 'utf8');
  const eventDetailSource = readFileSync('app/events/[slug]/page.tsx', 'utf8');
  const eventBookingSource = readFileSync(
    'app/book/event/[slug]/page.tsx',
    'utf8',
  );

  assert.ok(ownedEvents.some((event) => event.name.includes('TCJ Hip-Hop')));
  assert.ok(ownedEvents.some((event) => event.name.includes('Hypnotic Heels')));
  assert.ok(ownedEvents.some((event) => event.name.includes('Seat Seduction')));
  assert.ok(ownedEvents.every((event) => event.photo.startsWith('/founders/')));
  assert.ok(ownedEvents.every((event) => event.price === '$30'));
  assert.doesNotMatch(eventsPreviewSource, /\$38/);
  assert.match(siteSource, /label: 'Events', href: '\/events'/);
  assert.match(eventsPreviewSource, /UPCOMING EVENTS/);
  assert.match(eventsPreviewSource, /grid-flow-col/);
  assert.match(eventsPreviewSource, /booked/);
  assert.match(eventsPageSource, /EVENTS BY DATE/);
  assert.match(eventDetailSource, /getOwnedEvent/);
  assert.match(eventDetailSource, /Claim Your Spot/);
  assert.match(eventBookingSource, /Confirm Event Booking/);
});

test('Rhyze-owned schedule renders as a branded weekly calendar', () => {
  const calendarSource = readFileSync(
    'components/sections/WeeklyCalendar.tsx',
    'utf8',
  );
  const scheduleSource = readFileSync(
    'components/sections/ScheduleFull.tsx',
    'utf8',
  );

  assert.equal(weekDays.length, 7);
  assert.equal(ownedSchedule.filter((slot) => slot.day === 'Mon').length, 4);
  assert.deepEqual(
    ownedSchedule
      .filter((slot) => slot.day === 'Mon')
      .map((slot) => slot.className),
    [
      'Pilates Pulse with Adrianna',
      'Flow with Adrianna',
      'Ignite with Julie',
      'Heels 101 "Walk with Me" with Jessica',
    ],
  );
  assert.ok(ownedSchedule.every((slot) => slot.photo.startsWith('/founders/')));
  assert.match(calendarSource, /weekDays/);
  assert.match(calendarSource, /selectedDay/);
  assert.match(calendarSource, /Classes Bookable/);
  assert.match(calendarSource, /In-Person/);
  assert.match(calendarSource, /Book/);
  assert.match(calendarSource, /bg-rhyze-gradient/);
  assert.match(calendarSource, /font-display font-black leading-tight/);
  assert.match(calendarSource, /text-lg md:text-xl/);
  assert.match(scheduleSource, /<WeeklyCalendar/);
});

test('classes and booking stay inside the Rhyze #2 website', () => {
  const scheduleSource = readFileSync(
    'components/sections/ScheduleFull.tsx',
    'utf8',
  );
  const classListSource = readFileSync(
    'components/sections/ClassList.tsx',
    'utf8',
  );
  const detailSource = readFileSync('app/classes/[slug]/page.tsx', 'utf8');
  const bookingSource = readFileSync('app/book/[slug]/page.tsx', 'utf8');

  assert.match(scheduleSource, /WeeklyCalendar/);
  assert.doesNotMatch(scheduleSource, /Somble|somble|iframe|full-screen/);
  assert.match(classListSource, /`\/book\/\$\{c.slug\}`/);
  assert.doesNotMatch(classListSource, /Class Details/);
  assert.match(classListSource, /text-2xl font-black leading-tight/);
  assert.doesNotMatch(classListSource, /mb-2 font-display text-3xl/);
  assert.doesNotMatch(classListSource, /somble|Somble|target="_blank"/);
  assert.match(detailSource, /redirect\(`\/book\/\$\{params\.slug\}`\)/);
  assert.match(bookingSource, /Class Details/);
  assert.match(bookingSource, /What To Bring/);
  assert.match(bookingSource, /Confirm Booking/);
  assert.match(bookingSource, /Waiver status/);
});

test('classes filter has breathing room before the card grid', () => {
  const classListSource = readFileSync(
    'components/sections/ClassList.tsx',
    'utf8',
  );

  assert.match(classListSource, /id="list" className="pt-10"/);
  assert.match(classListSource, /mb-12 flex flex-col gap-4/);
  assert.match(classListSource, /hashToCategory/);
  assert.match(classListSource, /'#dance': 'dance'/);
  assert.match(classListSource, /'#yoga': 'yoga'/);
  assert.match(classListSource, /'#strength': 'strength'/);
  assert.match(classListSource, /hashchange/);
  assert.match(classListSource, /history\.replaceState/);
});

test('header uses the crisp cropped Rhyze logo asset', () => {
  const headerSource = readFileSync('components/layout/Header.tsx', 'utf8');

  assert.match(headerSource, /rhyze-logo-header\.png/);
  assert.match(headerSource, /unoptimized/);
  assert.match(headerSource, /flex shrink-0 items-center/);
  assert.match(headerSource, /h-20 w-28 shrink-0 md:h-24 md:w-36/);
  assert.match(headerSource, /object-contain/);
  assert.doesNotMatch(headerSource, /src="\/brand\/rhyze-logo\.png"/);
  assert.doesNotMatch(headerSource, /h-40 w-auto/);
});

test('join page and pricing cards route through Rhyze-owned memberships', () => {
  const pricingSource = readFileSync('lib/pricing.ts', 'utf8');
  const cardsSource = readFileSync(
    'components/sections/PricingCards.tsx',
    'utf8',
  );
  const pageSource = readFileSync('app/join/page.tsx', 'utf8');
  const joinFormSource = readFileSync(
    'components/sections/JoinForm.tsx',
    'utf8',
  );
  const shopSource = readFileSync('app/shop/page.tsx', 'utf8');
  const platformSource = readFileSync('lib/rhyze-platform.ts', 'utf8');

  assert.doesNotMatch(pricingSource, /Somble|somble/);
  assert.match(pricingSource, /href: '\/join\?plan=/);
  assert.doesNotMatch(cardsSource, /target="_blank"|rel="noreferrer"/);
  assert.ok(openingBillingNote.includes('August 3, 2026'));
  assert.ok(openingBillingNote.includes('first class'));
  assert.ok(
    openingBillingNote.includes('automatically expires 7 calendar days'),
  );
  assert.ok(tiers.every((tier) => tier.bullets.length >= 4));
  assert.match(pricingSource, /Activates when first class is booked/);
  assert.match(pricingSource, /Expires automatically 7 days/);
  assert.match(pricingSource, /Unique member promo code for 10%/);
  assert.match(pricingSource, /Unique member promo code for 15%/);
  assert.match(pricingSource, /Unique member promo code for 20%/);
  assert.match(platformSource, /15% member merch promo code/);
  assert.match(platformSource, /20% member merch promo code/);
  assert.doesNotMatch(pricingSource + platformSource + shopSource, /30%/);
  assert.match(cardsSource, /t\.bullets\.map/);
  assert.match(pageSource, /Rhyze account/);
  assert.match(pageSource, /member portal/);
  assert.match(pageSource, /openingBillingNote/);
  assert.match(joinFormSource, /Auto-expires after 7 days/);
  assert.match(shopSource, /Elevate saves\s+10%/);
  assert.match(shopSource, /Ritual saves\s+15%/);
  assert.match(shopSource, /VIP Access Pass saves\s+20%/);
  assert.doesNotMatch(shopSource, /All Rhyze members save 10%/);
  assert.doesNotMatch(pageSource, /Somble|somble/);
});

test('policies use the approved cancellation policy and no late-entry column', () => {
  const policiesSource = readFileSync('app/policies/page.tsx', 'utf8');

  assert.match(policiesSource, /Cancellation for Classes/);
  assert.match(policiesSource, /6 hours before class start time/);
  assert.match(policiesSource, /\$10 transfer fee/);
  assert.match(policiesSource, /All classes and events are non-refundable/);
  assert.match(policiesSource, /Online booking closes 30 minutes before/);
  assert.match(policiesSource, /Private Group Parties/);
  assert.doesNotMatch(policiesSource, /Arrival & Late Entry/);
  assert.doesNotMatch(policiesSource, /No entry once the music starts/);
});

test('footer matches the four-column branded bottom layout', () => {
  const footerSource = readFileSync('components/layout/Footer.tsx', 'utf8');

  assert.match(footerSource, /next\/image/);
  assert.match(footerSource, /rhyze-logo-header\.png/);
  assert.match(footerSource, /A boutique dance, yoga, and HIIT studio/);
  assert.match(footerSource, /EXPLORE/);
  assert.match(footerSource, /VISIT/);
  assert.match(footerSource, /STAY IN THE RHYTHM/);
  assert.match(footerSource, /primaryNav/);
  assert.match(footerSource, /site\.address\.line3/);
  assert.match(footerSource, /Varies depending on the scheduled classes/);
  assert.match(footerSource, /className="w-full"/);
});

test('contact details card matches the rounded details reference', () => {
  const contactSource = readFileSync('app/contact/page.tsx', 'utf8');
  const siteSource = readFileSync('lib/site.ts', 'utf8');

  assert.match(contactSource, /THE DETAILS/);
  assert.match(contactSource, /rounded-\[1\.75rem\]/);
  assert.match(contactSource, /border-white\/15/);
  assert.match(contactSource, /text-rhyze-orange/);
  assert.match(contactSource, /site\.emails\.vanessa/);
  assert.match(contactSource, /site\.instagram\.handle/);
  assert.match(siteSource, /line3: 'Building J'/);
  assert.match(siteSource, /phone: '\(973\) 506-8565'/);
  assert.match(siteSource, /phoneTel: '\+19735068565'/);
});

test('home floor uses the custom direction photo with the same Google destination', () => {
  const locationSource = readFileSync(
    'components/sections/LocationBlock.tsx',
    'utf8',
  );

  assert.match(locationSource, /home-floor-map\.jpeg/);
  assert.match(locationSource, /object-contain/);
  assert.doesNotMatch(
    locationSource,
    /object-cover transition duration-500 group-hover:scale/,
  );
  assert.match(locationSource, /directionsHref/);
  assert.match(locationSource, /google\.com\/maps\/dir/);
  assert.match(locationSource, /Open Google directions/);
  assert.doesNotMatch(locationSource, /<iframe/);
  assert.doesNotMatch(locationSource, /output=embed/);
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
    'events',
    'memberships',
    'sales',
    'customers',
    'signups',
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

test('Studio OS includes event management, signups, and email blast details', () => {
  const dashboardSource = readFileSync('app/dashboard/page.tsx', 'utf8');
  const detailLayerSource = readFileSync(
    'components/sections/StudioOSDetailLayer.tsx',
    'utf8',
  );

  assert.match(dashboardSource, /title="EVENTS"/);
  assert.match(dashboardSource, /Add Event/);
  assert.match(dashboardSource, /Preview Event Booking/);
  assert.match(dashboardSource, /title="ALL SIGNUPS"/);
  assert.match(dashboardSource, /CUSTOMER \+ LEAD LIST/);
  assert.match(dashboardSource, /Send Email Blast/);
  assert.match(dashboardSource, /studioSignups\.map/);
  for (const detailId of [
    'event-template',
    'add-event',
    'all-signups',
    'signup-record',
    'email-blast',
  ]) {
    assert.match(dashboardSource + detailLayerSource, new RegExp(detailId));
  }
  assert.match(detailLayerSource, /Email updates only/);
  assert.match(detailLayerSource, /newsletter leads/);
});

test('Studio OS dashboard cards open detail popups with source data', () => {
  const dashboardSource = readFileSync('app/dashboard/page.tsx', 'utf8');
  const detailLayerSource = readFileSync(
    'components/sections/StudioOSDetailLayer.tsx',
    'utf8',
  );

  assert.match(dashboardSource, /StudioOSDetailLayer/);
  for (const detailId of [
    'today-income',
    'monthly-recurring',
    'bookings-this-week',
    'new-customers',
    'membership-rules',
    'class-template',
    'customer-activity',
    'reports',
    'settings',
  ]) {
    assert.match(dashboardSource + detailLayerSource, new RegExp(detailId));
  }

  assert.match(detailLayerSource, /'use client'/);
  assert.match(detailLayerSource, /data-studio-detail/);
  assert.match(detailLayerSource, /Today's income breakdown/);
  assert.match(detailLayerSource, /Rhyze Up with Vanessa/);
  assert.match(detailLayerSource, /Monthly recurring breakdown/);
  assert.match(detailLayerSource, /New customers: 27 this month/);
  assert.match(detailLayerSource, /Ava Martinez/);
  assert.match(detailLayerSource, /Start date/);
  assert.match(detailLayerSource, /Total/);
  assert.match(detailLayerSource, /Date/);
});

test('Studio OS calendar supports daily weekly and monthly views with booked totals', () => {
  const dashboardSource = readFileSync('app/dashboard/page.tsx', 'utf8');
  const calendarSource = readFileSync(
    'components/sections/StudioOSCalendarBoard.tsx',
    'utf8',
  );

  assert.match(dashboardSource, /StudioOSCalendarBoard/);
  assert.match(calendarSource, /'use client'/);
  assert.match(calendarSource, /Daily/);
  assert.match(calendarSource, /Weekly/);
  assert.match(calendarSource, /Monthly/);
  assert.match(calendarSource, /useState<CalendarView>\('weekly'\)/);
  assert.match(calendarSource, /weekDays/);
  assert.match(calendarSource, /total \+ slot\.booked/);
  assert.doesNotMatch(calendarSource, /Total booked so far/);
  assert.match(calendarSource, /data-calendar-view/);
  assert.match(calendarSource, /booked\}\/\{slot\.capacity\} booked/);
  assert.match(calendarSource, /font-display text-xl font-black leading-tight/);
  assert.doesNotMatch(calendarSource, /mt-1 font-display text-3xl/);
  assert.match(
    calendarSource,
    /shadow-\[0_0_0_1px_rgba\(255,199,44,0\.65\),0_0_22px_rgba\(255,199,44,0\.16\)\]/,
  );
  assert.match(calendarSource, /hover:border-rhyze-orange/);
  assert.match(
    calendarSource,
    /hover:shadow-\[0_0_0_1px_rgba\(255,122,24,0\.8\),0_0_26px_rgba\(255,122,24,0\.24\)\]/,
  );
  assert.match(calendarSource, /hover:bg-rhyze-coral\/15/);
  assert.match(calendarSource, /Previous day/);
  assert.match(calendarSource, /Next day/);
  assert.match(calendarSource, /grid-flow-col/);
  assert.doesNotMatch(calendarSource, /xl:grid-cols-\[13rem_minmax\(0,1fr\)\]/);
});

test('customer schedule calendar supports daily weekly and monthly views', () => {
  const calendarSource = readFileSync(
    'components/sections/WeeklyCalendar.tsx',
    'utf8',
  );

  assert.match(
    calendarSource,
    /type CalendarView = 'daily' \| 'weekly' \| 'monthly'/,
  );
  assert.match(calendarSource, /useState<CalendarView>/);
  assert.match(calendarSource, /Daily/);
  assert.match(calendarSource, /Weekly/);
  assert.match(calendarSource, /Monthly/);
  assert.match(calendarSource, /data-calendar-view/);
  assert.doesNotMatch(calendarSource, /Total booked so far/);
  assert.match(calendarSource, /weeklyDaySummaries/);
  assert.match(calendarSource, /monthlyCalendarDays/);
  assert.match(calendarSource, /Monthly calendar/);
  assert.match(calendarSource, /Weekly agenda/);
  assert.doesNotMatch(calendarSource, /xl:grid-cols-7/);
  assert.match(calendarSource, /No Classes Bookable/);
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
  const instagramSource = readFileSync(
    'components/sections/InstagramFeed.tsx',
    'utf8',
  );

  assert.match(instagramSource, /next\/script/);
  assert.match(instagramSource, /https:\/\/elfsightcdn\.com\/platform\.js/);
  assert.match(instagramSource, /30afe97e-55a2-4095-9f83-112e1eae34d8/);
  assert.match(instagramSource, /data-elfsight-app-lazy/);
  assert.doesNotMatch(
    instagramSource,
    /NEXT_PUBLIC_LIGHTWIDGET_URL|LightWidget|iframe|FallbackTiles/,
  );
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
