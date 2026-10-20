import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({owner:vi.fn(),cancel:vi.fn(),tx:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApprovedOwner:m.owner}));
vi.mock('@/lib/db/prisma',()=>({prisma:{$transaction:m.tx}}));
vi.mock('@/lib/domain/bookings/cancel-invalid-trial-booking',()=>({cancelInvalidTrialBooking:m.cancel}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {POST} from '@/app/api/admin/bookings/cancel-invalid-trial/route';
const body={bookingId:'booking',userId:'member',occurrenceId:'occurrence',reason:'Owner approved invalid trial correction',dryRun:true};
const request=(data:unknown=body,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/admin/bookings/cancel-invalid-trial',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
describe('invalid trial booking correction authorization',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.owner.mockResolvedValue({id:'owner'});m.tx.mockImplementation(fn=>fn({}));m.cancel.mockResolvedValue({status:'eligible'});});
 it('rejects foreign origins',async()=>{expect((await POST(request(body,'https://other.test'))).status).toBe(403);expect(m.tx).not.toHaveBeenCalled();});
 it('requires approved owner',async()=>{m.owner.mockRejectedValue(Error('denied'));await expect(POST(request())).rejects.toThrow('denied');expect(m.tx).not.toHaveBeenCalled();});
 it('requires an explicit dry run or apply and exact identities',async()=>{expect((await POST(request({...body,dryRun:undefined}))).status).toBe(400);expect((await POST(request({...body,userId:''}))).status).toBe(400);expect(m.tx).not.toHaveBeenCalled();});
 it('uses authenticated actor in a serializable transaction',async()=>{expect((await POST(request())).status).toBe(200);expect(m.cancel).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({...body,actorId:'owner'}));expect(m.tx).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'Serializable'}));});
 it('refuses changed booking evidence',async()=>{m.cancel.mockRejectedValue(Error('changed'));expect((await POST(request())).status).toBe(409);});
});
