export type BookingAccessType =
  | 'STANDARD'
  | 'INTRO_TRIAL'
  | 'VIP'
  | 'COMPLIMENTARY';

export type CancellationWindow = 'ADVANCE' | 'TRANSFER' | 'LATE';

export type CancellationPolicyDecision = {
  window: CancellationWindow;
  action: 'CANCEL' | 'RESCHEDULE';
  status: 'CANCELLED' | 'LATE_CANCELLED';
  feeCents: 0 | 500 | 1_000 | 1_500;
  restoreCredit: boolean;
  message: string;
  confirmLabel: string;
  requiresAcknowledgement?: boolean;
};

export function accessTypeForProductKind(
  productKind: string | null | undefined,
): BookingAccessType {
  if (productKind === 'INTRO_TRIAL') return 'INTRO_TRIAL';
  if (productKind === 'VIP') return 'VIP';
  return 'STANDARD';
}

function cancellationWindow(startAt: Date, requestedAt: Date): CancellationWindow {
  const minutesUntilClass = (startAt.getTime() - requestedAt.getTime()) / 60_000;
  if (minutesUntilClass <= 120) return 'LATE';
  if (minutesUntilClass <= 360) return 'TRANSFER';
  return 'ADVANCE';
}

export function cancellationPolicyDecision(input: {
  startAt: Date;
  requestedAt: Date;
  accessType: BookingAccessType;
  isEvent: boolean;
  hasReservedCredit: boolean;
}): CancellationPolicyDecision {
  const window = cancellationWindow(input.startAt, input.requestedAt);

  if (input.isEvent) {
    if (window === 'ADVANCE') {
      return {
        window: 'ADVANCE',
        action: 'CANCEL',
        status: 'CANCELLED',
        feeCents: 0,
        restoreCredit: true,
        message: 'Thanks for letting us know early. If you cancel now, your event credit will be returned to your portal as an event-only credit. You must rebook another event within 30 days or the event credit expires.',
        confirmLabel: 'I understand — cancel and return my event credit',
        requiresAcknowledgement: true,
      };
    }
    if (window === 'TRANSFER') {
      return {
        window: 'TRANSFER',
        action: 'CANCEL',
        status: 'CANCELLED',
        feeCents: 500,
        restoreCredit: true,
        message: 'Cancelations within 6hrs have a transfer fee of $5. If you proceed, your event credit will be returned to your portal as an event-only credit. You must rebook another event within 30 days or the event credit expires. Do you wish to proceed with canceling?',
        confirmLabel: 'I understand — cancel and charge $5',
        requiresAcknowledgement: true,
      };
    }
    return {
      window: 'LATE',
      action: 'CANCEL',
      status: 'LATE_CANCELLED',
      feeCents: 0,
      restoreCredit: false,
      message: 'This event starts within 2 hours. If you cancel now, you will lose your event credit and no replacement event credit will be returned. Do you wish to proceed with canceling?',
      confirmLabel: 'I understand — cancel and lose my event credit',
      requiresAcknowledgement: true,
    };
  }

  if (window === 'ADVANCE') {
    const returnsCredit = input.hasReservedCredit;
    return {
      window,
      action: 'CANCEL',
      status: 'CANCELLED',
      feeCents: 0,
      restoreCredit: returnsCredit,
      message: returnsCredit
        ? 'Thanks for letting us know early. If you cancel now, your class credit will be returned to your account.'
        : 'Thanks for letting us know early. You can cancel this booking with no fee.',
      confirmLabel: returnsCredit ? 'Cancel and return my credit' : 'Cancel booking',
    };
  }

  if (window === 'TRANSFER') {
    if (input.accessType === 'STANDARD') {
      return {
        window,
        action: 'RESCHEDULE',
        status: 'CANCELLED',
        feeCents: 500,
        restoreCredit: false,
        message: 'This class starts within 6 hours. You may move this booking to another eligible class within 14 days. A $5 transfer fee will be charged to your saved card only after you choose and confirm the new class.',
        confirmLabel: 'Choose another class',
      };
    }
    if (input.accessType === 'VIP') {
      return {
        window,
        action: 'RESCHEDULE',
        status: 'CANCELLED',
        feeCents: 0,
        restoreCredit: false,
        message: 'This class starts within 6 hours. As a VIP member, you may move this booking to another eligible class within 14 days with no transfer fee.',
        confirmLabel: 'Choose another class',
      };
    }
    return {
      window,
      action: 'CANCEL',
      status: 'CANCELLED',
      feeCents: 0,
      restoreCredit: false,
      message: input.accessType === 'INTRO_TRIAL'
        ? 'This class starts within 6 hours. No fee applies right now, but early notice helps another Rhyzer take the spot.'
        : 'This class starts within 6 hours. Cancel only if you cannot attend so another Rhyzer can take the spot.',
      confirmLabel: 'Cancel booking',
    };
  }

  if (input.accessType === 'INTRO_TRIAL') {
    return {
      window,
      action: 'CANCEL',
      status: 'LATE_CANCELLED',
      feeCents: 1_000,
      restoreCredit: false,
      message: 'This class starts within 2 hours. A $10 late-cancellation fee will be charged to your saved card if you cancel now.',
      confirmLabel: 'Cancel and charge $10',
    };
  }
  if (input.accessType === 'VIP') {
    return {
      window,
      action: 'CANCEL',
      status: 'LATE_CANCELLED',
      feeCents: 1_000,
      restoreCredit: false,
      message: 'This class starts within 2 hours. A $10 late-cancellation fee will be charged to your saved card if you cancel now.',
      confirmLabel: 'Cancel and charge $10',
    };
  }
  if (input.accessType === 'STANDARD') {
    return {
      window,
      action: 'CANCEL',
      status: 'LATE_CANCELLED',
      feeCents: 1_000,
      restoreCredit: false,
      message: 'This class starts within 2 hours. If you cancel now, your class credit will not be returned and a $10 late-cancellation fee will be charged to your saved card.',
      confirmLabel: 'Cancel and charge $10',
    };
  }
  return {
    window,
    action: 'CANCEL',
    status: 'LATE_CANCELLED',
    feeCents: 0,
    restoreCredit: false,
    message: 'This class starts within 2 hours. If you cancel now, the booking will be marked as a late cancellation and the class credit will not be returned.',
    confirmLabel: 'Cancel booking',
  };
}
