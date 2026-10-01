'use client';
import { useDialogFocus } from './useDialogFocus';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  label,
  easternDate,
  outcomes,
  localSendCandidates,
  type Customer,
} from '@/lib/newsletters/domain';
import './newsletter.css';
import { contactStatusColors, membershipColors } from './status-colors';
type Entry = {
  id: string;
  actorName: string;
  actorInitials: string;
  type: string;
  method: string | null;
  attempt: number | null;
  outcome: string | null;
  note: string | null;
  occurredAt: string;
};
const LEADS_PER_PAGE = 50;

export function LeadsWorkspace({ userId }: { userId?: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]),
    [capture, setCapture] = useState(false),
    [staff, setStaff] = useState<{ id: string; name: string | null }[]>([]),
    [selected, setSelected] = useState<Customer | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [filter, setFilter] = useState('LEADS'),
    [q, setQ] = useState(''),
    [outcome, setOutcome] = useState(''),
    [draftOutcome, setDraftOutcome] = useState('NOT_CONTACTED'),
    [assigned, setAssigned] = useState(''),
    [days, setDays] = useState(30),
    [attendance, setAttendance] = useState(''),
    [follow, setFollow] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [page, setPage] = useState(1);
  const dialogRef = useDialogFocus(Boolean(selected && !userId), () =>
    setSelected(null),
  );
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/leads?days=' + days);
    const x = await r.json();
    if (!r.ok) throw Error(x.error);
    setCustomers(x.customers);
    setCapture(x.capture === true);
    setStaff(x.staff);
    if (userId)
      setSelected(x.customers.find((c: Customer) => c.id === userId) || null);
    return x.customers as Customer[];
  }, [days, userId]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function select(c: Customer) {
    setSelected(c);
    setError('');
    const r = await fetch('/api/admin/leads?userId=' + c.id);
    const x = await r.json();
    if (r.ok) setEntries(x.timeline);
    else setError(x.error);
  }
  useEffect(() => {
    if (userId)
      fetch('/api/admin/leads?userId=' + userId)
        .then((r) => r.json())
        .then((x) => setEntries(x.timeline || []));
  }, [userId]);
  useEffect(() => {
    setDraftOutcome(selected?.outcome || 'NOT_CONTACTED');
  }, [selected?.id, selected?.version, selected?.outcome]);
  const filtered = customers
    .filter(
      (c) =>
        (filter === 'ALL' || !c.activeMember) &&
        (filter !== 'ENGAGED' || c.strongSignals > 0 || c.recordedOpens > 0) &&
        (!q ||
          `${c.name} ${c.email} ${c.phone}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!outcome || c.outcome === outcome) &&
        (!assigned || c.assignedToId === assigned) &&
        (!attendance ||
          (attendance === 'ONE'
            ? c.classAttendance === 1
            : attendance === 'REPEAT'
              ? c.classAttendance > 1
              : c.eventAttendance > 0)) &&
        (!follow || (c.followUpAt && easternDate(c.followUpAt) <= follow)),
    )
    .sort((a, b) =>
      filter === 'ENGAGED' ? b.strongSignals - a.strongSignals : 0,
    );
  const pageCustomers = filtered.slice(
    (page - 1) * LEADS_PER_PAGE,
    page * LEADS_PER_PAGE,
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    const f = new FormData(event.currentTarget);
    const form = event.currentTarget;
    try {
      const type = String(f.get('type'));
      const date = String(f.get('followUp') || '');
      const body = {
        userId: selected.id,
        version: selected.version,
        operationKey: crypto.randomUUID(),
        type,
        method: f.get('method') || undefined,
        outcome: f.get('outcome') || undefined,
        note: f.get('note'),
        followUpAt: date
          ? localSendCandidates(date + 'T12:00', 'America/New_York')[0]
          : null,
        assignedToId: f.get('assigned') || null,
      };
      const r = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const x = await r.json();
      if (!r.ok) throw Error(x.error);
      const list = await load();
      await select(list.find((c) => c.id === selected.id)!);
      form.reset();
      setNotice('Saved to the shared timeline. No call or text was sent.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nl-workspace nl-leads">
      {capture && (
        <div className="nl-banner">
          <strong>LOCAL PREVIEW</strong> · Sample customers only. No calls,
          texts or emails are sent.
        </div>
      )}
      <div className="nl-eyebrow">Community · Client relationships</div>
      <div className="nl-heading-row">
        <div>
          <h1>{userId ? 'OUTREACH & NOTES' : 'MEMBERSHIP LEADS'}</h1>
          <p className="nl-muted">
            Track follow-ups, contact history and shared notes for your clients.
          </p>
        </div>
        {!userId && (
          <Link className="nl-button" href="/admin/members">
            All clients ↗
          </Link>
        )}
      </div>
      {notice && (
        <p className="nl-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="nl-error" role="alert">
          {error}
        </p>
      )}
      {!userId && (
        <>
          <div className="nl-stats">
            <div>
              <strong>{customers.filter((c) => !c.activeMember).length}</strong>
              <span>Non-members</span>
            </div>
            <div>
              <strong>
                {
                  customers.filter(
                    (c) =>
                      !c.activeMember &&
                      (c.strongSignals > 0 || c.recordedOpens > 0),
                  ).length
                }
              </strong>
              <span>Recent recorded engagement</span>
            </div>
            <div>
              <strong>
                {
                  customers.filter(
                    (c) => c.followUpAt && new Date(c.followUpAt) <= new Date(),
                  ).length
                }
              </strong>
              <span>Follow-ups due</span>
            </div>
          </div>
          <div className="nl-tabs">
            {[
              ['LEADS', 'Membership leads'],
              ['ENGAGED', 'Engaged non-members'],
              ['ALL', 'All customers'],
            ].map(([v, t]) => (
              <button
                key={v}
                className={filter === v ? 'active' : ''}
                onClick={() => {
                  setFilter(v);
                  setPage(1);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="nl-filters">
            <input
              aria-label="Find a customer"
              placeholder="Search name, email or phone…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Contact outcome"
              style={outcome ? contactStatusColors(outcome) : undefined}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option value="">All contact statuses</option>
              {outcomes.map((o) => (
                <option key={o} value={o}>
                  {label(o)}
                </option>
              ))}
            </select>
            <select
              aria-label="Assigned staff"
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
            >
              <option value="">All staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Attendance filter"
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
            >
              <option value="">All attendance</option>
              <option value="ONE">Exactly one class attended</option>
              <option value="REPEAT">Repeat class attendees</option>
              <option value="EVENT">Event attendees</option>
            </select>
            <label>
              Activity window
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[7, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>
            <label>
              Follow-up by
              <input
                type="date"
                value={follow}
                onChange={(e) => setFollow(e.target.value)}
              />
            </label>
          </div>
          <div className="nl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Membership / activity</th>
                  <th>Contact status</th>
                  <th>Last personal contact</th>
                  <th>Why follow up?</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageCustomers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={'/admin/members/' + c.id}>
                        <strong>{c.name}</strong>
                      </Link>
                      <small>{c.email}</small>
                      <small>{c.phone}</small>
                    </td>
                    <td>
                      <span className="nl-pill" style={membershipColors(c)}>
                        {c.membership}
                      </span>
                      <small>
                        {c.classAttendance} classes · {c.eventAttendance} events
                        attended
                      </small>
                      <small>{c.bookings} active/attended bookings</small>
                    </td>
                    <td>
                      <button
                        className="nl-status-button"
                        style={contactStatusColors(c.outcome)}
                        onClick={() => select(c)}
                      >
                        {label(c.outcome)} ▾
                      </button>
                      <small>
                        {c.attempts} personal attempts
                        {c.followUpAt
                          ? ' · Follow-up ' +
                            new Date(c.followUpAt).toLocaleDateString()
                          : ''}
                      </small>
                      {c.doNotContact && (
                        <small className="nl-danger">Do not contact</small>
                      )}
                    </td>
                    <td>
                      {c.lastContactedAt ? (
                        <>
                          <span className="nl-initials" title={c.lastStaff}>
                            {c.lastInitials}
                          </span>
                          <small>{c.lastStaff}</small>
                          <small>
                            {new Date(c.lastContactedAt).toLocaleString()}
                          </small>
                        </>
                      ) : (
                        'No personal contact logged'
                      )}
                    </td>
                    <td>
                      {c.signals.length ? (
                        c.signals.map((s) => <small key={s}>{s}</small>)
                      ) : (
                        <small>No recent recorded signals</small>
                      )}
                      <small>
                        {c.consent === 'OPTED_IN'
                          ? 'Marketing opt-in recorded'
                          : c.consent === 'OPTED_OUT'
                            ? 'Marketing opted out'
                            : 'Marketing consent unknown'}
                      </small>
                    </td>
                    <td>
                      <button className="nl-button" onClick={() => select(c)}>
                        Log outreach
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="nl-empty">No customers match these filters.</div>
            )}
          </div>
          <div className="nl-pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              {filtered.length} customers · Page {page}
            </span>
            <button
              disabled={page * LEADS_PER_PAGE >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {selected && (
        <div
          className={userId ? 'nl-profile-outreach' : 'nl-modal'}
          role={userId ? undefined : 'dialog'}
          ref={dialogRef}
          aria-modal={userId ? undefined : true}
          aria-label="Customer outreach"
        >
          <div className="nl-dialog">
            <div className="nl-heading-row">
              <div>
                <div className="nl-eyebrow">PERSONAL OUTREACH</div>
                <h2>{selected.name}</h2>
                <p>
                  {selected.membership} · {selected.classAttendance} classes
                  attended
                </p>
              </div>
              {!userId && (
                <button className="nl-button" onClick={() => setSelected(null)}>
                  Close
                </button>
              )}
            </div>
            <p className="nl-muted">
              Review recent activity before contacting. This form logs a
              completed action; it does not call or text anyone.
            </p>
            {selected.doNotContact && (
              <p className="nl-error">
                Do Not Contact is active. You can add notes or status updates;
                outreach is blocked.
              </p>
            )}
            <div className="nl-outreach-grid">
              <form
                key={selected.version}
                onSubmit={submit}
                className="nl-form"
              >
                <label>
                  Record type
                  <select name="type">
                    <option value="OUTREACH" disabled={selected.doNotContact}>
                      Completed call or text
                    </option>
                    <option value="STATUS">Status / follow-up update</option>
                    <option value="NOTE">Shared note</option>
                  </select>
                </label>
                <label>
                  Contact method
                  <select name="method">
                    <option value="TEXT">Texted</option>
                    <option value="CALL">Called</option>
                  </select>
                </label>
                <label>
                  Outcome
                  <select
                    name="outcome"
                    value={draftOutcome}
                    onChange={(e) => setDraftOutcome(e.target.value)}
                    style={contactStatusColors(draftOutcome)}
                  >
                    {outcomes.map((o) => (
                      <option key={o} value={o}>
                        {label(o)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Follow-up date
                  <input
                    type="date"
                    name="followUp"
                    defaultValue={
                      selected.followUpAt
                        ? easternDate(selected.followUpAt)
                        : ''
                    }
                  />
                </label>
                <label>
                  Assigned to
                  <select name="assigned" defaultValue={selected.assignedToId}>
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Shared note
                  <textarea
                    name="note"
                    rows={4}
                    placeholder="What would help the next staff member?"
                  />
                </label>
                <small>
                  Staff identity and time are recorded automatically.
                  “Converted” does not activate a membership.
                </small>
                <button className="nl-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save to timeline'}
                </button>
              </form>
              <div className="nl-timeline">
                <h3>Shared timeline</h3>
                {!entries.length && (
                  <p className="nl-muted">No outreach logged yet.</p>
                )}
                {entries.map((e) => (
                  <article key={e.id}>
                    <span className="nl-initials" title={e.actorName}>
                      {e.actorInitials}
                    </span>
                    <div>
                      <strong>
                        {e.type === 'OUTREACH'
                          ? `${e.method === 'CALL' ? 'Called' : 'Texted'} — Attempt ${e.attempt}`
                          : label(e.type)}
                      </strong>
                      <small>
                        {e.actorName} ·{' '}
                        {new Date(e.occurredAt).toLocaleString()}
                      </small>
                      {e.outcome && (
                        <p>
                          <span
                            className="nl-pill"
                            style={contactStatusColors(e.outcome)}
                          >
                            {label(e.outcome)}
                          </span>
                        </p>
                      )}
                      {e.note && <p>{e.note}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
