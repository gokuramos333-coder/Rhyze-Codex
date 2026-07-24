export type SombleClientInput = {
  name: string;
  email: string;
  sourceStatus: string;
  lastWorkoutAt: Date | null;
  lastLoginAt: Date | null;
  sourceJoinedAt: Date;
  totalWorkouts: number;
  appDownloaded: boolean;
  birthday: Date | null;
};

export type SombleTransactionInput = {
  transferredAt: Date;
  amountCents: number;
  contentType: string;
  supporterName: string;
  transferId: string;
  paymentId: string;
};

export type SombleImportSummary = {
  clientCount: number;
  transactionCount: number;
  transferredRevenueCents: number;
  revenueByType: Record<string, number>;
};

function parseCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }

  const [headers, ...dataRows] = rows.filter((item) =>
    item.some((value) => value.length > 0),
  );
  if (!headers) return [];

  return dataRows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

function requireColumns(rows: Record<string, string>[], columns: string[]) {
  const available = new Set(Object.keys(rows[0] ?? {}));
  for (const column of columns) {
    if (!available.has(column)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }
}

function requiredDate(value: string, label: string): Date {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}: ${value || '(blank)'}`);
  }
  return date;
}

function optionalDate(value: string): Date | null {
  return value ? requiredDate(value, 'date') : null;
}

export function parseSombleClients(csv: string): SombleClientInput[] {
  const rows = parseCsv(csv);
  requireColumns(rows, [
    'Client Name',
    'Email Address',
    'Status',
    'Last Workout',
    'Last Login',
    'Date Joined',
    'Total Workouts',
    'App Downloaded',
    'Birthday',
  ]);

  const emails = new Set<string>();
  return rows.map((row) => {
    const email = row['Email Address'].trim().toLowerCase();
    if (!email) throw new Error('Client email cannot be blank');
    if (emails.has(email)) throw new Error(`Duplicate client email: ${email}`);
    emails.add(email);
    return {
      name: row['Client Name'].trim(),
      email,
      sourceStatus: row.Status.trim().toLowerCase(),
      lastWorkoutAt: optionalDate(row['Last Workout']),
      lastLoginAt: optionalDate(row['Last Login']),
      sourceJoinedAt: requiredDate(row['Date Joined'], 'Date Joined'),
      totalWorkouts: Number.parseInt(row['Total Workouts'] || '0', 10),
      appDownloaded: row['App Downloaded'].trim().toLowerCase() === 'true',
      birthday: optionalDate(row.Birthday),
    };
  });
}

export function parseSombleTransactions(
  csv: string,
): SombleTransactionInput[] {
  const rows = parseCsv(csv);
  requireColumns(rows, [
    'transfer_date',
    'transfer_amount',
    'content_type',
    'supporter',
    'transfer_id',
    'payment_id',
  ]);

  const transferIds = new Set<string>();
  const paymentIds = new Set<string>();
  return rows.map((row) => {
    const transferId = row.transfer_id.trim();
    const paymentId = row.payment_id.trim();
    if (transferIds.has(transferId)) {
      throw new Error(`Duplicate Somble transfer_id: ${transferId}`);
    }
    if (paymentIds.has(paymentId)) {
      throw new Error(`Duplicate Somble payment_id: ${paymentId}`);
    }
    transferIds.add(transferId);
    paymentIds.add(paymentId);
    const amountCents = Math.round(Number(row.transfer_amount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
      throw new Error(`Invalid transfer amount: ${row.transfer_amount}`);
    }
    return {
      transferredAt: requiredDate(row.transfer_date, 'transfer_date'),
      amountCents,
      contentType: row.content_type.trim(),
      supporterName: row.supporter.trim().replace(/\s+/g, ' '),
      transferId,
      paymentId,
    };
  });
}

export function summarizeSombleImport(
  clients: SombleClientInput[],
  transactions: SombleTransactionInput[],
): SombleImportSummary {
  const revenueByType: Record<string, number> = {};
  for (const transaction of transactions) {
    revenueByType[transaction.contentType] =
      (revenueByType[transaction.contentType] ?? 0) + transaction.amountCents;
  }
  return {
    clientCount: clients.length,
    transactionCount: transactions.length,
    transferredRevenueCents: transactions.reduce(
      (total, transaction) => total + transaction.amountCents,
      0,
    ),
    revenueByType,
  };
}
