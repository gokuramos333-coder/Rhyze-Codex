import { describe, it, expect } from 'vitest';
import {
  addDays,
  easternDate,
  qualifyingCampaignLink,
  defaultWeek,
  localSendCandidates,
  resolveSendTime,
  defaultAudience,
  resolveAudience,
  matchesAudience,
  eligibility,
  materialChanges,
  initials,
  blockSchema,
  documentSchema,
  validateContent,
  csvCell,
  type Customer,
  type ScheduleItem,
} from '@/lib/newsletters/domain';
import { renderNewsletter } from '@/lib/newsletters/render';
import { templateCatalog } from '@/lib/newsletters/templates';
import { campaignMetrics } from '@/lib/newsletters/analytics';
const customer = (partial: Partial<Customer> = {}): Customer => ({
  id: 'u',
  name: 'Sample User',
  email: 'a@example.test',
  phone: '',
  membership: 'Non-member',
  activeMember: false,
  formerMember: false,
  classAttendance: 0,
  eventAttendance: 0,
  recentAttendance: 0,
  bookings: 0,
  lastAttendance: null,
  bookedIds: [],
  attendedIds: [],
  signals: [],
  strongSignals: 0,
  recordedOpens: 0,
  consent: 'OPTED_IN',
  consentSource: 'Explicit signup',
  doNotContact: false,
  suppression: null,
  accountStatus: 'ACTIVE',
  outcome: 'NOT_CONTACTED',
  assignedToId: '',
  followUpAt: null,
  lastContactedAt: null,
  version: 0,
  attempts: 0,
  lastStaff: '',
  lastInitials: '',
  ...partial,
});
const session: ScheduleItem = {
  id: 's',
  title: 'Sample Class',
  startAt: '2026-10-05T16:00:00Z',
  endAt: '2026-10-05T17:00:00Z',
  instructor: 'Sample Instructor',
  description: 'Movement',
  image: '',
  isEvent: false,
  status: 'SCHEDULED',
  available: 5,
  href: '/book/sample?occurrence=s',
};
describe('Newsletter audience and outreach invariants', () => {
  it('generates initials without hardcoded people', () => {
    expect(initials('Alex Jordan Rivera')).toBe('AR');
    expect(initials('Rhyze')).toBe('R');
  });
  it('excludes unknown marketing eligibility', () =>
    expect(
      resolveAudience([customer({ consent: 'UNKNOWN' })], defaultAudience())
        .eligible,
    ).toHaveLength(0));
  it.each(['ACTIVE', 'INVITED'])(
    'includes owner-approved %s customer profiles without inventing consent',
    (accountStatus) => {
      const c = customer({
        consent: 'UNKNOWN',
        consentSource: '',
        accountStatus,
        marketingApproval: 'CUSTOMER_PROFILE',
      });
      expect(eligibility(c)).toBeNull();
      expect(c.consent).toBe('UNKNOWN');
      expect(c.consentSource).toBe('');
    },
  );
  it.each([
    { consent: 'OPTED_OUT' },
    { doNotContact: true },
    { suppression: 'Hard bounce' },
    { suppression: 'Unsubscribed' },
    { accountStatus: 'SUSPENDED' },
    { accountStatus: 'ARCHIVED' },
    { email: 'invalid' },
  ])('customer-profile approval preserves exclusion %j', (blocked) => {
    expect(
      eligibility(
        customer({
          consent: 'UNKNOWN',
          marketingApproval: 'CUSTOMER_PROFILE',
          ...blocked,
        }),
      ),
    ).not.toBeNull();
  });
  it('customer-profile approval cannot bypass an opt-out on the same address', () => {
    expect(
      resolveAudience(
        [
          customer({
            consent: 'UNKNOWN',
            marketingApproval: 'CUSTOMER_PROFILE',
          }),
          customer({ id: 'other', consent: 'OPTED_OUT' }),
        ],
        defaultAudience(),
      ).eligible,
    ).toHaveLength(0);
  });
  it('deduplicates overlapping groups and normalized emails', () => {
    const a = { ...defaultAudience(), groups: ['ALL', 'NON_MEMBERS'] as const };
    const r = resolveAudience(
      [customer(), customer({ id: 'b', email: ' A@EXAMPLE.TEST ' })],
      { ...a, groups: [...a.groups] },
    );
    expect(r.eligible).toHaveLength(1);
    expect(r.excluded[0].reason).toBe('Duplicate email');
  });
  it('opt-out on duplicate address prevents an eligible duplicate bypass', () =>
    expect(
      resolveAudience(
        [customer(), customer({ id: 'b', consent: 'OPTED_OUT' })],
        defaultAudience(),
      ).eligible,
    ).toHaveLength(0));
  it('engagement never overrides DNC or suppression', () =>
    expect(
      resolveAudience([customer({ doNotContact: true, strongSignals: 3 })], {
        ...defaultAudience(),
        groups: ['ENGAGED'],
      }).eligible,
    ).toHaveLength(0));
  it('does not treat booking as attendance', () => {
    expect(
      matchesAudience(customer({ bookings: 2, bookedIds: ['s'] }), {
        ...defaultAudience(),
        groups: ['ONE_CLASS'],
      }),
    ).toBe(false);
    expect(
      matchesAudience(customer({ bookedIds: ['s'] }), {
        ...defaultAudience(),
        groups: ['OCCURRENCE_ATTENDED'],
        occurrenceId: 's',
      }),
    ).toBe(false);
  });
  it('combines audience groups with recent attendance and excludes registrants', () => {
    const a = {
      ...defaultAudience(),
      groups: ['NON_MEMBERS'] as const,
      recentAttendance: true,
      excludeBooked: 's',
    };
    expect(
      resolveAudience([customer({ recentAttendance: 1, bookedIds: ['s'] })], {
        ...a,
        groups: [...a.groups],
      }).excluded[0].reason,
    ).toBe('Already registered');
  });
  it('does not classify active members as engaged nonmembers', () =>
    expect(
      matchesAudience(customer({ activeMember: true, strongSignals: 3 }), {
        ...defaultAudience(),
        groups: ['ENGAGED'],
      }),
    ).toBe(false));
});
describe('Schedule and DST', () => {
  it('Sunday defaults to upcoming Monday in Eastern time', () =>
    expect(defaultWeek(new Date('2026-10-05T01:00:00Z'))).toBe('2026-10-05'));
  it('Monday uses the same Monday', () =>
    expect(defaultWeek(new Date('2026-10-05T16:00:00Z'))).toBe('2026-10-05'));
  it('future send chooses its own week', () =>
    expect(defaultWeek(new Date('2026-11-16T15:00:00Z'))).toBe('2026-11-16'));
  it('rejects spring-forward nonexistent time', () =>
    expect(
      localSendCandidates('2027-03-14T02:30', 'America/New_York'),
    ).toHaveLength(0));
  it('requires a deliberate fall-back offset choice', () => {
    expect(
      localSendCandidates('2026-11-01T01:30', 'America/New_York'),
    ).toHaveLength(2);
    expect(() =>
      resolveSendTime(
        '2026-11-01T01:30',
        'America/New_York',
        undefined,
        new Date('2026-10-01'),
      ),
    ).toThrow('twice');
  });
  it('rejects past schedules and invalid calendar dates', () => {
    expect(() =>
      resolveSendTime(
        '2026-01-01T12:00',
        'America/New_York',
        undefined,
        new Date('2026-10-01'),
      ),
    ).toThrow('future');
    expect(
      localSendCandidates('2026-02-30T12:00', 'America/New_York'),
    ).toHaveLength(0);
  });
  it('handles month/year boundaries', () =>
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04'));
  it('holds material time/instructor/cancellation changes', () => {
    expect(
      materialChanges(
        [session],
        [{ ...session, instructor: 'Other Instructor' }],
      ),
    ).toHaveLength(1);
    expect(materialChanges([session], [])).toHaveLength(1);
    expect(
      materialChanges([session], [{ ...session, available: 2 }]),
    ).toHaveLength(0);
  });
});
describe('Templates and email safety', () => {
  it('has 15 complete independently editable starters', () => {
    expect(templateCatalog).toHaveLength(15);
    for (const t of templateCatalog) {
      expect(t.subject).toBeTruthy();
      expect(t.previewText).toBeTruthy();
      expect(documentSchema.safeParse(t.document).success).toBe(true);
      expect(
        t.document.blocks.some((b) => b.type === 'text' && b.text.length > 50),
      ).toBe(true);
    }
  });
  it('escapes user data and handles named/fallback personalization', () => {
    const doc = documentSchema.parse({
      version: 1,
      blocks: [
        {
          id: 'a',
          type: 'text',
          text: 'Hey {{first_name}}! <script>alert(1)</script>',
        },
      ],
    });
    const base = {
      subject: 'Hi',
      previewText: 'Preview',
      document: doc,
      schedule: [],
      origin: 'https://example.test',
      unsubscribeUrl: 'https://example.test/unsubscribe/x',
      postalAddress: 'Studio address',
    };
    expect(renderNewsletter(base).html).toContain('Hey there!');
    const h = renderNewsletter({ ...base, firstName: '<img onerror=x>' }).html;
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;img onerror=x&gt;');
  });
  it('neutralizes unsafe links and cannot include private notes fields', () => {
    const doc = documentSchema.parse({
      version: 1,
      blocks: [
        { id: 'a', type: 'button', text: 'Click', url: 'javascript:alert(1)' },
      ],
    });
    const r = renderNewsletter({
      subject: 'Hi',
      previewText: '',
      document: doc,
      schedule: [],
      origin: 'https://example.test',
      unsubscribeUrl: '/safe',
      postalAddress: 'Studio',
    });
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toContain('href="#"');
  });
  it('never invites booking a cancelled or full session', () => {
    const doc = documentSchema.parse({
      version: 1,
      blocks: [{ id: 'a', type: 'event', occurrenceId: 's' }],
    });
    const r = renderNewsletter({
      subject: 'Hi',
      previewText: '',
      document: doc,
      schedule: [{ ...session, status: 'CANCELLED' }],
      origin: 'https://example.test',
      unsubscribeUrl: '/safe',
      postalAddress: 'Studio',
    });
    expect(r.html).toContain('Cancelled / unavailable');
    expect(r.html).not.toContain('BOOK CLASS');
  });
  it('blocks review campaign without a verified link', () => {
    const t = templateCatalog.find((t) => t.type === 'REVIEW')!;
    expect(
      validateContent({
        subject: t.subject,
        document: t.document,
        type: t.type,
        schedule: [],
        sender: 'studio@example.test',
        replyTo: 'reply@example.test',
        postalAddress: 'Address',
        googleReviewUrl: '',
        now: new Date('2026-10-01'),
      }),
    ).toContain('Add a verified Google review URL in Email Settings.');
  });
  it('requires a real upcoming deadline for 24-hour urgency', () => {
    const doc = templateCatalog.find(
      (t) => t.type === 'CLASS_24_HOURS',
    )!.document;
    const errors = validateContent({
      subject: 'Class',
      document: doc,
      type: 'CLASS_24_HOURS',
      schedule: [],
      sender: 'studio@example.test',
      replyTo: 'reply@example.test',
      postalAddress: 'Address',
      googleReviewUrl: '',
      now: new Date('2026-10-01'),
    });
    expect(errors.some((e) => e.includes('real deadline'))).toBe(true);
  });
  it('rejects untrusted style values', () =>
    expect(
      blockSchema.safeParse({
        id: 'x',
        type: 'text',
        color: 'red;background:url(javascript:x)',
      }).success,
    ).toBe(false));
  it('protects spreadsheet CSV cells', () =>
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"'));
});
describe('Analytics truthfulness', () => {
  const recipient = {
    id: 'a',
    status: 'ACCEPTED',
    acceptedAt: new Date(),
    events: [],
  };
  it('distinguishes provider accepted from delivered and unsupported tracking', () => {
    const m = campaignMetrics([recipient], {
      opensSupported: false,
      clicksSupported: false,
    });
    expect(m.accepted).toBe(1);
    expect(m.delivered).toBe(0);
    expect(m.uniqueOpens).toBeNull();
    expect(m.openRate).toBeNull();
  });
  it('counts repeat opens but rates only delivered recipients', () => {
    const event = (type: string) => ({
      type,
      occurredAt: new Date(),
      automated: null,
      link: null,
    });
    const m = campaignMetrics(
      [
        {
          ...recipient,
          events: [event('email.opened'), event('email.opened')],
        },
        { ...recipient, id: 'b', events: [event('email.delivered')] },
      ],
      { opensSupported: true, clicksSupported: true },
    );
    expect(m.totalOpens).toBe(2);
    expect(m.uniqueOpens).toBe(1);
    expect(m.repeatOpens).toBe(1);
    expect(m.openRate).toBe(0);
    expect(m.delivered).toBe(1);
  });
  it('does not count captured preview email as provider accepted', () => {
    const m = campaignMetrics(
      [{ ...recipient, status: 'CAPTURED', acceptedAt: null }],
      { opensSupported: false, clicksSupported: false },
    );
    expect(m.captured).toBe(1);
    expect(m.accepted).toBe(0);
  });
});

it('keeps follow-up and reporting dates in Eastern time near midnight', () => {
  expect(easternDate('2026-10-03T00:00:00Z')).toBe('2026-10-02');
  expect(easternDate('2027-01-01T04:30:00Z')).toBe('2026-12-31');
});
it('attributes only same-site links carrying the matching campaign identifier', () => {
  expect(
    qualifyingCampaignLink(
      'https://example.test/book/dance?utm_campaign=c',
      'https://example.test',
      'c',
      'schedule',
    ),
  ).toBe(true);
  expect(
    qualifyingCampaignLink(
      'https://other.test/book/dance?utm_campaign=c',
      'https://example.test',
      'c',
      'schedule',
    ),
  ).toBe(false);
  expect(
    qualifyingCampaignLink(
      'https://example.test/book/dance?utm_campaign=other',
      'https://example.test',
      'c',
      'schedule',
    ),
  ).toBe(false);
  expect(
    qualifyingCampaignLink(
      'https://[invalid',
      'https://example.test',
      'c',
      'schedule',
    ),
  ).toBe(false);
});
