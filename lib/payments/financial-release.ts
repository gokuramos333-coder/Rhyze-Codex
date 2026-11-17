import type { Prisma, PrismaClient } from '@prisma/client';
type DB = Pick<PrismaClient | Prisma.TransactionClient, '$queryRaw'>;
export type FinancialReleaseState = { generation: number; enabledDeployId: string | null; sourceSha: string | null; evidenceHash: string | null };
export function financialRuntimeIdentity(env: { DEPLOY_ID?: string; COMMIT_REF?: string } = {DEPLOY_ID:process.env.DEPLOY_ID,COMMIT_REF:process.env.COMMIT_REF}) {
  const deployId = env.DEPLOY_ID;
  const sourceSha = env.COMMIT_REF;
  if (!/^[a-f0-9]{24}$/.test(deployId || '') || !/^[a-f0-9]{40}$/.test(sourceSha || '')) throw Error('Trusted financial runtime identity unavailable');
  return { deployId: deployId!, sourceSha: sourceSha! };
}
/** No positive cache: an old runtime never inherits a later deployment's activation. */
export async function assertFinancialRelease(db: DB) {
  const runtime = financialRuntimeIdentity();
  const [state] = await db.$queryRaw<FinancialReleaseState[]>`SELECT generation,"enabledDeployId","sourceSha","evidenceHash" FROM "FinancialRelease" WHERE id='rhyze' FOR SHARE`;
  if (!state || state.enabledDeployId !== runtime.deployId || state.sourceSha !== runtime.sourceSha || !state.evidenceHash) throw Error('Financial changes are temporarily paused for release verification. No payment or refund was submitted.');
  return state;
}

/** Hold admission through the external request. A close takes the row exclusively. */
export function withFinancialRelease<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient, deadline: number) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => { const deadline=Date.now()+60000; await assertFinancialRelease(tx); return work(tx,deadline); }, {timeout:60000});
}

/** A timed-out Prisma callback can keep running JavaScript. Re-enter the live
 * transaction immediately before a bounded (20s, no retries) provider write.
 * Leave at least 25s so the provider timeout precedes release of admission.
 */
export async function assertFinancialSubmission(tx: DB, deadline: number, clock:()=>number=Date.now) {
  if (deadline-clock()<25000) throw Error('Financial preparation deadline expired; no provider request submitted');
  await assertFinancialRelease(tx);
  if (deadline-clock()<25000) throw Error('Financial preparation deadline expired; no provider request submitted');
}
