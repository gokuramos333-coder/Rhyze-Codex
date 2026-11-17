import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { isApprovedOwner } from '@/lib/auth/owner-access';
import { financialRuntimeIdentity, type FinancialReleaseState } from './financial-release';

export const financialReleaseChange = z.object({
  action: z.enum(['ACTIVATE', 'CLOSE']),
  generation: z.number().int().nonnegative(),
  deployId: z.string().regex(/^[a-f0-9]{24}$/),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(20).max(1000),
}).strict();

/** Release control does not approve a refund. Only Vanessa/Melissa can do that.
 * The guarded release operator records independently verified provider evidence
 * before activation. This endpoint binds that approval to this exact runtime.
 */
export async function changeFinancialRelease(db: PrismaClient, actorId: string, value: unknown) {
  const input = financialReleaseChange.parse(value);
  const runtime = financialRuntimeIdentity();
  if (input.deployId !== runtime.deployId || input.sourceSha !== runtime.sourceSha)
    throw Error('Release identity differs from the running artifact');
  return db.$transaction(async tx => {
    const actor = await tx.user.findUnique({where:{id:actorId}});
    if (!actor || !isApprovedOwner(actor)) throw Error('Active approved release owner required');
    // Exclusive lock waits for admitted financial requests to complete. A stale
    // operator cannot reactivate a deployment after a later close/activation.
    const [before] = await tx.$queryRaw<FinancialReleaseState[]>`SELECT generation,"enabledDeployId","sourceSha","evidenceHash" FROM "FinancialRelease" WHERE id='rhyze' FOR UPDATE`;
    if (!before || before.generation !== input.generation) throw Error('Release state changed; inspect before retrying');
    if (input.action === 'ACTIVATE' && before.enabledDeployId && before.enabledDeployId !== runtime.deployId)
      throw Error('Close the previous financial runtime before activation');
    const deployId = input.action === 'ACTIVATE' ? runtime.deployId : null;
    const sourceSha = input.action === 'ACTIVATE' ? runtime.sourceSha : null;
    const evidenceHash = input.action === 'ACTIVATE' ? input.evidenceHash : null;
    const activatedAt = input.action === 'ACTIVATE' ? new Date() : null;
    const [after] = await tx.$queryRaw<FinancialReleaseState[]>`UPDATE "FinancialRelease" SET generation=generation+1,"enabledDeployId"=${deployId},"sourceSha"=${sourceSha},"evidenceHash"=${evidenceHash},"activatedBy"=${actor.id},"activatedAt"=${activatedAt} WHERE id='rhyze' AND generation=${input.generation} RETURNING generation,"enabledDeployId","sourceSha","evidenceHash"`;
    if (!after) throw Error('Release state changed');
    await tx.auditLog.create({data:{actorId:actor.id,action:`financial.release.${input.action.toLowerCase()}`,entityType:'FinancialRelease',entityId:'rhyze',before,after:{...after,reason:input.reason,approvalEvidenceHash:input.evidenceHash}}});
    return after;
  }, {timeout:60000});
}
