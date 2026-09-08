import { prisma } from '../lib/db/prisma';

async function main() {
  const email = 'rebecca.robinson.2219@gmail.com';
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  console.log({ user });
  const rows = await prisma.booking.findMany({
    where: { user: { email } },
    include: {
      occurrence: { include: { template: true } },
      paymentRecords: true,
    },
    orderBy: { bookedAt: 'desc' },
    take: 10,
  });
  for (const booking of rows) {
    const ledger = await prisma.creditLedgerEntry.findMany({ where: { bookingId: booking.id }, include: { creditAccount: true }, orderBy: { createdAt: 'asc' } });
    console.log(JSON.stringify({
      bookingId: booking.id,
      source: booking.source,
      bookedAt: booking.bookedAt,
      status: booking.status,
      class: booking.occurrence.template.name,
      classStartAt: booking.occurrence.startAt,
      policySnapshot: booking.policySnapshot,
      paymentRecords: booking.paymentRecords.map((p) => ({ id: p.id, kind: p.kind, status: p.status, amountCents: p.amountCents, bookingId: p.bookingId, purchaseId: p.purchaseId, occurredAt: p.occurredAt })),
      ledger: ledger.map((l) => ({ id: l.id, type: l.type, quantity: l.quantity, reason: l.reason, creditAccount: { id: l.creditAccount.id, label: l.creditAccount.label, isUnlimited: l.creditAccount.isUnlimited, validFrom: l.creditAccount.validFrom, validUntil: l.creditAccount.validUntil, sourcePurchaseId: l.creditAccount.sourcePurchaseId } }))
    }, null, 2));
  }
}

main().finally(async () => prisma.$disconnect());
