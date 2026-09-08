const paymentDateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatPaymentDateTime(date: Date) {
  return paymentDateTime.format(date);
}
