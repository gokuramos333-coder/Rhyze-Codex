import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
vi.hoisted(() => {
  const raw = process.env.NEWSLETTER_TEST_DATABASE_URL;
  if (!raw) throw Error('Explicit isolated newsletter database required');
  const u = new URL(raw);
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || u.pathname !== '/rhyze_newsletter_preview' || u.search || u.hash) throw Error('Refusing non-preview database');
  vi.stubEnv('DATABASE_URL', raw);
});
const auth = vi.hoisted(() => ({ current: () => null as unknown }));
vi.mock('@/lib/newsletters/access', () => ({ newsletterActor: async () => auth.current() }));
vi.mock('@/lib/auth/request-origin', () => ({ isTrustedAdminOrigin: () => true }));
import { prisma } from '@/lib/db/prisma';
import { POST as outreach } from '@/app/api/admin/leads/route';
import { POST as consent } from '@/app/api/admin/newsletters/route';
const actors = [0, 1].map(i => ({ id: randomUUID(), name: `Protocol staff ${i}`, email: `${randomUUID()}@example.test`, role: 'OWNER' as const }));
const context = new AsyncLocalStorage<typeof actors[number]>();
auth.current = () => context.getStore();
const users: string[] = [];
beforeAll(async () => { for (const actor of actors) await prisma.user.create({ data: { ...actor, status: 'ACTIVE' } }); });
afterAll(async () => {
  await prisma.customerOutreach.deleteMany({ where: { userId: { in: users } } });
  await prisma.customerLeadProfile.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: actors.map(a => a.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: [...users, ...actors.map(a => a.id)] } } });
  await prisma.$disconnect();
});
async function lead() {
  const id = randomUUID(); users.push(id);
  await prisma.user.create({ data: { id, email: `${id}@example.test`, role: 'MEMBER', status: 'ACTIVE' } });
  return id;
}
const input = (userId: string) => ({ userId, version: 0, operationKey: randomUUID(), type: 'OUTREACH', method: 'TEXT', contactedAt: '2026-10-20T15:22:33.000Z' });
const consentInput = (userId: string) => ({ action: 'consent', userId, version: 0, consent: 'OPTED_OUT', evidence: 'Explicit customer request' });
function post(route: (request: Request) => Promise<Response>, body: object, actor = actors[0]) {
  return context.run(actor, () => route(new Request('http://localhost/api/admin/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })));
}
// Hold the exact production lock and observe real blocked backend requests, not
// a sleep. This proves both APIs join the protocol before lazy creation/reads.
async function held(userId: string, run: (tx: Prisma.TransactionClient) => Promise<void>) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`newsletter-lead:${userId}`}, 0))`;
    await run(tx);
  });
}
async function waiting(n: number, userId: string) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
      AND classid::bigint = ((hashtextextended(${`newsletter-lead:${userId}`}, 0) >> 32) & 4294967295)
      AND objid::bigint = (hashtextextended(${`newsletter-lead:${userId}`}, 0) & 4294967295)`;
    if (Number(rows[0].n) >= n) return;
  }
  throw Error(`Expected ${n} real advisory-lock waiters before any profile access`);
}
it('both APIs wait before lazy creation, then re-read version after consent commits', async () => {
  const userId = await lead(); let requests: Promise<Response>[] = [];
  try {
    await held(userId, async tx => {
      requests = [post(outreach, input(userId)), post(consent, consentInput(userId), actors[1])];
      await waiting(2, userId);
      expect(await tx.customerLeadProfile.count({ where: { userId } })).toBe(0);
      await tx.customerLeadProfile.create({ data: { userId, version: 1, consent: 'OPTED_IN', consentSource: 'Committed while callers waited' } });
    });
  } finally { await Promise.all(requests); }
  const responses = await Promise.all(requests);
  expect(responses.map(r => r.status)).toEqual([409, 400]);
  expect(await prisma.customerOutreach.count({ where: { userId } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { entityId: userId } })).toBe(0);
  expect(await prisma.customerLeadProfile.findUnique({ where: { userId } })).toMatchObject({ version: 1, consent: 'OPTED_IN' });
});
it('duplicate API operation waiting on a lazy lead replays once, including later stale-version replay', async () => {
  const userId = await lead(); const body = input(userId); let requests: Promise<Response>[] = [];
  try {
    await held(userId, async () => {
      requests = [post(outreach, body), post(outreach, body)];
      await waiting(2, userId);
    });
  } finally { await Promise.all(requests); }
  const responses = await Promise.all(requests);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  const entries = await Promise.all(responses.map(r => r.json()));
  expect(entries[0]).toEqual(entries[1]);
  const replay = await post(outreach, { ...body, contactedNow: true, contactedAt: undefined });
  expect(await replay.json()).toEqual(entries[0]);
  const wrongActor = await post(outreach, body, actors[1]);
  expect(wrongActor.status).toBe(409);
  expect((await wrongActor.json()).error).toBe('Operation belongs to another record.');
  expect(await prisma.auditLog.count({ where: { entityId: userId } })).toBe(1);
  expect(await prisma.customerLeadProfile.findUnique({ where: { userId } })).toMatchObject({ version: 1 });
});
it('same-lead staff API race has one stale loser and preserves immutable history after reload', async () => {
  const userId = await lead(); const bodies = [input(userId), input(userId)];
  const responses = await Promise.all(bodies.map((body, i) => post(outreach, body, actors[i])));
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  const winner = responses.findIndex(r => r.status === 200), loser = 1 - winner;
  const first = (await responses[winner].json()).entry;
  expect((await responses[loser].json()).error).toContain('Another staff member');
  expect((await post(outreach, { ...bodies[loser], version: 1, contactedAt: '2026-09-01T12:00:00.000Z' }, actors[loser])).status).toBe(200);
  expect(await prisma.customerOutreach.findUnique({ where: { id: first.id } })).toMatchObject({ actorId: actors[winner].id, contactedAt: new Date(first.contactedAt), occurredAt: new Date(first.occurredAt) });
  expect((await prisma.customerOutreach.findMany({ where: { userId } })).map(e => e.attempt).sort()).toEqual([1, 2]);
});
it.each(['consent', 'outreach'])('consent/outreach race with %s starting first retains atomic audit and separate fields', async first => {
  const userId = await lead();
  const calls = [() => post(consent, consentInput(userId)), () => post(outreach, input(userId), actors[1])];
  if (first === 'outreach') calls.reverse();
  const transaction = prisma.$transaction.bind(prisma);
  let ready!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { ready = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((callback: any, options: any) => transaction(async (tx: any) => {
    const result = await callback(tx);
    ready();
    await gate;
    return result;
  }, options)) as typeof prisma.$transaction);
  const winner = calls[0]();
  let loser: Promise<Response> | undefined;
  try {
    await reached;
    loser = calls[1]();
    await waiting(1, userId);
  } finally { release(); spy.mockRestore(); }
  const responses = await Promise.all([winner, loser!]);
  expect(responses[0].status).toBe(200);
  expect(responses[1].status).toBe(first === 'consent' ? 409 : 400);
  expect(responses.filter(r => r.status === 200)).toHaveLength(1);
  const profile = await prisma.customerLeadProfile.findUniqueOrThrow({ where: { userId } });
  expect(profile.version).toBe(1);
  expect(await prisma.auditLog.count({ where: { entityId: userId } })).toBe(1);
  if (profile.consent === 'OPTED_OUT') {
    expect(await prisma.customerOutreach.count({ where: { userId } })).toBe(0);
    expect((await post(outreach, { ...input(userId), version: 1 })).status).toBe(200);
  } else {
    expect(await prisma.customerOutreach.count({ where: { userId } })).toBe(1);
    expect((await post(consent, { ...consentInput(userId), version: 1 })).status).toBe(200);
  }
  expect(await prisma.customerLeadProfile.findUnique({ where: { userId } })).toMatchObject({ version: 2, consent: 'OPTED_OUT', consentSource: 'Explicit customer request', lastContactedAt: new Date(input(userId).contactedAt) });
  expect(await prisma.auditLog.count({ where: { entityId: userId } })).toBe(2);
});
it.each(['consent', 'outreach'])('%s API rolls back lazy profile, entry and audit on a post-write failure', async kind => {
  const userId = await lead();
  const transaction = prisma.$transaction.bind(prisma);
  const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((callback: any, options: any) => transaction(async (tx: any) => {
    await callback(tx);
    throw Error('Controlled post-write failure');
  }, options)) as typeof prisma.$transaction);
  try {
    const response = await post(kind === 'consent' ? consent : outreach, kind === 'consent' ? consentInput(userId) : input(userId));
    expect((await response.json()).error).toBe('Controlled post-write failure');
  } finally { spy.mockRestore(); }
  expect(await prisma.customerLeadProfile.findUnique({ where: { userId } })).toBeNull();
  expect(await prisma.customerOutreach.count({ where: { userId } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { entityId: userId } })).toBe(0);
  expect((await post(outreach, input(userId))).status).toBe(200);
});
it('independent API leads commit concurrently and cross-lead operation collision rolls back loser', async () => {
  const bodies = await Promise.all([lead(), lead()]).then(ids => ids.map(input));
  expect((await Promise.all(bodies.map(body => post(outreach, body)))).map(r => r.status)).toEqual([200, 200]);
  const collision = await Promise.all([lead(), lead()]).then(ids => ids.map(input));
  collision[1].operationKey = collision[0].operationKey;
  const results = await Promise.all(collision.map(body => post(outreach, body)));
  expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  const loser = collision[results.findIndex(r => r.status === 409)].userId;
  expect(await prisma.customerLeadProfile.findUnique({ where: { userId: loser } })).toBeNull();
  expect(await prisma.auditLog.count({ where: { entityId: loser } })).toBe(0);
});
