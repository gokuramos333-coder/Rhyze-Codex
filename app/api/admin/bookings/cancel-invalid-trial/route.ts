import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { prisma } from '@/lib/db/prisma';
import { cancelInvalidTrialBooking } from '@/lib/domain/bookings/cancel-invalid-trial-booking';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
const schema=z.object({userId:z.string().min(1).max(200),bookingId:z.string().min(1).max(200),occurrenceId:z.string().min(1).max(200),reason:z.string().trim().min(10).max(240),dryRun:z.boolean()}).strict();
export async function POST(request:Request) {
 if(!isTrustedAdminOrigin(request)) return NextResponse.json({error:'Same-origin owner request required.'},{status:403});
 const owner=await requireApprovedOwner();
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success) return NextResponse.json({error:'Exact booking, member, occurrence, reason and explicit dryRun required.'},{status:400});
 try {
  const result=await retrySerializableTransaction(()=>prisma.$transaction(tx=>cancelInvalidTrialBooking(tx,{...parsed.data,actorId:owner.id,now:new Date()}),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10000}));
  if(!parsed.data.dryRun) for(const path of ['/member/bookings','/admin/members','/admin/schedule','/instructor/classes','/schedule']) revalidatePath(path,'layout');
  return NextResponse.json({ok:true,dryRun:parsed.data.dryRun,...result});
 } catch {return NextResponse.json({ok:false,error:'Correction refused: booking, trial window, credit or attendance state needs review.'},{status:409});}
}
