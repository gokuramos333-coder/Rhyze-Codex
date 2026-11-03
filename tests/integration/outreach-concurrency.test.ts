import { afterAll, beforeAll, expect, it, vi } from 'vitest';
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
const actors = [0, 1].map(i => ({ id: randomUUID(), name: `Concurrent staff ${i}`, email: `${randomUUID()}@example.test` }));
const users: string[] = [];
beforeAll(async () => {
  for (const actor of actors) await prisma.user.create({ data: { ...actor, role: 'OWNER', status: 'ACTIVE' } });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.customerOutreach.deleteMany({ where: { userId: { in: users } } });
  await prisma.customerLeadProfile.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: actors.map(a => a.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: [...users, ...actors.map(a => a.id)] } } });
  await prisma.$disconnect();
});
async function lead() {
  const id = randomUUID(); users.push(id);
  await prisma.user.create({ data: { id, email: `${id}@example.test`, role: 'MEMBER', status: 'ACTIVE', leadProfile: { create: {} } } });
  return id;
}
// Overlap real transaction lifetimes before the first statement. A per-lead
// lock must prevent same-lead readers from reaching an after-read barrier.
function overlapSnapshots() {
  const transaction = prisma.$transaction.bind(prisma);
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const timer = setTimeout(release, 3000);
  const spy = vi.spyOn(prisma, '$transaction').mockImplementation(((callback: any, options: any) => transaction(async (tx: any) => {
    if (arrived < 2) {
      arrived += 1;
      if (arrived === 2) { clearTimeout(timer); release(); }
      await gate;
    }
    return callback(tx);
  }, options)) as typeof prisma.$transaction);
  return () => { clearTimeout(timer); spy.mockRestore(); expect(arrived).toBe(2); };
}
const input = (userId: string) => ({ userId, version: 0, operationKey: randomUUID(), type: 'OUTREACH' as const, method: 'TEXT' as const, contactedAt: '2026-10-20T15:22:33.000Z' });
it('concurrent same-operation submissions both return the one committed entry and audit', async () => {
  const request = input(await lead()); const done = overlapSnapshots();
  const results = await Promise.allSettled([logOutreach(actors[0], request), logOutreach(actors[0], request)]); done();
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
  if (results[0].status !== 'fulfilled' || results[1].status !== 'fulfilled') return;
  expect(results[0].value).toEqual(results[1].value);
  expect(await timeline(request.userId)).toHaveLength(1);
  expect(await prisma.auditLog.count({ where: { actorId: actors[0].id, entityId: request.userId } })).toBe(1);
  expect((await prisma.customerLeadProfile.findUniqueOrThrow({ where: { userId: request.userId } })).version).toBe(1);
});
it('distinct simultaneous staff writes retain optimistic version rejection, then explicit reload saves the losing entry', async () => {
  const userId = await lead(); const requests = [input(userId), input(userId)]; const done = overlapSnapshots();
  const results = await Promise.allSettled(requests.map((request, i) => logOutreach(actors[i], request))); done();
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const loser = results.findIndex(r => r.status === 'rejected');
  expect(loser).toBeGreaterThanOrEqual(0);
  const rejected = results[loser] as PromiseRejectedResult;
  expect(rejected.reason.message).toContain('Another staff member updated this customer');
  expect(await timeline(userId)).toHaveLength(1);
  await logOutreach(actors[loser], { ...requests[loser], version: 1 });
  const entries = await timeline(userId);
  expect(entries).toHaveLength(2);
  expect(entries.map(e => e.operationKey).sort()).toEqual(requests.map(r => r.operationKey).sort());
  expect(entries.map(e => e.attempt).sort()).toEqual([1, 2]);
  expect(await prisma.auditLog.count({ where: { entityId: userId } })).toBe(2);
  expect((await prisma.customerLeadProfile.findUniqueOrThrow({ where: { userId } })).version).toBe(2);
});
it('exhausted conflicts reject after three rolled-back attempts without dropping or duplicating updates', async () => {
  const request = input(await lead());
  const transaction = prisma.$transaction.bind(prisma);
  const conflict = Object.assign(new Error('Controlled transaction conflict'), { code: 'P2034' });
  let attempts = 0;
  const spy = vi.spyOn(prisma, '$transaction').mockImplementation(((callback: any, options: any) => transaction(async (tx: any) => {
    attempts += 1;
    await callback(tx);
    throw conflict; // Real entry/profile/audit writes must all roll back.
  }, options)) as typeof prisma.$transaction);
  try {
    await expect(logOutreach(actors[0], request)).rejects.toBe(conflict);
    expect(attempts).toBe(3);
  } finally { spy.mockRestore(); }
  expect(await timeline(request.userId)).toHaveLength(0);
  expect(await prisma.auditLog.count({ where: { entityId: request.userId } })).toBe(0);
  expect((await prisma.customerLeadProfile.findUniqueOrThrow({ where: { userId: request.userId } })).version).toBe(0);
});
it('concurrent independent leads both persist despite shared SERIALIZABLE predicate pages', async () => {
  const requests = [input(await lead()), input(await lead())]; const done = overlapSnapshots();
  const results = await Promise.allSettled(requests.map((request, i) => logOutreach(actors[i], request))); done();
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
  for (const request of requests) expect(await timeline(request.userId)).toHaveLength(1);
});
