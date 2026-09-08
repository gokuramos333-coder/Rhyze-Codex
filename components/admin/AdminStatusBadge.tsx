import React from 'react';

const statusStyles: Record<string, string> = {
  active: 'border-emerald-700/20 bg-emerald-100 text-emerald-900',
  native: 'border-sky-700/20 bg-sky-100 text-sky-900',
  'native rhyze': 'border-sky-700/20 bg-sky-100 text-sky-900',
  instructor: 'border-blue-700/20 bg-blue-100 text-blue-900',
  inactive: 'border-red-700/20 bg-red-100 text-red-900',
  admin: 'border-rhyze-orange/30 bg-orange-100 text-rhyze-black',
  'at-risk': 'border-amber-700/20 bg-amber-100 text-amber-950',
  invited: 'border-violet-700/20 bg-violet-100 text-violet-900',
  'to be claimed': 'border-amber-700/20 bg-amber-100 text-amber-950',
  test: 'border-cyan-700/20 bg-cyan-100 text-cyan-900',
  suspended: 'border-red-700/20 bg-red-100 text-red-900',
  archived: 'border-slate-600/20 bg-slate-200 text-slate-800',
  complete: 'border-emerald-700/20 bg-emerald-100 text-emerald-900',
  confirmed: 'border-emerald-700/20 bg-emerald-100 text-emerald-900',
  attended: 'border-emerald-700/20 bg-emerald-100 text-emerald-900',
  missing: 'border-red-700/20 bg-red-100 text-red-900',
  cancelled: 'border-red-700/20 bg-red-100 text-red-900',
  'late_cancelled': 'border-red-700/20 bg-red-100 text-red-900',
  'late cancelled': 'border-red-700/20 bg-red-100 text-red-900',
  'no_show': 'border-red-700/20 bg-red-100 text-red-900',
  'no show': 'border-red-700/20 bg-red-100 text-red-900',
  paused: 'border-amber-700/20 bg-amber-100 text-amber-950',
};

export function AdminStatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <span
      className={`inline-flex border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
        statusStyles[key] || 'border-rhyze-orange/30 bg-rhyze-orange/10 text-rhyze-black'
      }`}
    >
      {status}
    </span>
  );
}
