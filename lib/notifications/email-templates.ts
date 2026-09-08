export type EmailPayload = Record<string, unknown>;

export const EMAIL_TEMPLATE_REVISION = '2026-07-27-v3';

export type EmailPresentation = {
  eyebrow: string;
  headline: string;
  greeting?: string;
  paragraphs: string[];
  facts?: Array<{ label: string; value: string }>;
  callout?: { title: string; body: string };
  cta?: { label: string; href: string };
  closing?: string;
};

type EmailTemplateDefinition = {
  label: string;
  category: 'Accounts' | 'Bookings' | 'Memberships & payments' | 'Instructors' | 'Messages';
  trigger: string;
  subject: (payload: EmailPayload) => string;
  sample: EmailPayload;
  present: (payload: EmailPayload) => EmailPresentation;
};

function text(payload: EmailPayload, key: string, fallback: string) {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function dollars(payload: EmailPayload, key = 'amount', fallback = '$92.00') {
  const value = payload[key];
  if (typeof value === 'number') return `$${(value / 100).toFixed(2)}`;
  return typeof value === 'string' && value ? value : fallback;
}

const member = { name: 'Sample Member', memberUrl: '/member', membershipUrl: '/memberships' };
const booking = {
  ...member,
  className: 'Pilates Pulse',
  instructorName: 'Adrianna Jones',
  classDate: 'Monday, August 3',
  classTime: '10:00 AM',
  bookingsUrl: '/member/bookings',
};

export const emailTemplateCatalog = {
  WELCOME: {
    label: 'Welcome to Rhyze', category: 'Accounts', trigger: 'Immediately after a member creates an account',
    subject: () => 'Welcome to Rhyze Fitness', sample: member,
    present: (p) => ({ eyebrow: 'Welcome to the tribe', headline: 'Your Rhyze starts here', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['Your account is ready. You can now book classes, follow your credits, manage your membership, and stay connected with the studio in one place.', 'We are so glad you are here.'], cta: { label: 'Open My Rhyze', href: text(p, 'memberUrl', '/member') }, closing: 'Please cancel in advance if your plans change. No-shows and late cancellations may result in automatic charges under the Rhyze cancellation policy. If you have questions, review the policy or reach out to us.' }),
  },
  PROFILE_COMPLETION_REMINDER: {
    label: 'Profile completion and waiver reminder', category: 'Accounts', trigger: 'When management asks existing members to complete required profile and waiver details',
    subject: () => 'Please update your Rhyze profile and waivers', sample: { ...member, profileUrl: '/member/profile', waiverUrl: '/member/waiver' },
    present: (p) => ({
      eyebrow: 'Account update needed',
      headline: 'Complete your Rhyze profile',
      greeting: `Hi ${text(p, 'name', 'Rhyzer')},`,
      paragraphs: [
        'Please update your My Rhyze account with your full first and last name, email, cell phone, and birthday month and day so management can send your free standard class.',
        'Please also read and accept the required Rhyze waiver and cancellation policies before taking class. This is crucial for everyone’s safety and studio liability protection.',
        'If your information is already complete, please open your profile and waiver page to confirm everything is current.',
      ],
      facts: [
        { label: 'Profile', value: text(p, 'profileUrl', '/member/profile') },
        { label: 'Waiver', value: text(p, 'waiverUrl', '/member/waiver') },
      ],
      cta: { label: 'Update profile', href: text(p, 'profileUrl', '/member/profile') },
      closing: `Waivers and the cancellation policy must be accepted before booking or taking class. You can review the waiver here: ${text(p, 'waiverUrl', '/member/waiver')}`,
    }),
  },
  ACCOUNT_ACTIVATION: {
    label: 'Imported member account activation', category: 'Accounts', trigger: 'When an imported Somble member is invited to activate My Rhyze',
    subject: () => 'Your new My Rhyze Fitness account is ready!', sample: { name: 'Sample Member', activationUrl: '/claim-account/sample-token' },
    present: (p) => ({
      eyebrow: 'Your upgraded My Rhyze',
      headline: 'Your new account is ready',
      greeting: `Hi ${text(p, 'name', 'Rhyzer')},`,
      paragraphs: [
        'We’re excited to share that Rhyze Fitness has upgraded to our own in-house studio platform!',
        'The new My Rhyze experience has a cleaner layout and makes it easier to view your classes, memberships, credits, purchases, and studio updates in one place.',
        'We transferred your existing Rhyze information to this account, so you do not need to create another account or repurchase anything. Choose your password to activate access.',
        'This secure, one-time activation link expires after one month.',
      ],
      cta: { label: 'Activate My Rhyze Account', href: text(p, 'activationUrl', '/forgot-password') },
      closing: 'If you need help, reply to this email. Welcome to the Rhyze tribe!',
    }),
  },
  PASSWORD_RESET: {
    label: 'Password reset', category: 'Accounts', trigger: 'When someone requests a password reset',
    subject: () => 'Reset your Rhyze password', sample: { ...member, resetUrl: '/reset-password/sample-token' },
    present: (p) => ({ eyebrow: 'Account help', headline: 'Reset your password', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['We received a request to reset your Rhyze password.', 'This secure link expires soon. If you did not request it, you can ignore this email and your password will remain unchanged.'], cta: { label: 'Reset password', href: text(p, 'resetUrl', '/forgot-password') } }),
  },
  PASSWORD_CHANGED: {
    label: 'Password changed', category: 'Accounts', trigger: 'Immediately after a password is successfully changed or reset',
    subject: () => 'Your Rhyze password was changed', sample: { ...member, contactUrl: '/contact' },
    present: (p) => ({
      eyebrow: 'Account security',
      headline: 'Your password was changed',
      greeting: `Hi ${text(p, 'name', 'Rhyzer')},`,
      paragraphs: [
        'This is a confirmation that the password for your My Rhyze account was changed.',
        'If you made this change, no further action is needed. If you did not, contact Rhyze management right away.',
      ],
      cta: { label: 'Contact Rhyze', href: text(p, 'contactUrl', '/contact') },
    }),
  },
  NEW_SIGNUP_ADMIN: {
    label: 'New signup — management', category: 'Accounts', trigger: 'When a new member account is created',
    subject: (p) => `New Rhyze signup: ${text(p, 'memberName', 'New member')}`, sample: { memberName: 'Gui Ramos', memberEmail: 'gui@example.com', memberPhone: '(908) 555-0123', adminUrl: '/admin/members' },
    present: (p) => ({ eyebrow: 'Management update', headline: 'A new Rhyzer joined', paragraphs: [`${text(p, 'memberName', 'A new member')} just created an account.`], facts: [{ label: 'Email', value: text(p, 'memberEmail', 'Not provided') }, { label: 'Phone', value: text(p, 'memberPhone', 'Not provided') }], cta: { label: 'View member', href: text(p, 'adminUrl', '/admin/members') } }),
  },
  BIRTHDAY_MONTHLY_DIGEST: {
    label: 'Monthly birthday digest', category: 'Messages', trigger: 'On the first day of a month when active members or instructors have birthdays that month',
    subject: (p) => `${text(p, 'monthName', 'Upcoming')} birthdays at Rhyze`, sample: { monthName: 'September', birthdayList: 'September 8 — Sample Member (Member); September 21 — Sample Instructor (Instructor)' },
    present: (p) => ({ eyebrow: 'Management birthday calendar', headline: `${text(p, 'monthName', 'Upcoming')} birthdays`, paragraphs: ['Here are the active Rhyze member and instructor birthdays for this month so management has time to plan a celebration.'], callout: { title: 'Birthday list', body: text(p, 'birthdayList', 'No birthdays listed') }, cta: { label: 'Open Admin members', href: '/admin/members' } }),
  },
  BIRTHDAY_WEEK_AHEAD: {
    label: 'Birthday one-week reminder', category: 'Messages', trigger: 'Exactly seven days before an active member or instructor birthday',
    subject: (p) => `Birthday in one week: ${text(p, 'birthdayList', 'Rhyze member')}`, sample: { birthdayDate: 'September 8', birthdayList: 'Sample Member (Member)' },
    present: (p) => ({ eyebrow: 'Birthday reminder', headline: 'A Rhyze birthday is one week away', paragraphs: ['This reminder is being sent one week ahead so management has time to plan.'], facts: [{ label: 'Birthday', value: text(p, 'birthdayDate', 'One week from today') }], callout: { title: 'Who to celebrate', body: text(p, 'birthdayList', 'Rhyze member') }, cta: { label: 'Open Admin members', href: '/admin/members' } }),
  },
  BOOKING_CONFIRMATION: {
    label: 'Booking confirmation', category: 'Bookings', trigger: 'Immediately after a confirmed class booking',
    subject: (p) => `You’re booked for ${text(p, 'className', 'your Rhyze class')}`, sample: booking,
    present: (p) => ({ eyebrow: 'Spot confirmed', headline: 'You’re on the floor', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['Your spot is confirmed. We cannot wait to move with you.'], facts: [{ label: 'Class', value: text(p, 'className', 'Rhyze class') }, { label: 'Instructor', value: text(p, 'instructorName', 'Rhyze instructor') }, { label: 'When', value: `${text(p, 'classDate', 'See your bookings')} · ${text(p, 'classTime', '')}` }], cta: { label: 'View booking', href: text(p, 'bookingsUrl', '/member/bookings') }, callout: { title: 'Need to change plans?', body: 'Please cancel in advance through My Rhyze. Late cancellations and no-shows may result in automatic charges according to the Rhyze cancellation policy.' } }),
  },
  CLASS_REMINDER: {
    label: 'Class reminder', category: 'Bookings', trigger: '24 hours before a confirmed class',
    subject: (p) => `${text(p, 'className', 'Your Rhyze class')} is tomorrow`, sample: booking,
    present: (p) => ({ eyebrow: 'See you tomorrow', headline: 'Your class is coming up', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['A quick reminder to bring water, arrive a few minutes early, and come ready to move.'], facts: [{ label: 'Class', value: text(p, 'className', 'Rhyze class') }, { label: 'Instructor', value: text(p, 'instructorName', 'Rhyze instructor') }, { label: 'When', value: `${text(p, 'classDate', 'Tomorrow')} · ${text(p, 'classTime', '')}` }], cta: { label: 'View booking', href: text(p, 'bookingsUrl', '/member/bookings') } }),
  },
  BOOKING_CANCELLATION: {
    label: 'Booking cancellation', category: 'Bookings', trigger: 'After a member cancels or transfers out of a class',
    subject: (p) => `${text(p, 'className', 'Your class')} booking was cancelled`, sample: { ...booking, creditResult: 'Your class credit was returned to your account.' },
    present: (p) => ({ eyebrow: 'Booking updated', headline: 'Your cancellation is confirmed', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your booking for ${text(p, 'className', 'your Rhyze class')} has been cancelled.`, text(p, 'creditResult', 'Open My Rhyze to review your credit balance.')], cta: { label: 'View bookings', href: text(p, 'bookingsUrl', '/member/bookings') } }),
  },
  ATTENDANCE_NO_SHOW: {
    label: 'No-show follow-up', category: 'Bookings', trigger: 'After staff marks a booked member as a no-show',
    subject: (p) => `We missed you at ${text(p, 'className', 'class')}`,
    sample: { ...booking, chargeSummary: '$10 no-show fee charged to your saved payment method.', policyUrl: '/policies#cancellation' },
    present: (p) => ({ eyebrow: 'Attendance update', headline: 'We missed you in class', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`We missed you at ${text(p, 'className', 'your scheduled Rhyze class')} on ${text(p, 'classDate', 'your class date')} at ${text(p, 'classTime', 'class time')}.`, text(p, 'chargeSummary', 'A no-show fee may apply according to the Rhyze cancellation policy.'), 'We know life happens. If your plans change, please cancel in advance through My Rhyze so another Rhyzer has a chance to take the spot. Late cancellations and no-shows can result in automatic charges according to the Rhyze cancellation policy.'], cta: { label: 'View bookings', href: text(p, 'bookingsUrl', '/member/bookings') }, closing: `Questions? Review the Rhyze cancellation policy at ${text(p, 'policyUrl', '/policies#cancellation')} or reach out to us.` }),
  },
  ADMIN_BOOKING_CANCELLED: {
    label: 'Booking cancellation — management', category: 'Bookings', trigger: 'When a member cancels a booked class or event',
    subject: (p) => `Class cancellation: ${text(p, 'memberName', 'Member')}`,
    sample: { memberName: 'Kelly Roberts', memberEmail: 'kelly@example.com', className: 'TCJ Hip-Hop Happy Hour with Tricia', classDate: 'Monday, August 3', classTime: '7:15 PM', bookingStatus: 'CANCELLED', creditResult: 'Credit returned to the member account.', adminUrl: '/admin/schedule/sample/roster' },
    present: (p) => ({ eyebrow: 'Management alert', headline: `${text(p, 'memberName', 'A member')} cancelled a class`, paragraphs: [`${text(p, 'memberName', 'A member')} cancelled ${text(p, 'className', 'a Rhyze class')}.`, text(p, 'creditResult', 'Review the member credit/payment status in Admin.')], facts: [{ label: 'Member', value: text(p, 'memberEmail', 'View in Admin') }, { label: 'When', value: `${text(p, 'classDate', '')} · ${text(p, 'classTime', '')}` }, { label: 'Status', value: text(p, 'bookingStatus', 'CANCELLED') }], cta: { label: 'Open roster', href: text(p, 'adminUrl', '/admin') } }),
  },
  ATTENDANCE_CREDIT_RESTORED_STAFF: {
    label: 'Attendance credit restored — management', category: 'Bookings', trigger: 'When staff restore a two-week attendance rollover credit',
    subject: (p) => `Credit restored: ${text(p, 'memberName', 'Member')}`,
    sample: { memberName: 'Tricia Salazar', memberEmail: 'tricia@example.com', className: 'Heels 101 with Nicole', classDate: 'Monday, August 3', classTime: '7:15 PM', restoredBy: 'admin@rhyzefit.com', adminUrl: '/admin/members/sample#credits' },
    present: (p) => ({ eyebrow: 'Management update', headline: `${text(p, 'memberName', 'A member')} received a rollover credit`, paragraphs: ['A class credit was restored from attendance and must be applied within 2 weeks.', text(p, 'fallbackUsed', '') ? 'This restore used the no-reservation fallback because the original booking had no Rhyze credit reservation.' : 'The restored credit was tied back to the original class booking.'], facts: [{ label: 'Member', value: text(p, 'memberEmail', 'View in Admin') }, { label: 'Class', value: text(p, 'className', 'Rhyze class') }, { label: 'When', value: `${text(p, 'classDate', '')} · ${text(p, 'classTime', '')}` }, { label: 'Restored by', value: text(p, 'restoredBy', 'Rhyze staff') }], cta: { label: 'Open member credits', href: text(p, 'adminUrl', '/admin/members') } }),
  },
  BOOKING_TRANSFERRED: {
    label: 'Class transfer confirmation', category: 'Bookings', trigger: 'After an approved class transfer',
    subject: () => 'Your Rhyze class transfer is confirmed', sample: { ...booking, previousClass: 'Pilates Pulse · August 3', newClass: 'Pilates Pulse · August 10' },
    present: (p) => ({ eyebrow: 'Transfer complete', headline: 'Your new spot is confirmed', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['We moved your booking as requested.'], facts: [{ label: 'From', value: text(p, 'previousClass', 'Previous class') }, { label: 'To', value: text(p, 'newClass', 'New class') }], cta: { label: 'View updated booking', href: text(p, 'bookingsUrl', '/member/bookings') } }),
  },
  WAITLIST_JOINED: {
    label: 'Waitlist joined', category: 'Bookings', trigger: 'After a member joins a full class waitlist',
    subject: (p) => `You’re on the waitlist for ${text(p, 'className', 'a Rhyze class')}`, sample: { ...booking, waitlistPosition: '2' },
    present: (p) => ({ eyebrow: 'Waitlist update', headline: 'You’re in line for a spot', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`You joined the waitlist for ${text(p, 'className', 'your selected class')}. We will email you immediately if a spot opens.`], facts: [{ label: 'Current position', value: text(p, 'waitlistPosition', 'View in My Rhyze') }, { label: 'When', value: `${text(p, 'classDate', '')} · ${text(p, 'classTime', '')}` }], cta: { label: 'View waitlist', href: text(p, 'bookingsUrl', '/member/bookings') } }),
  },
  WAITLIST_PROMOTED: {
    label: 'Waitlist promotion', category: 'Bookings', trigger: 'When an open spot automatically promotes a waitlisted member',
    subject: (p) => `A spot opened in ${text(p, 'className', 'your Rhyze class')}`, sample: booking,
    present: (p) => ({ eyebrow: 'You’re in', headline: 'A spot opened for you', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Good news—your spot in ${text(p, 'className', 'the class')} is now confirmed.`], facts: [{ label: 'When', value: `${text(p, 'classDate', '')} · ${text(p, 'classTime', '')}` }, { label: 'Instructor', value: text(p, 'instructorName', 'Rhyze instructor') }], cta: { label: 'View booking', href: text(p, 'bookingsUrl', '/member/bookings') } }),
  },
  WAITLIST_SPOT_AVAILABLE: {
    label: 'Waitlist spot available', category: 'Bookings', trigger: 'When the first waitlisted member must securely claim and pay for an open spot',
    subject: (p) => `A spot is ready to claim in ${text(p, 'className', 'your Rhyze class')}`, sample: booking,
    present: (p) => ({ eyebrow: 'You’re first in line', headline: 'A spot is ready for you', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`A cancellation opened a spot in ${text(p, 'className', 'the class')}. You have first access to claim it. You will not be charged unless you complete the secure booking.`], facts: [{ label: 'When', value: `${text(p, 'classDate', '')} · ${text(p, 'classTime', '')}` }, { label: 'Instructor', value: text(p, 'instructorName', 'Rhyze instructor') }], cta: { label: 'Claim available spot', href: text(p, 'claimUrl', '/member/bookings') } }),
  },
  CLASS_UPDATE: {
    label: 'Instructor class update', category: 'Bookings', trigger: 'When an instructor messages an upcoming roster',
    subject: (p) => text(p, 'messageSubject', `Update for ${text(p, 'className', 'your class')}`), sample: { ...booking, messageSubject: 'Weather update for Pilates Pulse', body: 'Please allow a few extra minutes for travel. Class is still on as scheduled.' },
    present: (p) => ({ eyebrow: 'Class update', headline: text(p, 'messageSubject', 'A note about your class'), greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [text(p, 'body', 'Your instructor shared an update about your upcoming class.')], facts: [{ label: 'Class', value: text(p, 'className', 'Rhyze class') }, { label: 'When', value: `${text(p, 'classDate', '')} · ${text(p, 'classTime', '')}` }], cta: { label: 'View booking', href: text(p, 'bookingsUrl', '/member/bookings') } }),
  },
  CLASS_CANCELLED: {
    label: 'Class cancelled', category: 'Bookings', trigger: 'When management or an instructor cancels a class',
    subject: (p) => `${text(p, 'className', 'Your Rhyze class')} was cancelled`, sample: { ...booking, reason: 'The studio needs to cancel this class due to low enrollment.', creditResult: 'Your credit has been returned automatically.' },
    present: (p) => ({
      eyebrow: 'Schedule change',
      headline: 'This class has been cancelled',
      greeting: `Hi ${text(p, 'name', 'Rhyzer')},`,
      paragraphs: [
        `We need to cancel ${text(p, 'className', 'your upcoming class')} on ${text(p, 'classDate', 'the scheduled date')} at ${text(p, 'classTime', 'the scheduled time')}.`,
        'We apologize for the inconvenience and appreciate your understanding.',
        text(p, 'reason', 'Open My Rhyze for the latest update.'),
        text(p, 'creditResult', 'Your eligible credit will be returned automatically.'),
        'We hope to see you in another class soon.',
      ],
      cta: { label: 'Choose another class', href: '/classes' },
    }),
  },
  MEMBERSHIP_PURCHASE_CONFIRMATION: {
    label: 'Membership purchase', category: 'Memberships & payments', trigger: 'After Stripe confirms a membership purchase',
    subject: (p) => `Welcome to ${text(p, 'planName', 'your Rhyze membership')}`, sample: { ...member, planName: 'Elevate', amount: '$92.00', billingSchedule: 'Monthly', billingUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Membership active', headline: 'Your rhythm has room to grow', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your ${text(p, 'planName', 'Rhyze')} membership is active. Thank you for choosing to move with us.`], facts: [{ label: 'Plan', value: text(p, 'planName', 'Rhyze membership') }, { label: 'Paid', value: dollars(p) }, { label: 'Billing', value: text(p, 'billingSchedule', 'See billing details') }], cta: { label: 'Manage membership', href: text(p, 'billingUrl', '/member/billing') }, closing: 'Please cancel in advance if you cannot attend a booked class. No-shows and late cancellations may result in automatic charges under the Rhyze cancellation policy. If you have questions, review the policy or reach out to us.' }),
  },
  PURCHASE_CONFIRMATION: {
    label: 'Class pack or merchandise purchase', category: 'Memberships & payments', trigger: 'After Stripe confirms a one-time purchase',
    subject: (p) => `Your Rhyze purchase is confirmed`, sample: { ...member, itemName: '5-Class Pack', amount: '$110.00', receiptUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Purchase confirmed', headline: 'You’re ready to move', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your purchase of ${text(p, 'itemName', 'a Rhyze offering')} is complete.`], facts: [{ label: 'Item', value: text(p, 'itemName', 'Rhyze purchase') }, { label: 'Paid', value: dollars(p) }], cta: { label: 'View receipt', href: text(p, 'receiptUrl', '/member/billing') }, closing: 'Please cancel in advance if you cannot attend a booked class. No-shows and late cancellations may result in automatic charges under the Rhyze cancellation policy. If you have questions, review the policy or reach out to us.' }),
  },
  EVENT_PURCHASE_CONFIRMATION: {
    label: 'Special event purchase', category: 'Memberships & payments', trigger: 'After Stripe confirms an event booking',
    subject: (p) => `You’re booked for ${text(p, 'eventName', 'a Rhyze special event')}`, sample: { ...member, eventName: 'TCJ Hip-Hop Happy Hour', eventDate: 'Monday, August 3', eventTime: '7:15 PM', amount: '$30.00', bookingsUrl: '/member/bookings' },
    present: (p) => ({ eyebrow: 'Special event confirmed', headline: 'Your event spot is yours', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['Your payment is complete and your name is on the roster.'], facts: [{ label: 'Event', value: text(p, 'eventName', 'Rhyze special event') }, { label: 'When', value: `${text(p, 'eventDate', '')} · ${text(p, 'eventTime', '')}` }, { label: 'Paid', value: dollars(p) }], cta: { label: 'View booking', href: text(p, 'bookingsUrl', '/member/bookings') } }),
  },
  PAYMENT_RECEIPT: {
    label: 'Payment receipt', category: 'Memberships & payments', trigger: 'After a successful one-time payment',
    subject: () => 'Your Rhyze payment receipt', sample: { ...member, itemName: '5-Class Pack', amount: '$110.00', paidAt: 'July 27, 2026', paymentMethod: 'Visa ending in 4242', receiptUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Payment received', headline: 'Thank you', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['Your payment was successful. Keep this email for your records.'], facts: [{ label: 'For', value: text(p, 'itemName', 'Rhyze purchase') }, { label: 'Amount', value: dollars(p) }, { label: 'Date', value: text(p, 'paidAt', 'Today') }, { label: 'Payment method', value: text(p, 'paymentMethod', 'Saved payment method') }], cta: { label: 'View billing', href: text(p, 'receiptUrl', '/member/billing') } }),
  },
  MEMBERSHIP_RENEWED: {
    label: 'Membership renewal', category: 'Memberships & payments', trigger: 'After a recurring membership payment succeeds',
    subject: (p) => `${text(p, 'planName', 'Your Rhyze membership')} renewed`, sample: { ...member, planName: 'Elevate', amount: '$92.00', nextBillingDate: 'August 27, 2026', billingUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Membership renewed', headline: 'Keep your rhythm going', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your ${text(p, 'planName', 'Rhyze')} membership renewed successfully.`], facts: [{ label: 'Payment', value: dollars(p) }, { label: 'Next billing date', value: text(p, 'nextBillingDate', 'See billing details') }], cta: { label: 'View billing', href: text(p, 'billingUrl', '/member/billing') } }),
  },
  PAYMENT_FAILED: {
    label: 'Failed payment', category: 'Memberships & payments', trigger: 'When Stripe cannot collect a membership payment',
    subject: () => 'Your Rhyze payment needs attention', sample: { ...member, amount: '$92.00', billingUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Billing update', headline: 'Please update your payment method', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`We could not complete your ${dollars(p, 'amountCents')} payment. Update your payment method so your membership and class access stay uninterrupted.`], cta: { label: 'Update payment method', href: text(p, 'billingUrl', '/member/billing') }, callout: { title: 'Need help?', body: 'Reply to this email and our management team will help you review the account.' } }),
  },
  TRIAL_ENDING: {
    label: '$7 trial ending', category: 'Memberships & payments', trigger: 'One day before the seven-day trial expires',
    subject: () => 'Your Rhyze intro week ends tomorrow', sample: member,
    present: (p) => ({ eyebrow: 'Your next rhythm', headline: 'Your intro week ends tomorrow', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: ['Thank you for spending your intro week with Rhyze Fitness. Your $7 trial ends tomorrow.', 'Keep moving with Elevate, Ritual, or VIP Access.'], cta: { label: 'Explore memberships', href: text(p, 'membershipUrl', '/memberships') }, callout: { title: 'What changes after the trial?', body: 'Trial class access ends, but your Rhyze account, history, and profile stay ready whenever you choose a membership.' } }),
  },
  MEMBERSHIP_PAUSED: {
    label: 'Membership paused', category: 'Memberships & payments', trigger: 'When management pauses a membership',
    subject: () => 'Your Rhyze membership is paused', sample: { ...member, planName: 'Elevate', pauseUntil: 'September 1, 2026', billingUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Membership update', headline: 'Your plan is paused', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your ${text(p, 'planName', 'Rhyze')} membership is paused. No new membership credits will be available during the pause.`], facts: [{ label: 'Scheduled return', value: text(p, 'pauseUntil', 'Management will confirm') }], cta: { label: 'View membership', href: text(p, 'billingUrl', '/member/billing') } }),
  },
  MEMBERSHIP_RESUMED: {
    label: 'Membership resumed', category: 'Memberships & payments', trigger: 'When management resumes a paused membership',
    subject: () => 'Your Rhyze membership is active again', sample: { ...member, planName: 'Elevate', billingUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Welcome back', headline: 'Your membership is moving again', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your ${text(p, 'planName', 'Rhyze')} membership is active again. You can use your available credits and book classes now.`], cta: { label: 'Book a class', href: '/classes' } }),
  },
  MEMBERSHIP_CANCELLED: {
    label: 'Membership cancellation', category: 'Memberships & payments', trigger: 'After management confirms a membership cancellation',
    subject: () => 'Your Rhyze membership cancellation is confirmed', sample: { ...member, planName: 'Elevate', accessEndsAt: 'August 26, 2026', membershipUrl: '/member/membership' },
    present: (p) => ({ eyebrow: 'Membership update', headline: 'Your cancellation is confirmed', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your ${text(p, 'planName', 'Rhyze')} membership will not renew.`], facts: [{ label: 'Access through', value: text(p, 'accessEndsAt', 'Your paid billing period') }], cta: { label: 'View membership', href: text(p, 'membershipUrl', '/member/membership') }, closing: 'The floor is here whenever you are ready to return.' }),
  },
  MEMBERSHIP_CHANGE_REQUEST_RECEIVED: {
    label: 'Membership request received', category: 'Memberships & payments', trigger: 'Immediately after a member requests a plan change, pause, or cancellation',
    subject: () => 'We received your membership request', sample: { ...member, requestType: 'Cancellation', planName: 'Elevate', membershipUrl: '/member/membership' },
    present: (p) => ({ eyebrow: 'Request received', headline: 'Management will review your request', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`We received your ${text(p, 'requestType', 'membership change')} request for ${text(p, 'planName', 'your Rhyze membership')}. Your current access remains unchanged while management reviews it.`], cta: { label: 'View membership', href: text(p, 'membershipUrl', '/member/membership') }, closing: 'We will send another email as soon as the review is complete.' }),
  },
  MEMBERSHIP_CHANGE_REQUEST_REVIEWED: {
    label: 'Membership request reviewed', category: 'Memberships & payments', trigger: 'After management reviews a membership request that is not completed automatically',
    subject: () => 'Your membership request was reviewed', sample: { ...member, requestType: 'Pause', decision: 'Not approved', reviewNote: 'Please contact management so we can review the requested dates.', membershipUrl: '/member/membership' },
    present: (p) => ({ eyebrow: 'Request update', headline: 'Management reviewed your request', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`Your ${text(p, 'requestType', 'membership')} request was ${text(p, 'decision', 'reviewed').toLowerCase()}.`, text(p, 'reviewNote', 'Open My Rhyze to review your current membership status.')], cta: { label: 'View membership', href: text(p, 'membershipUrl', '/member/membership') } }),
  },
  PAYMENT_REFUND_CONFIRMATION: {
    label: 'Refund confirmation', category: 'Memberships & payments', trigger: 'After management successfully issues a Stripe refund',
    subject: () => 'Your Rhyze refund was issued', sample: { ...member, itemName: 'Elevate membership', amount: '$92.00', billingUrl: '/member/billing' },
    present: (p) => ({ eyebrow: 'Refund issued', headline: 'Your refund is on the way', greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [`We issued a ${dollars(p)} refund for ${text(p, 'itemName', 'your Rhyze purchase')}. Your bank may take several business days to post it.`], cta: { label: 'View billing', href: text(p, 'billingUrl', '/member/billing') } }),
  },
  NEW_PURCHASE_ADMIN: {
    label: 'New purchase — management', category: 'Memberships & payments', trigger: 'After Stripe confirms a new purchase',
    subject: (p) => `New Rhyze purchase: ${text(p, 'memberName', 'Member')}`, sample: { memberName: 'Gui Ramos', memberEmail: 'gui@example.com', itemName: 'Elevate', amount: '$92.00', adminUrl: '/admin/payments' },
    present: (p) => ({ eyebrow: 'Management update', headline: 'A new purchase came through', paragraphs: [`${text(p, 'memberName', 'A member')} purchased ${text(p, 'itemName', 'a Rhyze offering')}.`], facts: [{ label: 'Member', value: text(p, 'memberEmail', 'View in Admin') }, { label: 'Amount', value: dollars(p) }], cta: { label: 'View sale', href: text(p, 'adminUrl', '/admin/payments') } }),
  },
  INSTRUCTOR_APPROVAL_NEEDED: {
    label: 'Instructor approval request', category: 'Instructors', trigger: 'When someone signs up with the instructor code',
    subject: (p) => `Instructor approval needed: ${text(p, 'applicantName', 'New applicant')}`, sample: { applicantName: 'Nicole Finley', applicantEmail: 'nicole@example.com', adminPath: '/admin/instructors' },
    present: (p) => ({ eyebrow: 'Management review', headline: 'A new instructor is waiting', paragraphs: [`${text(p, 'applicantName', 'A new applicant')} used the Rhyze instructor code and needs approval.`], facts: [{ label: 'Email', value: text(p, 'applicantEmail', 'Not provided') }], cta: { label: 'Review application', href: text(p, 'adminPath', '/admin/instructors') } }),
  },
  INSTRUCTOR_WELCOME_INVITE: {
    label: 'Instructor welcome invitation', category: 'Instructors', trigger: 'When management manually invites a new or existing member to join the instructor team',
    subject: () => 'Welcome to the Rhyze Tribe team', sample: { name: 'Avery', instructorCode: 'RZTRIBE2026', activationUrl: '/member/instructor-access' },
    present: (p) => ({
      eyebrow: 'Welcome to the Rhyze Tribe team',
      headline: 'Your instructor invitation is ready',
      greeting: `Hi ${text(p, 'name', 'Instructor')},`,
      paragraphs: [
        'Management created your Rhyze instructor invitation. Open the link below, sign in or activate your account, and enter the instructor access code.',
        'After you submit the code, management will review and approve your access before the instructor portal opens.',
      ],
      facts: [{ label: 'Instructor access code', value: text(p, 'instructorCode', 'Contact management') }],
      cta: { label: 'Activate instructor invitation', href: text(p, 'activationUrl', '/member/instructor-access') },
      closing: 'Welcome to the team. We are excited to have you join the Rhyze Tribe!',
    }),
  },
  INSTRUCTOR_APPROVED: {
    label: 'Instructor approved', category: 'Instructors', trigger: 'After management approves an instructor application',
    subject: () => 'Your Rhyze instructor access is approved', sample: { name: 'Nicole', referralCode: 'NICOLERZ26', instructorUrl: '/instructor' },
    present: (p) => ({ eyebrow: 'Welcome to the instructor tribe', headline: 'Your instructor portal is ready', greeting: `Hi ${text(p, 'name', 'Instructor')},`, paragraphs: ['Management approved your Rhyze instructor access. You can now see your assigned classes, rosters, referrals, and profile tasks.'], facts: [{ label: 'Your referral code', value: text(p, 'referralCode', 'Available in your portal') }], cta: { label: 'Open instructor portal', href: text(p, 'instructorUrl', '/instructor') } }),
  },
  INSTRUCTOR_DENIED: {
    label: 'Instructor application not approved', category: 'Instructors', trigger: 'After management denies an instructor application',
    subject: () => 'Update on your Rhyze instructor request', sample: { name: 'Applicant', reason: 'We need to confirm a few details before approving access.', contactUrl: '/contact' },
    present: (p) => ({ eyebrow: 'Application update', headline: 'Your instructor request needs follow-up', greeting: `Hi ${text(p, 'name', 'there')},`, paragraphs: ['Your instructor access was not approved at this time.', text(p, 'reason', 'Reply to this email if you believe this needs another review.')], cta: { label: 'Contact Rhyze', href: text(p, 'contactUrl', '/contact') } }),
  },
  INSTRUCTOR_DOCUMENTS_MISSING: {
    label: 'Missing instructor documents', category: 'Instructors', trigger: '48 hours after approval when CPR or insurance is missing',
    subject: () => 'Complete your Rhyze instructor credentials', sample: { name: 'Nicole', missingDocuments: 'Instructor insurance and CPR certification', profileUrl: '/instructor/profile' },
    present: (p) => ({ eyebrow: 'Instructor profile task', headline: 'Please upload your documents', greeting: `Hi ${text(p, 'name', 'Instructor')},`, paragraphs: ['Your instructor portal is active, but your compliance profile is not complete.'], facts: [{ label: 'Still needed', value: text(p, 'missingDocuments', 'Insurance or CPR documentation') }], cta: { label: 'Upload documents', href: text(p, 'profileUrl', '/instructor/profile') } }),
  },
  CREDENTIAL_VALID: {
    label: 'Instructor credential approved', category: 'Instructors', trigger: 'After management approves a CPR or insurance document',
    subject: (p) => `Your ${text(p, 'credentialName', 'instructor document')} was approved`, sample: { name: 'Nicole', credentialName: 'CPR certification', profileUrl: '/instructor/profile' },
    present: (p) => ({ eyebrow: 'Document reviewed', headline: 'Your document is approved', greeting: `Hi ${text(p, 'name', 'Instructor')},`, paragraphs: [`Management approved your ${text(p, 'credentialName', 'instructor document')}. Your profile has been updated.`], cta: { label: 'View profile', href: text(p, 'profileUrl', '/instructor/profile') } }),
  },
  CREDENTIAL_REJECTED: {
    label: 'Instructor credential rejected', category: 'Instructors', trigger: 'When a CPR or insurance upload cannot be approved',
    subject: (p) => `Please replace your ${text(p, 'credentialName', 'instructor document')}`, sample: { name: 'Nicole', credentialName: 'insurance document', rejectionNote: 'The uploaded image is too blurry to verify.', profileUrl: '/instructor/profile' },
    present: (p) => ({ eyebrow: 'Document needs attention', headline: 'Please upload a new copy', greeting: `Hi ${text(p, 'name', 'Instructor')},`, paragraphs: [`We could not approve your ${text(p, 'credentialName', 'instructor document')}.`, text(p, 'rejectionNote', 'Please upload a clear, current copy for review.')], cta: { label: 'Replace document', href: text(p, 'profileUrl', '/instructor/profile') } }),
  },
  CREDENTIAL_EXPIRING: {
    label: 'Instructor credential expiring', category: 'Instructors', trigger: 'Before a dated CPR or insurance document expires',
    subject: (p) => `Your ${text(p, 'credentialName', 'instructor document')} expires soon`, sample: { name: 'Nicole', credentialName: 'CPR certification', expirationDate: 'August 27, 2026', profileUrl: '/instructor/profile' },
    present: (p) => ({ eyebrow: 'Document reminder', headline: 'Your credential expires soon', greeting: `Hi ${text(p, 'name', 'Instructor')},`, paragraphs: [`Your ${text(p, 'credentialName', 'instructor document')} is approaching its expiration date.`], facts: [{ label: 'Expiration date', value: text(p, 'expirationDate', 'See your profile') }], cta: { label: 'Upload an updated copy', href: text(p, 'profileUrl', '/instructor/profile') } }),
  },
  CREDENTIAL_EXPIRED: {
    label: 'Instructor credential expired', category: 'Instructors', trigger: 'When a dated CPR or insurance document expires',
    subject: (p) => `Your ${text(p, 'credentialName', 'instructor document')} has expired`, sample: { name: 'Nicole', credentialName: 'instructor insurance', expirationDate: 'July 27, 2026', profileUrl: '/instructor/profile' },
    present: (p) => ({ eyebrow: 'Document required', headline: 'Your credential has expired', greeting: `Hi ${text(p, 'name', 'Instructor')},`, paragraphs: [`Your ${text(p, 'credentialName', 'instructor document')} is now expired. Please upload a current copy so management can review it.`], facts: [{ label: 'Expired', value: text(p, 'expirationDate', 'Recently') }], cta: { label: 'Replace document', href: text(p, 'profileUrl', '/instructor/profile') } }),
  },
  ADMIN_MESSAGE: {
    label: 'Management message', category: 'Messages', trigger: 'When management sends a member a portal message',
    subject: (p) => text(p, 'messageSubject', 'A new message from Rhyze'), sample: { ...member, senderName: 'Rhyze Management', messageSubject: 'A quick note from Rhyze', body: 'Hi Gui! We wanted to make sure you have everything you need for your first class.', messageUrl: '/member/messages' },
    present: (p) => ({ eyebrow: 'New message', headline: text(p, 'messageSubject', 'A note from Rhyze'), greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [text(p, 'body', 'You have a new message from Rhyze management.')], facts: [{ label: 'From', value: text(p, 'senderName', 'Rhyze Management') }], cta: { label: 'Open conversation', href: text(p, 'messageUrl', '/member/messages') } }),
  },
  MEMBER_REPLY: {
    label: 'Member reply — management', category: 'Messages', trigger: 'When a member replies to an Admin conversation',
    subject: (p) => `Member reply: ${text(p, 'conversationSubject', 'Rhyze conversation')}`, sample: { senderName: 'Gui Ramos', senderEmail: 'gui@example.com', conversationSubject: 'Membership question', body: 'Thank you. That answers my question!', messageUrl: '/admin/messages' },
    present: (p) => ({ eyebrow: 'Member reply', headline: text(p, 'conversationSubject', 'A member replied'), paragraphs: [text(p, 'body', 'A member replied to a Rhyze conversation.')], facts: [{ label: 'From', value: `${text(p, 'senderName', 'Member')} · ${text(p, 'senderEmail', '')}` }], cta: { label: 'Open conversation', href: text(p, 'messageUrl', '/admin/messages') } }),
  },
  CAMPAIGN: {
    label: 'Email campaign', category: 'Messages', trigger: 'When management sends or schedules an announcement',
    subject: (p) => text(p, 'campaignSubject', 'News from Rhyze Fitness'), sample: { name: 'Gui', campaignSubject: 'A new week on the floor', body: 'Fresh classes are on the schedule. Come find the movement that feels like you.', campaignUrl: '/classes' },
    present: (p) => ({ eyebrow: 'Studio news', headline: text(p, 'campaignSubject', 'News from Rhyze Fitness'), greeting: `Hi ${text(p, 'name', 'Rhyzer')},`, paragraphs: [text(p, 'body', 'There is something new happening at Rhyze Fitness.')], cta: { label: 'See what’s happening', href: text(p, 'campaignUrl', '/classes') }, closing: 'You are receiving this because you chose Studio News and offers. You can update that preference in My Rhyze.' }),
  },
  CONTACT_FORM: {
    label: 'Contact form — management', category: 'Messages', trigger: 'When someone submits the website contact form',
    subject: (p) => `Website message from ${text(p, 'senderName', 'a visitor')}`, sample: { senderName: 'Gui Ramos', senderEmail: 'gui@example.com', senderPhone: '(908) 555-0123', body: 'Hi! Which class would you recommend for a first visit?', adminUrl: '/admin/messages' },
    present: (p) => ({ eyebrow: 'Website inquiry', headline: 'A new message came in', paragraphs: [text(p, 'body', 'A visitor sent a message through the Rhyze website.')], facts: [{ label: 'From', value: text(p, 'senderName', 'Website visitor') }, { label: 'Email', value: text(p, 'senderEmail', 'Not provided') }, { label: 'Phone', value: text(p, 'senderPhone', 'Not provided') }], cta: { label: 'Open Admin', href: text(p, 'adminUrl', '/admin/messages') } }),
  },
  CONTACT_CONFIRMATION: {
    label: 'Contact form confirmation', category: 'Messages', trigger: 'Immediately after someone submits the website contact form',
    subject: () => 'We received your message', sample: { name: 'Gui', contactUrl: '/contact' },
    present: (p) => ({ eyebrow: 'Message received', headline: 'We’ll be in touch soon', greeting: `Hi ${text(p, 'name', 'there')},`, paragraphs: ['Thank you for reaching out to Rhyze Fitness. We received your message and will respond as soon as possible.', 'In the meantime, you can explore the schedule and find your next class.'], cta: { label: 'View class schedule', href: '/classes' }, closing: 'Need to add something? Reply directly to this email.' }),
  },
  NEWSLETTER_WELCOME: {
    label: 'Newsletter subscription welcome', category: 'Messages', trigger: 'Immediately after someone subscribes in the website footer',
    subject: () => 'You’re in the Rhyze rhythm', sample: { email: 'gui@example.com', classesUrl: '/classes' },
    present: (p) => ({ eyebrow: 'Welcome to Rhyze updates', headline: 'You’re on the list', paragraphs: ['Thank you for subscribing. We’ll keep you in rhythm with studio news, schedule updates, special events, and member offers.', 'Until then, explore the classes waiting for you on the floor.'], cta: { label: 'Explore classes', href: text(p, 'classesUrl', '/classes') }, closing: 'You can unsubscribe from marketing updates at any time.' }),
  },
} satisfies Record<string, EmailTemplateDefinition>;

export type EmailTemplateKey = keyof typeof emailTemplateCatalog;
export const emailTemplateKeys = Object.keys(emailTemplateCatalog) as EmailTemplateKey[];

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return value in emailTemplateCatalog;
}

export function sampleEmailInput(template: EmailTemplateKey) {
  const definition = emailTemplateCatalog[template];
  return { template, subject: definition.subject(definition.sample), payload: definition.sample };
}
