import type { BookingAccessType } from '@/lib/domain/bookings/cancellation-policy';

export type TransferWindow = 'FREE' | 'FEE_500' | 'BLOCKED';

export function evaluateTransferWindow(
  classStart: Date,
  requestedAt: Date,
  accessType: BookingAccessType,
): TransferWindow {
  const minutes = (classStart.getTime() - requestedAt.getTime()) / 60_000;
  if (minutes <= 120) return 'BLOCKED';
  if (minutes <= 360 && accessType === 'STANDARD') return 'FEE_500';
  return 'FREE';
}
