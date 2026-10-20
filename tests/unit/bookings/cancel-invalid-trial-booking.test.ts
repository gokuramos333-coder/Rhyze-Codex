import { describe, expect, it, vi } from 'vitest';
import { cancelInvalidTrialBooking } from '@/lib/domain/bookings/cancel-invalid-trial-booking';
const now = new Date('2026-10-19T12:00Z');
const trial = { id:'trial', activatedAt:new Date('2026-10-17T15:00Z'), currentPeriodEnd:new Date('2026-10-24T15:00Z') };
function fixture() {
 const booking = { id:'booking', userId:'member', occurrenceId:'oct26', status:'CONFIRMED', policySnapshot:{accessType:'INTRO_TRIAL'}, occurrence:{startAt:new Date('2026-10-26T22:10Z'),template:{isEvent:false}} };
 const tx:any = { $executeRaw:vi.fn(), booking:{findUnique:vi.fn().mockResolvedValue(booking),update:vi.fn()}, membership:{findMany:vi.fn().mockResolvedValue([trial])}, creditLedgerEntry:{count:vi.fn().mockResolvedValue(0)}, attendanceRecord:{count:vi.fn().mockResolvedValue(0)}, emailMessage:{updateMany:vi.fn()}, auditLog:{create:vi.fn()} };
 const input = {userId:'member',bookingId:'booking',occurrenceId:'oct26',reason:'Owner correction of out-of-window trial transfer',actorId:'owner',dryRun:false,now};
 return {tx,input,booking};
}
describe('owner correction of an invalid trial transfer',()=>{
 it('cancels only the verified future invalid trial booking and reminders, with an audit',async()=>{
  const f=fixture(); await cancelInvalidTrialBooking(f.tx,f.input);
  expect(f.tx.booking.update).toHaveBeenCalledWith({where:{id:'booking'},data:{status:'CANCELLED',cancelledAt:now}});
  expect(f.tx.emailMessage.updateMany).toHaveBeenCalled(); expect(f.tx.auditLog.create).toHaveBeenCalled();
 });
 it('dry run makes no changes',async()=>{const f=fixture(); await cancelInvalidTrialBooking(f.tx,{...f.input,dryRun:true});expect(f.tx.booking.update).not.toHaveBeenCalled();expect(f.tx.auditLog.create).not.toHaveBeenCalled();});
 it('is idempotent after cancellation',async()=>{const f=fixture();f.booking.status='CANCELLED';await cancelInvalidTrialBooking(f.tx,f.input);expect(f.tx.booking.update).not.toHaveBeenCalled();});
 it.each(['member','date','access','window','past','reserve','attendance','missing-trial'])('refuses a changed or unsupported %s',async(kind)=>{
  const f=fixture();
  if(kind==='member') f.booking.userId='other';
  if(kind==='date') f.booking.occurrenceId='other';
  if(kind==='access') f.booking.policySnapshot.accessType='STANDARD';
  if(kind==='window') f.booking.occurrence.startAt=new Date('2026-10-21T15:00Z');
  if(kind==='past') f.booking.occurrence.startAt=new Date('2026-10-18T15:00Z');
  if(kind==='reserve') f.tx.creditLedgerEntry.count.mockResolvedValue(1);
  if(kind==='attendance') f.tx.attendanceRecord.count.mockResolvedValue(1);
  if(kind==='missing-trial') f.tx.membership.findMany.mockResolvedValue([]);
  await expect(cancelInvalidTrialBooking(f.tx,f.input)).rejects.toThrow();expect(f.tx.booking.update).not.toHaveBeenCalled();
 });
});
