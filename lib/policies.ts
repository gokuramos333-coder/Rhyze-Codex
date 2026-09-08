export type PolicySection = {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  list?: string[];
};

export const AGREEMENT_EFFECTIVE_LABEL = 'August 21, 2026';

export const policySections: PolicySection[] = [
  {
    id: 'waiver',
    title: 'Waiver',
    subtitle: 'Assumption of Risk · Release of Liability',
    body: 'I understand that dance, yoga, Pilates, strength, HIIT, and related fitness activities involve physical exertion and inherent risks, including serious injury. I voluntarily participate, accept those risks, confirm that I am physically able to participate, and release Rhyze Fitness, its owners, staff, and instructors from claims to the fullest extent permitted by law. This agreement does not waive rights that cannot legally be waived.',
  },
  {
    id: 'cancellation',
    title: 'Cancellation for Classes',
    subtitle: 'Transfers, late cancels, and no-shows',
    list: [
      'Submit every cancellation through My Bookings. A confirmation will show the exact credit and fee outcome before anything changes.',
      'More than 6 hours before a standard class: cancel with no fee. A reserved class credit is returned to the member account.',
      'More than 2 hours through 6 hours before class: OG Rhyze Tribe, Elevate, Ritual, class-pack, and single-class clients may reschedule to an eligible class within 14 days for a $5 transfer fee. The saved card is charged only after the new class is selected and confirmed.',
      'More than 2 hours through 6 hours before class: VIP clients may reschedule within 14 days with no transfer fee. Intro-trial clients receive a firm attendance reminder but no fee in this window.',
      '2 hours or less before class: standard membership, class-pack, and single-class clients lose the reserved credit and are charged a $10 late-cancellation fee to the saved payment method.',
      '2 hours or less before class: intro-trial and VIP clients are charged a $10 late-cancellation fee to the saved payment method.',
      'No-shows are charged automatically to the saved payment method: $10 for standard clients, $10 for intro-trial clients, and $10 for VIP clients.',
      'Complimentary owner and staff bookings are never charged an automatic attendance fee.',
      'Specialty event cancellations made more than 6 hours before the event automatically receive one event-only booking credit. The credit can be used for any eligible event, regardless of price, for 30 days from the cancellation date. Event credits cannot be used for standard classes.',
    ],
  },
  {
    id: 'weather',
    title: 'Weather and Emergency Closures',
    list: [
      'If Rhyze cancels a class because of severe weather, unsafe conditions, a utility failure, government restriction, instructor emergency, or another event outside reasonable control, Rhyze will restore the class credit or provide a fee-free transfer.',
      'A member who reasonably believes conditions are unsafe to travel may promptly request a weather exception. Rhyze may approve a fee-free transfer based on timing, location, official alerts, road conditions, and the circumstances presented.',
      'A general State of Emergency does not always prohibit travel. Official travel restrictions and local conditions will be considered, and Rhyze retains reasonable discretion unless law or an official order requires otherwise.',
      'Rhyze may cancel, delay, relocate, shorten, substitute an instructor, or move a class online when reasonably necessary for health and safety.',
      'Updates may be sent through email, enabled SMS, the website, or the member portal. Members are responsible for keeping contact information current and checking class status before travel.',
    ],
  },
  {
    id: 'refunds',
    title: 'Refunds and Membership Cancellation',
    list: [
      'Classes, events, and workshops are non-refundable except where required by law or when Rhyze expressly approves a refund.',
      'Special events, collaboration classes, and workshops are non-refundable. When cancelled more than 6 hours before the event, the member automatically receives one event-only booking credit, valid for 30 days from the cancellation date, instead of a cash refund.',
      'Any statutory cancellation rights control over conflicting studio wording. Eligible New Jersey health-club contracts may include specific cancellation, relocation, disability, closure, and online termination rights described in the applicable membership agreement.',
    ],
  },
  {
    id: 'late-booking',
    title: 'Late Booking',
    list: [
      'Online booking closes 30 minutes before class start time.',
      'Drop-ins are permitted if space is available.',
      'Check the website or member portal for availability and status before traveling.',
    ],
  },
  {
    id: 'private-groups',
    title: 'Private Group Parties',
    list: [
      'A $100 deposit is required when scheduling private groups.',
      'The deposit applies to the final balance due before the session begins.',
      'Sessions cancelled less than 72 hours before the appointment incur a cancellation fee equal to the deposit.',
      'When cancelled 72 or more hours before the event, the deposit may be used as a credit.',
    ],
  },
  {
    id: 'age',
    title: 'Age Requirements',
    list: [
      'All Rhyzers must be 12 years or older.',
      'Anyone under 18 requires a parent or guardian to sign the agreement in person before participation.',
    ],
  },
  {
    id: 'health',
    title: 'Health and Safety',
    list: [
      'Stay home when feeling unwell or experiencing a contagious illness.',
      'Tell the instructor about injuries, pregnancy, limitations, or relevant health concerns before class so modifications can be considered.',
      'Stop exercising and seek appropriate assistance if pain, dizziness, breathing difficulty, or another concerning symptom occurs.',
    ],
  },
  {
    id: 'conduct',
    title: 'Conduct and Studio Safety',
    list: [
      'Treat members, instructors, staff, facilities, and equipment respectfully.',
      'Rhyze may refuse entry or remove a person for harassment, threats, intoxication, unsafe behavior, material disruption, or failure to follow safety instructions. Credits or refunds are not guaranteed when removal results from misconduct.',
    ],
  },
  {
    id: 'property',
    title: 'Personal Property',
    body: 'Members are responsible for personal belongings. Rhyze is not responsible for lost, stolen, or damaged property except where liability cannot legally be excluded.',
  },
  {
    id: 'electronic-records',
    title: 'Electronic Signature and Policy Updates',
    list: [
      'Checking the agreement box and selecting Accept and digitally sign constitutes an electronic signature and consent to receive this agreement electronically.',
      'The accepted version, account, timestamp, and available technical evidence are retained as the acceptance record.',
      'Material changes create a new agreement version and require acceptance before a future booking.',
      'Members may print or save a copy and should keep their email and phone information current.',
    ],
  },
  {
    id: 'media',
    title: 'Photography and Media',
    body: 'Optional media consent: I give Rhyze Fitness permission to photograph or record me and use my image or likeness for its website, social media, advertising, and promotional materials. I understand that I will not be paid and may withdraw permission for future use by contacting Rhyze Fitness. Leaving this option unchecked will not affect membership, booking, or class participation.',
  },
];

export const agreementSnapshot = policySections
  .map((section) =>
    [
      section.title.toUpperCase(),
      section.subtitle,
      section.body,
      ...(section.list || []).map((item) => `• ${item}`),
    ]
      .filter(Boolean)
      .join('\n'),
  )
  .join('\n\n');
