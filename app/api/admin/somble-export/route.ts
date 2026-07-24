import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireApprovedOwner } from '@/lib/auth/session';

function csvCell(value: string | number | boolean | null | undefined) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  await requireApprovedOwner();
  const type = new URL(request.url).searchParams.get('type');

  if (type === 'clients') {
    const profiles = await prisma.sombleClientProfile.findMany({
      include: { user: true },
      orderBy: { sourceJoinedAt: 'desc' },
    });
    const rows = [
      [
        'Client Name',
        'Email Address',
        'Somble Status',
        'Date Joined',
        'Last Login',
        'Total Workouts',
        'App Downloaded',
      ],
      ...profiles.map((item) => [
        item.user.name ?? '',
        item.user.email,
        item.sourceStatus,
        item.sourceJoinedAt.toISOString(),
        item.lastLoginAt?.toISOString() ?? '',
        item.totalWorkouts,
        item.appDownloaded,
      ]),
    ];
    return new NextResponse(
      rows.map((row) => row.map(csvCell).join(',')).join('\n'),
      {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition':
            'attachment; filename="rhyze-somble-clients.csv"',
        },
      },
    );
  }

  if (type === 'transactions') {
    const transactions = await prisma.sombleTransaction.findMany({
      include: { user: true },
      orderBy: { transferredAt: 'desc' },
    });
    const rows = [
      [
        'Transfer Date',
        'Transferred Amount',
        'Content Type',
        'Customer',
        'Email',
        'Transfer ID',
        'Payment ID',
      ],
      ...transactions.map((item) => [
        item.transferredAt.toISOString(),
        (item.amountCents / 100).toFixed(2),
        item.contentType,
        item.supporterName,
        item.user.email,
        item.transferId,
        item.paymentId,
      ]),
    ];
    return new NextResponse(
      rows.map((row) => row.map(csvCell).join(',')).join('\n'),
      {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition':
            'attachment; filename="rhyze-somble-transferred-revenue.csv"',
        },
      },
    );
  }

  return NextResponse.json(
    { ok: false, error: 'Choose type=clients or type=transactions.' },
    { status: 400 },
  );
}
