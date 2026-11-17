import { NextResponse } from 'next/server';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { financialRuntimeIdentity, type FinancialReleaseState } from '@/lib/payments/financial-release';
import { changeFinancialRelease, financialReleaseChange } from '@/lib/payments/financial-release-control';
export const dynamic='force-dynamic';
export async function GET() {
  await requireApprovedOwner();
  const runtime=financialRuntimeIdentity();
  const [state]=await prisma.$queryRaw<FinancialReleaseState[]>`SELECT generation,"enabledDeployId","sourceSha","evidenceHash" FROM "FinancialRelease" WHERE id='rhyze'`;
  return NextResponse.json({runtime,state}, {headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request) {
  if(!isTrustedAdminOrigin(request))return NextResponse.json({error:'Same-origin owner request required'}, {status:403});
  const actor=await requireApprovedOwner();
  const parsed=financialReleaseChange.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Exact release identity, generation and evidence required'}, {status:400});
  try {return NextResponse.json({state:await changeFinancialRelease(prisma,actor.id,parsed.data)}, {headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Activation/close not confirmed. Re-read release state before any retry.'}, {status:409});}
}
