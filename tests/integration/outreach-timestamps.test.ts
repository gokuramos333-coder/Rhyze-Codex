import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.hoisted(() => {
  const raw = process.env.NEWSLETTER_TEST_DATABASE_URL;
  if (!raw) throw Error('Explicit isolated newsletter database required');
  const u = new URL(raw);
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || u.pathname !== '/rhyze_newsletter_preview' || u.search || u.hash) throw Error('Refusing non-preview database');
  vi.stubEnv('DATABASE_URL', raw);
});
import { prisma } from '@/lib/db/prisma';
import { logOutreach, timeline } from '@/lib/newsletters/repository';
const actor = { id: randomUUID(), name: 'Synthetic staff', email: randomUUID() + '@example.test' };
const userId = randomUUID();
beforeAll(async () => {
  await prisma.user.create({data: {...actor, role: 'OWNER', status: 'ACTIVE'}});
  await prisma.user.create({data: {id:userId,email:randomUUID()+'@example.test',role:'MEMBER',status:'ACTIVE'}});
});
afterAll(async () => {
  await prisma.customerOutreach.deleteMany({where:{userId}});
  await prisma.customerLeadProfile.deleteMany({where:{userId}});
  await prisma.auditLog.deleteMany({where:{actorId:actor.id}});
  await prisma.user.deleteMany({where:{id:{in:[actor.id,userId]}}});
  await prisma.$disconnect();
});
it('preserves past contact time through updates, retry, refresh and out-of-order logging', async () => {
  const contactedAt = '2026-10-20T15:22:33.000Z';
  const operationKey = randomUUID();
  const input = {userId,version:0,operationKey,type:'OUTREACH' as const,method:'TEXT' as const,contactedAt};
  const first = await logOutreach(actor,input);
  expect(first.contactedAt?.toISOString()).toBe(contactedAt);
  expect(first.occurredAt.getTime()).toBeGreaterThan(new Date(contactedAt).getTime());
  let version = 1;
  for (const changes of [{outcome:'NO_ANSWER'}, {followUpAt:'2026-12-01T17:00:00Z'}, {assignedToId:actor.id}, {note:'Synthetic note'}]) {
    await logOutreach(actor,{userId,version:version++,operationKey:randomUUID(),type:'STATUS',...changes});
    const stored = (await timeline(userId)).find(e=>e.id===first.id)!;
    expect(stored.contactedAt?.toISOString()).toBe(contactedAt);
    expect(stored.occurredAt).toEqual(first.occurredAt);
  }
  expect(await logOutreach(actor,input)).toEqual(first);
  await logOutreach(actor,{...input,version,operationKey:randomUUID(),contactedAt:'2026-10-01T13:00:00Z'});
  expect((await prisma.customerLeadProfile.findUniqueOrThrow({where:{userId}})).lastContactedAt?.toISOString()).toBe(contactedAt);
  const unchanged = await timeline(userId);
  for (const invalid of ['invalid', '2999-01-01T00:00:00Z']) {
    await expect(logOutreach(actor,{...input,version:version+1,operationKey:randomUUID(),contactedAt:invalid})).rejects.toThrow('valid contact time');
  }
  await expect(logOutreach(actor,{...input,version:version+1,operationKey:randomUUID(),type:'NOTE',note:'Synthetic'})).rejects.toThrow('only for completed');
  expect(await timeline(userId)).toEqual(unchanged);
  const now = await logOutreach(actor,{userId,version:version+1,operationKey:randomUUID(),type:'OUTREACH',method:'CALL',contactedNow:true});
  expect(now.contactedAt).toEqual(now.occurredAt);
  const note = await logOutreach(actor,{userId,version:version+2,operationKey:randomUUID(),type:'NOTE',note:'Synthetic note'});
  expect(note.contactedAt).toBeNull();
  expect((await timeline(userId)).find(e=>e.id===first.id)?.contactedAt?.toISOString()).toBe(contactedAt);
});
