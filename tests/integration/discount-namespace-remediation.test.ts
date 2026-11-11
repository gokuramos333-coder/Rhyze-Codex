import { beforeAll, afterAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { discountDatabaseDeclaration, assertDiscountDatabaseIdentity } from '@/scripts/release/disposable-discount-database';
const declaration = discountDatabaseDeclaration(process.env);
const db = new PrismaClient({ datasourceUrl: declaration.url });
const prefix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
const instructorId = `namespace-${prefix}`;
beforeAll(async () => {
 await assertDiscountDatabaseIdentity(db, declaration);
  await db.user.create({ data: { id: instructorId, email: `${prefix}@example.invalid`, role: 'INSTRUCTOR', status: 'ACTIVE' } });
});
afterAll(() => db.$disconnect());
const campaign = (code: string) => ({ code, percentOff: 15, productIds: ['synthetic'], startsAt: new Date('2030-01-01'), endsAt: new Date('2030-02-01') });
it('campaign-first rejects a later normalized referral write', async () => {
  const code = `${prefix}FIRST`;
  await db.discountCampaign.create({ data: campaign(code) });
  await expect(db.referralCode.create({ data: { code: ` ${code.toLowerCase()} `, instructorId } })).rejects.toThrow();
});
it('referral-first rejects a later normalized campaign write', async () => {
  const code = `${prefix}SECOND`;
  await db.referralCode.create({ data: { code: code.toLowerCase(), instructorId } });
  await expect(db.discountCampaign.create({ data: campaign(code) })).rejects.toThrow();
});
it.each(['campaign', 'referral'])('controlled concurrent writers: %s wins; other cannot commit', async winner => {
  const code = `${prefix}${winner.toUpperCase()}`;
  let entered!: () => void; const held = new Promise<void>(r => { entered = r; });
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const first = db.$transaction(async tx => {
    if (winner === 'campaign') await tx.discountCampaign.create({ data: campaign(code) });
    else await tx.referralCode.create({ data: { code: code.toLowerCase(), instructorId } });
    entered(); await gate;
  }, { timeout: 10000 });
  await held;
  const second = (winner === 'campaign'
    ? db.referralCode.create({ data: { code: code.toLowerCase(), instructorId } })
    : db.discountCampaign.create({ data: campaign(code) })).then(() => 'committed', () => 'rejected');
  // Observe a real database lock wait, not a timing-only Promise.all race.
  let waiting = false;
  for (let i = 0; i < 100; i++) {
    const rows = await db.$queryRawUnsafe<{ n: bigint }[]>("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
    if (Number(rows[0].n)) { waiting = true; break; }
    await new Promise(r => setTimeout(r, 10));
  }
  release(); await first;
  const outcome = await second;
  expect({ waiting, outcome }).toEqual({ waiting: true, outcome: 'rejected' });
});
