import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const url = process.env.VIP_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/identity_migration')) throw Error('Waitlist tests require disposable local identity_migration');
const state = vi.hoisted(() => ({ actor: { id: '', email: 'synthetic@example.test', name: 'Synthetic' } }));
vi.mock('@/lib/db/prisma', async () => { const { PrismaClient } = await import('@prisma/client'); return { prisma: new PrismaClient({ datasourceUrl: process.env.VIP_TEST_DATABASE_URL }) }; });
vi.mock('@/lib/auth/session', () => ({ requireArea: async () => ({ ...state.actor }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error(url); } }));
// Any accidental financial operation must fail this read/write-isolated test.
vi.mock('@/lib/payments/attendance-fee', () => ({ chargeAttendanceFee: () => { throw Error('Unexpected charge'); }, refundAttendanceFee: () => { throw Error('Unexpected refund'); } }));
import { waitlistEmailIsDeliverable, completeWaitlistBooking } from '@/lib/domain/bookings/waitlist';
import { cancelBookingAction, bookOccurrenceAction } from '@/app/(portal)/member/bookings/actions';
import { prisma as db } from '@/lib/db/prisma';

describe.skipIf(!url)('waitlist cancellation notifications in PostgreSQL', () => {
  const prefix = `waitlist-${randomUUID()}`;
  let templateId: string;
  let categoryId: string;
  let userIds: string[];
  let waiverId: string;
  beforeAll(async () => {
    const category = await db.classCategory.create({ data: { name: prefix, slug: prefix } }); categoryId = category.id;
    const template = await db.classTemplate.create({ data: { name: 'Synthetic event', slug: prefix, categoryId, description: 'Synthetic', durationMinutes: 50, defaultCapacity: 1, isEvent: true } }); templateId = template.id;
    userIds = [];
    for (let i=0;i<7;i++) { const u = await db.user.create({ data: { email: `${prefix}-${i}@example.test` } }); userIds.push(u.id); }
    state.actor.id = userIds[0];
    const waiver = await db.waiverVersion.create({ data: { version: 99999999, title: prefix, body: 'Synthetic', effectiveAt: new Date(), isActive: true } }); waiverId = waiver.id;
    for (const userId of userIds) await db.waiverAcceptance.create({ data: { waiverVersionId: waiverId, userId, signedDate: new Date() } });
  });
  afterAll(async () => {
    const occurrences = await db.classOccurrence.findMany({ where: { templateId }, select: { id: true } });
    const ids = occurrences.map(o=>o.id);
    await db.emailMessage.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { payload: { path: ['className'], equals: 'Synthetic event' } }] } });
    await db.inAppNotification.deleteMany({ where: { link: { in: ids.map(id=>`/admin/schedule/${id}/roster`) } } });
    await db.waitlistEntry.deleteMany({ where: { occurrenceId: { in: ids } } });
    await db.booking.deleteMany({ where: { occurrenceId: { in: ids } } });
    await db.classOccurrence.deleteMany({ where: { templateId } });
    await db.classTemplate.delete({ where: { id: templateId } }); await db.classCategory.delete({ where: { id: categoryId } });
    await db.waiverAcceptance.deleteMany({ where: { waiverVersionId: waiverId } });
    await db.waiverVersion.delete({ where: { id: waiverId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect();
  });
  async function fixture(offsetMinutes = 60, status: 'SCHEDULED'|'CANCELLED' = 'SCHEDULED', historicalSignupCount = 0) {
    state.actor.id = userIds[0];
    const startAt = new Date(Date.now() + offsetMinutes*60_000);
    const occurrence = await db.classOccurrence.create({ data: { templateId, startAt, endAt: new Date(+startAt+50*60_000), capacity: 1, status, historicalSignupCount } });
    const booking = await db.booking.create({ data: { occurrenceId: occurrence.id, userId: userIds[0], policySnapshot: { accessType: 'VIP' } } });
    for (const userId of userIds.slice(1,6)) await db.waitlistEntry.create({ data: { occurrenceId: occurrence.id, userId } });
    const form = new FormData(); form.set('bookingId', booking.id);
    return { occurrence, booking, form };
  }
  it('emails all five waiting people after a late event cancellation, preserving the selected date and avoiding duplicates', async () => {
    const f = await fixture();
    await expect(cancelBookingAction(f.form)).rejects.toThrow('/member/bookings');
    expect((await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status).toBe('LATE_CANCELLED');
    const messages = await db.emailMessage.findMany({ where: { template: 'WAITLIST_SPOT_AVAILABLE', payload: { path: ['claimUrl'], string_contains: f.occurrence.id } } });
    expect(messages).toHaveLength(5);
    expect(messages.map(m=>m.userId).sort()).toEqual(userIds.slice(1,6).sort());
    expect((messages[0].payload as any).claimUrl).toBe(`/book/event/${prefix}?occurrence=${f.occurrence.id}`);
    expect(messages.every(m=>m.status==='QUEUED')).toBe(true);
    expect(await waitlistEmailIsDeliverable(db, messages[0])).toBe(true);
    await expect(cancelBookingAction(f.form)).rejects.toThrow('/member/bookings');
    expect(await db.emailMessage.count({ where: { template: 'WAITLIST_SPOT_AVAILABLE', payload: { path: ['claimUrl'], string_contains: f.occurrence.id } } })).toBe(5);
    await db.booking.create({ data: { occurrenceId: f.occurrence.id, userId: messages[0].userId! } });
    await db.$transaction(tx => completeWaitlistBooking(tx, f.occurrence.id, messages[0].userId!));
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { occurrenceId_userId: { occurrenceId: f.occurrence.id, userId: messages[0].userId! } } })).status).toBe('PROMOTED');
    for (const message of messages) expect(await waitlistEmailIsDeliverable(db, message)).toBe(false);
  });
  it.each([[-60, 'SCHEDULED', 0], [60, 'CANCELLED', 0], [60, 'SCHEDULED', 1]] as const)('does not advertise a past/cancelled/still-full occurrence (%s, %s, %s)', async (offset, status, history) => {
    const f = await fixture(offset, status, history);
    await expect(cancelBookingAction(f.form)).rejects.toThrow('/member/bookings');
    expect(await db.emailMessage.count({ where: { template: 'WAITLIST_SPOT_AVAILABLE', payload: { path: ['claimUrl'], string_contains: f.occurrence.id } } })).toBe(0);
  });
  it('limits simultaneous joins to five, queues each confirmation once, and uses no credit or payment', async () => {
    const f = await fixture(180);
    await db.waitlistEntry.deleteMany({ where: { occurrenceId: f.occurrence.id } });
    const form = new FormData(); form.set('occurrenceId', f.occurrence.id);
    const outcomes = await Promise.all(userIds.slice(1).map(id => {
      state.actor.id = id;
      return bookOccurrenceAction(form).then(() => 'unexpected success', e=>String(e));
    }));
    expect(outcomes.filter(s=>s.includes('result=waitlist-full'))).toHaveLength(1);
    expect(outcomes.filter(s=>s.endsWith('result=waitlist'))).toHaveLength(5);
    expect(await db.waitlistEntry.count({ where: { occurrenceId: f.occurrence.id, status: 'WAITING' } })).toBe(5);
    expect(await db.booking.count({ where: { occurrenceId: f.occurrence.id } })).toBe(1);
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { userId: { in: userIds } } } })).toBe(0);
    expect(await db.emailMessage.count({ where: { template: 'WAITLIST_JOINED', payload: { path: ['occurrenceId'], equals: f.occurrence.id } } })).toBe(5);
  });

});
