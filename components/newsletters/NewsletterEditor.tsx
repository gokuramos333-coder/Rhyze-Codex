'use client';
import { useDialogFocus } from './useDialogFocus';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  blockSchema,
  defaultAudience,
  defaultWeek,
  groups,
  label,
  localSendCandidates,
  resolveAudience,
  type Block,
  type NewsletterDocument,
  type ScheduleItem,
} from '@/lib/newsletters/domain';
import { renderNewsletter } from '@/lib/newsletters/render';
import { command, type Bundle, type Campaign, type Template } from './types';
type Review = {
  hash: string;
  errors: string[];
  snapshot: {
    subject: string;
    previewText: string;
    sender: string;
    replyTo: string;
    targetWeek: string;
  };
  recipients: {
    matching: number;
    eligible: { email: string; customer: { name: string } }[];
    excluded: { email: string; reason: string }[];
  };
  preview: { html: string };
  capture: boolean;
};
export function NewsletterEditor({
  campaign,
  bundle,
  onClose,
  onSaved,
  master,
}: {
  campaign: Campaign;
  bundle: Bundle;
  onClose: () => void;
  onSaved: () => Promise<void>;
  master?: Template;
}) {
  const [draft, setDraft] = useState(campaign),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [tab, setTab] = useState('Content'),
    [schedule, setSchedule] = useState(bundle.schedule),
    [mobile, setMobile] = useState(false),
    [named, setNamed] = useState(false),
    [review, setReview] = useState<Review | null>(null),
    [sendMode, setSendMode] = useState('NOW'),
    [localTime, setLocalTime] = useState(''),
    [zone, setZone] = useState('America/New_York'),
    [chosenUtc, setChosenUtc] = useState(''),
    [testEmail, setTestEmail] = useState('preview@example.test'),
    [uploading, setUploading] = useState(false),
    [assets, setAssets] = useState(bundle.assets);
  const previewContainer = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(680);
  useEffect(() => {
    const el = previewContainer.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setPreviewWidth(entries[0].contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const previewSize = mobile ? 375 : 680;
  const previewScale = Math.min(1, previewWidth / previewSize);
  const testOperation = useRef({ signature: '', key: '' });
  const revision = useRef(0);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const [audienceCustomers, setAudienceCustomers] = useState(bundle.customers);
  const dialogRef = useDialogFocus(Boolean(review), () => setReview(null));
  const doc = draft.document!;
  const audience = draft.audience || defaultAudience();
  const counts = useMemo(
    () => resolveAudience(audienceCustomers, audience),
    [audienceCustomers, audience],
  );
  const mark = (update: Partial<Campaign>) => {
    revision.current++;
    setError('');
    setDraft((d) => ({ ...d, ...update }));
    setDirty(true);
    setReview(null);
  };
  const changeDoc = (update: Partial<NewsletterDocument>) =>
    mark({ document: { ...doc, ...update } });
  const block = (id: string, update: Partial<Block>) =>
    changeDoc({
      blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...update } : b)),
    });
  const preview = renderNewsletter({
    subject: draft.subject,
    previewText: draft.previewText || '',
    document: doc,
    schedule,
    origin: bundle.health.origin,
    unsubscribeUrl: bundle.health.origin + '/newsletter/unsubscribe/preview',
    postalAddress: bundle.settings.postalAddress,
    firstName: named ? 'Sarah' : undefined,
    campaignId: draft.id,
  });
  let candidates: string[] = [];
  try {
    if (localTime) candidates = localSendCandidates(localTime, zone);
  } catch {
    /* Shown as invalid time below. */
  }
  const plannedCandidate = chosenUtc || candidates[0] || '';
  const featuredIds = doc.blocks
    .flatMap((b) => (b.occurrenceId ? [b.occurrenceId] : []))
    .join(',');
  useEffect(() => {
    if (draft.scheduleMode !== 'AUTO') return;
    const planned =
      sendMode === 'SCHEDULE' && plannedCandidate
        ? new Date(plannedCandidate)
        : new Date();
    const week = defaultWeek(planned);
    if (week !== draft.targetWeek) mark({ targetWeek: week });
  }, [draft.scheduleMode, draft.targetWeek, sendMode, plannedCandidate]);
  async function save() {
    const savingRevision = revision.current;
    setBusy(true);
    setError('');
    try {
      if (master) {
        await command({
          action: 'saveTemplate',
          id: master.id,
          version: draft.version,
          name: draft.name,
          subject: draft.subject,
          previewText: draft.previewText || '',
          document: doc,
        });
        setDraft((d) => ({ ...d, version: d.version + 1 }));
      } else {
        const c = await command({
          action: 'save',
          id: draft.id,
          version: draft.version,
          name: draft.name,
          subject: draft.subject,
          previewText: draft.previewText || '',
          document: doc,
          audience,
          targetWeek: draft.targetWeek || defaultWeek(new Date()),
          scheduleMode: draft.scheduleMode,
        });
        setDraft((d) =>
          revision.current === savingRevision
            ? { ...d, ...c }
            : { ...d, version: c.version },
        );
      }
      if (revision.current === savingRevision) setDirty(false);
      setNotice(
        'Saved. Your edits are separate from other campaigns and master templates.',
      );
      await onSaved();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || busy || error) return;
    const timer = setTimeout(() => {
      void saveRef.current();
    }, 1500);
    return () => clearTimeout(timer);
  }, [draft, dirty, busy, error]);
  useEffect(() => {
    let active = true;
    fetch(
      '/api/admin/newsletters?context=1&days=' +
        audience.days +
        '&week=' +
        draft.targetWeek +
        '&featured=' +
        encodeURIComponent(featuredIds),
    )
      .then(async (r) => {
        if (!r.ok) throw Error('Unable to refresh audience or schedule.');
        return r.json();
      })
      .then((x) => {
        if (active) {
          setAudienceCustomers(x.customers);
          setSchedule(x.schedule);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [audience.days, draft.targetWeek, featuredIds]);
  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch(
        '/api/admin/newsletters?context=1&week=' +
          draft.targetWeek +
          '&days=' +
          audience.days +
          '&featured=' +
          encodeURIComponent(featuredIds),
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setSchedule(data.schedule);
      setAudienceCustomers(data.customers);
      setNotice(
        'Schedule refreshed. Your introduction, photos and layout are unchanged.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reviewSend() {
    if (dirty) {
      setError('Save your latest edits before reviewing delivery.');
      return;
    }
    if (
      sendMode === 'SCHEDULE' &&
      (!candidates.length || (candidates.length > 1 && !chosenUtc))
    ) {
      setError(
        'Choose a valid future local time and resolve any daylight-saving ambiguity.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const sendAt =
        sendMode === 'SCHEDULE' ? chosenUtc || candidates[0] : null;
      const r = await fetch(
        `/api/admin/newsletters?id=${draft.id}&review=1${sendAt ? '&sendAt=' + encodeURIComponent(sendAt) : ''}`,
      );
      const x = await r.json();
      if (!r.ok) throw Error(x.error);
      setReview(x);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review) return;
    setBusy(true);
    try {
      await command({
        action: 'approve',
        id: draft.id,
        version: draft.version,
        reviewHash: review.hash,
        confirmation:
          sendMode === 'NOW' ? 'CONFIRM & SEND NOW' : 'CONFIRM & SCHEDULE',
        ...(sendMode === 'SCHEDULE'
          ? { localTime, timezone: zone, chosenUtc: chosenUtc || candidates[0] }
          : {}),
      });
      setReview(null);
      await onSaved();
      setNotice(
        bundle.capture
          ? 'Confirmed for the local capture queue. No real email will be sent.'
          : 'Campaign scheduled for the server queue.',
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setReview(null);
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    try {
      const r = await fetch('/api/admin/newsletters/assets', {
        method: 'POST',
        body: new FormData(event.currentTarget),
      });
      const x = await r.json();
      if (!r.ok) throw Error(x.error);
      setAssets((a) => [x.asset, ...a]);
      changeDoc({
        blocks: [
          ...doc.blocks,
          blockSchema.parse({
            id: crypto.randomUUID(),
            type: 'image',
            url: x.asset.url,
            alt: x.asset.alt,
          }),
        ],
      });
      setNotice(
        'Photo uploaded and added. Original campaign assets remain unchanged.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <div className="nl-heading-row">
        <div>
          <button
            className="nl-button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm('Leave without saving your changes?')
              )
                onClose();
            }}
          >
            ← Newsletters
          </button>
          <h1 style={{ marginTop: 18 }}>
            {master ? 'EDIT MASTER TEMPLATE' : 'MAKE IT YOURS'}
          </h1>
          <p className="nl-muted">
            {dirty ? 'Unsaved changes' : `Saved · Version ${draft.version}`} ·{' '}
            {master
              ? 'Master template — existing campaigns stay unchanged'
              : 'Draft changes never send an email'}
          </p>
        </div>
        <div className="nl-actions">
          <button className="nl-button" disabled={busy} onClick={save}>
            Save {master ? 'template' : 'draft'}
          </button>
          {!master && (
            <button
              className="nl-primary coral"
              onClick={() => setTab('Review & send')}
            >
              Review & send →
            </button>
          )}
        </div>
      </div>
      {draft.holdReason && (
        <p role="status" className="nl-notice">
          {draft.holdReason}
        </p>
      )}
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
      <div className="nl-tabs">
        {(master
          ? ['Content', 'Design & photos']
          : ['Content', 'Design & photos', 'Audience', 'Review & send']
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? 'active' : ''}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="nl-editor-grid">
        <div>
          {tab === 'Content' && (
            <>
              <div className="nl-panel nl-form">
                <label>
                  Internal name
                  <input
                    value={draft.name}
                    onChange={(e) => mark({ name: e.target.value })}
                  />
                </label>
                <label>
                  Subject line
                  <input
                    value={draft.subject}
                    maxLength={250}
                    onChange={(e) => mark({ subject: e.target.value })}
                  />
                </label>
                <label>
                  Preview / preheader
                  <textarea
                    rows={2}
                    value={draft.previewText || ''}
                    onChange={(e) => mark({ previewText: e.target.value })}
                  />
                </label>
                {draft.templateType === 'REVIEW' && (
                  <button
                    className="nl-button"
                    disabled={!bundle.settings.googleReviewUrl}
                    onClick={() =>
                      changeDoc({
                        blocks: doc.blocks.map((b) =>
                          b.type === 'button'
                            ? { ...b, url: bundle.settings.googleReviewUrl }
                            : b,
                        ),
                      })
                    }
                  >
                    Use configured Google review link
                  </button>
                )}
                <label>
                  Target week (Monday–Sunday)
                  <input
                    type="date"
                    value={draft.targetWeek || bundle.week}
                    onChange={(e) =>
                      mark({
                        targetWeek: e.target.value,
                        scheduleMode: 'EXPLICIT',
                      })
                    }
                  />
                </label>
                <label>
                  Week behavior
                  <select
                    value={draft.scheduleMode}
                    onChange={(e) => mark({ scheduleMode: e.target.value })}
                  >
                    <option value="AUTO">Follow planned send date</option>
                    <option value="EXPLICIT">Use selected week</option>
                  </select>
                </label>
                <button className="nl-button" onClick={refresh} disabled={busy}>
                  ↻ Refresh schedule
                </button>
                <small>
                  Eastern time. Auto mode uses the upcoming week on Sunday and
                  the current week on Monday.
                </small>
                {['OFFER', 'CLASS_24_HOURS', 'EVENT_24_HOURS'].includes(
                  draft.templateType,
                ) && (
                  <label>
                    Verified offer / registration deadline (ISO with time zone)
                    <input
                      value={doc.deadline || ''}
                      placeholder="2026-10-12T19:30:00-04:00"
                      onChange={(e) => changeDoc({ deadline: e.target.value })}
                    />
                  </label>
                )}
              </div>
              <div className="nl-panel">
                <div className="nl-heading-row">
                  <h3>Email sections</h3>
                  <span className="nl-kicker">{doc.blocks.length} blocks</span>
                </div>
                {doc.blocks.map((b, index) => (
                  <div className="nl-editor-block" key={b.id}>
                    <details open={index < 2}>
                      <summary>
                        {index + 1}. {label(b.type)}
                        {b.text ? ' · ' + b.text.slice(0, 22) : ''}
                      </summary>
                      <div className="nl-block-fields nl-form">
                        {['heading', 'text', 'button', 'columns'].includes(
                          b.type,
                        ) && (
                          <label>
                            Copy
                            <textarea
                              rows={b.type === 'text' ? 5 : 2}
                              value={b.text}
                              onChange={(e) =>
                                block(b.id, { text: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {b.type === 'columns' && (
                          <label>
                            Second column
                            <textarea
                              rows={4}
                              value={b.secondary}
                              onChange={(e) =>
                                block(b.id, { secondary: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {['button', 'image'].includes(b.type) && (
                          <label>
                            {b.type === 'button'
                              ? 'Destination link'
                              : 'Image URL'}
                            <input
                              value={b.url}
                              onChange={(e) =>
                                block(b.id, { url: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {b.type === 'image' && (
                          <label>
                            Image alt text
                            <input
                              value={b.alt}
                              onChange={(e) =>
                                block(b.id, { alt: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {['class', 'event'].includes(b.type) && (
                          <label>
                            Featured session
                            <select
                              value={b.occurrenceId || ''}
                              onChange={(e) =>
                                block(b.id, { occurrenceId: e.target.value })
                              }
                            >
                              <option value="">
                                Select from the loaded schedule
                              </option>
                              {schedule
                                .filter(
                                  (s) => s.isEvent === (b.type === 'event'),
                                )
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {new Date(s.startAt).toLocaleDateString()} ·{' '}
                                    {s.title} · {s.status}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        {b.type === 'schedule' && (
                          <p className="nl-muted">
                            Pulls the website schedule, grouped by day with a
                            separate events section.
                          </p>
                        )}
                        <div className="nl-inline-fields">
                          <label>
                            Size
                            <input
                              type="number"
                              min={12}
                              max={48}
                              value={b.fontSize}
                              onChange={(e) =>
                                block(b.id, {
                                  fontSize: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Padding
                            <input
                              type="number"
                              min={0}
                              max={48}
                              value={b.padding}
                              onChange={(e) =>
                                block(b.id, { padding: Number(e.target.value) })
                              }
                            />
                          </label>
                          <label>
                            Weight
                            <select
                              value={b.weight}
                              onChange={(e) =>
                                block(b.id, {
                                  weight: e.target.value as Block['weight'],
                                })
                              }
                            >
                              <option>normal</option>
                              <option>bold</option>
                            </select>
                          </label>
                        </div>
                        <div className="nl-inline-fields">
                          <label>
                            Align
                            <select
                              value={b.align}
                              onChange={(e) =>
                                block(b.id, {
                                  align: e.target.value as Block['align'],
                                })
                              }
                            >
                              <option>left</option>
                              <option>center</option>
                              <option>right</option>
                            </select>
                          </label>
                          <label>
                            Text
                            <input
                              type="color"
                              value={b.color}
                              onChange={(e) =>
                                block(b.id, { color: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Background
                            <input
                              type="color"
                              value={b.background}
                              onChange={(e) =>
                                block(b.id, { background: e.target.value })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </details>
                    <div className="nl-actions" style={{ marginTop: 12 }}>
                      <button
                        aria-label="Move section up"
                        className="nl-button"
                        disabled={index === 0}
                        onClick={() => {
                          const list = [...doc.blocks];
                          [list[index - 1], list[index]] = [
                            list[index],
                            list[index - 1],
                          ];
                          changeDoc({ blocks: list });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        aria-label="Move section down"
                        className="nl-button"
                        disabled={index === doc.blocks.length - 1}
                        onClick={() => {
                          const list = [...doc.blocks];
                          [list[index + 1], list[index]] = [
                            list[index],
                            list[index + 1],
                          ];
                          changeDoc({ blocks: list });
                        }}
                      >
                        ↓
                      </button>
                      <button
                        className="nl-button"
                        disabled={doc.blocks.length <= 1}
                        onClick={() =>
                          changeDoc({
                            blocks: doc.blocks.filter((x) => x.id !== b.id),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <label className="nl-form">
                  Add a section
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        changeDoc({
                          blocks: [
                            ...doc.blocks,
                            blockSchema.parse({
                              id: crypto.randomUUID(),
                              type: e.target.value,
                              text:
                                e.target.value === 'text'
                                  ? 'Write your message here.'
                                  : '',
                            }),
                          ],
                        });
                    }}
                  >
                    <option value="">Choose block…</option>
                    {[
                      'heading',
                      'text',
                      'image',
                      'button',
                      'columns',
                      'divider',
                      'schedule',
                      'class',
                      'event',
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          {tab === 'Design & photos' && (
            <>
              <div className="nl-panel nl-form">
                <h3>Brand & typography</h3>
                <label>
                  Email font
                  <select
                    value={doc.font}
                    onChange={(e) =>
                      changeDoc({
                        font: e.target.value as NewsletterDocument['font'],
                      })
                    }
                  >
                    {['Arial', 'Georgia', 'Verdana', 'Trebuchet MS'].map(
                      (f) => (
                        <option key={f}>{f}</option>
                      ),
                    )}
                  </select>
                </label>
                <small>
                  Supported fonts use email-safe fallbacks. Email clients may
                  render them differently.
                </small>
                <div className="nl-inline-fields">
                  <label>
                    Canvas color
                    <input
                      type="color"
                      value={doc.background}
                      onChange={(e) =>
                        changeDoc({ background: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Button / accent
                    <input
                      type="color"
                      value={doc.accent}
                      onChange={(e) => changeDoc({ accent: e.target.value })}
                    />
                  </label>
                </div>
              </div>
              <form className="nl-panel nl-form" onSubmit={upload}>
                <h3>Upload an approved photo</h3>
                <label>
                  Image
                  <input
                    name="file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                  />
                </label>
                <label>
                  Alt text
                  <input name="alt" required maxLength={300} />
                </label>
                <div className="nl-inline-fields">
                  <label>
                    Resize width
                    <input
                      name="width"
                      type="number"
                      defaultValue={1200}
                      min={320}
                      max={1600}
                    />
                  </label>
                  <label>
                    Crop height (optional)
                    <input name="height" type="number" min={100} max={1600} />
                  </label>
                  <label>
                    Crop focus
                    <select name="position">
                      <option value="centre">Center</option>
                      <option value="north">Top</option>
                      <option value="south">Bottom</option>
                    </select>
                  </label>
                </div>
                <small>
                  JPG, PNG or WebP · up to 8 MB. Uploads become durable, public
                  newsletter images. Never upload customer documents.
                </small>
                <button className="nl-primary" disabled={uploading}>
                  {uploading ? 'Optimizing…' : 'Upload & add image'}
                </button>
              </form>
              <div className="nl-panel">
                <h3>Campaign image library</h3>
                {!assets.length && (
                  <p className="nl-muted">
                    Your approved uploads will appear here.
                  </p>
                )}
                {assets.map((a) => (
                  <button
                    key={a.id}
                    className="nl-button"
                    style={{ margin: 6 }}
                    onClick={() =>
                      changeDoc({
                        blocks: [
                          ...doc.blocks,
                          blockSchema.parse({
                            id: crypto.randomUUID(),
                            type: 'image',
                            url: a.url,
                            alt: a.alt,
                          }),
                        ],
                      })
                    }
                  >
                    {a.name} ＋
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === 'Audience' && (
            <>
              <div className="nl-panel">
                <h3>Who should hear from us?</h3>
                <p className="nl-muted">
                  Selected groups are combined. Duplicate addresses receive one
                  campaign; eligibility rules still apply.
                </p>
                <div className="nl-checks">
                  {groups.map((g) => (
                    <label key={g}>
                      <input
                        type="checkbox"
                        checked={audience.groups.includes(g)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...audience.groups, g]
                            : audience.groups.filter((x) => x !== g);
                          if (next.length)
                            mark({ audience: { ...audience, groups: next } });
                        }}
                      />
                      {label(g)}
                    </label>
                  ))}
                </div>
                <div className="nl-form" style={{ marginTop: 20 }}>
                  <label>
                    Recent activity window (days)
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={audience.days}
                      onChange={(e) =>
                        mark({
                          audience: {
                            ...audience,
                            days: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      <input
                        type="checkbox"
                        checked={audience.recentAttendance}
                        onChange={(e) =>
                          mark({
                            audience: {
                              ...audience,
                              recentAttendance: e.target.checked,
                            },
                          })
                        }
                      />{' '}
                      Require recent confirmed attendance
                    </span>
                  </label>
                  <label>
                    Selected class / event audience
                    <select
                      value={audience.occurrenceId}
                      onChange={(e) =>
                        mark({
                          audience: {
                            ...audience,
                            occurrenceId: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Choose session</option>
                      {schedule.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} · {new Date(s.startAt).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Exclude registered customers
                    <select
                      value={audience.excludeBooked}
                      onChange={(e) =>
                        mark({
                          audience: {
                            ...audience,
                            excludeBooked: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">No registration exclusion</option>
                      {schedule.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="nl-panel">
                <h3>{counts.eligible.length} currently eligible</h3>
                <p className="nl-muted">
                  {counts.matching} matched · {counts.excluded.length} excluded.
                  Final counts are recalculated on review and dispatch.
                </p>
                <details>
                  <summary>Review recipients & exclusions</summary>
                  {counts.entries.map((e, i) => (
                    <p className="nl-small" key={e.email + i}>
                      <strong>{e.customer.name}</strong> · {e.email}
                      <br />
                      {e.reason || 'Eligible'}
                    </p>
                  ))}
                </details>
              </div>
            </>
          )}
          {tab === 'Review & send' && (
            <>
              <div className="nl-panel nl-form">
                <h3>Preview, then confirm</h3>
                <p className="nl-muted">
                  Saving a draft never sends. Scheduled sends run server-side
                  and do not need this browser open.
                </p>
                <label>
                  Send mode
                  <select
                    value={sendMode}
                    onChange={(e) => {
                      setSendMode(e.target.value);
                      setReview(null);
                    }}
                  >
                    <option value="NOW">Send now</option>
                    <option value="SCHEDULE">Schedule send</option>
                  </select>
                </label>
                {sendMode === 'SCHEDULE' && (
                  <>
                    <label>
                      Local send date/time
                      <input
                        type="datetime-local"
                        value={localTime}
                        onChange={(e) => {
                          setLocalTime(e.target.value);
                          setChosenUtc('');
                          setReview(null);
                        }}
                      />
                    </label>
                    <label>
                      Time zone
                      <select
                        value={zone}
                        onChange={(e) => {
                          setZone(e.target.value);
                          setChosenUtc('');
                        }}
                      >
                        {[
                          'America/New_York',
                          'America/Chicago',
                          'America/Denver',
                          'America/Los_Angeles',
                          'UTC',
                        ].map((z) => (
                          <option key={z}>{z}</option>
                        ))}
                      </select>
                    </label>
                    {localTime && !candidates.length && (
                      <p className="nl-error">
                        This time is invalid or falls in a daylight-saving gap.
                      </p>
                    )}
                    {candidates.length > 1 && (
                      <label>
                        This time occurs twice — choose one
                        <select
                          value={chosenUtc}
                          onChange={(e) => setChosenUtc(e.target.value)}
                        >
                          <option value="">Choose offset</option>
                          {candidates.map((c) => (
                            <option key={c} value={c}>
                              {new Intl.DateTimeFormat('en-US', {
                                timeZone: zone,
                                timeStyle: 'long',
                              }).format(new Date(c))}{' '}
                              · {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
                <button
                  className="nl-primary coral"
                  disabled={busy || dirty}
                  onClick={reviewSend}
                >
                  Review content & audience
                </button>
                {dirty && <small>Save the latest draft first.</small>}
              </div>
              <div className="nl-panel nl-form">
                <h3>Send a test</h3>
                <label>
                  Test recipient
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </label>
                <button
                  className="nl-button"
                  disabled={dirty || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const signature =
                        draft.id + ':' + draft.version + ':' + testEmail;
                      if (testOperation.current.signature !== signature)
                        testOperation.current = {
                          signature,
                          key: crypto.randomUUID(),
                        };
                      await command({
                        operationKey: testOperation.current.key,
                        action: 'test',
                        id: draft.id,
                        recipient: testEmail,
                        confirmation: 'SEND TEST EMAIL',
                      });
                      setNotice(
                        bundle.capture
                          ? 'Test email captured locally; no email was delivered. Open Email archive to inspect it.'
                          : 'Test email submitted; verify delivery in the archive.',
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Send test email
                </button>
              </div>
              <div className="nl-panel">
                <button
                  className="nl-button"
                  disabled={dirty || busy}
                  onClick={async () => {
                    const name = window.prompt('Template name', draft.name);
                    if (name)
                      try {
                        await command({
                          action: 'template',
                          id: draft.id,
                          name,
                        });
                        setNotice('Saved as a new master template.');
                        await onSaved();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                  }}
                >
                  Save as template
                </button>
              </div>
            </>
          )}
        </div>
        <div className={'nl-preview' + (mobile ? ' mobile' : '')}>
          <div className="nl-preview-controls">
            <div className="nl-actions">
              <button
                className="nl-button"
                aria-pressed={!mobile}
                onClick={() => setMobile(false)}
              >
                Desktop
              </button>
              <button
                className="nl-button"
                aria-pressed={mobile}
                onClick={() => setMobile(true)}
              >
                Mobile
              </button>
            </div>
            <label>
              <input
                type="checkbox"
                checked={named}
                onChange={(e) => setNamed(e.target.checked)}
              />{' '}
              Sample name
            </label>
          </div>
          <div
            ref={previewContainer}
            style={{
              width: '100%',
              overflow: 'hidden',
              height: 1100 * previewScale,
            }}
          >
            <iframe
              title="Newsletter live preview"
              sandbox=""
              srcDoc={preview.html}
              style={{
                width: previewSize,
                maxWidth: 'none',
                height: 1100,
                minHeight: 1100,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
                margin: 0,
              }}
            />
          </div>
          <p className="nl-small nl-muted">
            {named ? 'Named: Hey Sarah!' : 'Fallback: Hey there!'} · Links are
            inert in the preview. Actual email-client rendering can vary.
          </p>
        </div>
      </div>
      {review && (
        <div
          className="nl-modal"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm newsletter delivery"
        >
          <div className="nl-dialog">
            <div className="nl-heading-row">
              <h2>One last look.</h2>
              <button className="nl-button" onClick={() => setReview(null)}>
                Close
              </button>
            </div>
            <p>
              <strong>{draft.name}</strong>
              <br />
              {review.snapshot.subject}
              <br />
              <small>{review.snapshot.previewText}</small>
            </p>
            <p className="nl-muted">
              From: {review.snapshot.sender}
              <br />
              Reply-to: {review.snapshot.replyTo}
              <br />
              Audience: {audience.groups.map(label).join(' + ')}
              <br />
              Week of {review.snapshot.targetWeek} · America/New_York
              <br />
              Send: {sendMode === 'NOW' ? 'Now' : `${localTime} ${zone}`}
            </p>
            <div className="nl-stats">
              <div>
                <strong>{review.recipients.matching}</strong>
                <span>Matching customers</span>
              </div>
              <div>
                <strong>{review.recipients.eligible.length}</strong>
                <span>Unique eligible recipients</span>
              </div>
              <div>
                <strong>{review.recipients.excluded.length}</strong>
                <span>Excluded / suppressed</span>
              </div>
            </div>
            {review.errors.map((e) => (
              <p key={e} className="nl-error">
                {e}
              </p>
            ))}
            <details>
              <summary>Review recipient list</summary>
              {review.recipients.eligible.map((e) => (
                <p className="nl-small" key={e.email}>
                  {e.customer.name} · {e.email}
                </p>
              ))}
              {review.recipients.excluded.map((e, i) => (
                <p className="nl-small" key={i}>
                  {e.email} — {e.reason}
                </p>
              ))}
            </details>
            <iframe
              title="Final approved newsletter preview"
              sandbox=""
              srcDoc={review.preview.html}
              className="nl-history-email"
            />
            {review.capture && (
              <p className="nl-banner">
                LOCAL CAPTURE ONLY — this confirmation will not deliver real
                email.
              </p>
            )}
            <button
              className="nl-primary coral"
              disabled={busy || review.errors.length > 0}
              onClick={confirm}
            >
              {sendMode === 'NOW' ? 'CONFIRM & SEND NOW' : 'CONFIRM & SCHEDULE'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
