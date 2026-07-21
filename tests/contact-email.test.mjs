import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { site } from '../lib/site.ts';

test('site contact phone and hours match approved public details', () => {
  assert.equal(site.phone, '(973) 506-8565');
  assert.equal(site.phoneTel, '+19735068565');
  assert.equal(site.address.line1, 'The Shoppes at Lafayette');
  assert.equal(site.address.line2, '75 NJ-15, Lafayette Township, NJ 07848');
  assert.equal(site.address.line3, 'Building J');
  assert.deepEqual(site.hours, [
    { days: 'Mon - Sun', hours: '8:00 AM - 8:00 PM' },
  ]);
  assert.equal(
    site.hoursNote,
    'Varies depending on the scheduled classes',
  );
});

test('contact and subscribe email APIs send through Resend to Melissa', () => {
  const emailSource = readFileSync('lib/email.ts', 'utf8');
  const contactSource = readFileSync('app/api/contact/route.ts', 'utf8');
  const newsletterSource = readFileSync('app/api/newsletter/route.ts', 'utf8');

  assert.match(emailSource, /CONTACT_TO = site\.emails\.melissa/);
  assert.match(emailSource, /RESEND_API_KEY/);
  assert.match(emailSource, /https:\/\/api\.resend\.com\/emails/);
  assert.match(emailSource, /reply_to/);
  assert.match(contactSource, /sendRhyzeEmail\(formatContactEmail\(data\)\)/);
  assert.match(newsletterSource, /sendRhyzeEmail\(formatNewsletterEmail\(email\)\)/);
  assert.doesNotMatch(contactSource, /console\.info\('\[contact\] submission:'/);
  assert.doesNotMatch(newsletterSource, /console\.info\('\[newsletter\] subscribe:'/);
});

test('email formatting includes subscriber and contact details', () => {
  const emailSource = readFileSync('lib/email.ts', 'utf8');

  assert.match(emailSource, /New Rhyze Fitness contact submission/);
  assert.match(emailSource, /Name:/);
  assert.match(emailSource, /Email:/);
  assert.match(emailSource, /Phone:/);
  assert.match(emailSource, /Message:/);
  assert.match(emailSource, /New Rhyze Fitness newsletter signup/);
  assert.match(emailSource, /replyTo: data\.email/);
  assert.match(emailSource, /replyTo: email/);
});

test('contact page exposes Vanessa above Melissa as contact email destinations', () => {
  const contactPage = readFileSync('app/contact/page.tsx', 'utf8');

  assert.match(contactPage, /site\.emails\.vanessa/);
  assert.match(contactPage, /site\.emails\.melissa/);
  assert.ok(
    contactPage.indexOf('site.emails.vanessa') <
      contactPage.indexOf('site.emails.melissa'),
  );
});
