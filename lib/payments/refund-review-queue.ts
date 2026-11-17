import { Prisma, type PrismaClient } from '@prisma/client';
import type { ReviewRow } from './refund-review';
type Cursor = { at: string; id: string };
export function financialQueueCursor(value?: string): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 2048) throw Error();
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(parsed.at) ||
      !Number.isFinite(Date.parse(parsed.at)) ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      parsed.id.length > 200
    )
      throw Error();
    return { at: parsed.at, id: parsed.id };
  } catch {
    throw Error('Invalid financial queue cursor');
  }
}
type Row = ReviewRow & { cursorAt: string; paymentIntentId: string | null };
export async function financialQueuePage(
  db: PrismaClient,
  kind: 'reviews' | 'collections' | 'replacements',
  options: { cursor?: string; limit?: number } = {},
) {
  const cursor = financialQueueCursor(options.cursor);
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  if (!Number.isInteger(limit)) throw Error('Invalid page size');
  const table =
    kind === 'reviews'
      ? Prisma.sql`"FinancialReview"`
      : kind === 'collections'
        ? Prisma.sql`"AttendanceCollection"`
        : Prisma.sql`"PaymentRecord"`;
  const key = kind === 'collections' ? Prisma.sql`"bookingId"` : Prisma.sql`id`;
  const date =
    kind === 'replacements'
      ? Prisma.sql`"occurredAt"`
      : Prisma.sql`"createdAt"`;
  const filter =
    kind === 'reviews'
      ? Prisma.sql`"resolvedAt" IS NULL`
      : kind === 'collections'
        ? Prisma.sql`(state='UNKNOWN' OR NOT "serviceConfirmed") AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" p JOIN "ApprovedFinancialOperation" o ON o."paymentRecordId"=p.id WHERE p."stripePaymentIntentId"="AttendanceCollection"."paymentIntentId" AND p."refundedAmountCents"=p."amountCents" AND o.kind='REFUND' AND o.state='SUCCEEDED')`
        : Prisma.sql`kind='NO_SHOW_FEE' AND status='REFUNDED' AND "amountCents"=1000 AND "stripeEventId" NOT LIKE 'approved-replacement:%' AND NOT EXISTS (SELECT 1 FROM "ApprovedFinancialOperation" o WHERE (o."paymentRecordId"="PaymentRecord".id AND o.kind='REPLACEMENT' AND o.state='SUCCEEDED') OR (o.kind='REPLACEMENT' AND o."providerId"="PaymentRecord"."stripePaymentIntentId"))`;
  const cursorDate =
    kind === 'replacements'
      ? Prisma.sql`${cursor?.at ?? null}::timestamptz AT TIME ZONE 'UTC'`
      : Prisma.sql`${cursor?.at ?? null}::timestamptz`;
  const displayDate =
    kind === 'replacements' ? date : Prisma.sql`${date} AT TIME ZONE 'UTC'`;
  const after = cursor
    ? Prisma.sql`AND (${date},${key}) > ((${cursorDate}),${cursor.id})`
    : Prisma.empty;
  const alias = kind === 'collections' ? Prisma.sql`,${key} AS id` : Prisma.empty;
  const rows = await db.$queryRaw<
    Row[]
  >(Prisma.sql`SELECT *${alias},to_char(${displayDate},'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
    FROM ${table} WHERE ${filter} ${after} ORDER BY ${date},${key} LIMIT ${limit + 1}`);
  const page = rows.slice(0, limit),
    last = page.at(-1);
  return {
    rows: page,
    next:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ at: last.cursorAt, id: last.id }),
          ).toString('base64url')
        : null,
  };
}
export async function financialQueueBacklog(db: PrismaClient) {
  const [counts] = await db.$queryRaw<
    { open: bigint; overdue: bigint; uncertain: bigint; unassigned: bigint }[]
  >`
    SELECT (SELECT count(*) FROM "FinancialReview" WHERE "resolvedAt" IS NULL) AS open,
      (SELECT count(*) FROM "FinancialReview" WHERE "resolvedAt" IS NULL AND "createdAt"<=now()-interval '24 hours') AS overdue,
      (SELECT count(*) FROM "AttendanceCollection" WHERE (state='UNKNOWN' OR NOT "serviceConfirmed") AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" p JOIN "ApprovedFinancialOperation" o ON o."paymentRecordId"=p.id WHERE p."stripePaymentIntentId"="AttendanceCollection"."paymentIntentId" AND p."refundedAmountCents"=p."amountCents" AND o.kind='REFUND' AND o.state='SUCCEEDED')) AS uncertain,
      (SELECT count(*) FROM "FinancialReview" r WHERE r."resolvedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "FinancialTask" t WHERE t."reviewId"=r.id)) AS unassigned`;
  const amounts = await db.$queryRaw<{ currency: string; cents: bigint }[]>`
    SELECT p.currency,sum(GREATEST(0,p."amountCents"-p."refundedAmountCents"))::bigint AS cents
    FROM "PaymentRecord" p WHERE EXISTS (SELECT 1 FROM "FinancialReview" r WHERE r."paymentRecordId"=p.id AND r."resolvedAt" IS NULL)
    GROUP BY p.currency ORDER BY p.currency`;
  return { ...counts, amounts };
}
