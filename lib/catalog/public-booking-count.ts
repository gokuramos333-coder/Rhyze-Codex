export const PUBLIC_BOOKING_COUNT_THRESHOLD = 10;

export function publicBookingCountLabel(
  booked: number,
  capacity: number,
): string | null {
  if (booked < PUBLIC_BOOKING_COUNT_THRESHOLD) return null;
  return `${booked}/${capacity} booked`;
}
