import type { Prisma, PrismaClient } from '@prisma/client';
import { occurrenceTitle } from '@/lib/domain/schedule/occurrence-management';
type Client = PrismaClient | Prisma.TransactionClient;
type Message = { template: string; userId: string | null; payload: unknown; dedupeKey?: string | null; createdAt: Date };
type Occurrence = { id: string; startAt: Date; endAt: Date; titleOverride: string | null; template: { name: string } };
function payloadOf(message: Message) { return (message.payload && typeof message.payload==='object' && !Array.isArray(message.payload) ? message.payload : {}) as Record<string,unknown>; }
/** Legacy confirmation payloads have no ID: match all original date/time/name fields,
 * plus the message's booking-year window. Never suppress another dated class by title alone. */
export function confirmationReferencesOccurrence(message: Message, occurrence: Occurrence, bookingIds: string[] = []) {
 const p=payloadOf(message);
 if(typeof p.occurrenceId==='string') return p.occurrenceId===occurrence.id;
 if(typeof p.bookingId==='string') return bookingIds.includes(p.bookingId);
 if(message.template!=='BOOKING_CONFIRMATION') return false;
 return message.createdAt<=occurrence.endAt && +occurrence.startAt-+message.createdAt<=366*86400000 &&
  [occurrenceTitle(occurrence),occurrence.template.name].includes(String(p.className||'')) &&
  p.classDate===occurrence.startAt.toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'}) &&
  p.classTime===occurrence.startAt.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
}
export async function bookingConfirmationIsDeliverable(db: Client, message: Message) {
 if(!['BOOKING_CONFIRMATION','EVENT_PURCHASE_CONFIRMATION'].includes(message.template)) return true;
 const p=payloadOf(message);
 if(message.template==='EVENT_PURCHASE_CONFIRMATION' && message.dedupeKey?.startsWith('commerce-confirmation:')) {
  const order=await db.commerceOrder.findUnique({where:{id:message.dedupeKey.slice('commerce-confirmation:'.length)},select:{occurrence:{select:{archivedAt:true}}}});
  return !order?.occurrence?.archivedAt;
 }
 if(typeof p.occurrenceId==='string') {
  const occurrence=await db.classOccurrence.findUnique({where:{id:p.occurrenceId},select:{archivedAt:true}});
  return Boolean(occurrence && !occurrence.archivedAt);
 }
 if(!message.userId) return true;
 const bookings=await db.booking.findMany({where:{userId:message.userId,...(typeof p.bookingId==='string'?{id:p.bookingId}:{}),occurrence:{archivedAt:{not:null},startAt:{gte:new Date(+message.createdAt-86400000),lte:new Date(+message.createdAt+366*86400000)}}},include:{occurrence:{include:{template:true}}}});
 return !bookings.some(b=>confirmationReferencesOccurrence(message,b.occurrence,[b.id]));
}
