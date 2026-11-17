import {afterEach,expect,it,vi} from 'vitest';
import {changeFinancialRelease} from '@/lib/payments/financial-release-control';
const deploy='a'.repeat(24),source='b'.repeat(40),hash='e'.repeat(64);
const input={action:'ACTIVATE',generation:0,deployId:deploy,sourceSha:source,evidenceHash:hash,reason:'Verified closed deployment and provider reconciliation'};
function setup(){
 vi.stubEnv('DEPLOY_ID',deploy);vi.stubEnv('COMMIT_REF',source);
 const tx:any={user:{findUnique:vi.fn(async()=>({id:'owner',email:'automation-admin@rhyze.local',role:'OWNER',status:'ACTIVE'}))},$queryRaw:vi.fn().mockResolvedValueOnce([{generation:0,enabledDeployId:null,sourceSha:null,evidenceHash:null}]).mockResolvedValueOnce([{generation:1,enabledDeployId:deploy,sourceSha:source,evidenceHash:hash}]),auditLog:{create:vi.fn()}};
 const db:any={$transaction:vi.fn(async(fn:any)=>fn(tx))};return{db,tx};
}
afterEach(()=>vi.unstubAllEnvs());
it('binds activation and audit to authenticated owner and exact runtime',async()=>{const{db,tx}=setup();expect((await changeFinancialRelease(db,'owner',input)).generation).toBe(1);expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'owner',action:'financial.release.activate'})});expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');});
it('rejects a claimed source/deployment before transaction',async()=>{const{db}=setup();await expect(changeFinancialRelease(db,'owner',{...input,deployId:'c'.repeat(24)})).rejects.toThrow('identity');expect(db.$transaction).not.toHaveBeenCalled();});
it('rejects stale generation without update/audit',async()=>{const{db,tx}=setup();await expect(changeFinancialRelease(db,'owner',{...input,generation:1})).rejects.toThrow('state changed');expect(tx.$queryRaw).toHaveBeenCalledTimes(1);expect(tx.auditLog.create).not.toHaveBeenCalled();});
it('rejects another active deployment until explicit close',async()=>{const{db,tx}=setup();tx.$queryRaw.mockReset().mockResolvedValueOnce([{generation:0,enabledDeployId:'c'.repeat(24)}]);await expect(changeFinancialRelease(db,'owner',input)).rejects.toThrow('Close');expect(tx.$queryRaw).toHaveBeenCalledTimes(1);});
it.each(['ADMIN','MEMBER'])('rejects %s even with an owner email',async(role)=>{const{db,tx}=setup();tx.user.findUnique.mockResolvedValue({id:'owner',email:'melissa@rhyzefit.com',role,status:'ACTIVE'});await expect(changeFinancialRelease(db,'owner',input)).rejects.toThrow('owner');expect(tx.$queryRaw).not.toHaveBeenCalled();});
it('rejects unknown evidence fields and missing reason',async()=>{const{db}=setup();await expect(changeFinancialRelease(db,'owner',{...input,reason:''})).rejects.toThrow();await expect(changeFinancialRelease(db,'owner',{...input,bypass:true})).rejects.toThrow();});
it('close uses the same audit and exclusive generation check',async()=>{const{db,tx}=setup();await changeFinancialRelease(db,'owner',{...input,action:'CLOSE'});expect(tx.$queryRaw.mock.calls[1].slice(1,4)).toEqual([null,null,null]);expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({action:'financial.release.close'})});});
