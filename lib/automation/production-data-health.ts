import type { PrismaClient } from '@prisma/client';

export function productionDatabaseUrl(value: unknown): string {
  try {
    const config = value as { target?: string; database?: { connectionString?: string } };
    const raw = config?.database?.connectionString;
    const url = new URL(raw || '');
    if (config.target !== 'production' || !raw || !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.hostname || /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i.test(url.hostname) || url.searchParams.has('host')) {
      throw new Error('invalid target');
    }
    return raw;
  } catch {
    // Never include the supplied URI: it contains credentials.
    throw new Error('A remote production read-only database configuration is required.');
  }
}

function summarizePending<T extends { createdAt: Date }>(rows: T[], typeOf: (row: T) => string) {
  return {
    oldest: rows.length ? new Date(Math.min(...rows.map((row) => row.createdAt.getTime()))).toISOString() : null,
    newest: rows.length ? new Date(Math.max(...rows.map((row) => row.createdAt.getTime()))).toISOString() : null,
    byType: rows.reduce<Record<string, number>>((counts, row) => {
      const type = typeOf(row);
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {}),
  };
}

export async function readProductionDataHealth(prisma: PrismaClient, now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const weekAhead = new Date(now.getTime() + 7 * 86400_000);
  const staleCutoff = new Date(now.getTime() - 86400_000);
  const upcoming = { startAt: { gte: now, lt: weekAhead }, status: 'SCHEDULED' as const };
  const stale = { createdAt: { lt: staleCutoff }, status: 'PENDING' as const, stripeCheckoutSessionId: { not: null } };

  return prisma.$transaction(async (tx) => {
    // This must succeed BEFORE any aggregate. No writes or local fallback.
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const [upcomingOccurrences, upcomingWithoutInstructor, upcomingWithoutCoverage, upcomingBookings,
      recentPaymentFailures, recentPurchaseFailures, recentCommerceFailures, recentEmailFailures,
      recentStripeErrors, stalePendingPurchases, stalePendingCommerceOrders, sombleProfiles,
      activeMemberships, stalePurchaseRows, staleCommerceRows, openPaymentDisputes, unresolvedStripeErrors] = await Promise.all([
      tx.classOccurrence.count({ where: upcoming }),
      tx.classOccurrence.count({ where: { ...upcoming, instructorId: null } }),
      tx.classOccurrence.count({ where: { ...upcoming, instructorId: null,
        OR: [{ substituteInstructorName: null }, { substituteInstructorName: '' }] } }),
      tx.booking.count({ where: { occurrence: upcoming, status: 'CONFIRMED' } }),
      // Old purchases can fail/be disputed today. Track current status updates,
      // not the original purchase date; keep outstanding disputes visible too.
      tx.paymentRecord.count({ where: { updatedAt: { gte: weekAgo }, status: { in: ['FAILED', 'DISPUTED'] } } }),
      tx.purchase.count({ where: { updatedAt: { gte: weekAgo }, status: 'FAILED' } }),
      tx.commerceOrder.count({ where: { updatedAt: { gte: weekAgo }, status: { in: ['PAYMENT_FAILED', 'DISPUTED'] } } }),
      tx.emailMessage.count({ where: { updatedAt: { gte: weekAgo }, status: 'FAILED' } }),
      tx.stripeEvent.count({ where: { createdAt: { gte: weekAgo }, processedAt: null, error: { not: null } } }),
      tx.purchase.count({ where: stale }),
      tx.commerceOrder.count({ where: stale }),
      tx.sombleClientProfile.count(),
      tx.membership.count({ where: { status: { in: ['ACTIVE', 'TRIALING'] } } }),
      tx.purchase.findMany({ where: stale, select: { createdAt: true, product: { select: { kind: true } } } }),
      tx.commerceOrder.findMany({ where: stale, select: { createdAt: true, kind: true } }),
      tx.paymentRecord.count({ where: { status: 'DISPUTED' } }),
      tx.stripeEvent.count({ where: { processedAt: null, error: { not: null } } }),
    ]);
    return {
      source: 'production-readonly', checkedAt: now.toISOString(),
      limitations: 'Stored production records only; not an independent Stripe settlement reconciliation or paid checkout test. Stale pending checkouts can be abandoned, not failed payments.',
      upcomingOccurrences, upcomingWithoutInstructor, upcomingWithoutCoverage, upcomingBookings,
      recentPaymentFailures, recentPurchaseFailures, recentCommerceFailures, recentEmailFailures,
      recentStripeErrors, stalePendingPurchases, stalePendingCommerceOrders, sombleProfiles, activeMemberships,
      openPaymentDisputes, unresolvedStripeErrors,
      stalePurchaseSummary: summarizePending(stalePurchaseRows, (row) => row.product.kind),
      staleCommerceSummary: summarizePending(staleCommerceRows, (row) => row.kind),
    };
  }, { maxWait: 10_000, timeout: 60_000 });
}
