export type TransferWindow = 'FREE' | 'FEE_1000' | 'BLOCKED';

export function evaluateTransferWindow(
  classStart: Date,
  requestedAt: Date,
  isVip: boolean,
): TransferWindow {
  const minutes = (classStart.getTime() - requestedAt.getTime()) / 60_000;
  if (minutes <= 120) return 'BLOCKED';
  if (minutes <= 360 && !isVip) return 'FEE_1000';
  return 'FREE';
}
