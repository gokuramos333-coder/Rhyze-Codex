import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Row = Record<string, unknown>;

function hostOf(value?: string) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return 'unparseable';
  }
}

async function rows(sql: string) {
  return prisma.$queryRawUnsafe<Row[]>(sql);
}

export async function GET() {
  const [counts, latestBookings, latestUsers, latestPurchases, latestPayments, columns] = await Promise.all([
    rows(`
      SELECT 'ClassOccurrence' AS table, COUNT(*)::int AS count, MIN("startAt") AS min, MAX("startAt") AS max FROM "ClassOccurrence"
      UNION ALL SELECT 'Booking', COUNT(*)::int, MIN("bookedAt"), MAX("bookedAt") FROM "Booking"
      UNION ALL SELECT 'User', COUNT(*)::int, MIN("createdAt"), MAX("createdAt") FROM "User"
      UNION ALL SELECT 'Purchase', COUNT(*)::int, MIN("createdAt"), MAX("createdAt") FROM "Purchase"
      UNION ALL SELECT 'Membership', COUNT(*)::int, MIN("createdAt"), MAX("createdAt") FROM "Membership"
      UNION ALL SELECT 'PaymentRecord', COUNT(*)::int, MIN("createdAt"), MAX("createdAt") FROM "PaymentRecord"
    `).catch((error) => [{ error: String(error) }]),
    rows(`
      SELECT b.id, b.status, b."bookedAt", u.name, u.email, co."startAt", ct.name AS class
      FROM "Booking" b
      JOIN "User" u ON u.id = b."userId"
      JOIN "ClassOccurrence" co ON co.id = b."occurrenceId"
      JOIN "ClassTemplate" ct ON ct.id = co."templateId"
      ORDER BY b."bookedAt" DESC
      LIMIT 8
    `),
    rows(`SELECT name, email, status, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 8`),
    rows(`
      SELECT p.id, p.status, p."amountCents", p."createdAt", u.name, u.email, pr.name AS product
      FROM "Purchase" p
      LEFT JOIN "User" u ON u.id = p."userId"
      LEFT JOIN "Product" pr ON pr.id = p."productId"
      ORDER BY p."createdAt" DESC
      LIMIT 8
    `),
    rows(`SELECT * FROM "PaymentRecord" ORDER BY "createdAt" DESC LIMIT 8`).catch((error) => [{ error: String(error) }]),
    rows(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('PaymentRecord','Purchase','Booking','User','ClassOccurrence') ORDER BY table_name, ordinal_position`),
  ]);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    databaseHosts: {
      DATABASE_URL: hostOf(process.env.DATABASE_URL),
      NETLIFY_DB_URL: hostOf(process.env.NETLIFY_DB_URL),
      NETLIFY_DATABASE_URL: hostOf(process.env.NETLIFY_DATABASE_URL),
    },
    counts,
    latest: { bookings: latestBookings, users: latestUsers, purchases: latestPurchases, payments: latestPayments },
    columns,
  });
}
