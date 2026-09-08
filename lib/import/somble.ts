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

export type SombleAttendeeInput = {
  name: string;
  email: string;
  accessType: string;
  checkedIn: boolean;
};

export type GroupedSombleAttendee = {
  attendee: SombleAttendeeInput;
  guests: string[];
};

export type SombleMembershipInput = {
  planName: string;
  supporterName: string;
  supporterEmail: string;
  paymentStructure: string;
  paymentStructureAmount: number | string;
  creditsRemaining: number | null;
  status: string;
  paymentAmountCents: number;
  accessMethod: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  pausedAt: Date | null;
  unsubscribedAt: Date | null;
};

export type SombleImportSummary = {
  clientCount: number;
  transactionCount: number;
  transferredRevenueCents: number;
  revenueByType: Record<string, number>;
};

export type SombleMembershipStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED';

type SombleProductDefaultsInput = Pick<
  SombleMembershipInput,
  | 'planName'
  | 'paymentStructure'
  | 'paymentStructureAmount'
  | 'paymentAmountCents'
>;

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

export function parseSombleAttendees(csv: string): SombleAttendeeInput[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
  requireColumns(rows, [
    'display_name',
    'email_address',
    'access_type',
    'checked_in_status',
  ]);

  const emails = new Set<string>();
  return rows.map((row) => {
    const email = row.email_address.trim().toLowerCase();
    const name = row.display_name.trim().replace(/\s+/g, ' ');
    if (!email) throw new Error('Attendee email cannot be blank');
    if (emails.has(email)) {
      throw new Error(`Duplicate attendee email: ${email}`);
    }
    emails.add(email);
    return {
      name,
      email,
      accessType: row.access_type.trim().toLowerCase(),
      checkedIn: row.checked_in_status.trim().toLowerCase() === 'true',
    };
  });
}

export function groupSombleAttendees(
  attendees: SombleAttendeeInput[],
): GroupedSombleAttendee[] {
  const grouped = new Map<string, GroupedSombleAttendee>();
  for (const attendee of attendees) {
    const existing = grouped.get(attendee.email);
    if (!existing) {
      grouped.set(attendee.email, { attendee, guests: [] });
    } else {
      existing.guests.push(attendee.name);
    }
  }
  return [...grouped.values()];
}

export function parseSombleMemberships(csv: string): SombleMembershipInput[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
  requireColumns(rows, [
    'membership_name',
    'supporter_name',
    'supporter_email',
    'payment_structure',
    'payment_structure_amount',
    'credits_remaining',
    'status',
    'payment_amount',
    'access_method',
    'purchase_date',
    'expiration_date',
    'pause_date',
    'unsubscribe_date',
  ]);

  return rows.map((row) => {
    const supporterEmail = row.supporter_email.trim().toLowerCase();
    if (!supporterEmail) throw new Error('Membership email cannot be blank');

    const creditsRemaining = row.credits_remaining.trim()
      ? Number.parseInt(row.credits_remaining, 10)
      : null;
    if (
      creditsRemaining !== null &&
      (!Number.isSafeInteger(creditsRemaining) || creditsRemaining < 0)
    ) {
      throw new Error(`Invalid credits_remaining: ${row.credits_remaining}`);
    }

    const paymentAmountCents = Math.round(Number(row.payment_amount) * 100);
    if (!Number.isSafeInteger(paymentAmountCents) || paymentAmountCents < 0) {
      throw new Error(`Invalid payment_amount: ${row.payment_amount}`);
    }

    const paymentStructure = row.payment_structure.trim().toLowerCase();
    const paymentStructureAmount =
      paymentStructure === 'credits'
        ? Number(row.payment_structure_amount)
        : row.payment_structure_amount.trim().toLowerCase();
    if (
      paymentStructure === 'credits' &&
      (typeof paymentStructureAmount !== 'number' ||
        !Number.isFinite(paymentStructureAmount) ||
        paymentStructureAmount < 0)
    ) {
      throw new Error(
        `Invalid payment_structure_amount: ${row.payment_structure_amount}`,
      );
    }
    if (paymentStructure !== 'credits' && !paymentStructureAmount) {
      throw new Error('Invalid payment_structure_amount: (blank)');
    }

    return {
      planName: row.membership_name.trim(),
      supporterName: row.supporter_name.trim().replace(/\s+/g, ' '),
      supporterEmail,
      paymentStructure,
      paymentStructureAmount,
      creditsRemaining,
      status: row.status.trim().toLowerCase(),
      paymentAmountCents,
      accessMethod: row.access_method.trim().toLowerCase(),
      purchasedAt: requiredDate(row.purchase_date, 'purchase_date'),
      expiresAt: optionalDate(row.expiration_date),
      pausedAt: optionalDate(row.pause_date),
      unsubscribedAt: optionalDate(row.unsubscribe_date),
    };
  });
}

export function sombleMembershipStatus(
  status: string,
): SombleMembershipStatus {
  switch (status.trim().toLowerCase()) {
    case 'active':
      return 'ACTIVE';
    case 'paused':
      return 'PAUSED';
    case 'past_due':
    case 'past-due':
      return 'PAST_DUE';
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';
    case 'inactive':
    case 'expired':
      return 'EXPIRED';
    default:
      throw new Error(`Unsupported Somble membership status: ${status}`);
  }
}

export function sombleProductDefaults(input: SombleProductDefaultsInput) {
  const normalizedName = input.planName.trim().toLowerCase();
  const creditBased = input.paymentStructure === 'credits';
  const trial = normalizedName.includes('intro') || normalizedName.includes('trial');
  const vip = normalizedName.includes('vip');
  const promisedMonthlyCredits = normalizedName.includes('og rhyze tribe')
    ? 8
    : normalizedName === 'ritual'
      ? 8
      : normalizedName === 'elevate'
        ? 4
        : null;
  const isUnlimited = vip || trial;
  return {
    slug: `somble-${normalizedName
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
    description: 'Legacy Somble plan preserved for transferred members.',
    kind: trial
      ? ('INTRO_TRIAL' as const)
      : vip
        ? ('VIP' as const)
        : creditBased
          ? ('CLASS_PACK' as const)
          : ('LIMITED_MEMBERSHIP' as const),
    priceCents: input.paymentAmountCents,
    billingInterval: creditBased
      ? ('ONE_TIME' as const)
      : input.paymentStructureAmount === 'yearly'
        ? ('YEARLY' as const)
        : ('MONTHLY' as const),
    includedCredits: isUnlimited
      ? null
      : promisedMonthlyCredits ??
        (creditBased && typeof input.paymentStructureAmount === 'number'
        ? input.paymentStructureAmount
        : null),
    isUnlimited,
    isPublic: false,
    isActive: false,
    alwaysAvailable: false,
  };
}

export function sombleImportedCreditEntitlement(input: {
  creditsRemaining: number | null;
  includedCredits: number | null;
  isUnlimited: boolean;
}) {
  if (input.isUnlimited) {
    return { shouldCreate: true, isUnlimited: true, balance: null } as const;
  }

  const balance = input.creditsRemaining ?? input.includedCredits;
  return {
    shouldCreate: balance !== null,
    isUnlimited: false,
    balance,
  } as const;
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
