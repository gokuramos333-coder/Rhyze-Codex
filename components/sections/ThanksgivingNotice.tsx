export function ThanksgivingNotice({ dateKey }: { dateKey: string }) {
  if (dateKey !== '2026-11-26') return null;
  return (
    <p data-calendar-notice-date={dateKey} className="my-2 max-w-full break-words text-sm font-bold leading-snug text-rhyze-orange">
      Happy Thanksgiving!
    </p>
  );
}
