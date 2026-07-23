import { NextResponse } from 'next/server';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: { report: string } }) {
  await requireArea('admin');
  let rows: unknown[][] = [];
  if (params.report === 'attendance') {
    const data = await prisma.attendanceRecord.findMany({ include: { user: true, occurrence: { include: { template: true } } }, orderBy: { createdAt: 'desc' } });
    rows = [['Member','Email','Class','Date','Status'], ...data.map((item) => [item.user.name,item.user.email,item.occurrence.template.name,item.occurrence.startAt.toISOString(),item.status])];
  } else if (params.report === 'revenue') {
    const data = await prisma.purchase.findMany({ include: { user: true, product: true }, orderBy: { createdAt: 'desc' } });
    rows = [['Member','Email','Product','Amount','Status','Date'], ...data.map((item) => [item.user.name,item.user.email,item.product.name,(item.amountCents/100).toFixed(2),item.status,item.createdAt.toISOString()])];
  } else {
    const data = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    rows = [['Name','Email','Role','Status','Joined'], ...data.map((item) => [item.name,item.email,item.role,item.status,item.createdAt.toISOString()])];
  }
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="rhyze-${params.report}.csv"` } });
}
