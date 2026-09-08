import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { syncRecentStripePaymentRecords } from '@/lib/payments/stripe-payment-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncRecentStripePaymentRecords(prisma, { lookbackDays: 14, limit: 100 });
  const july31Start = new Date('2026-07-31T04:00:00.000Z');
  const [allPaymentRecords, july31PaymentRecords, july31Sums] = await Promise.all([
    prisma.paymentRecord.count(),
    prisma.paymentRecord.count({ where: { occurredAt: { gte: july31Start } } }),
    prisma.paymentRecord.aggregate({
      where: { occurredAt: { gte: july31Start } },
      _sum: { amountCents: true, refundedAmountCents: true },
    }),
  ]);

  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/activity');

  return NextResponse.json({
    ...result,
    productionDb: {
      allPaymentRecords,
      july31PaymentRecords,
      july31GrossCents: july31Sums._sum.amountCents || 0,
      july31RefundedCents: july31Sums._sum.refundedAmountCents || 0,
    },
  });
}
