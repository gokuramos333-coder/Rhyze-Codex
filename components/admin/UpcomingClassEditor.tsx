'use client';
import Link from 'next/link';
import { useActionState, useState, useEffect } from 'react';
import { editUpcomingClassesAction } from '@/app/(studio)/admin/classes/[templateId]/upcoming-actions';
export type EditableClassDate = {
  id: string;
  updatedAt: string;
  startAt: string;
  endAt: string;
  title: string;
  instructorId: string | null;
  instructor: string;
  capacity: number;
  priceCents: number;
  publicNotes: string | null;
};
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
export function UpcomingClassEditor({
  templateId,
  dates,
  weekEnd,
  nowLabel,
  instructors,
}: {
  templateId: string;
  dates: EditableClassDate[];
  weekEnd: string;
  nowLabel: string;
  instructors: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(
    editUpcomingClassesAction,
    {},
  );
  const [view, setView] = useState(
    dates.some((d) => d.startAt < weekEnd) ? 'week' : 'all',
  );
  const [selected, setSelected] = useState<string[]>(
    dates[0] ? [dates[0].id] : [],
  );
  const [changeName, setChangeName] = useState(true);
  const [title, setTitle] = useState(dates[0]?.title || '');
  const [titleEdited, setTitleEdited] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const localDay = (iso: string) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  const visible = dates.filter((d) =>
    view === 'week'
      ? d.startAt < weekEnd
      : view === 'custom'
        ? (!from || localDay(d.startAt) >= from) &&
          (!to || localDay(d.startAt) <= to)
        : true,
  );
  const first = dates.find((d) => selected.includes(d.id)) || dates[0];
  useEffect(() => {
    if (!titleEdited) setTitle(first?.title || '');
  }, [first?.title, titleEdited]);
  const selectedDates = dates.filter((d) => selected.includes(d.id));
  const inputClass =
    'min-h-12 w-full rounded border border-black/25 bg-white px-3 text-base';
  const toggle = (key: string) =>
    setExtras((old) =>
      old.includes(key) ? old.filter((k) => k !== key) : [...old, key],
    );
  if (!dates.length)
    return (
      <div className="mt-6 border-l-4 border-rhyze-gold bg-white p-6">
        <p className="font-bold">No upcoming dates for this class.</p>
        <p className="mt-2 text-sm text-black/60">
          Past dates are retained below. Add a scheduled date before editing
          future classes.
        </p>
        <Link
          className="mt-4 inline-block font-bold underline"
          href="/admin/schedule"
        >
          Add a scheduled date
        </Link>
      </div>
    );
  return (
    <form action={action} className="mt-6" aria-label="Edit upcoming classes">
      <input type="hidden" name="templateId" value={templateId} />
      {dates.map((d) => (
        <input
          key={d.id}
          type="hidden"
          name={`version:${d.id}`}
          value={d.updatedAt}
        />
      ))}
      <div className="mb-5 border-l-4 border-rhyze-orange bg-white p-4 text-sm">
        <strong>Loaded at: {nowLabel}</strong>
        <p className="mt-1 text-black/65">
          New Jersey time · adjusts automatically for daylight saving. Only
          selected classes that have not started can change.
        </p>
      </div>
      {state.error && (
        <p
          role="alert"
          className="mb-5 border-l-4 border-red-700 bg-red-50 p-4 font-bold text-red-900"
        >
          {state.error}
        </p>
      )}
      {state.saved && (
        <p
          role="status"
          className="mb-5 border-l-4 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900"
        >
          Saved changes to {state.saved} upcoming{' '}
          {state.saved === 1 ? 'date' : 'dates'}. Past classes were not changed.
        </p>
      )}
      <fieldset
        disabled={pending}
        className="grid min-w-0 gap-6 xl:grid-cols-[1.2fr_1fr]"
      >
        <section className="min-w-0 border-t-4 border-rhyze-gold bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
            1 · Choose dates
          </p>
          <h2 className="mt-2 font-display text-3xl">TODAY & UPCOMING</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ['week', 'This week'],
              ['all', 'All upcoming'],
              ['custom', 'Choose dates'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`min-h-11 rounded border px-3 text-sm font-bold ${view === value ? 'border-black bg-black text-white' : 'border-black/20 bg-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'custom' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold">
                From (New Jersey)
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                Through (New Jersey)
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}
          <div className="my-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {visible.length} dates shown · {selected.length} selected (200
              max)
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                className="min-h-11 font-bold underline"
                onClick={() =>
                  setSelected(visible.slice(0, 200).map((d) => d.id))
                }
              >
                Select shown dates
              </button>
              <button
                type="button"
                className="min-h-11 underline"
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-[34rem] space-y-2 overflow-y-auto">
            {visible.map((d) => (
              <label
                key={d.id}
                className={`flex cursor-pointer items-start gap-3 rounded border p-4 ${selected.includes(d.id) ? 'border-rhyze-orange bg-orange-50' : 'border-black/15'}`}
              >
                <input
                  name="occurrenceId"
                  type="checkbox"
                  value={d.id}
                  checked={selected.includes(d.id)}
                  disabled={!selected.includes(d.id) && selected.length >= 200}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, d.id]
                        : old.filter((id) => id !== d.id),
                    )
                  }
                  className="mt-1 h-5 w-5 shrink-0"
                />
                <span>
                  <strong className="block text-sm">
                    {dateLabel(d.startAt)}
                  </strong>
                  <span className="mt-1 block font-bold">{d.title}</span>
                  <span className="mt-1 block text-sm text-black/60">
                    {d.instructor} ·{' '}
                    {(+new Date(d.endAt) - +new Date(d.startAt)) / 60000} min ·
                    ${(d.priceCents / 100).toFixed(2)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!visible.length && (
            <p className="py-6 text-black/60">
              No upcoming classes in this range. Choose “All upcoming” or
              another date range.
            </p>
          )}
          {selectedDates
            .filter((d) => !visible.includes(d))
            .map((d) => (
              <input
                key={d.id}
                type="hidden"
                name="occurrenceId"
                value={d.id}
              />
            ))}
        </section>
        <section className="min-w-0 self-start border-t-4 border-rhyze-coral bg-white p-5 xl:sticky xl:top-5">
          <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
            2 · Make changes
          </p>
          <h2 className="mt-2 font-display text-3xl">EDIT SELECTED DATES</h2>
          <p className="mt-3 text-sm text-black/65">
            Choose only the fields you want to change. Each date keeps its other
            settings.
          </p>
          <label className="mt-5 flex items-center gap-3 font-bold">
            <input
              className="h-5 w-5"
              type="checkbox"
              name="changeName"
              checked={changeName}
              onChange={(e) => setChangeName(e.target.checked)}
            />
            Change class name
          </label>
          {changeName && (
            <label className="mt-3 grid gap-2 text-sm font-bold">
              New class name
              <input
                name="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
                required
                minLength={2}
                maxLength={150}
                className={inputClass}
              />
            </label>
          )}
          <details className="mt-5 border-t border-black/10 pt-4">
            <summary className="cursor-pointer font-bold">
              Other class details
            </summary>
            {(
              ['Capacity', 'Duration', 'Price', 'Instructor', 'Notes'] as const
            ).map((key) => (
              <div key={key} className="mt-4">
                <label className="flex items-center gap-3 font-bold">
                  <input
                    type="checkbox"
                    name={`change${key}`}
                    className="h-5 w-5"
                    checked={extras.includes(key)}
                    onChange={() => toggle(key)}
                  />
                  Change {key.toLowerCase()}
                </label>
                {extras.includes(key) && (
                  <label className="mt-2 grid gap-2 text-sm">
                    {key === 'Duration'
                      ? 'Duration in minutes (start time stays the same)'
                      : key === 'Price'
                        ? 'Client drop-in price ($)'
                        : key === 'Notes'
                          ? 'Public notes'
                          : key}
                    {key === 'Instructor' ? (
                      <select
                        name="instructorId"
                        defaultValue={first?.instructorId || ''}
                        required
                        className={inputClass}
                      >
                        <option value="">Choose instructor</option>
                        {instructors.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    ) : key === 'Notes' ? (
                      <textarea
                        name="publicNotes"
                        maxLength={5000}
                        defaultValue={first?.publicNotes || ''}
                        className="min-h-24 rounded border p-3"
                      />
                    ) : (
                      <input
                        name={
                          key === 'Capacity'
                            ? 'capacity'
                            : key === 'Duration'
                              ? 'durationMinutes'
                              : 'price'
                        }
                        type="number"
                        required
                        min={key === 'Duration' ? 5 : 1}
                        max={
                          key === 'Duration'
                            ? 480
                            : key === 'Capacity'
                              ? 1000
                              : 10000
                        }
                        step={key === 'Price' ? '0.01' : 1}
                        defaultValue={
                          key === 'Capacity'
                            ? first?.capacity
                            : key === 'Duration'
                              ? (+new Date(first.endAt) -
                                  +new Date(first.startAt)) /
                                60000
                              : ((first?.priceCents || 0) / 100).toFixed(2)
                        }
                        className={inputClass}
                      />
                    )}
                  </label>
                )}
              </div>
            ))}
          </details>
          <div className="mt-6 rounded border border-rhyze-gold/50 bg-[#fff8dc] p-4 text-sm">
            <strong>{selected.length} dates will change</strong>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
              {selectedDates.map((d) => (
                <li key={d.id}>{dateLabel(d.startAt)}</li>
              ))}
            </ul>
            <p className="mt-3">
              Start dates and times stay unchanged. Past classes and unselected
              dates are preserved.
            </p>
          </div>
          <button
            disabled={!selected.length || (!changeName && !extras.length)}
            className="mt-5 min-h-12 w-full bg-rhyze-gradient px-5 text-sm font-black uppercase tracking-wider disabled:opacity-40"
          >
            {pending
              ? 'Saving…'
              : `Save ${selected.length} selected ${selected.length === 1 ? 'date' : 'dates'}`}
          </button>
          {selected.length === 1 && (
            <Link
              href={`/admin/schedule/${selected[0]}`}
              className="mt-4 block text-center text-sm font-bold underline"
            >
              Date/time, pay or cancellation settings for this date →
            </Link>
          )}
          <p className="mt-3 text-xs text-black/55">
            This updates the dates listed above. Newly added dates use their
            saved class format until you select and edit them.
          </p>
        </section>
      </fieldset>
    </form>
  );
}
