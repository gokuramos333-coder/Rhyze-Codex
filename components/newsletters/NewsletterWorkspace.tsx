'use client';
import { useDialogFocus } from './useDialogFocus';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  defaultAudience,
  easternDate,
  label,
  resolveAudience,
} from '@/lib/newsletters/domain';
import { NewsletterEditor } from './NewsletterEditor';
import { command, type Bundle, type Campaign, type Template } from './types';
import './newsletter.css';
const tabs = [
  'Overview',
  'Templates',
  'Drafts',
  'Scheduled',
  'History',
  'Analytics',
  'Audience groups',
  'Suppressions',
  'Email settings',
];
const metric = (v: number | null | undefined) =>
  v === null || v === undefined ? 'Unavailable' : v.toLocaleString();
const pct = (v: number | null) =>
  v === null ? 'Unavailable' : (v * 100).toFixed(1) + '%';
export function NewsletterWorkspace() {
  const [data, setData] = useState<Bundle | null>(null),
    [tab, setTab] = useState('Overview'),
    [selected, setSelected] = useState<Campaign | null>(null),
    [master, setMaster] = useState<Template | undefined>(),
    [history, setHistory] = useState<Campaign | null>(null),
    [detail, setDetail] = useState('Email'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [kind, setKind] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [consentPage, setConsentPage] = useState(1),
    [sender, setSender] = useState(''),
    [audienceFilter, setAudienceFilter] = useState(''),
    [recipientFilter, setRecipientFilter] = useState('ALL'),
    [page, setPage] = useState(1),
    [showArchived, setShowArchived] = useState(false);
  const dialogRef = useDialogFocus(Boolean(history), () => setHistory(null));
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/newsletters');
    const x = await r.json();
    if (!r.ok) throw Error(x.error);
    setData(x);
    return x as Bundle;
  }, []);
  useEffect(() => {
    load()
      .then((x) => {
        const id = new URLSearchParams(window.location.search).get('campaign');
        const draft = x.campaigns.find(
          (c) => c.id === id && c.document && !c.sentSnapshot,
        );
        if (draft) setSelected(draft);
      })
      .catch((e) => setError(e.message));
  }, [load]);
  async function viewCampaign(c: Campaign) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(
        '/api/admin/newsletters?detail=1&id=' + encodeURIComponent(c.id),
      );
      const x = await r.json();
      if (!r.ok) throw Error(x.error);
      setHistory(x.campaign);
      setDetail('Email');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(body: unknown, done?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await command(body);
      await load();
      if (done) setNotice(done);
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(input: object) {
    const result = await action({ action: 'create', ...input });
    if (result?.id) {
      const fresh = await load();
      setMaster(undefined);
      setSelected(fresh.campaigns.find((c) => c.id === result.id)!);
    }
  }
  async function refresh() {
    await load();
  }
  if (!data)
    return (
      <section className="nl-workspace">
        <h1>NEWSLETTERS</h1>
        <p role={error ? 'alert' : 'status'}>
          {error || 'Loading your newsletter workspace…'}
        </p>
        {error && (
          <button
            className="nl-button"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Try again
          </button>
        )}
      </section>
    );
  const eligibility = resolveAudience(data.customers, defaultAudience());
  const sent = data.campaigns.filter((c) =>
    ['SENT', 'PARTIALLY_SENT'].includes(c.status),
  );
  const rows = data.campaigns.filter(
    (c) =>
      (showArchived || !c.archivedAt) &&
      (!q ||
        `${c.name} ${c.subject}`.toLowerCase().includes(q.toLowerCase())) &&
      (!kind || c.templateType === kind) &&
      (!statusFilter || c.status === statusFilter) &&
      (!sender || c.createdBy.name === sender) &&
      (!audienceFilter ||
        c.audience?.groups.includes(audienceFilter as never)) &&
      (!from ||
        easternDate(c.sentAt || c.scheduledFor || c.createdAt) >= from) &&
      (!to || easternDate(c.sentAt || c.scheduledFor || c.createdAt) <= to) &&
      (tab === 'Drafts'
        ? ['DRAFT', 'NEEDS_REVIEW'].includes(c.status)
        : tab === 'Scheduled'
          ? ['SCHEDULED', 'SENDING'].includes(c.status)
          : tab === 'History' || tab === 'Analytics'
            ? c.templateType === 'LEGACY' ||
              ['SENT', 'PARTIALLY_SENT', 'FAILED', 'CANCELLED'].includes(
                c.status,
              )
            : true),
  );
  rows.sort(
    (a, b) =>
      new Date(b.sentAt || b.scheduledFor || b.createdAt).getTime() -
      new Date(a.sentAt || a.scheduledFor || a.createdAt).getTime(),
  );
  function editMaster(t: Template) {
    setMaster(t);
    setSelected({
      id: t.id,
      name: t.name,
      subject: t.subject,
      previewText: t.previewText,
      document: t.document,
      version: t.version,
      templateType: t.type,
      audience: defaultAudience(),
      targetWeek: data!.week,
      scheduleMode: 'AUTO',
      status: 'DRAFT',
    } as Campaign);
  }
  const table = (list: Campaign[]) => (
    <>
      <div className="nl-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Audience</th>
              <th>Send date / creator</th>
              <th>Status</th>
              <th>Recorded results</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.slice((page - 1) * 15, page * 15).map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <small>{c.subject}</small>
                  <small>{label(c.templateType)}</small>
                  {c.holdReason && (
                    <small className="nl-danger">{c.holdReason}</small>
                  )}
                </td>
                <td>
                  {c.audience?.groups.map(label).join(' + ') ||
                    'Legacy audience'}
                  <small>
                    {c.recipients.length
                      ? c.metrics.eligible + ' eligible recipients'
                      : 'Audience reviewed before sending'}
                  </small>
                </td>
                <td>
                  {c.sentAt
                    ? new Date(c.sentAt).toLocaleString('en-US', {
                        timeZone: c.timezone || 'America/New_York',
                      })
                    : c.scheduledFor
                      ? new Date(c.scheduledFor).toLocaleString('en-US', {
                          timeZone: c.timezone || 'America/New_York',
                        })
                      : 'Not scheduled'}
                  <small>
                    {c.timezone || 'America/New_York'} ·{' '}
                    {c.createdBy.name || 'Admin'}
                  </small>
                </td>
                <td>
                  <span
                    className={
                      'nl-pill ' +
                      (c.status === 'SENT'
                        ? 'green'
                        : c.status === 'NEEDS_REVIEW'
                          ? 'orange'
                          : '')
                    }
                  >
                    {c.metrics.captured > 0 ? 'Captured' : label(c.status)}
                  </span>
                  {c.metrics.captured > 0 && (
                    <small>Local capture · not delivered</small>
                  )}
                </td>
                <td>
                  {c.templateType === 'LEGACY' ? (
                    <small>
                      Historical metrics unavailable; inspect retained archive
                    </small>
                  ) : (
                    <>
                      <strong>{c.metrics.delivered} delivered</strong>
                      <small>
                        {metric(c.metrics.uniqueOpens)} unique opens
                      </small>
                      <small>
                        {metric(c.metrics.uniqueClicks)} unique clicks
                      </small>
                    </>
                  )}
                </td>
                <td>
                  <div className="nl-actions">
                    {c.document && !c.sentSnapshot && (
                      <button
                        className="nl-button"
                        onClick={() => {
                          setMaster(undefined);
                          setSelected(c);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="nl-button"
                      onClick={() => {
                        void viewCampaign(c);
                      }}
                    >
                      View
                    </button>
                    <button
                      className="nl-button"
                      disabled={busy}
                      title={
                        !c.document
                          ? 'Copy legacy text into a new draft for review'
                          : undefined
                      }
                      onClick={() => create({ duplicateId: c.id })}
                    >
                      Duplicate
                    </button>
                    {['SCHEDULED', 'SENDING', 'NEEDS_REVIEW'].includes(
                      c.status,
                    ) && (
                      <button
                        className="nl-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Stop unsent recipients? Already-dispatched messages cannot be recalled.',
                            )
                          )
                            action(
                              { action: 'cancel', id: c.id },
                              'Unsent delivery cancelled.',
                            );
                        }}
                      >
                        Cancel send
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && (
          <div className="nl-empty">
            <h3>Room for your next good message.</h3>
            <p>No campaigns match this view. Start with a branded template.</p>
            <button className="nl-primary" onClick={() => setTab('Templates')}>
              Explore templates
            </button>
          </div>
        )}
      </div>
      {list.length > 15 && (
        <div className="nl-pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} · {list.length} campaigns
          </span>
          <button
            disabled={page * 15 >= list.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
  return (
    <section className="nl-workspace">
      {data.capture && (
        <div className="nl-banner">
          <strong>LOCAL PREVIEW</strong> · Isolated sample customers and
          schedule · Emails are captured here, never delivered
        </div>
      )}
      {selected ? (
        <NewsletterEditor
          key={selected.id + (master ? 'master' : '')}
          campaign={selected}
          master={master}
          bundle={data}
          onSaved={refresh}
          onClose={() => {
            setSelected(null);
            setMaster(undefined);
            refresh();
          }}
        />
      ) : (
        <>
          <div className="nl-eyebrow">THE RHYZE CONNECTION</div>
          <div className="nl-heading-row">
            <div>
              <h1>NEWSLETTERS</h1>
              <p className="nl-muted">
                Good energy, delivered thoughtfully. Keep your community in the
                loop.
              </p>
            </div>
            <div className="nl-actions">
              <Link className="nl-button" href="/admin/members/leads">
                Membership leads ↗
              </Link>
              <button
                className="nl-primary coral"
                onClick={() => setTab('Templates')}
              >
                ＋ Create newsletter
              </button>
            </div>
          </div>
          {notice && (
            <p role="status" className="nl-notice">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="nl-error">
              {error}
            </p>
          )}
          <div className="nl-stats">
            <div>
              <strong>{eligibility.eligible.length}</strong>
              <span>Eligible marketing subscribers</span>
            </div>
            <div>
              <strong>
                {data.campaigns.filter((c) => c.status === 'DRAFT').length}
              </strong>
              <span>Drafts to make your own</span>
            </div>
            <div>
              <strong>
                {data.campaigns.filter((c) => c.status === 'SCHEDULED').length}
              </strong>
              <span>Scheduled campaigns</span>
            </div>
            <div>
              <strong>{sent.length}</strong>
              <span>
                {data.capture
                  ? 'Completed preview campaigns'
                  : 'Sent / partially sent campaigns'}
              </span>
            </div>
          </div>
          <div className="nl-tabs">
            {tabs.map((t) => (
              <button
                key={t}
                className={tab === t ? 'active' : ''}
                onClick={() => {
                  setTab(t);
                  setPage(1);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'Overview' && (
            <>
              <div className="nl-hero">
                <div>
                  <div className="nl-eyebrow">
                    A LITTLE MOVEMENT. A LOT OF COMMUNITY.
                  </div>
                  <h2>
                    Your weekly schedule,
                    <br />
                    ready for your touch.
                  </h2>
                  <p>
                    Load the right week’s classes and events, add a personal
                    note, and review who will receive it.
                  </p>
                  <div className="nl-actions" style={{ marginTop: 24 }}>
                    <button
                      className="nl-primary coral"
                      onClick={() => create({ templateType: 'WEEKLY' })}
                    >
                      Create weekly schedule
                    </button>
                    <button
                      className="nl-button"
                      onClick={() => create({ lastWeekly: true })}
                    >
                      Duplicate last weekly
                    </button>
                  </div>
                </div>
                <div className="nl-hero-preview">
                  <span>RHYZE FITNESS · IN RHYTHM, WE RISE.</span>
                  <strong>
                    This week,
                    <br />
                    find your rhythm.
                  </strong>
                  <p>
                    Fresh classes. Familiar faces.
                    <br />A little time just for you.
                  </p>
                </div>
              </div>
              <div className="nl-heading-row">
                <h2>Your latest campaigns</h2>
                <button className="nl-button" onClick={() => setTab('History')}>
                  Campaign history →
                </button>
              </div>
              {table(rows.slice(0, 5))}
              {data.capture && (
                <div className="nl-panel" style={{ marginTop: 24 }}>
                  <h3>Try the server queue safely</h3>
                  <p className="nl-muted">
                    Confirm a preview campaign first, then run the same
                    dispatcher using local capture. Scheduled campaigns wait
                    until their chosen time.
                  </p>
                  <button
                    className="nl-button"
                    disabled={busy}
                    onClick={() =>
                      action(
                        { action: 'capture' },
                        'Preview queue processed. Inspect the campaign and Email archive for captured content.',
                      )
                    }
                  >
                    Run preview queue
                  </button>
                </div>
              )}
            </>
          )}
          {tab === 'Templates' && (
            <>
              <div className="nl-heading-row">
                <div>
                  <h2>A starting point for every story.</h2>
                  <p className="nl-muted">
                    15 editable layouts. Your campaign edits never overwrite a
                    master template.
                  </p>
                </div>
                <button
                  className="nl-button"
                  onClick={() => create({ lastWeekly: true })}
                >
                  Duplicate last weekly schedule
                </button>
              </div>
              <div className="nl-grid">
                {data.catalog.map((t) => (
                  <article className="nl-template" key={t.type}>
                    <div className="nl-template-art">
                      <Image
                        unoptimized
                        src="/brand/rhyze-logo-dark.png"
                        width={110}
                        height={70}
                        alt="Rhyze Fitness"
                      />
                      <strong>{t.subject}</strong>
                    </div>
                    <div className="nl-template-body">
                      <h3>{t.name}</h3>
                      <p>{t.previewText}</p>
                      <button
                        className="nl-button"
                        disabled={busy}
                        onClick={() => create({ templateType: t.type })}
                      >
                        Use template →
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <h2 style={{ margin: '32px 0 20px' }}>Your saved templates</h2>
              {!data.templates.length && (
                <p className="nl-muted">
                  Save a draft as a template to reuse its design.
                </p>
              )}
              <div className="nl-grid">
                {data.templates.map((t) => (
                  <article key={t.id} className="nl-panel">
                    <h3>{t.name}</h3>
                    <p className="nl-muted">
                      {t.subject} · Version {t.version}
                    </p>
                    <div className="nl-actions">
                      <button
                        className="nl-button"
                        onClick={() => create({ templateId: t.id })}
                      >
                        Create campaign
                      </button>
                      <button
                        className="nl-button"
                        onClick={() => editMaster(t)}
                      >
                        Edit master
                      </button>
                      <button
                        className="nl-button"
                        onClick={() =>
                          action(
                            { action: 'duplicateTemplate', id: t.id },
                            'Template duplicated.',
                          )
                        }
                      >
                        Duplicate template
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {['Drafts', 'Scheduled', 'History', 'Analytics'].includes(tab) && (
            <>
              <div className="nl-heading-row">
                <h2>
                  {tab === 'History'
                    ? 'Campaign history / previous blasts'
                    : tab === 'Scheduled'
                      ? 'Scheduled emails'
                      : tab}
                </h2>
                <button className="nl-button" onClick={refresh}>
                  Refresh results
                </button>
              </div>
              <div className="nl-filters">
                <input
                  aria-label="Search campaigns"
                  placeholder="Campaign or subject…"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
                <select
                  aria-label="Campaign type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="">All templates</option>
                  {data.catalog.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Campaign creator"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                >
                  <option value="">All creators</option>
                  {[
                    ...new Set(
                      data.campaigns
                        .map((c) => c.createdBy.name)
                        .filter(Boolean),
                    ),
                  ].map((n) => (
                    <option key={n!}>{n}</option>
                  ))}
                </select>
                <select
                  aria-label="Audience filter"
                  value={audienceFilter}
                  onChange={(e) => setAudienceFilter(e.target.value)}
                >
                  <option value="">All audiences</option>
                  {['ALL', 'MEMBERS', 'NON_MEMBERS', 'ENGAGED', 'FORMER'].map(
                    (a) => (
                      <option key={a} value={a}>
                        {label(a)}
                      </option>
                    ),
                  )}
                </select>
                <select
                  aria-label="Campaign status"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {[
                    'DRAFT',
                    'SCHEDULED',
                    'NEEDS_REVIEW',
                    'SENDING',
                    'PARTIALLY_SENT',
                    'SENT',
                    'CANCELLED',
                    'FAILED',
                  ].map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Date range"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const date = new Date();
                    if (e.target.value === 'year') {
                      setFrom(easternDate(date).slice(0, 4) + '-01-01');
                    } else if (n) {
                      date.setDate(date.getDate() - n);
                      setFrom(easternDate(date));
                    } else setFrom('');
                    setTo('');
                  }}
                >
                  <option value="">All dates / custom</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="year">This year</option>
                </select>
                <label>
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />{' '}
                    Include archived
                  </span>
                </label>
              </div>
              {tab === 'Analytics' && (
                <div className="nl-panel">
                  <p className="nl-muted">
                    Recorded opens are tracking events, not proof of reading.
                    Unknown/automated activity is labeled in recipient detail.
                    Compare audiences and sample size before drawing conclusions
                    about subjects or send times.
                  </p>
                  <div className="nl-stats">
                    <div>
                      <strong>
                        {rows.reduce((n, c) => n + c.metrics.accepted, 0)}
                      </strong>
                      <span>Provider accepted</span>
                    </div>
                    <div>
                      <strong>
                        {rows.reduce((n, c) => n + c.metrics.delivered, 0)}
                      </strong>
                      <span>Confirmed delivered</span>
                    </div>
                    <div>
                      <strong>
                        {data.settings.opensSupported
                          ? rows.reduce(
                              (n, c) => n + (c.metrics.uniqueOpens || 0),
                              0,
                            )
                          : 'Unavailable'}
                      </strong>
                      <span>Unique opens across campaigns</span>
                    </div>
                    <div>
                      <strong>
                        {
                          data.outcomes.filter((o) =>
                            rows.some((c) => c.id === o.campaignId),
                          ).length
                        }
                      </strong>
                      <span>Outcomes following qualifying clicks</span>
                    </div>
                  </div>
                  <small>
                    Soft-bounce detail is unavailable unless supplied by the
                    provider. Attribution uses the last qualifying click within{' '}
                    {data.settings.attributionDays} days, once per
                    booking/purchase; it does not prove causation.
                  </small>
                </div>
              )}
              {table(rows)}
            </>
          )}
          {tab === 'Audience groups' && (
            <>
              <h2>The right message, to the right people.</h2>
              <p className="nl-muted">
                Existing customer records and newsletter signups. Having an
                account is not marketing consent.
              </p>
              <div className="nl-grid">
                {[
                  'ALL',
                  'MEMBERS',
                  'NON_MEMBERS',
                  'ENGAGED',
                  'ONE_CLASS',
                  'REPEAT_CLASSES',
                  'ONE_EVENT',
                  'EVENT_NON_MEMBERS',
                  'FORMER',
                  'LOW_ENGAGEMENT',
                ].map((g) => {
                  const a = { ...defaultAudience(), groups: [g as 'ALL'] };
                  const count = resolveAudience(data.customers, a);
                  return (
                    <article className="nl-panel" key={g}>
                      <h3>{label(g)}</h3>
                      <p>
                        <strong>{count.eligible.length}</strong> eligible ·{' '}
                        {count.excluded.length} excluded
                      </p>
                      <p className="nl-muted">
                        {count.matching} matching records. Additional filters
                        are available inside the editor.
                      </p>
                    </article>
                  );
                })}
              </div>
              <h3>Consent review</h3>
              <div className="nl-actions">
                <button
                  className="nl-button"
                  disabled={consentPage === 1}
                  onClick={() => setConsentPage((p) => p - 1)}
                >
                  Previous contacts
                </button>
                <span>Page {consentPage}</span>
                <button
                  className="nl-button"
                  disabled={
                    consentPage * 15 >=
                    data.customers.filter(
                      (c) => !c.id.startsWith('subscriber:'),
                    ).length
                  }
                  onClick={() => setConsentPage((p) => p + 1)}
                >
                  Next contacts
                </button>
              </div>
              <p className="nl-muted">
                Only record an opt-in when you have evidence. An email
                unsubscribe or Do Not Contact remains respected.
              </p>
              <div className="nl-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Eligibility</th>
                      <th>Evidence</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers
                      .filter((c) => !c.id.startsWith('subscriber:'))
                      .slice((consentPage - 1) * 15, consentPage * 15)
                      .map((c) => (
                        <tr key={c.id}>
                          <td>
                            {c.name}
                            <small>{c.email}</small>
                          </td>
                          <td>{label(c.consent)}</td>
                          <td>
                            {c.consentSource || 'No explicit opt-in evidence'}
                          </td>
                          <td>
                            <button
                              className="nl-button"
                              onClick={async () => {
                                const evidence = window.prompt(
                                  'Describe the customer’s explicit marketing opt-in evidence. Do not infer it from an account or purchase.',
                                );
                                if (evidence)
                                  await action(
                                    {
                                      action: 'consent',
                                      userId: c.id,
                                      version: c.version,
                                      consent: 'OPTED_IN',
                                      evidence,
                                    },
                                    'Consent evidence recorded. Existing opt-outs and suppression still apply.',
                                  );
                              }}
                            >
                              Record consent evidence
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'Suppressions' && (
            <>
              <h2>Preferences come first.</h2>
              <p className="nl-muted">
                Marketing suppression does not remove accounts, memberships or
                essential transactional communications.
              </p>
              <form
                className="nl-panel nl-filters"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  const r = await action(
                    {
                      action: 'suppress',
                      email: f.get('email'),
                      reason: f.get('reason'),
                    },
                    'Marketing suppression saved.',
                  );
                  if (r) form.reset();
                }}
              >
                <input
                  type="email"
                  name="email"
                  aria-label="Suppress email"
                  placeholder="Email address"
                  required
                />
                <select name="reason" aria-label="Suppression reason">
                  <option>Admin suppression</option>
                  <option>Unsubscribed</option>
                  <option>Do not contact</option>
                </select>
                <button className="nl-primary" disabled={busy}>
                  Add suppression
                </button>
              </form>
              <div className="nl-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Reason</th>
                      <th>Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suppressions.map((s) => (
                      <tr key={s.email}>
                        <td>{s.email}</td>
                        <td>{s.reason}</td>
                        <td>{new Date(s.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.suppressions.length && (
                  <div className="nl-empty">No suppression records.</div>
                )}
              </div>
            </>
          )}
          {tab === 'Email settings' && (
            <div className="nl-outreach-grid">
              <form
                key={data.settings.version}
                className="nl-panel nl-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await action(
                    {
                      action: 'settings',
                      version: data.settings.version,
                      replyTo: f.get('replyTo'),
                      postalAddress: f.get('postalAddress'),
                      googleReviewUrl: f.get('googleReviewUrl'),
                      engagementDays: Number(f.get('engagementDays')),
                      attributionDays: Number(f.get('attributionDays')),
                      opensSupported: f.has('opensSupported'),
                      clicksSupported: f.has('clicksSupported'),
                    },
                    'Settings saved. Previously approved campaigns will require review if settings changed.',
                  );
                }}
              >
                <h3>Studio email settings</h3>
                <label>
                  Reply-to email
                  <input
                    type="email"
                    name="replyTo"
                    defaultValue={data.settings.replyTo}
                    required
                  />
                </label>
                <label>
                  Business postal address
                  <textarea
                    name="postalAddress"
                    defaultValue={data.settings.postalAddress}
                    required
                  />
                </label>
                <label>
                  Verified Google review URL
                  <input
                    type="url"
                    name="googleReviewUrl"
                    defaultValue={data.settings.googleReviewUrl}
                  />
                </label>
                <label>
                  Engagement window (days)
                  <input
                    type="number"
                    name="engagementDays"
                    min={1}
                    max={365}
                    defaultValue={data.settings.engagementDays}
                  />
                </label>
                <label>
                  Attribution window (days)
                  <input
                    type="number"
                    name="attributionDays"
                    min={1}
                    max={30}
                    defaultValue={data.settings.attributionDays}
                  />
                </label>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      name="opensSupported"
                      defaultChecked={data.settings.opensSupported}
                    />{' '}
                    Open tracking enabled and verified with provider
                  </span>
                </label>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      name="clicksSupported"
                      defaultChecked={data.settings.clicksSupported}
                    />{' '}
                    Click tracking enabled and verified with provider
                  </span>
                </label>
                <small>
                  These capability settings do not enable tracking at Resend.
                  Confirm provider configuration before checking them.
                </small>
                <button className="nl-primary" disabled={busy}>
                  Save settings
                </button>
              </form>
              <div className="nl-panel">
                <h3>Email health</h3>
                <p>
                  Sender:{' '}
                  <strong>{data.health.sender || 'Not configured'}</strong>
                </p>
                <p>
                  Provider credentials:{' '}
                  {data.health.providerConfigured
                    ? 'Present; not delivery verification'
                    : 'Not configured'}
                </p>
                <p>
                  Signed webhook configuration:{' '}
                  {data.health.webhookConfigured
                    ? 'Present; not delivery verification'
                    : 'Not configured'}
                </p>
                <p>
                  Newsletter delivery:{' '}
                  {data.health.deliveryEnabled
                    ? 'Enabled by configuration'
                    : 'Disabled'}
                </p>
                <p>
                  Preview capture:{' '}
                  {data.capture ? 'Enabled — localhost only' : 'Off'}
                </p>
                <p className="nl-muted">
                  Verify sender/domain, tracking settings, event coverage and
                  signed delivery in a sandbox before activation. No recurring
                  Sunday/Monday sends are created.
                </p>
              </div>
            </div>
          )}
        </>
      )}
      {history && (
        <div
          className="nl-modal"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Campaign history"
        >
          <div className="nl-dialog">
            <div className="nl-heading-row">
              <div>
                <div className="nl-eyebrow">CAMPAIGN HISTORY</div>
                <h2>{history.name}</h2>
                <p className="nl-muted">
                  {history.subject} · {label(history.status)}
                </p>
              </div>
              <button className="nl-button" onClick={() => setHistory(null)}>
                Close
              </button>
            </div>
            <div className="nl-actions">
              <button
                className="nl-button"
                disabled={!history.document}
                onClick={() => {
                  const id = history.id;
                  setHistory(null);
                  create({ duplicateId: id });
                }}
              >
                Duplicate as new draft
              </button>
              <a
                className="nl-button"
                href={'/api/admin/newsletters?id=' + history.id + '&export=1'}
              >
                Export report
              </a>
              <button
                className="nl-button"
                onClick={async () => {
                  await action(
                    { action: 'archive', id: history.id },
                    'Archived; content and analytics preserved.',
                  );
                  setHistory(null);
                }}
              >
                Archive
              </button>
            </div>
            <div className="nl-tabs">
              {['Email', 'Analytics', 'Recipients'].map((t) => (
                <button
                  key={t}
                  className={detail === t ? 'active' : ''}
                  onClick={() => setDetail(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {history.templateType === 'LEGACY' && (
              <div className="nl-notice">
                Historical campaign. Original records are shown below without
                resending. Missing send-time audience classification and
                tracking remain unavailable. Legacy queued messages require a
                new consent-aware draft and approval.
              </div>
            )}
            {history.templateType === 'LEGACY' && (
              <div className="nl-panel">
                {history.legacyMessages?.length ? (
                  history.legacyMessages.map((m) => (
                    <details key={m.id}>
                      <summary>
                        {m.to} · {m.status} ·{' '}
                        {m.sentAt
                          ? new Date(m.sentAt).toLocaleString()
                          : 'Send time unavailable'}
                      </summary>
                      <p>Provider ID: {m.providerId || 'Unavailable'}</p>
                      {m.htmlBody ? (
                        <iframe
                          sandbox=""
                          title={'Historical email ' + m.id}
                          srcDoc={m.htmlBody}
                          className="nl-history-email"
                        />
                      ) : (
                        <pre>
                          {m.textBody || 'Exact rendered content unavailable'}
                        </pre>
                      )}
                    </details>
                  ))
                ) : (
                  <p>
                    No linked email archive was retained. Original campaign
                    text:
                  </p>
                )}
                <pre style={{ whiteSpace: 'pre-wrap' }}>{history.body}</pre>
              </div>
            )}
            {detail === 'Email' &&
              (history.recipients.find((r) => r.emailMessage?.htmlBody)
                ?.emailMessage?.htmlBody ? (
                <>
                  <p className="nl-muted">
                    Exact archived recipient content. Personalization differs
                    per recipient; select recipients to inspect their individual
                    archive.
                  </p>
                  <iframe
                    title="Exact archived email"
                    sandbox=""
                    srcDoc={
                      history.recipients.find((r) => r.emailMessage?.htmlBody)!
                        .emailMessage!.htmlBody!
                    }
                    className="nl-history-email"
                  />
                </>
              ) : (
                <p className="nl-muted">
                  No dispatched HTML is available.{' '}
                  {history.templateType === 'LEGACY'
                    ? 'This is legacy campaign history; missing provider data is not invented.'
                    : 'Open the draft editor for a current preview.'}
                </p>
              ))}
            {detail === 'Analytics' && history.templateType !== 'LEGACY' && (
              <>
                <div className="nl-stats">
                  <div>
                    <strong>{history.metrics.accepted}</strong>
                    <span>Provider accepted (not inbox placement)</span>
                  </div>
                  <div>
                    <strong>{history.metrics.delivered}</strong>
                    <span>Confirmed delivered</span>
                  </div>
                  <div>
                    <strong>{pct(history.metrics.openRate)}</strong>
                    <span>
                      {metric(history.metrics.openRateNumerator)} /{' '}
                      {history.metrics.delivered} delivered with recorded opens
                    </span>
                  </div>
                  <div>
                    <strong>{pct(history.metrics.clickRate)}</strong>
                    <span>
                      {metric(history.metrics.clickRateNumerator)} /{' '}
                      {history.metrics.delivered} delivered with recorded clicks
                    </span>
                  </div>
                </div>
                <p className="nl-muted">
                  {metric(history.metrics.totalOpens)} total opens ·{' '}
                  {metric(history.metrics.repeatOpens)} repeat opens ·{' '}
                  {metric(history.metrics.totalClicks)} total clicks.
                  Opens/clicks may be automated; they do not prove reading or
                  intent.
                </p>
                <p>
                  {history.metrics.hardBounces} hard bounces ·{' '}
                  {history.metrics.otherBounces} other/unspecified bounces ·{' '}
                  {history.metrics.unsubscribed} unsubscribes ·{' '}
                  {history.metrics.complaints} complaints ·{' '}
                  {history.metrics.failed} failed · {history.metrics.pending}{' '}
                  pending · {history.metrics.unknown} unknown
                </p>
                <p className="nl-muted">
                  Soft bounces: Unavailable · Last recorded event:{' '}
                  {history.metrics.lastUpdated
                    ? new Date(history.metrics.lastUpdated).toLocaleString()
                    : 'No provider events'}
                </p>
                <h3>Link performance</h3>
                {history.metrics.links.map((l) => (
                  <p key={l.link}>
                    {l.link}
                    <br />
                    <small>
                      {l.unique} recipients · {l.total} recorded clicks
                    </small>
                  </p>
                ))}
                <h3 style={{ marginTop: 24 }}>Supported follow-through</h3>
                {data.outcomes
                  .filter((o) => o.campaignId === history.id)
                  .map((o) => (
                    <p key={o.id}>
                      {o.kind} · {o.status} ·{' '}
                      {o.net
                        ? 'Current/net outcome'
                        : 'Cancelled/refunded outcome'}
                      <br />
                      <small>{o.rule}</small>
                    </p>
                  ))}
                {!data.outcomes.some((o) => o.campaignId === history.id) && (
                  <p className="nl-muted">
                    No matched internal outcomes. External booking platforms and
                    posted Google reviews are not tracked.
                  </p>
                )}
              </>
            )}
            {detail === 'Recipients' && (
              <>
                <select
                  aria-label="Recipient analytics filter"
                  value={recipientFilter}
                  onChange={(e) => setRecipientFilter(e.target.value)}
                >
                  {[
                    'ALL',
                    'OPENED',
                    'NO_OPEN',
                    'CLICKED',
                    'NO_CLICK',
                    'BOUNCED',
                    'UNSUBSCRIBED',
                    'MEMBER',
                    'NON_MEMBER',
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v === 'NO_OPEN'
                        ? 'No Recorded Open'
                        : v === 'NO_CLICK'
                          ? 'No Recorded Click'
                          : label(v)}
                    </option>
                  ))}
                </select>
                <div className="nl-table-wrap" style={{ marginTop: 18 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>Status</th>
                        <th>Recorded engagement</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.recipients
                        .filter((r) => {
                          const has = (type: string) =>
                            r.events.some((e) => e.type === type);
                          return (
                            recipientFilter === 'ALL' ||
                            (recipientFilter === 'OPENED' &&
                              has('email.opened')) ||
                            (recipientFilter === 'NO_OPEN' &&
                              !has('email.opened')) ||
                            (recipientFilter === 'CLICKED' &&
                              has('email.clicked')) ||
                            (recipientFilter === 'NO_CLICK' &&
                              !has('email.clicked')) ||
                            (recipientFilter === 'BOUNCED' &&
                              has('email.bounced')) ||
                            (recipientFilter === 'UNSUBSCRIBED' &&
                              has('unsubscribe')) ||
                            (recipientFilter === 'MEMBER' &&
                              r.membershipAtSend === 'Active member') ||
                            (recipientFilter === 'NON_MEMBER' &&
                              r.membershipAtSend !== 'Active member')
                          );
                        })
                        .map((r) => {
                          const opens = r.events
                            .filter((e) => e.type === 'email.opened')
                            .map((e) => e.occurredAt)
                            .sort();
                          return (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.firstName || 'Subscriber'}</strong>
                                <small>{r.email}</small>
                                <small>At send: {r.membershipAtSend}</small>
                                <small>
                                  Current:{' '}
                                  {data.customers.find((c) => c.id === r.userId)
                                    ?.membership || 'Unavailable'}
                                </small>
                              </td>
                              <td>
                                {r.status}
                                <small>
                                  {r.exclusionReason || r.lastError}
                                </small>
                              </td>
                              <td>
                                {data.settings.opensSupported || opens.length
                                  ? opens.length
                                  : 'Unavailable'}{' '}
                                recorded opens
                                <small>
                                  {data.settings.clicksSupported
                                    ? r.events.filter(
                                        (e) => e.type === 'email.clicked',
                                      ).length
                                    : 'Unavailable'}{' '}
                                  recorded clicks
                                </small>
                                <small>
                                  First open:{' '}
                                  {opens[0]
                                    ? new Date(opens[0]).toLocaleString()
                                    : 'No recorded open'}
                                </small>
                                <small>
                                  Last open:{' '}
                                  {opens.at(-1)
                                    ? new Date(opens.at(-1)!).toLocaleString()
                                    : 'No recorded open'}
                                </small>
                              </td>
                              <td>
                                <details>
                                  <summary>
                                    Recorded events & exact email
                                  </summary>
                                  {r.events.map((e) => (
                                    <p key={e.id} className="nl-small">
                                      {e.type} ·{' '}
                                      {new Date(e.occurredAt).toLocaleString()}
                                      <br />
                                      {e.link}
                                      <br />
                                      {e.automated === true
                                        ? 'Known automated activity'
                                        : e.automated === false
                                          ? 'Provider identified non-automated'
                                          : 'Automation status unknown'}
                                    </p>
                                  ))}
                                  {r.emailMessage?.htmlBody && (
                                    <iframe
                                      title={'Archived email for ' + r.email}
                                      sandbox=""
                                      srcDoc={r.emailMessage.htmlBody}
                                      style={{
                                        width: 300,
                                        height: 350,
                                        border: 0,
                                      }}
                                    />
                                  )}
                                </details>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
