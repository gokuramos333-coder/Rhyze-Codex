import { describe, expect, it } from 'vitest';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import {
  emailTemplateCatalog,
  emailTemplateKeys,
  sampleEmailInput,
} from '@/lib/notifications/email-templates';

const requiredTemplates = [
  'WELCOME',
  'ACCOUNT_ACTIVATION',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'NEW_SIGNUP_ADMIN',
  'BIRTHDAY_MONTHLY_DIGEST',
  'BIRTHDAY_WEEK_AHEAD',
  'BOOKING_CONFIRMATION',
  'CLASS_REMINDER',
  'BOOKING_CANCELLATION',
  'BOOKING_TRANSFERRED',
  'WAITLIST_JOINED',
  'WAITLIST_PROMOTED',
  'CLASS_UPDATE',
  'CLASS_CANCELLED',
  'MEMBERSHIP_PURCHASE_CONFIRMATION',
  'PURCHASE_CONFIRMATION',
  'EVENT_PURCHASE_CONFIRMATION',
  'PAYMENT_RECEIPT',
  'MEMBERSHIP_RENEWED',
  'PAYMENT_FAILED',
  'TRIAL_ENDING',
  'MEMBERSHIP_PAUSED',
  'MEMBERSHIP_RESUMED',
  'MEMBERSHIP_CANCELLED',
  'MEMBERSHIP_CHANGE_REQUEST_RECEIVED',
  'MEMBERSHIP_CHANGE_REQUEST_REVIEWED',
  'PAYMENT_REFUND_CONFIRMATION',
  'NEW_PURCHASE_ADMIN',
  'INSTRUCTOR_APPROVAL_NEEDED',
  'INSTRUCTOR_APPROVED',
  'INSTRUCTOR_DENIED',
  'INSTRUCTOR_DOCUMENTS_MISSING',
  'CREDENTIAL_VALID',
  'CREDENTIAL_REJECTED',
  'CREDENTIAL_EXPIRING',
  'CREDENTIAL_EXPIRED',
  'ADMIN_MESSAGE',
  'MEMBER_REPLY',
  'CAMPAIGN',
  'CONTACT_FORM',
  'CONTACT_CONFIRMATION',
  'NEWSLETTER_WELCOME',
] as const;

describe('Rhyze email template catalog', () => {
  it('contains every required transactional and management template', () => {
    expect(emailTemplateKeys).toEqual(expect.arrayContaining([...requiredTemplates]));
    expect(new Set(emailTemplateKeys).size).toBe(emailTemplateKeys.length);
  });

  it('does not offer or deliver obsolete studio agreement reminders', () => {
    expect(emailTemplateKeys).not.toContain('WAIVER_REMINDER_24_HOUR');
    expect(emailTemplateKeys).not.toContain('WAIVER_REMINDER_UPCOMING_CLASS');
  });

  it.each([...requiredTemplates])('renders %s with branded, useful recipient content', (template) => {
    const input = sampleEmailInput(template);
    const rendered = renderTransactionalEmail(input);

    expect(input.subject.length).toBeGreaterThan(5);
    expect(rendered.html).toContain('/brand/rhyze-logo-header.png');
    expect(rendered.html).toContain('alt="Rhyze Fitness"');
    expect(rendered.html).toContain('In Rhythm, We Rise.');
    expect(rendered.html).toContain('The Shoppes at Lafayette');
    expect(rendered.html).toContain('75 NJ-15, Lafayette Township, NJ 07848');
    expect(rendered.html).toContain('Building J');
    expect(rendered.text).toContain('In Rhythm, We Rise.');
    expect(rendered.text).toContain('The Shoppes at Lafayette');
    expect(rendered.html).toContain('#ff5c45');
    expect(rendered.html).toContain('#f7a928');
    expect(rendered.text).toContain('Rhyze Fitness');
    expect(rendered.text).not.toMatch(/bookingId:|occurrenceId:|credentialId:/);
    expect(rendered.html).not.toMatch(/bookingId:|occurrenceId:|credentialId:/);
  });

  it('escapes customer-provided content in HTML', () => {
    const rendered = renderTransactionalEmail({
      subject: 'A safe message',
      template: 'ADMIN_MESSAGE',
      payload: { senderName: '<Melissa>', body: '<script>alert(1)</script>' },
    });
    expect(rendered.html).toContain('&lt;Melissa&gt;');
    expect(rendered.html).not.toContain('<script>');
  });

  it('provides review metadata and a sample for every template', () => {
    for (const template of emailTemplateKeys) {
      expect(emailTemplateCatalog[template].label).toBeTruthy();
      expect(emailTemplateCatalog[template].trigger).toBeTruthy();
      expect(emailTemplateCatalog[template].category).toBeTruthy();
      expect(sampleEmailInput(template).payload).toBeTypeOf('object');
    }
  });

  it('uses management voice instead of naming an individual in standard copy', () => {
    for (const template of emailTemplateKeys) {
      const rendered = renderTransactionalEmail(sampleEmailInput(template));
      expect(rendered.text).not.toContain('Melissa');
      expect(rendered.html).not.toContain('Melissa');
    }
  });
});
