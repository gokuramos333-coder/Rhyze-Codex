import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/admin/maintenance/audit-cleanup/route';
const mocks=vi.hoisted(()=>({owner:vi.fn(),transaction:vi.fn(),cleanup:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApprovedOwner:mocks.owner}));
vi.mock('@/lib/db/prisma',()=>({prisma:{$transaction:mocks.transaction}}));
vi.mock('@/lib/maintenance/audit-cleanup',()=>({cleanupAuditBacklog:mocks.cleanup}));
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_APP_URL','https://www.rhyzefitness.com');mocks.owner.mockResolvedValue({id:'owner',email:'owner@example.test'});mocks.transaction.mockImplementation(fn=>fn({}));mocks.cleanup.mockResolvedValue({dryRun:true,snapshot:'a'.repeat(64)});});
afterEach(()=>vi.unstubAllEnvs());
function request(body:unknown,origin='https://www.rhyzefitness.com'){return new Request('https://www.rhyzefitness.com/api/admin/maintenance/audit-cleanup',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});}
describe('cleanup owner boundary',()=>{
 it('blocks cross-origin requests before any DB access',async()=>{expect((await POST(request({},'https://example.test'))).status).toBe(403);expect(mocks.transaction).not.toHaveBeenCalled();});
 it('requires the approved owner before a preview or mutation',async()=>{mocks.owner.mockRejectedValueOnce(new Error('unauthorized'));await expect(POST(request({dryRun:true,reason:'Owner authorized obsolete backlog cleanup'}))).rejects.toThrow('unauthorized');expect(mocks.transaction).not.toHaveBeenCalled();});
 it('rejects missing explicit dryRun and unknown actions',async()=>{expect((await POST(request({reason:'Owner authorized obsolete backlog cleanup',charge:true}))).status).toBe(400);expect(mocks.transaction).not.toHaveBeenCalled();});
 it('uses a serializable transaction and never returns raw errors',async()=>{mocks.cleanup.mockRejectedValueOnce(new Error('private database info'));const response=await POST(request({dryRun:true,reason:'Owner authorized obsolete backlog cleanup'}));expect(response.status).toBe(409);expect(await response.text()).not.toContain('private database info');expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'Serializable'}));});
});
