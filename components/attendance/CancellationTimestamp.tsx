export function CancellationTimestamp({ value }: { value: Date | null | undefined }) {
  if (!value) return null;
  return <p className="mt-2 text-sm font-bold text-red-800">
    Canceled <time dateTime={value.toISOString()}>{value.toLocaleString('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
    })}</time>
  </p>;
}
