import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Rhyze email lifecycle wiring', () => {
  it('sends as Melissa and keeps Melissa on every reply path', () => {
    const worker = readFileSync('app/api/jobs/email/route.ts', 'utf8');
    const env = readFileSync('.env.example', 'utf8');
    expect(env).toContain('EMAIL_FROM="Rhyze Fitness <melissa@rhyzefit.com>"');
    expect(env).toContain('EMAIL_REPLY_TO="melissa@rhyzefit.com"');
    expect(worker).toContain('process.env.EMAIL_REPLY_TO');
    expect(worker).toContain('managementReplyTo');
  });

  it('queues password reset and management signup notifications', () => {
    const actions = readFileSync('app/(auth)/actions.ts', 'utf8');
    expect(actions).toContain("template: 'PASSWORD_RESET'");
    expect(actions).toContain("template: 'NEW_SIGNUP_ADMIN'");
    expect(actions).toContain("to: 'melissa@rhyzefit.com'");
    expect(actions).toContain("cc: ['vanessa@rhyzefit.com']");
    expect(actions).toContain('resetUrl');
  });

  it('queues complete booking and waitlist details', () => {
    const actions = readFileSync('app/(portal)/member/bookings/actions.ts', 'utf8');
    expect(actions).toContain("template: 'WAITLIST_JOINED'");
    expect(actions).toContain('className: occurrence.template.name');
    expect(actions).toContain('classDate:');
    expect(actions).toContain('classTime:');
  });

  it('alerts management when a member cancels a booked class', () => {
    const actions = readFileSync('app/(portal)/member/bookings/actions.ts', 'utf8');
    const helper = readFileSync('lib/notifications/admin-booking-cancellations.ts', 'utf8');
    const layout = readFileSync('app/(studio)/admin/layout.tsx', 'utf8');
    expect(actions).toContain('notifyAdminBookingCancellation');
    expect(helper).toContain("template: 'ADMIN_BOOKING_CANCELLED'");
    expect(helper).toContain("to: 'melissa@rhyzefit.com'");
    expect(helper).toContain("cc: ['vanessa@rhyzefit.com']");
    expect(helper).toContain('booking-cancelled-admin:');
    expect(helper).toContain('inAppNotification.createMany');
    expect(helper).toContain("endsWith: '@rhyze.local'");
    expect(layout).toContain('booking-cancelled-admin:');
    expect(layout).toContain('Recent class cancellation');
  });

  it('queues purchase, receipt, renewal, and management-sale messages', () => {
    const processor = readFileSync('lib/payments/webhook-processor.ts', 'utf8');
    expect(processor).toContain("'MEMBERSHIP_PURCHASE_CONFIRMATION'");
    expect(processor).toContain("'PURCHASE_CONFIRMATION'");
    expect(processor).toContain("'EVENT_PURCHASE_CONFIRMATION'");
    expect(processor).toContain("template: 'PAYMENT_RECEIPT'");
    expect(processor).toContain("template: 'MEMBERSHIP_RENEWED'");
    expect(processor).toContain("template: 'NEW_PURCHASE_ADMIN'");
    expect(processor).toContain("cc: ['vanessa@rhyzefit.com']");
  });

  it('persists CC recipients for queued email delivery', () => {
    const queue = readFileSync('lib/notifications/email-queue.ts', 'utf8');
    const worker = readFileSync('app/api/jobs/email/route.ts', 'utf8');
    expect(queue).toContain('cc?: string[]');
    expect(queue).toContain('cc: message.cc || []');
    expect(worker).toContain('cc: message.cc.length');
  });

  it('sends a branded contact acknowledgement and queues instructor denials', () => {
    const contact = readFileSync('app/api/contact/route.ts', 'utf8');
    const instructors = readFileSync('app/(studio)/admin/instructors/actions.ts', 'utf8');
    expect(contact).toContain('const to = site.emails.melissa');
    expect(contact).toContain("template: 'CONTACT_CONFIRMATION'");
    expect(contact).toContain('renderTransactionalEmail');
    expect(instructors).toContain("template: 'INSTRUCTOR_DENIED'");
  });

  it('queues one branded welcome email when a visitor subscribes in the footer', () => {
    const newsletter = readFileSync('app/api/newsletter/route.ts', 'utf8');
    const templates = readFileSync('lib/notifications/email-templates.ts', 'utf8');
    expect(newsletter).toContain("template: 'NEWSLETTER_WELCOME'");
    expect(newsletter).toContain('newsletter-welcome:');
    expect(newsletter).toContain('prisma.$transaction');
    expect(newsletter).toContain('new Resend(apiKey).emails.send');
    expect(newsletter).toContain("status: 'SENT'");
    expect(newsletter).toContain('renderTransactionalEmail');
    expect(templates).toContain('NEWSLETTER_WELCOME:');
  });

  it('keeps contact email out of Admin Messages and uses Email Archive as the only email record', () => {
    const inbox = readFileSync('app/(studio)/admin/messages/page.tsx', 'utf8');
    expect(inbox).not.toContain('WEBSITE INQUIRIES');
    expect(inbox).not.toContain('EMAIL QUEUE');
    expect(inbox).not.toContain('/admin/messages/email/');
    expect(inbox).not.toContain('prisma.emailMessage.findMany');
  });

  it('uses human-readable class details for transfers, updates, and cancellations', () => {
    const transfers = readFileSync('app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts', 'utf8');
    const messages = readFileSync('app/(portal)/instructor/classes/[occurrenceId]/message/actions.ts', 'utf8');
    expect(transfers).toContain('previousClass:');
    expect(transfers).toContain('newClass:');
    expect(transfers).toContain("bookingsUrl: '/member/bookings'");
    expect(messages).toContain('className: occurrence.template.name');
    expect(messages).toContain('classDate:');
    expect(messages).toContain('classTime:');
  });

  it('queues membership status updates from management actions', () => {
    const actions = readFileSync('app/(studio)/admin/members/[userId]/actions.ts', 'utf8');
    expect(actions).toContain("template: action === 'PAUSE' ? 'MEMBERSHIP_PAUSED'");
    expect(actions).toContain("'MEMBERSHIP_RESUMED'");
    expect(actions).toContain("'MEMBERSHIP_CANCELLED'");
  });

  it('acknowledges membership requests and communicates every review outcome', () => {
    const memberActions = readFileSync('app/(portal)/member/membership/actions.ts', 'utf8');
    const adminActions = readFileSync('app/(studio)/admin/members/[userId]/actions.ts', 'utf8');
    expect(memberActions).toContain("template: 'MEMBERSHIP_CHANGE_REQUEST_RECEIVED'");
    expect(adminActions).toContain("template: 'MEMBERSHIP_CHANGE_REQUEST_REVIEWED'");
  });

  it('notifies attendees when management cancels a class', () => {
    const actions = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/actions.ts', 'utf8');
    expect(actions).toContain("template: 'CLASS_CANCELLED'");
    expect(actions).toContain("status: 'CANCELLED'");
    expect(actions).toContain("type: 'RELEASE'");
  });

  it('confirms Admin-issued refunds to the member', () => {
    const actions = readFileSync('app/(studio)/admin/payments/actions.ts', 'utf8');
    expect(actions).toContain("template: 'PAYMENT_REFUND_CONFIRMATION'");
  });

  it('queues complete instructor document messages', () => {
    const review = readFileSync('app/(studio)/admin/instructors/[userId]/actions.ts', 'utf8');
    const reminders = readFileSync('app/api/jobs/credentials/route.ts', 'utf8');
    expect(review).toContain('credentialName:');
    expect(review).toContain("profileUrl: '/instructor/profile'");
    expect(reminders).toContain('missingDocuments:');
    expect(reminders).toContain("profileUrl: '/instructor/profile'");
  });
});
