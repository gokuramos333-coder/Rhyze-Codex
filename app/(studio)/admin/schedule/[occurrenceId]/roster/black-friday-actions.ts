'use server';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe } from '@/lib/payments/stripe';
import { claimBlackFridayGuest, BLACK_FRIDAY_ID } from '@/lib/payments/black-friday-checkout';
import { manageBlackFridayTicket } from '@/lib/payments/black-friday-management';
import { revalidatePath } from 'next/cache';
export async function blackFridayStaffAction(form:FormData){
 const actor=await requireArea('admin');
 const orderId=String(form.get('orderId')||'');
 const operation=String(form.get('operation')||'');
 if(operation==='CLAIM'){
  if(form.get('identityConfirmed')!=='on')throw new Error('Verify the guest identity before linking their own account');
  await claimBlackFridayGuest(prisma,{actorId:actor.id,orderId,userId:String(form.get('userId')||'')});
 }else if(operation==='CANCEL'||operation==='RECONCILE'){
  if(operation==='CANCEL'&&form.get('cancelConfirmed')!=='on')throw new Error('Confirm cancellation and remaining cash refund');
  await manageBlackFridayTicket(prisma,getStripe(),{actorId:actor.id,orderId,operation,reason:String(form.get('reason')||''),sessionId:String(form.get('sessionId')||'')||undefined});
 }else throw new Error('Unknown operation');
 for (const id of [BLACK_FRIDAY_ID, 'cmw026ajl0001jn09jsqpqzij']) revalidatePath(`/admin/schedule/${id}/roster`);
 for (const id of [BLACK_FRIDAY_ID, 'cmw026ajl0001jn09jsqpqzij']) revalidatePath(`/instructor/classes/${id}/roster`);
 revalidatePath('/member/bookings');
}
