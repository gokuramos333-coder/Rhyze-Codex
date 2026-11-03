'use client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteClassScheduleAction } from '@/app/(studio)/admin/classes/[templateId]/delete-actions';
export type DeletableClassDate = {
  id: string;
  startAt: string;
  updatedAt: string;
  label: string;
  booked: number;
  waiting: number;
};
export function DeleteClassSchedule({
  templateId,
  dates,
}: {
  templateId: string;
  dates: DeletableClassDate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'one' | 'future'>('one');
  const [id, setId] = useState(dates[0]?.id || '');
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(
    deleteClassScheduleAction,
    {},
  );
  const revision = JSON.stringify(dates);
  useEffect(() => {
    setConfirmed(false);
  }, [revision]);
  useEffect(() => {
    if (state.completedAt) {
      setConfirmed(false);
      router.refresh();
    }
  }, [state.completedAt, router]);
  const chosen = scope === 'future' ? dates : dates.filter((d) => d.id === id);
  const signups = chosen.reduce((sum, d) => sum + d.booked + d.waiting, 0);
  const snapshot = chosen.map((d) => ({
    id: d.id,
    expectedStartAt: d.startAt,
    expectedUpdatedAt: d.updatedAt,
    booked: d.booked,
    waiting: d.waiting,
  }));
  return (
    <section className="mt-6 rounded border border-red-200 bg-white p-5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="delete-class-schedule"
        onClick={() => setOpen(!open)}
        className="min-h-12 rounded border border-red-700 px-5 font-bold text-red-800"
      >
        Delete from schedule
      </button>
      {open && (
        <div id="delete-class-schedule" className="mt-5">
          <h2 className="font-display text-3xl">
            Which classes should be removed?
          </h2>
          {state.error && (
            <p
              role="alert"
              className="mt-4 bg-red-50 p-4 font-bold text-red-800"
            >
              {state.error}{' '}
              <button
                type="button"
                onClick={() => router.refresh()}
                className="underline"
              >
                Refresh dates
              </button>
            </p>
          )}
          {state.completedAt && (
            <p role="status" className="mt-4 bg-emerald-50 p-4 font-bold">
              {state.removed
                ? `${state.removed} scheduled ${state.removed === 1 ? 'date was' : 'dates were'} removed.`
                : 'These dates were already removed.'}{' '}
              Past classes and payment history were kept.
            </p>
          )}
          {!dates.length ? (
            <p className="mt-4">There are no future dates to delete.</p>
          ) : (
            <form
              action={action}
              className="mt-4 space-y-4"
              aria-label="Delete class dates"
            >
              <input type="hidden" name="templateId" value={templateId} />
              <input type="hidden" name="scope" value={scope} />
              <input
                type="hidden"
                name="dates"
                value={JSON.stringify(snapshot)}
              />
              <fieldset disabled={pending} className="space-y-4">
                <legend className="sr-only">Deletion scope</legend>
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="radio"
                    name="deletionChoice"
                    checked={scope === 'one'}
                    onChange={() => {
                      setScope('one');
                      setConfirmed(false);
                    }}
                  />{' '}
                  This date only
                </label>
                {scope === 'one' && (
                  <label className="grid gap-2 font-bold">
                    Choose the exact class date and time
                    <select
                      value={id}
                      onChange={(e) => {
                        setId(e.target.value);
                        setConfirmed(false);
                      }}
                      className="min-h-12 w-full min-w-0 rounded border p-3 font-normal"
                    >
                      <option value="">Choose a date</option>
                      {dates.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="radio"
                    name="deletionChoice"
                    checked={scope === 'future'}
                    onChange={() => {
                      setScope('future');
                      setConfirmed(false);
                    }}
                  />{' '}
                  All future dates for this class
                </label>
                <div className="rounded border border-red-200 bg-red-50 p-4">
                  <p className="font-bold">
                    {chosen.length} {chosen.length === 1 ? 'date' : 'dates'}{' '}
                    will disappear from the schedule.
                  </p>
                  <p className="mt-2 text-sm">
                    {scope === 'future'
                      ? 'Includes every upcoming day, time and instructor under this class—not just the month shown above. Recurring scheduling for this class will be stopped.'
                      : 'Only the date selected here will be removed. Other dates stay on the schedule.'}{' '}
                    Past classes and payment history are kept.
                  </p>
                  <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
                    {chosen.map((d) => (
                      <li key={d.id}>
                        <strong>{d.label}</strong> · {d.booked} booked ·{' '}
                        {d.waiting} waiting
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm font-bold">
                    {signups
                      ? 'Only people booked or waiting on these dates will be notified. Reserved credits are returned once. Cash payments require staff review; no automatic refund is issued.'
                      : 'No signups: no customer email will be sent.'}
                  </p>
                </div>
                {chosen.length > 200 && (
                  <p role="alert">
                    There are more than 200 dates. Delete individual dates or
                    ask for a reviewed bulk removal.
                  </p>
                )}
                <label className="flex items-start gap-3 font-bold">
                  <input
                    type="checkbox"
                    name="confirmDelete"
                    value="yes"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-1 h-5 w-5"
                  />{' '}
                  I confirm: remove only the {chosen.length}{' '}
                  {chosen.length === 1 ? 'date' : 'dates'} listed above.
                </label>
                <button
                  disabled={
                    pending ||
                    !confirmed ||
                    !chosen.length ||
                    chosen.length > 200
                  }
                  className="min-h-12 rounded bg-red-700 px-5 font-bold text-white disabled:opacity-40"
                >
                  {pending
                    ? 'Removing…'
                    : scope === 'one'
                      ? 'Delete this date'
                      : `Delete all ${chosen.length} future dates`}
                </button>
              </fieldset>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
