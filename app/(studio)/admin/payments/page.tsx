import { prisma } from '@/lib/db/prisma';
import { stripeIsConfigured } from '@/lib/payments/stripe';
import { refundPurchaseAction } from './actions';

export default async function PaymentsPage() {
  const purchases = await prisma.purchase.findMany({ include: { user: true, product: true, invoice: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Revenue ledger</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">PAYMENTS</h1>
      {!stripeIsConfigured() && <p className="mt-6 border-l-4 border-rhyze-gold bg-white p-4 text-sm font-bold">Stripe keys are not set. Purchases and refund controls will activate when the live account is connected.</p>}
      <div className="mt-8 overflow-x-auto bg-white">
        <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-4">Member</th><th>Product</th><th>Status</th><th>Amount</th><th>Action</th></tr></thead>
          <tbody>{purchases.map((item) => <tr key={item.id} className="border-b border-black/5"><td className="p-4">{item.user.name || item.user.email}</td><td>{item.product.name}</td><td>{item.status}</td><td>${(item.amountCents/100).toFixed(2)}</td><td>{item.status === 'PAID' && <form action={refundPurchaseAction}><input type="hidden" name="purchaseId" value={item.id}/><button className="text-xs font-black uppercase text-rhyze-coral">Refund</button></form>}</td></tr>)}</tbody>
        </table>
        {purchases.length === 0 && <p className="p-8 text-rhyze-black/55">No payment records yet.</p>}
      </div>
    </>
  );
}
