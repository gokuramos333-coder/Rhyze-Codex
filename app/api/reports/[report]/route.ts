import { NextResponse } from 'next/server';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  loadFinancialReport,
  financialReportCsvRows,
} from '@/lib/admin/financial-report';

function csvCell(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `"${String(value ?? '')
    .replace(/^[=+@\t\r-]/, (match) => `'${match}`)
    .replaceAll('"', '""')}"`;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ report: string }> },
) {
  const params = await props.params;
  await requireApprovedOwner();
  let rows: unknown[][] = [];
  if (params.report === 'attendance') {
    // Linking moves a ticket check-in into native attendance in one transaction.
    // A single statement sees exactly one side of that transfer.
    const data=await prisma.$queryRaw<{name:string|null;email:string;title:string;startAt:Date;status:string}[]>`
      SELECT u.name,u.email,c.name AS title,o."startAt",a.status::text AS status,a."createdAt" AS recorded
      FROM "AttendanceRecord" a JOIN "User" u ON u.id=a."userId" JOIN "ClassOccurrence" o ON o.id=a."occurrenceId"
      JOIN "ClassTemplate" c ON c.id=o."templateId"
      WHERE NOT EXISTS (SELECT 1 FROM "BlackFridayTicket" t WHERE a."bookingId" IN (t."buyerBookingId",t."guestBookingId")
        AND NOT EXISTS (SELECT 1 FROM bf_paid_event_ticket paid WHERE paid."orderId"=t."orderId"))
      UNION ALL SELECT t."guestName",'',c.name,o."startAt",'CHECKED_IN',t."guestCheckedInAt"
      FROM bf_paid_event_ticket t JOIN "ClassOccurrence" o ON o.id=t."occurrenceId" JOIN "ClassTemplate" c ON c.id=o."templateId"
      WHERE t."guestBookingId" IS NULL AND t."guestCheckedInAt" IS NOT NULL ORDER BY recorded DESC`;
    rows=[['Member','Email','Class','Date','Status'],...data.map(row=>[row.name,row.email,row.title,row.startAt.toISOString(),row.status])];
  } else if (params.report === 'revenue') {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const report = await loadFinancialReport(params);
    rows = financialReportCsvRows(report);
  } else {
    const data = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    rows = [
      ['Name', 'Email', 'Role', 'Status', 'Joined'],
      ...data.map((item) => [
        item.name,
        item.email,
        item.role,
        item.status,
        item.createdAt.toISOString(),
      ]),
    ];
  }
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="rhyze-${params.report}.csv"`,
    },
  });
}
