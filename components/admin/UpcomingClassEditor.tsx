'use client';
import {
  useActionState,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import { useRouter } from 'next/navigation';
import { editUpcomingClassesAction } from '@/app/(studio)/admin/classes/[templateId]/upcoming-actions';
import { weeklyEditorDates } from '@/lib/domain/schedule/weekly-editor-dates';
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
  imageUrl?: string | null;
};
type Details = {
  title: string;
  publicNotes: string;
  instructorId: string;
  durationMinutes: string;
  capacity: string;
  price: string;
  imageUrl: string;
};
const local = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace(' ', 'T');
const label = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
const flags: Record<keyof Details, string> = {
  title: 'Name',
  publicNotes: 'Notes',
  instructorId: 'Instructor',
  durationMinutes: 'Duration',
  capacity: 'Capacity',
  price: 'Price',
  imageUrl: 'Image',
};
export function UpcomingClassEditor({
  templateId,
  dates,
  nowLabel,
  instructors,
  defaults,
  nowLocal,
}: {
  templateId: string;
  dates: EditableClassDate[];
  weekEnd?: string;
  nowLabel: string;
  instructors: Array<{ id: string; name: string }>;
  nowLocal?: string;
  defaults?: Partial<Details>;
}) {
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(
    editUpcomingClassesAction,
    {},
  );
  const [month, setMonth] = useState(
    ((dates[0] && local(dates[0].startAt)) || nowLocal || '').slice(0, 7),
  );
  const [selected, setSelected] = useState<string[]>(
    dates[0] ? [dates[0].id] : [],
  );
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [newStarts, setNewStarts] = useState<string[]>([]);
  const [repeatStart, setRepeatStart] = useState('');
  const [repeatEnd, setRepeatEnd] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState<string[]>([]);
  const first = dates.find((d) => selected.includes(d.id)) || dates[0];
  const values = useCallback(
    (): Details => ({
      title: first?.title || defaults?.title || '',
      publicNotes: first?.publicNotes ?? defaults?.publicNotes ?? '',
      instructorId: first?.instructorId || defaults?.instructorId || '',
      durationMinutes: first
        ? String((+new Date(first.endAt) - +new Date(first.startAt)) / 60000)
        : defaults?.durationMinutes || '50',
      capacity: String(first?.capacity ?? defaults?.capacity ?? 25),
      price: first
        ? (first.priceCents / 100).toFixed(2)
        : defaults?.price || '25.00',
      imageUrl: first?.imageUrl || defaults?.imageUrl || '',
    }),
    [first, defaults],
  );
  const [details, setDetails] = useState<Details>(values);
  useEffect(() => {
    const next = values();
    setDetails(
      (old) =>
        Object.fromEntries(
          Object.entries(next).map(([k, v]) => [
            k,
            dirty.includes(k) ? old[k as keyof Details] : v,
          ]),
        ) as Details,
    );
  }, [values, dirty]); // Preserve fields already edited when selecting another date.
  useEffect(() => {
    if (state.saved) {
      if (photoInput.current) photoInput.current.value = '';
      setNewStarts([]);
      setStarts({});
      setDirty([]);
      router.refresh();
    }
  }, [state.saved, state.savedAt, router]);
  const shown = dates.filter(
    (d) => !month || local(d.startAt).startsWith(month),
  );
  const chosen = dates.filter((d) => selected.includes(d.id));
  const mark = (key: string) =>
    setDirty((old) => (old.includes(key) ? old : [...old, key]));
  const change = (key: keyof Details, value: string) => {
    mark(key);
    setDetails((old) => ({ ...old, [key]: value }));
  };
  const changedTimes = chosen.filter(
    (d) => starts[d.id] && starts[d.id] !== local(d.startAt),
  );
  const changed =
    dirty.length > 0 || changedTimes.length > 0 || newStarts.length > 0;
  const input =
    'min-h-12 w-full min-w-0 rounded border border-black/25 bg-white px-3 text-base';
  function repeat() {
    try {
      const additions = weeklyEditorDates(repeatStart, repeatEnd);
      const existing = new Set([
        ...dates.map((d) => starts[d.id] || local(d.startAt)),
        ...newStarts,
      ]);
      const fresh = additions.filter((x) => !existing.has(x));
      if (newStarts.length + fresh.length + selected.length > 200)
        throw Error('Save at most 200 dates at once.');
      setNewStarts((old) => [...old, ...fresh]);
      setError(
        fresh.length < additions.length
          ? 'Existing dates were skipped. Select them above if you want to change their details.'
          : '',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form
      action={action}
      aria-label="Edit upcoming classes"
      className="mt-6 space-y-6"
    >
      <input type="hidden" name="templateId" value={templateId} />
      {first && <input type="hidden" name="sourceId" value={first.id} />}
      {chosen.map((d) => (
        <div key={d.id}>
          <input type="hidden" name="occurrenceId" value={d.id} />
          <input type="hidden" name={`version:${d.id}`} value={d.updatedAt} />
          {starts[d.id] && starts[d.id] !== local(d.startAt) && (
            <input type="hidden" name={`start:${d.id}`} value={starts[d.id]} />
          )}
        </div>
      ))}
      {(Object.keys(flags) as Array<keyof Details>)
        .filter(
          (k) => dirty.includes(k) || (newStarts.length > 0 && !chosen.length),
        )
        .map((k) => (
          <input key={k} type="hidden" name={`change${flags[k]}`} value="on" />
        ))}
      {state.error && (
        <p
          role="alert"
          className="border-l-4 border-red-700 bg-red-50 p-4 font-bold"
        >
          {state.error}
        </p>
      )}
      {state.saved && !changed && (
        <p
          role="status"
          className="border-l-4 border-emerald-700 bg-emerald-50 p-4 font-bold"
        >
          Saved {state.saved} scheduled {state.saved === 1 ? 'date' : 'dates'}.
          Your changes are on the schedule. Past and unselected classes were not
          changed.
        </p>
      )}
      <fieldset disabled={pending} className="space-y-6">
        <section className="border-t-4 border-rhyze-gold bg-white p-5 sm:p-7">
          <h2 className="font-display text-3xl">1. CLASS DETAILS</h2>
          <p className="mt-2 text-sm text-black/65">
            Change what you need. Changed fields apply to the selected dates and
            any dates you add below.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 font-bold sm:col-span-2">
              Class name
              <input
                name="title"
                required
                minLength={2}
                maxLength={150}
                className={input}
                value={details.title}
                onChange={(e) => change('title', e.target.value)}
              />
            </label>
            <label className="grid gap-2 font-bold sm:col-span-2">
              Class description / information
              <textarea
                name="publicNotes"
                maxLength={5000}
                className="min-h-32 rounded border border-black/25 p-3 font-normal"
                value={details.publicNotes}
                onChange={(e) => change('publicNotes', e.target.value)}
              />
            </label>
            <label className="grid gap-2 font-bold">
              Instructor
              <select
                name="instructorId"
                className={input}
                value={details.instructorId}
                onChange={(e) => change('instructorId', e.target.value)}
              >
                <option value="">Choose instructor</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['durationMinutes', 'Duration (minutes)', 5, 480, 1],
                ['capacity', 'Maximum guests', 1, 1000, 1],
                ['price', 'Price ($)', 1, 10000, 0.01],
              ] as const
            ).map(([key, title, min, max, step]) => (
              <label key={key} className="grid gap-2 font-bold">
                {title}
                <input
                  name={key}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  required
                  className={input}
                  value={details[key]}
                  onChange={(e) => change(key, e.target.value)}
                />
              </label>
            ))}
            <label className="grid gap-2 font-bold">
              Class image URL
              <input
                name="imageUrl"
                className={input}
                value={details.imageUrl}
                onChange={(e) => change('imageUrl', e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="grid gap-2 font-bold">
              Or upload a class photo
              <input
                ref={photoInput}
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="max-w-full text-sm font-normal"
                onChange={() => mark('imageUrl')}
              />
            </label>
          </div>
        </section>
        <section className="border-t-4 border-rhyze-orange bg-white p-5 sm:p-7">
          <h2 className="font-display text-3xl">2. DATES & TIMES</h2>
          <p className="mt-2 text-sm text-black/65">
            New Jersey time, including daylight saving. Loaded {nowLabel}.
            Select the dates to change, then adjust each date or time here.
          </p>
          <div className="my-5 flex flex-wrap items-end gap-4">
            <label className="grid gap-2 font-bold">
              Month
              <input
                type="month"
                className={input}
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setSelected([]);
                }}
              />
            </label>
            <button
              type="button"
              className="min-h-12 rounded border px-4 font-bold"
              onClick={() => setSelected(shown.map((d) => d.id).slice(0, 200))}
            >
              Select all dates in this month
            </button>
            <button
              type="button"
              className="min-h-12 px-3 underline"
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="min-h-12 px-3 underline"
              onClick={() => setMonth('')}
            >
              Show all upcoming
            </button>
          </div>
          {!shown.length && (
            <p className="rounded bg-stone-100 p-4">
              No upcoming dates in this month. Add dates below or choose another
              month.
            </p>
          )}
          <div className="space-y-3">
            {shown.map((d) => (
              <div
                key={d.id}
                className={`grid gap-3 rounded border p-4 md:grid-cols-[1fr_18rem] ${selected.includes(d.id) ? 'border-rhyze-orange bg-orange-50' : 'border-black/15'}`}
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, d.id]
                          : old.filter((x) => x !== d.id),
                      )
                    }
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <strong className="block">{label(d.startAt)}</strong>
                    <span className="block text-sm">
                      {d.title} · {d.instructor}
                    </span>
                  </span>
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  Date & time (New Jersey)
                  <input
                    aria-label={`Date and time for ${d.id}`}
                    type="datetime-local"
                    disabled={!selected.includes(d.id)}
                    value={starts[d.id] || local(d.startAt)}
                    onChange={(e) =>
                      setStarts((old) => ({ ...old, [d.id]: e.target.value }))
                    }
                    className={input}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded border border-black/15 bg-stone-50 p-4">
            <h3 className="font-bold">Add more dates for this class</h3>
            <p className="mt-1 text-sm">
              Add exact dates, or repeat weekly through the end date you choose.
              Existing dates are kept.
            </p>
            <div className="mt-4 grid items-end gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold">
                First date & time
                <input
                  type="datetime-local"
                  value={repeatStart}
                  onChange={(e) => setRepeatStart(e.target.value)}
                  className={input}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                Repeat weekly through
                <input
                  type="date"
                  value={repeatEnd}
                  onChange={(e) => setRepeatEnd(e.target.value)}
                  className={input}
                />
              </label>
              <button
                type="button"
                onClick={repeat}
                className="min-h-12 rounded border border-black px-3 font-bold"
              >
                Add weekly dates
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-3 font-bold text-red-700">
                {error}
              </p>
            )}
            <div className="mt-4 space-y-3">
              {newStarts.map((start, i) => (
                <div key={i} className="flex flex-wrap gap-3">
                  <label className="min-w-0 flex-1 text-sm font-bold">
                    New date {i + 1}
                    <input
                      required
                      name="newStartAt"
                      aria-label={`New date ${i + 1}`}
                      type="datetime-local"
                      className={input}
                      value={start}
                      onChange={(e) =>
                        setNewStarts((old) =>
                          old.map((x, n) => (n === i ? e.target.value : x)),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="min-h-12 self-end px-3 underline"
                    onClick={() =>
                      setNewStarts((old) => old.filter((_, n) => n !== i))
                    }
                  >
                    Remove new date {i + 1}
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setNewStarts((old) => [...old, ''])}
              className="mt-4 min-h-12 rounded border px-4 font-bold"
            >
              + Add one date
            </button>
          </div>
        </section>
        <section className="rounded border border-rhyze-gold bg-[#fff8dc] p-5">
          <h2 className="font-display text-3xl">3. REVIEW & SAVE</h2>
          <p className="mt-2 font-bold">
            {chosen.length} existing dates selected · {newStarts.length} new
            dates
          </p>
          <p className="mt-2 text-sm">
            {dirty.length
              ? `Changed details: ${dirty.map((k) => ({ title: 'name', publicNotes: 'description', instructorId: 'instructor', durationMinutes: 'duration', capacity: 'capacity', price: 'price', imageUrl: 'image' })[k]).join(', ')}.`
              : 'Existing class details stay the same.'}{' '}
            Only the dates listed here will change. Dates in other months are
            kept unless listed here.
          </p>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
            {chosen.map((d) => (
              <li key={d.id}>
                {label(d.startAt)}
                {starts[d.id] && starts[d.id] !== local(d.startAt)
                  ? ` → ${starts[d.id].replace('T', ' at ')} (New Jersey)`
                  : ' — keep date & time'}
              </li>
            ))}
            {newStarts.map((d, i) => (
              <li key={i}>
                ADD: {d ? d.replace('T', ' at ') : 'Choose a date and time'}{' '}
                (New Jersey)
              </li>
            ))}
          </ul>
          <button
            disabled={
              pending || !changed || (!chosen.length && !newStarts.length)
            }
            className="mt-5 min-h-12 w-full rounded bg-rhyze-gradient px-5 font-black disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save class & schedule'}
          </button>
          <p className="mt-2 text-xs">
            Nothing changes until you save. Past classes and unselected dates
            stay unchanged.
          </p>
        </section>
      </fieldset>
    </form>
  );
}
