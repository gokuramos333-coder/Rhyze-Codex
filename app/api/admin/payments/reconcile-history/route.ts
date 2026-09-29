import { NextResponse } from 'next/server';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { stripeAccountMode, stripeIsConfigured } from '@/lib/payments/stripe';
import { syncRecentStripePaymentRecords } from '@/lib/payments/stripe-payment-sync';

const inputSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  dryRun: z.boolean(),
  reason: z.string().trim().min(10).max(240),
  startingAfter: z.string().regex(/^(ch|py)_[A-Za-z0-9_]+$/).max(255).optional(),
}).strict().refine(value => {
  const duration = Date.parse(value.to) - Date.parse(value.from);
  return duration > 0 && duration <= 366 * 86400000;
});

export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request)) return NextResponse.json({ error: 'Same-origin owner request required.' }, { status: 403 });
  const owner = await requireApprovedOwner();
  if (!stripeIsConfigured() || stripeAccountMode() !== 'live') return NextResponse.json({ error: 'Live Stripe is required.' }, { status: 503 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Provide explicit dryRun, reason and ISO from/to bounds no more than 366 days apart. To is exclusive.' }, { status: 400 });
  const audit = input.data.dryRun ? null : await prisma.auditLog.create({ data: {
    actorId: owner.id,
    action: 'payments.history-sync.apply',
    entityType: 'PaymentRecord',
    before: input.data,
    after: { status: 'STARTED' },
  } });
  try {
    const result = await syncRecentStripePaymentRecords(prisma, {
      from: new Date(input.data.from), to: new Date(input.data.to),
      dryRun: input.data.dryRun, financialOnly: true, limit: 25, maxPages: 1,
      ...(input.data.startingAfter ? { startingAfter: input.data.startingAfter } : {}),
    });
    if (audit) await prisma.auditLog.update({ where: { id: audit.id }, data: { after: { status: result.attempted ? 'COMPLETED' : 'UNAVAILABLE', result: JSON.parse(JSON.stringify(result)) } } });
    if (!input.data.dryRun) for (const path of ['/admin', '/admin/payments', '/admin/events', '/admin/reports']) revalidatePath(path);
    return NextResponse.json({ ok: result.attempted, auditId: audit?.id ?? null, ...result }, { status: result.attempted ? 200 : 503 });
  } catch {
    if (audit) await prisma.auditLog.update({ where: { id: audit.id }, data: { after: { status: 'FAILED', possiblePartial: !input.data.dryRun } } });
    return NextResponse.json({ ok: false, auditId: audit?.id ?? null, possiblePartial: !input.data.dryRun, error: input.data.dryRun ? 'Provider preview failed. No financial records were changed.' : 'Financial reconciliation failed. Review the audit and retry the same bounded window; some rows may have been reconciled.' }, { status: 502 });
  }
}
