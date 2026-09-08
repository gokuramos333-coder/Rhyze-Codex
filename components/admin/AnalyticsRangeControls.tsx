import React from 'react';
import Link from 'next/link';
import type { AnalyticsRangeKey } from '@/lib/admin/analytics-range';

const periods: Array<{ key: AnalyticsRangeKey; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

export function AnalyticsRangeControls({
  basePath,
  active,
  from,
  to,
  preservedParams = {},
  anchor,
}: {
  basePath: string;
  active: AnalyticsRangeKey;
  from?: string;
  to?: string;
  preservedParams?: Record<string, string>;
  anchor?: string;
}) {
  const destination = (range: AnalyticsRangeKey) => {
    const params = new URLSearchParams({ ...preservedParams, range });
    const targetAnchor = anchor || (preservedParams.analytics === 'earnings' ? 'earnings' : '');
    return `${basePath}?${params.toString()}${targetAnchor ? `#${targetAnchor}` : ''}`;
  };
  return (
    <div className="mt-5 grid gap-3 border border-rhyze-orange/20 bg-orange-50 p-3 lg:grid-cols-[auto_1fr] lg:items-center">
      <div className="flex flex-wrap gap-2">
        {periods.map((period) => (
          <Link
            key={period.key}
            href={destination(period.key)}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest ${
              active === period.key
                ? 'bg-rhyze-black text-white'
                : 'border border-rhyze-black bg-white'
            }`}
          >
            {period.label}
          </Link>
        ))}
      </div>
      <form action={basePath} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="range" value="custom" />
        {Object.entries(preservedParams).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest">
          From
          <input name="from" type="date" defaultValue={from} required className="min-h-10 border border-rhyze-orange/30 bg-white px-3 text-sm font-normal" />
        </label>
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest">
          To
          <input name="to" type="date" defaultValue={to} required className="min-h-10 border border-rhyze-orange/30 bg-white px-3 text-sm font-normal" />
        </label>
        <button className="min-h-10 self-end bg-rhyze-gradient px-4 text-xs font-black uppercase tracking-widest">
          View dates
        </button>
      </form>
    </div>
  );
}
