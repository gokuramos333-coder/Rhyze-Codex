import { it, expect, vi, afterEach } from 'vitest';
import { assertFinancialRelease, financialRuntimeIdentity } from '@/lib/payments/financial-release';
afterEach(()=>vi.unstubAllEnvs());
const deploy='a'.repeat(24), source='b'.repeat(40);
function setup() { vi.stubEnv('DEPLOY_ID',deploy);vi.stubEnv('COMMIT_REF',source); }
it('rejects missing runtime identity before querying or reserving',async()=>{
 vi.stubEnv('DEPLOY_ID','');const db:any={$queryRaw:vi.fn()};
 await expect(assertFinancialRelease(db)).rejects.toThrow('runtime');expect(db.$queryRaw).not.toHaveBeenCalled();
});
it('does not accept a header-like or untrusted deployment identifier',()=>{
 expect(()=>financialRuntimeIdentity({DEPLOY_ID:'current',COMMIT_REF:source})).toThrow();
});
it.each([{rows:[]},{rows:[{enabledDeployId:null}]},{rows:[{enabledDeployId:'c'.repeat(24),sourceSha:source,evidenceHash:'x'}]},{rows:[{enabledDeployId:deploy,sourceSha:'d'.repeat(40),evidenceHash:'x'}]}])('fails closed for disabled, missing or other-source rows',async ({rows})=>{
 setup();await expect(assertFinancialRelease({$queryRaw:vi.fn(async()=>rows)} as any)).rejects.toThrow('paused');
});
it('checks the exact current deployment on every operation, without cached allowance',async()=>{
 setup();const row={enabledDeployId:deploy,sourceSha:source,evidenceHash:'e'.repeat(64),generation:1};
 const db:any={$queryRaw:vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([])};
 expect(await assertFinancialRelease(db)).toEqual(row);await expect(assertFinancialRelease(db)).rejects.toThrow('paused');expect(db.$queryRaw).toHaveBeenCalledTimes(2);
});
it('fails closed on database failure',async()=>{setup();await expect(assertFinancialRelease({$queryRaw:vi.fn(async()=>{throw Error('database offline')})} as any)).rejects.toThrow('offline');});
it('expired preparation cannot submit after asynchronous work outlives the transaction',async()=>{
 setup();const {assertFinancialSubmission}=await import('@/lib/payments/financial-release');
 const db:any={$queryRaw:vi.fn()};const submit=vi.fn();
 await expect((async()=>{await assertFinancialSubmission(db,60000,()=>40000);submit();})()).rejects.toThrow('deadline');
 expect(db.$queryRaw).not.toHaveBeenCalled();expect(submit).not.toHaveBeenCalled();
});
it('transaction liveness failure blocks submission even with time remaining',async()=>{
 setup();const {assertFinancialSubmission}=await import('@/lib/payments/financial-release');const submit=vi.fn();
 const db:any={$queryRaw:vi.fn(async()=>{throw Error('Transaction expired');})};
 await expect((async()=>{await assertFinancialSubmission(db,60000,()=>1000);submit();})()).rejects.toThrow('expired');expect(submit).not.toHaveBeenCalled();
});
it('a slow lock reacquisition cannot consume the reserved provider timeout',async()=>{
 setup();const {assertFinancialSubmission}=await import('@/lib/payments/financial-release');const submit=vi.fn();let now=1000;
 const db:any={$queryRaw:vi.fn(async()=>{now=40000;return[{enabledDeployId:deploy,sourceSha:source,evidenceHash:'e'.repeat(64)}];})};
 await expect((async()=>{await assertFinancialSubmission(db,60000,()=>now);submit();})()).rejects.toThrow('deadline');expect(submit).not.toHaveBeenCalled();
});

it('production requires artifact-stamped identity instead of mutable runtime metadata',()=>{
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('RHYZE_FINANCIAL_DEPLOY_ID','');vi.stubEnv('RHYZE_FINANCIAL_SOURCE_SHA','');setup();expect(()=>financialRuntimeIdentity()).toThrow('identity');
 vi.stubEnv('RHYZE_FINANCIAL_DEPLOY_ID',deploy);vi.stubEnv('RHYZE_FINANCIAL_SOURCE_SHA',source);expect(financialRuntimeIdentity()).toEqual({deployId:deploy,sourceSha:source});
});
