import { describe, it, expect, vi } from 'vitest';
import { assertFinancialApprover, isFinancialApprover } from '@/lib/auth/financial-owner-access';
describe('studio cash approval identity', () => {
  it.each(['vanessa@rhyzefit.com','melissa@rhyzefit.com'])('allows existing active owner %s', async email => {
    const actor = {id:'verified-owner', email, role:'OWNER' as const, status:'ACTIVE' as const};
    const db:any={user:{findUnique:vi.fn(async()=>actor)}};
    expect(await assertFinancialApprover(db, actor.id)).toBe(actor);
    expect(db.user.findUnique).toHaveBeenCalledWith({where:{id:actor.id}});
  });
  it.each(['gui@westaffnj.com','automation-admin@rhyze.local','staff@example.test'])('denies other owner %s', async email => {
    const db:any={user:{findUnique:async()=>({email,role:'OWNER',status:'ACTIVE'})}};
    await expect(assertFinancialApprover(db,'other')).rejects.toThrow('Vanessa or Melissa');
  });
  it('does not confer access through a name, admin role, or inactive account',()=>{
    expect(isFinancialApprover({email:'melissa@rhyzefit.com',role:'ADMIN',status:'ACTIVE'})).toBe(false);
    expect(isFinancialApprover({email:'vanessa@rhyzefit.com',role:'OWNER',status:'SUSPENDED'})).toBe(false);
  });
});
