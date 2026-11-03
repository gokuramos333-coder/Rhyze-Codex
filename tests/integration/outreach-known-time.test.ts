import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.hoisted(() => {
  const raw = process.env.NEWSLETTER_TEST_DATABASE_URL;
  if (!raw) throw Error('Explicit isolated newsletter database required');
  const u = new URL(raw);
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || u.pathname !== '/rhyze_newsletter_preview' || u.search || u.hash) throw Error('Refusing non-preview database');
  vi.stubEnv('DATABASE_URL', raw);
});
import { prisma } from '@/lib/db/prisma';
import { logOutreach, loadCustomers, timeline } from '@/lib/newsletters/repository';
import { POST } from '@/app/api/admin/leads/route';
const auth = vi.hoisted(() => ({ actor: null as null | {id:string;name:string;email:string} }));
vi.mock('@/lib/newsletters/access', () => ({newsletterActor: async () => auth.actor}));
vi.mock('@/lib/auth/request-origin', () => ({isTrustedAdminOrigin: () => true}));
const actors = ['Latest Contact Staff','Backdated Staff'].map(name => ({id:randomUUID(),name,email:randomUUID()+'@example.test'}));
const users: string[] = [];
beforeAll(async () => {for (const actor of actors) await prisma.user.create({data:{...actor,role:'OWNER',status:'ACTIVE'}});auth.actor=actors[0];});
afterAll(async () => {
  await prisma.customerOutreach.deleteMany({where:{userId:{in:users}}});
  await prisma.customerLeadProfile.deleteMany({where:{userId:{in:users}}});
  await prisma.auditLog.deleteMany({where:{actorId:{in:actors.map(a=>a.id)}}});
  await prisma.user.deleteMany({where:{id:{in:[...users,...actors.map(a=>a.id)]}}});
  await prisma.$disconnect();
});
async function legacy() {
 const id=randomUUID();users.push(id);
 await prisma.user.create({data:{id,email:id+'@example.test',role:'MEMBER',status:'ACTIVE',leadProfile:{create:{lastContactedAt:new Date('2026-11-03T15:00:00Z')}},outreachEntries:{create:{actorId:actors[1].id,actorName:actors[1].name,actorInitials:'BS',type:'OUTREACH',method:'TEXT',operationKey:randomUUID(),occurredAt:new Date('2026-11-03T15:00:00Z')}}}});
 return id;
}
it('does not present legacy logging rollup as known contact on reads',async()=>{
 const id=await legacy();
 expect((await loadCustomers()).find(c=>c.id===id)).toMatchObject({lastContactedAt:null,lastStaff:'',lastInitials:'',attempts:1});
});
it('replaces contaminated rollup using known entries and aligns date with its staff across backdated logs',async()=>{
 const userId=await legacy();const original=await timeline(userId);
 const input={userId,version:0,operationKey:randomUUID(),type:'OUTREACH' as const,method:'TEXT' as const,contactedAt:'2026-11-02T15:00:00.000Z'};
 await logOutreach(actors[0],input);
 expect((await prisma.customerLeadProfile.findUniqueOrThrow({where:{userId}})).lastContactedAt?.toISOString()).toBe(input.contactedAt);
 await logOutreach(actors[1],{...input,version:1,operationKey:randomUUID(),contactedAt:'2026-10-01T15:00:00Z'});
 expect((await loadCustomers()).find(c=>c.id===userId)).toMatchObject({lastContactedAt:input.contactedAt,lastStaff:actors[0].name,lastInitials:'LS'});
 expect((await timeline(userId)).find(e=>e.id===original[0].id)).toEqual(original[0]);
});
it('API preserves unknown for old payloads and only asserts now explicitly',async()=>{
 const userId=await legacy();
 for(const [version,extra] of [[0,{}],[1,{contactedNow:true}]] as const){
 const response=await POST(new Request('http://localhost/api/admin/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,version,operationKey:randomUUID(),type:'OUTREACH',method:'CALL',...extra})}));
 expect(response.status).toBe(200);const {entry}=await response.json();
 if(version===0) expect(entry.contactedAt).toBeNull();else expect(entry.contactedAt).toBe(entry.occurredAt);
 }
});
it('rejects conflicting time assertions and time assertions on notes',async()=>{
 const userId=await legacy();
 const input={userId,version:0,operationKey:randomUUID(),type:'OUTREACH' as const,method:'CALL' as const,contactedNow:true,contactedAt:'2026-10-01T15:00:00Z'};
 await expect(logOutreach(actors[0],input)).rejects.toThrow('Choose either');
 await expect(logOutreach(actors[0],{...input,contactedAt:undefined,type:'NOTE',note:'Synthetic'})).rejects.toThrow('only for completed');
});
