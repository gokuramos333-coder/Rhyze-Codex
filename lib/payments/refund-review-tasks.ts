import type { Prisma, PrismaClient } from '@prisma/client';
import { isFinancialApprover } from '@/lib/auth/financial-owner-access';

type Identity = { id: string; email: string };
export type FinancialReviewOwners = {
  owners: [Identity, Identity];
  evidenceReference: string;
};
/** Supplied only from supervisor-verified existing identities. Never grants a role. */
export function financialReviewOwners(
  raw = process.env.FINANCIAL_REVIEW_OWNERS,
): FinancialReviewOwners {
  try {
    const value = JSON.parse(raw ?? '');
    const owners = [value.vanessa, value.melissa] as [Identity, Identity];
    if (
      owners.some(
        (o) =>
          !o ||
          typeof o.id !== 'string' ||
          !o.id.trim() ||
          typeof o.email !== 'string' ||
          !o.email.includes('@'),
      ) ||
      owners[0].email.trim().toLowerCase() !== 'vanessa@rhyzefit.com' ||
      owners[1].email.trim().toLowerCase() !== 'melissa@rhyzefit.com' ||
      owners[0].id === owners[1].id ||
      owners[0].email.toLowerCase() === owners[1].email.toLowerCase() ||
      typeof value.evidenceReference !== 'string' ||
      value.evidenceReference.trim().length < 8
    )
      throw Error();
    return { owners, evidenceReference: value.evidenceReference };
  } catch {
    throw Error('Verified Vanessa and Melissa identity configuration required');
  }
}
export type FinancialTaskSubject = {
  id: string;
  createdAt: Date;
  reason: string;
  reviewId?: string | null;
  bookingId?: string | null;
  overdue?: boolean;
};
async function validateOwners(
  tx: Prisma.TransactionClient,
  config: FinancialReviewOwners,
) {
  const users = await tx.user.findMany({
    where: { id: { in: config.owners.map((o) => o.id) } },
  });
  if (
    config.owners.some(
      (o) =>
        !users.some(
          (u) =>
            u.id === o.id &&
            u.email.toLowerCase() === o.email.toLowerCase() &&
            isFinancialApprover(u),
        ),
    )
  )
    throw Error(
      'Verified financial owner identities are missing, changed or inactive',
    );
}
export async function assignFinancialReviewTask(
  tx: Prisma.TransactionClient,
  subject: FinancialTaskSubject,
  config: FinancialReviewOwners,
) {
  await validateOwners(tx, config);
  const dueAt = new Date(subject.createdAt.getTime() + 24 * 3600000);
  const assigned =
    await tx.$executeRaw`INSERT INTO "FinancialTask" (id,"reviewId","bookingId",assignees,"identityEvidence","dueAt")
    VALUES (${subject.id},${subject.reviewId ?? null},${subject.bookingId ?? null},${JSON.stringify(config.owners)}::jsonb,${config.evidenceReference},${dueAt})
    ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id
      WHERE "FinancialTask".assignees=EXCLUDED.assignees AND "FinancialTask"."identityEvidence"=EXCLUDED."identityEvidence"`;
  if (assigned !== 1)
    throw Error(
      'Persisted task owner identities differ; explicit reassignment review required',
    );
  await tx.inAppNotification.createMany({
    data: config.owners.map((owner) => ({
      userId: owner.id,
      title: 'Joint urgent financial review: Vanessa and Melissa',
      body: `${subject.reason}. Both owners are assigned. Unresolved after 24 hours escalates to both. Due ${dueAt.toISOString()}.`,
      link: '/admin/payments/refund-reviews',
      dedupeKey: `financial-review:${subject.id}:assigned:${owner.id}`,
    })),
    skipDuplicates: true,
  });
}
/** Existing five-minute protected email job drives tasks; no provider calls or email sends. */
export async function maintainFinancialReviewTasks(
  db: PrismaClient,
  raw = process.env.FINANCIAL_REVIEW_OWNERS,
) {
  const config = financialReviewOwners(raw);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('financial-review-task-maintenance'))`;
      const subjects = await tx.$queryRaw<FinancialTaskSubject[]>`
      WITH subjects AS (
        SELECT r.id,r.id AS "reviewId",NULL::text AS "bookingId",r."createdAt",r.reason
        FROM "FinancialReview" r WHERE r."resolvedAt" IS NULL
        UNION ALL
        SELECT 'collection:'||c."bookingId",NULL::text,c."bookingId",c."createdAt",'Uncertain collection or unconfirmed service; investigate without retry'
        FROM "AttendanceCollection" c WHERE (c.state='UNKNOWN' OR NOT c."serviceConfirmed") AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" p JOIN "ApprovedFinancialOperation" o ON o."paymentRecordId"=p.id WHERE p."stripePaymentIntentId"=c."paymentIntentId" AND p."refundedAmountCents"=p."amountCents" AND o.kind='REFUND' AND o.state='SUCCEEDED')
      ) SELECT s.*,s."createdAt" <= now()-interval '24 hours' AS overdue FROM subjects s
      LEFT JOIN "FinancialTask" t ON t.id=s.id
      WHERE t.id IS NULL OR (t."escalatedAt" IS NULL AND s."createdAt" <= now()-interval '24 hours')
      ORDER BY s."createdAt",s.id LIMIT 100`;
      for (const subject of subjects) {
        await assignFinancialReviewTask(tx, subject, config);
        if (!subject.overdue) continue;
        await tx.inAppNotification.createMany({
          data: config.owners.map((owner) => ({
            userId: owner.id,
            title: 'Overdue financial obligation — joint escalation',
            body: `${subject.reason}. Unresolved for at least 24 hours. Vanessa and Melissa must adjudicate; no automatic refund or retry.`,
            link: '/admin/payments/refund-reviews',
            dedupeKey: `financial-review:${subject.id}:overdue:${owner.id}`,
          })),
          skipDuplicates: true,
        });
        await tx.$executeRaw`UPDATE "FinancialTask" SET "escalatedAt"=COALESCE("escalatedAt",now()) WHERE id=${subject.id}`;
      }
      return {
        processed: subjects.length,
        moreMayRemain: subjects.length === 100,
      };
    },
    { timeout: 60000 },
  );
}
