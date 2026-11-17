import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { inspectNewFriendHistory } from '@/lib/payments/black-friday-new-friend-history';

const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test') throw new Error('Requires explicit disposable callback_test database');
const db = new PrismaClient({ datasources: { db: { url } } });
const prefix = `new-friend-test-${randomUUID()}-`;
beforeAll(async () => {
  await db.user.create({ data: { id: prefix + 'imported', name: 'Old Friend', email: 'bf-imported@example.test', status: 'INVITED', memberProfile: { create: { phone: '(201) 555-0123' } }, sombleClientProfile: { create: { sourceStatus: 'inactive', sourceJoinedAt: new Date('2020-01-01'), totalWorkouts: 4, sourceFile: 'disposable-fixture' } } } });
  await db.user.create({ data: { id: prefix + 'blank', name: '  New   Friend ', email: 'bf-blank@example.test', memberProfile: { create: { phone: '+1 201 555 0199' } } } });
  await db.classCategory.create({ data: { id: prefix + 'category', name: prefix, slug: prefix } });
  await db.classTemplate.create({ data: { id: prefix + 'template', categoryId: prefix + 'category', name: 'Disposable history', slug: prefix, description: 'Fixture', durationMinutes: 60, defaultCapacity: 20, tags: [], equipment: [] } });
  await db.classOccurrence.create({ data: { id: prefix + 'occurrence', templateId: prefix + 'template', startAt: new Date('2020-01-01T00:00:00Z'), endAt: new Date('2020-01-01T01:00:00Z'), capacity: 20 } });
});
afterAll(async () => {
  await db.attendanceRecord.deleteMany({ where: { occurrenceId: prefix + 'occurrence' } });
  await db.booking.deleteMany({ where: { occurrenceId: prefix + 'occurrence' } });
  await db.classOccurrence.deleteMany({ where: { id: prefix + 'occurrence' } });
  await db.classTemplate.deleteMany({ where: { id: prefix + 'template' } });
  await db.classCategory.deleteMany({ where: { id: prefix + 'category' } });
  await db.sombleClientProfile.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.memberProfile.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});
it('reads real normalized imported attendance without ignoring inactive/unclaimed accounts', async () => {
  expect(await inspectNewFriendHistory(db, { fullName: 'Old Friend', phone: '+12015550123' }, 'buyer')).toEqual({ status: 'INELIGIBLE', reason: 'PRIOR_ATTENDANCE' });
});
it('detects same-name changed phone and does not declare missing history eligible', async () => {
  expect(await inspectNewFriendHistory(db, { fullName: 'New Friend', phone: '2015550188' }, 'buyer')).toEqual({ status: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_IDENTITY' });
  expect(await inspectNewFriendHistory(db, { fullName: 'New Friend', phone: '2015550199' }, 'buyer')).toEqual({ status: 'DECLARATION_REQUIRED', reason: 'FIRST_VISIT_DECLARATION_REQUIRED' });
});
it.each(['CHECKED_IN', 'ATTENDED', 'BOOKING_ATTENDED', 'UNRESOLVED'] as const)('reads native %s history from PostgreSQL', async kind => {
  const id = prefix + kind;
  const fullName = `Native ${kind}`;
  await db.user.create({ data: { id, name: fullName, email: `${id}@example.test`, memberProfile: { create: { phone: '+12015550124' } } } });
  if (kind === 'BOOKING_ATTENDED' || kind === 'UNRESOLVED') await db.booking.create({ data: { userId: id, occurrenceId: prefix + 'occurrence', status: kind === 'UNRESOLVED' ? 'CONFIRMED' : 'ATTENDED' } });
  else await db.attendanceRecord.create({ data: { userId: id, occurrenceId: prefix + 'occurrence', status: kind } });
  expect(await inspectNewFriendHistory(db, { fullName, phone: '2015550124' }, 'buyer')).toMatchObject(kind === 'UNRESOLVED' ? { status: 'REVIEW_REQUIRED' } : { status: 'INELIGIBLE', reason: 'PRIOR_ATTENDANCE' });
  await db.memberProfile.update({ where: { userId: id }, data: { phone: null } });
});
it('returns no customer identities or existence details beyond an internal reason', async () => {
  expect(await inspectNewFriendHistory(db, { fullName: 'Unknown Friend', phone: '2015550100' }, 'buyer')).toEqual({ status: 'DECLARATION_REQUIRED', reason: 'FIRST_VISIT_DECLARATION_REQUIRED' });
});
