import Link from 'next/link';
import { BirthdayFields } from '@/components/domain/accounts/BirthdayFields';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { qualifyingMembershipProductKinds } from '@/lib/domain/memberships/active-membership';
import { createAdminClientAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CreateAdminClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireApprovedOwner();
  const query = await searchParams;
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      kind: { in: qualifyingMembershipProductKinds },
    },
    select: { id: true, name: true, priceCents: true, stripePriceId: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);

  return (
    <>
      <Link href="/admin/members" className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
        ← Client directory
      </Link>
      <div className="mt-5 max-w-5xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Walk-in account setup</p>
        <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">CREATE CLIENT</h1>
        <p className="mt-3 max-w-2xl text-sm font-bold text-rhyze-black/55">
          The client receives a secure activation email to choose their password and accept the waiver. Admin never creates those on their behalf.
        </p>
      </div>

      {query.error && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-50 p-4 font-bold text-red-900">
          {query.error === 'duplicate'
            ? 'A client account already exists for that email. Open the existing client instead.'
            : 'The client could not be created. Check every required field and try again.'}
        </p>
      )}

      <form action={createAdminClientAction} className="mt-7 grid gap-5 xl:grid-cols-[1fr_.9fr]">
        <section className="border-t-4 border-rhyze-orange bg-white p-5">
          <h2 className="font-display text-4xl tracking-wider">CLIENT DETAILS</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-black uppercase tracking-widest">
              First name
              <input name="firstName" required maxLength={50} className="min-h-12 border border-black/15 px-3 text-base font-normal normal-case tracking-normal" />
            </label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-widest">
              Last name
              <input name="lastName" required maxLength={50} className="min-h-12 border border-black/15 px-3 text-base font-normal normal-case tracking-normal" />
            </label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-widest sm:col-span-2">
              Email
              <input type="email" name="email" required className="min-h-12 border border-black/15 px-3 text-base font-normal normal-case tracking-normal" />
            </label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-widest sm:col-span-2">
              Cell phone
              <input type="tel" name="phone" required minLength={7} maxLength={30} className="min-h-12 border border-black/15 px-3 text-base font-normal normal-case tracking-normal" />
            </label>
            <BirthdayFields className="sm:col-span-2" />
          </div>
        </section>

        <section className="border-t-4 border-rhyze-gold bg-rhyze-black p-5 text-rhyze-cream">
          <h2 className="font-display text-4xl tracking-wider">MEMBERSHIP</h2>
          <p className="mt-2 text-sm font-bold text-rhyze-cream/60">Optional. You can also add a membership later from the client profile.</p>
          <div className="mt-5 grid gap-3">
            <label className="flex gap-3 border border-white/15 p-3 text-sm font-bold">
              <input type="radio" name="membershipMode" value="none" defaultChecked /> Create profile only
            </label>
            <label className="flex gap-3 border border-rhyze-orange/50 p-3 text-sm font-bold">
              <input type="radio" name="membershipMode" value="checkout" /> Purchase through Stripe
            </label>
            <label className="flex gap-3 border border-rhyze-gold/50 p-3 text-sm font-bold">
              <input type="radio" name="membershipMode" value="assign" /> Assign without charging
            </label>
          </div>
          <select name="productId" className="mt-4 min-h-12 w-full bg-white px-3 text-rhyze-black">
            <option value="">No membership selected</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · ${(product.priceCents / 100).toFixed(2)}{!product.stripePriceId ? ' · assignment only' : ''}
              </option>
            ))}
          </select>
          <label className="mt-3 grid gap-1 text-[10px] font-black uppercase tracking-widest">
            No-charge access through
            <input type="date" name="accessEndDate" min={tomorrow} className="min-h-12 bg-white px-3 text-rhyze-black" />
          </label>
          <label className="mt-3 grid gap-1 text-[10px] font-black uppercase tracking-widest">
            No-charge assignment reason
            <input name="reason" maxLength={240} placeholder="Required only for no-charge access" className="min-h-12 bg-white px-3 text-rhyze-black" />
          </label>
          <button className="mt-5 w-full bg-rhyze-gradient px-5 py-4 text-xs font-black uppercase tracking-widest text-rhyze-black">
            Create client and continue
          </button>
        </section>
      </form>
    </>
  );
}
