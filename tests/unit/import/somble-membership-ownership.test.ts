import { afterEach, describe, expect, it, vi } from 'vitest';

// Exercise all three actual writers. Only file/DB boundaries are replaced;
// real PostgreSQL tests separately verify filtering and transaction rollback.
const runtime = vi.hoisted(() => ({ db: {} as any, files: {} as Record<string, string> }));
vi.mock('@/lib/db/prisma', () => ({ prisma: new Proxy({}, {
  get: (_, key) => runtime.db[key],
}) }));
vi.mock('node:fs/promises', () => ({ readFile: async (path: string) => runtime.files[path] }));

const purchasedAt = new Date('2026-08-02T19:30:00Z');
const activatedAt = new Date('2026-08-04T12:00:00Z');
const payload = {
  clientsCsv: 'Client Name,Email Address,Status,Last Workout,Last Login,Date Joined,Total Workouts,App Downloaded,Birthday\nSynthetic,synthetic@example.test,active,,,2026-08-02,0,false,',
  transactionsCsv: 'transfer_date,transfer_amount,content_type,supporter,transfer_id,payment_id\n2026-08-02,7,Classpack,Synthetic,tr_synthetic,pi_synthetic',
  membershipsCsv: `membership_name,supporter_name,supporter_email,payment_structure,payment_structure_amount,credits_remaining,status,payment_amount,access_method,purchase_date,expiration_date,pause_date,unsubscribe_date\nSynthetic trial,Synthetic,synthetic@example.test,credits,7,,active,7,online,${purchasedAt.toISOString()},2026-08-11T12:00:00Z,,`,
  clientSourceFile: 'clients.csv', transactionSourceFile: 'transactions.csv', membershipSourceFile: 'memberships.csv',
};
function row(overrides = {}) {
  return { id: 'imported', userId: 'member', productId: 'product', purchaseId: null,
    stripeSubscriptionId: null, status: 'CANCELLED', currentPeriodStart: purchasedAt, ...overrides };
}
function fixture(memberships: ReturnType<typeof row>[]) {
  const accessWrites = vi.fn();
  const product = { id: 'product', name: 'Synthetic trial', isUnlimited: true, includedCredits: null };
  const matching = ({ where }: any) => memberships.filter(item => Object.entries(where).every(([key, value]) => {
    const actual = item[key as keyof typeof item];
    return actual instanceof Date && value instanceof Date ? +actual === +value : actual === value;
  }));
  const upsert = async () => ({});
  const tx = {
    user: { findUnique: async () => ({ id: 'member', role: 'OWNER' }), upsert: async () => ({ id: 'member' }), findMany: async () => [] },
    memberProfile: { upsert }, notificationPreference: { upsert },
    sombleClientProfile: { upsert, count: async () => 1 },
    sombleTransaction: { upsert, count: async () => 1, aggregate: async () => ({ _sum: { amountCents: 700 } }) },
    classOccurrence: { findMany: async () => [1, 2, 3].map(id => ({ id, status: 'SCHEDULED', capacity: 25 })) },
    booking: { upsert, findMany: async () => [] },
    product: { findMany: async () => [product], findFirst: async () => product },
    membership: {
      findFirst: async (args: any) => matching(args)[0] ?? null,
      findMany: async (args: any) => matching(args),
      create: accessWrites, update: accessWrites,
    },
    creditAccount: { findFirst: async () => null, create: async (args: any) => {
      accessWrites(args); return { id: 'replacement', entries: [] };
    } },
    creditLedgerEntry: { create: accessWrites },
  };
  let disconnected!: () => void;
  const done = new Promise<void>(resolve => { disconnected = resolve; });
  runtime.db = { ...tx, $transaction: (run: any) => run(tx), $disconnect: async () => disconnected() };
  runtime.files = { 'clients.csv': payload.clientsCsv, 'transactions.csv': payload.transactionsCsv, 'memberships.csv': payload.membershipsCsv };
  return { accessWrites, done };
}
const originalArgv = process.argv;
const originalExitCode = process.exitCode;
afterEach(() => { process.argv = originalArgv; process.exitCode = originalExitCode; vi.restoreAllMocks(); });

async function runWriter(writer: string, done: Promise<void>) {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  if (writer === 'job') {
    const { applySombleImportJob } = await import('@/lib/import/somble-import-job');
    return applySombleImportJob(runtime.db, payload);
  }
  if (writer === 'reconcile') {
    const { reconcileSombleAug2 } = await import('@/scripts/reconcile-somble-2026-08-02');
    return reconcileSombleAug2(true);
  }
  // The legacy CLI executes main at module load; await its disconnect finally.
  process.argv = ['node', 'import-somble.ts', '--clients', 'clients.csv', '--transactions', 'transactions.csv', '--memberships', 'memberships.csv', '--apply'];
  let failure: unknown;
  vi.spyOn(console, 'error').mockImplementation(error => { failure = error; });
  vi.resetModules();
  await import('@/scripts/import-somble');
  await done;
  if (failure) throw failure;
}

describe.each(['job', 'cli', 'reconcile'])('Somble %s membership ownership', writer => {
  it.each([['new import', []], ['single exact import replay', [row()]]])('allows %s', async (_name, memberships) => {
    const f = fixture(memberships as ReturnType<typeof row>[]);
    await runWriter(writer, f.done);
    expect(f.accessWrites).toHaveBeenCalled();
  });
  it.each([
    ['activation differs from purchase', [row({ id: 'native', purchaseId: 'purchase', currentPeriodStart: activatedAt })]],
    ['an imported row masks a native trial', [row(), row({ id: 'native', purchaseId: 'purchase', currentPeriodStart: activatedAt })]],
    ['duplicate unlinked memberships', [row(), row({ id: 'duplicate' })]],
    ['subscription ownership', [row({ stripeSubscriptionId: 'sub_native' })]],
    ['unlinked membership with a different start', [row({ currentPeriodStart: activatedAt })]],
  ])('refuses %s before changing membership or credits', async (_name, memberships) => {
    const f = fixture(memberships as ReturnType<typeof row>[]);
    await expect(runWriter(writer, f.done)).rejects.toThrow(/overlap.*review|ownership.*review/i);
    expect(f.accessWrites).not.toHaveBeenCalled();
  });
});
