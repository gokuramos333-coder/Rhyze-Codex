import { WAITLIST_CAPACITY } from '@/lib/domain/bookings/booking-rules';

export function bookingAvailability(booked: number, capacity: number, waiting: number) {
  const soldOut = booked >= capacity;
  const waitlistFull = waiting >= WAITLIST_CAPACITY;
  return {
    soldOut, waitlistFull,
    label: soldOut ? waitlistFull ? 'Sold out · Waiting list full' : 'Sold out · Waiting list available' : 'Booking available',
  };
}
