import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  sombleMembershipsUrl,
  sombleProfileUrl,
  sombleScheduleUrl,
} from '../lib/somble.ts';

test('Somble URLs point to the approved Rhyze Fitness profile and class schedule', () => {
  assert.equal(sombleProfileUrl, 'https://www.somble.com/vanessaramos');
  assert.equal(
    sombleScheduleUrl,
    'https://www.somble.com/vanessaramos/classes',
  );
  assert.equal(
    sombleMembershipsUrl,
    'https://www.somble.com/vanessaramos/memberships',
  );
  assert.match(
    readFileSync('lib/somble.ts', 'utf8'),
    /sombleLoginUrl = 'https:\/\/www\.somble\.com\/login'/,
  );
});

test('primary navigation uses Join Now instead of a duplicate memberships item', () => {
  const source = readFileSync('lib/site.ts', 'utf8');
  const footerSource = readFileSync('components/layout/Footer.tsx', 'utf8');
  const headerSource = readFileSync('components/layout/Header.tsx', 'utf8');
  const mobileSource = readFileSync('components/layout/MobileNav.tsx', 'utf8');
  const sitemapSource = readFileSync('app/sitemap.ts', 'utf8');

  assert.doesNotMatch(source, /label: 'Memberships'/);
  assert.match(headerSource, /<Button href="\/join" size="sm">/);
  assert.match(headerSource, /Join Now/);
  assert.match(mobileSource, /<Button href="\/join" size="lg" className="w-full">/);
  assert.match(mobileSource, /Join Now/);
  assert.doesNotMatch(footerSource, /Memberships/);
  assert.doesNotMatch(footerSource, /href="\/pricing"/);
  assert.doesNotMatch(sitemapSource, /'\/pricing'/);
});

test('homepage membership teaser sends visitors to Somble memberships', () => {
  const source = readFileSync(
    'components/sections/PricingTeaser.tsx',
    'utf8',
  );

  assert.match(source, /sombleMembershipsUrl/);
  assert.match(source, /View Memberships on Somble/);
  assert.match(source, /Intro Offer 7-Days/);
  assert.match(source, /\$7/);
  assert.match(source, /7 credits/);
  assert.match(source, /Full Rhythm/);
  assert.match(source, /\$168/);
  assert.match(source, /8 Classes \/ Month Membership/);
  assert.match(source, /Elevate/);
  assert.match(source, /\$92/);
  assert.match(source, /4 Classes \/ Month Membership/);
  assert.match(source, /The VIP Access Pass/);
  assert.match(source, /\$199/);
  assert.match(source, /Founding Members lock in/);
  assert.match(
    source,
    /id: 'intro-offer'[\s\S]*?popular: false[\s\S]*?id: 'full-rhythm'[\s\S]*?popular: true/,
  );
  assert.doesNotMatch(source, /Live on Somble/);
  assert.doesNotMatch(source, /href="\/pricing"/);
});

test('join page combines membership cards with first-day and FAQ content', () => {
  const pricingSource = readFileSync('lib/pricing.ts', 'utf8');
  const cardsSource = readFileSync('components/sections/PricingCards.tsx', 'utf8');
  const pageSource = readFileSync('app/join/page.tsx', 'utf8');

  assert.match(pricingSource, /Intro Offer 7-Days/);
  assert.match(pricingSource, /\$7/);
  assert.match(pricingSource, /7 credits/);
  assert.match(pricingSource, /Full Rhythm/);
  assert.match(pricingSource, /\$168/);
  assert.match(pricingSource, /8 Classes \/ Month Membership/);
  assert.match(pricingSource, /Elevate/);
  assert.match(pricingSource, /\$92/);
  assert.match(pricingSource, /4 Classes \/ Month Membership/);
  assert.match(pricingSource, /The VIP Access Pass/);
  assert.match(pricingSource, /\$199/);
  assert.match(pricingSource, /Founding Members lock in/);
  assert.match(
    pricingSource,
    /id: 'intro-offer'[\s\S]*?popular: false[\s\S]*?id: 'full-rhythm'[\s\S]*?popular: true/,
  );
  assert.match(pricingSource, /sombleMembershipsUrl/);
  assert.match(cardsSource, /target="_blank"/);
  assert.match(cardsSource, /rel="noreferrer"/);
  assert.match(pageSource, /PricingCards/);
  assert.match(pageSource, /MEMBERSHIPS ARE OPEN/);
  assert.match(pageSource, /QUESTIONS\?/);
  assert.match(pageSource, /What to Expect/);
  assert.match(pageSource, /YOUR FIRST DAY/);
  assert.match(pageSource, /FAQ/);
  assert.match(pageSource, /WE GOT YOU/);
  assert.doesNotMatch(
    pageSource,
    /Choose your Rhyze membership, then complete checkout securely through/,
  );
  assert.doesNotMatch(pageSource, /Live on Somble/);
  assert.doesNotMatch(pageSource, /SOMBLE MEMBERSHIPS/);
  assert.doesNotMatch(pageSource, /MemberPerks/);
  assert.doesNotMatch(pageSource, /All-Access Pass/);
  assert.doesNotMatch(pageSource, /MEMBER PERKS/);
  assert.doesNotMatch(pricingSource, /Glow-in-the-Dark Pop-ups/);
  assert.doesNotMatch(pricingSource, /Buddy Pass/);
  assert.doesNotMatch(pricingSource, /Retail Discount/);
  assert.match(
    pageSource,
    /Reach out\s+for any questions, events, packages, or anything else not listed/,
  );
  assert.doesNotMatch(pricingSource, /The Weekly Rhyzer/);
  assert.doesNotMatch(pricingSource, /The Twice-A-Week/);
  assert.doesNotMatch(pricingSource, /The Rhyze Up Unlimited/);
  assert.doesNotMatch(pageSource, /SombleMembershipsEmbed/);
  assert.doesNotMatch(pageSource, /JoinForm/);
  assert.doesNotMatch(pageSource, /New Rhyzer Special/);
  assert.doesNotMatch(pageSource, /START YOUR/);
  assert.doesNotMatch(pageSource, /\$7 RHYZE WEEK/);
  assert.doesNotMatch(pageSource, /Claim the Trial/);
});

test('old memberships page redirects to the combined join page', () => {
  const source = readFileSync('app/pricing/page.tsx', 'utf8');

  assert.match(source, /redirect\('\/join'\)/);
  assert.doesNotMatch(source, /PricingCards/);
});

test('schedule section embeds Somble with a direct fallback link', () => {
  const source = readFileSync(
    'components/sections/ScheduleFull.tsx',
    'utf8',
  );

  assert.match(source, /<iframe/);
  assert.match(source, /sombleScheduleUrl/);
  assert.match(source, /Open Somble Schedule/);
  assert.doesNotMatch(source, /Live on Somble/);
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

test('sign in page embeds the Somble login with a direct fallback link', () => {
  const source = readFileSync('app/signin/page.tsx', 'utf8');

  assert.match(source, /sombleLoginUrl/);
  assert.match(source, /<iframe/);
  assert.match(source, /title="Somble member login"/);
  assert.match(source, /Open Somble Login/);
  assert.doesNotMatch(source, /Members Only, Coming Soon/);
  assert.doesNotMatch(source, /Start \$7 Trial/);
});
