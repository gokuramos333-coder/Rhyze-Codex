import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { prisma } from '@/lib/db/prisma';
import { cleanupAuditBacklog } from '@/lib/maintenance/audit-cleanup';
const schema = z.object({dryRun:z.boolean(),snapshot:z.string().regex(/^[a-f0-9]{64}$/).optional(),reason:z.string().trim().min(20).max(300)}).strict();
export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request)) return NextResponse.json({error:'Same-origin owner request required.'},{status:403});
  const owner = await requireApprovedOwner();
  const input = schema.safeParse(await request.json().catch(()=>null));
  if (!input.success) return NextResponse.json({error:'Provide dryRun, reason and the reviewed snapshot for apply.'},{status:400});
  try {
    const result = await prisma.$transaction(tx=>cleanupAuditBacklog(tx,{...input.data,owner}),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000});
    return NextResponse.json({ok:true,...result});
  } catch {
    return NextResponse.json({error:'Cleanup was not applied. State changed or a scope guard failed; inspect a fresh preview.'},{status:409});
  }
}
