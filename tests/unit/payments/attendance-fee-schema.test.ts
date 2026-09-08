import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('attendance fee persistence schema', () => {
  it('exposes distinct late-cancellation and no-show payment kinds', () => {
    const paymentKinds = Prisma.dmmf.datamodel.enums
      .find((item) => item.name === 'PaymentRecordKind')
      ?.values.map((item) => item.name);

    expect(paymentKinds).toEqual(expect.arrayContaining([
      'TRANSFER_FEE',
      'LATE_CANCELLATION_FEE',
      'NO_SHOW_FEE',
    ]));
  });

  it('stores the exact purchase-policy acknowledgement used at checkout', () => {
    const purchaseFields = Prisma.dmmf.datamodel.models
      .find((item) => item.name === 'Purchase')
      ?.fields.map((item) => item.name);

    expect(purchaseFields).toEqual(expect.arrayContaining([
      'policyAcceptedAt',
      'policyAcceptance',
    ]));
  });

  it('links each attendance-fee ledger entry to its booking', () => {
    const paymentFields = Prisma.dmmf.datamodel.models
      .find((item) => item.name === 'PaymentRecord')
      ?.fields.map((item) => item.name);

    expect(paymentFields).toContain('bookingId');
  });
});
