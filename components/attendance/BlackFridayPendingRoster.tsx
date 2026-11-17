import React from 'react';
import { prisma } from '@/lib/db/prisma';
import { blackFridayRoster } from '@/lib/payments/black-friday-checkout';
import { blackFridayStaffAction } from '@/app/(studio)/admin/schedule/[occurrenceId]/roster/black-friday-actions';
export async function BlackFridayPendingRoster({occurrenceId,canManage=false}:{occurrenceId:string;canManage?:boolean}){
 const attendees=await blackFridayRoster(prisma,occurrenceId);
 if(!attendees.length)return null;
 return <section className="my-5 border border-rhyze-gold p-4"><h2 className="font-bold">Black Friday named ticket attendees</h2>
 <p>Each pair below reserves exactly two spots. Linked attendees also appear in the account roster. Pending guests must create their own account and accept the current waiver; staff verify identity before linking. Do not create placeholder accounts.</p>
 <ul>{attendees.map((a,i)=><li key={`${a.orderId}-${i}`} className="my-3 border-t p-3"><strong>{a.name}</strong> — {a.state} — {a.review?'Payment/eligibility review — do not admit':a.bookingId?'Account linked':'Pending own account and waiver'}
 {canManage&&!a.userId&&!a.review&&<form action={blackFridayStaffAction} className="grid gap-2"><input type="hidden" name="orderId" value={a.orderId}/><input type="hidden" name="operation" value="CLAIM"/><label>Guest’s real account ID<input name="userId" required className="border p-2"/></label><label><input type="checkbox" required name="identityConfirmed"/> I verified this account belongs to the named guest</label><button className="border p-2">Link guest account after waiver</button></form>}
 {canManage&&a.manage&&<form action={blackFridayStaffAction} className="mt-2 grid gap-2"><input type="hidden" name="orderId" value={a.orderId}/><label>Recovered Stripe checkout session ID (only if missing)<input name="sessionId" placeholder="cs_…" className="border p-2"/></label><label>Staff reason<input name="reason" required minLength={5} className="border p-2"/></label><label><input type="checkbox" name="cancelConfirmed"/> Cancel the entire ticket and refund remaining cash; restore only the original credit window</label><button name="operation" value="CANCEL" className="border p-2">Cancel/refund ticket</button><button name="operation" value="RECONCILE" className="border p-2">Reconcile provider status</button></form>}
 </li>)}</ul></section>;
}
