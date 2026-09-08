export function chartTooltip(
  label: string,
  value: number,
  format: 'money' | 'count',
) {
  const formatted = format === 'money'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
    : new Intl.NumberFormat('en-US').format(value);
  return `${label}: ${formatted}`;
}
