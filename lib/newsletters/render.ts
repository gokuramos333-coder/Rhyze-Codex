import {
  easternDate,
  formatScheduleDate,
  safeLink,
  type NewsletterDocument,
  type ScheduleItem,
} from './domain';
export function escapeHtml(v: string) {
  return v.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
export function renderNewsletter(input: {
  subject: string;
  previewText: string;
  document: NewsletterDocument;
  schedule: ScheduleItem[];
  firstName?: string;
  origin: string;
  unsubscribeUrl: string;
  postalAddress: string;
  campaignId?: string;
}) {
  const e = escapeHtml;
  const personalize = (v: string) =>
    v.replaceAll('{{first_name}}', input.firstName?.trim() || 'there');
  const url = (v: string) => {
    if (!safeLink(v)) return '#';
    const u = new URL(v, input.origin);
    if (input.campaignId && u.origin === input.origin) {
      u.searchParams.set('utm_source', 'rhyze_newsletter');
      u.searchParams.set('utm_campaign', input.campaignId);
    }
    return e(u.toString());
  };
  const button = (text: string, href: string) =>
    `<a href="${url(href)}" style="display:inline-block;padding:14px 22px;background:${input.document.accent};color:#111;text-decoration:none;font-weight:bold;border-radius:4px">${e(text)}</a>`;
  const dateLabel = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      ...options,
    }).format(new Date(iso));
  const session = (s: ScheduleItem, featured = false) => {
    const hasPhoto = Boolean(
      s.instructorPhoto &&
      s.instructorPhoto !== '/brand/rhyze-logo-header.png' &&
      safeLink(s.instructorPhoto),
    );
    const photo = hasPhoto
      ? s.instructorPhoto!
      : '/newsletter-brand/rhyze-logo-916c2282a7bd.png';
    const duration = Math.round(
      (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60000,
    );
    const border = s.isEvent ? '#F05A3C' : '#8b7027';
    const background = s.isEvent ? '#34201a' : '#0A0A0A';
    const unavailable =
      s.status !== 'SCHEDULED'
        ? 'Cancelled / unavailable'
        : new Date(s.endAt) <= new Date()
          ? 'Session ended — see the current website schedule'
          : s.available === 0
            ? 'Currently full — check the website for changes'
            : '';
    const cta = unavailable
      ? `<strong>${unavailable}</strong>`
      : `<a aria-label="${e(`Book ${s.title}`)}" href="${url(s.href)}" style="display:inline-block;background:#FFC72C;background-image:linear-gradient(90deg,#F05A3C,#F7931E,#FFC72C);color:#0A0A0A;padding:${featured ? '12px 18px' : '14px 10px'};border-radius:6px;text-decoration:none;font-size:${featured ? 12 : 11}px;font-weight:bold;letter-spacing:0.5px">${featured ? (s.isEvent ? 'SAVE YOUR SPOT' : 'BOOK CLASS') : 'BOOK'}</a>`;
    const portrait = (size: number) =>
      `<img src="${e(new URL(photo, input.origin).toString())}" alt="${e(hasPhoto ? s.instructor : 'Rhyze Fitness')}" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;object-fit:cover;object-position:center 18%;border-radius:50%;border:1px solid #F5F1E8">`;
    const category = `${e(s.category || 'RHYZE FITNESS')}${s.isEvent ? ' <span style="display:inline-block;padding:2px 4px;border:1px solid #F05A3C;color:#F5F1E8;border-radius:3px;letter-spacing:0.5px">EVENT</span>' : ''}`;
    if (!featured) {
      const compactStatus =
        s.status !== 'SCHEDULED'
          ? 'Unavailable'
          : s.available === 0 && new Date(s.endAt) > new Date()
            ? 'Full'
            : 'Ended';
      return `<table class="agenda-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 6px;border:1px solid ${border};border-radius:10px;background:${background};color:#F5F1E8;font-family:Arial,Helvetica,sans-serif;text-align:left"><tr><td style="padding:12px 10px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr>
          <td width="52" valign="middle" style="font-size:14px;font-weight:bold;line-height:1.1;padding-right:6px">${e(dateLabel(s.startAt, { hour: 'numeric', minute: '2-digit' }))}</td>
          <td width="54" valign="middle">${portrait(42)}</td>
          <td valign="middle" style="padding-right:8px;overflow-wrap:break-word;word-break:normal"><p style="margin:0 0 4px;font-size:9px;font-weight:bold;line-height:1.3;letter-spacing:1px;color:#F7931E;text-transform:uppercase">${category}</p>
            <h3 style="margin:0;font-family:Impact,Arial Narrow,Arial,sans-serif;font-size:21px;font-weight:bold;line-height:1.1;letter-spacing:0.3px;text-transform:uppercase;color:#F5F1E8">${e(s.title)}</h3>
            <p style="margin:5px 0 0;font-size:12px;line-height:1.3;color:#c4bfb7">${e(s.instructor)} · ${duration} min</p></td>
          <td width="62" valign="middle" align="right" style="font-size:11px;line-height:1.4">${unavailable ? `<span title="${e(unavailable)}">${compactStatus}</span>` : cta}</td>
        </tr></table>
      </td></tr></table>`;
    }
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;border:1px solid ${border};border-radius:12px;background:${background};color:#F5F1E8;font-family:Arial,Helvetica,sans-serif;text-align:left"><tr><td style="padding:${featured ? 22 : 16}px">
      ${featured ? `<p style="margin:0 0 16px;color:#FFC72C;font-size:12px;font-weight:bold;letter-spacing:1px">${e(dateLabel(s.startAt, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>` : ''}
      <p style="margin:0 0 16px;font-size:17px;font-weight:bold">${e(dateLabel(s.startAt, { hour: 'numeric', minute: '2-digit' }))} <span style="font-size:12px;color:#c4bfb7;font-weight:normal">· ${duration} min · Eastern</span></p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td width="${featured ? 104 : 64}" valign="top" style="padding-right:14px"><img src="${e(new URL(photo, input.origin).toString())}" alt="${e(hasPhoto ? s.instructor : 'Rhyze Fitness')}" width="${featured ? 88 : 50}" height="${featured ? 88 : 50}" style="display:block;width:${featured ? 88 : 50}px;height:${featured ? 88 : 50}px;object-fit:cover;object-position:center 18%;border-radius:50%;border:1px solid #F5F1E8"></td>
        <td valign="middle"><p style="margin:0 0 7px;font-size:10px;font-weight:bold;letter-spacing:1.5px;color:#F7931E;text-transform:uppercase">${e(s.category || 'RHYZE FITNESS')}${s.isEvent ? ' <span style="display:inline-block;padding:4px 6px;border:1px solid #F05A3C;color:#F5F1E8;border-radius:3px;letter-spacing:1px">EVENT</span>' : ''}</p>
        <h3 style="margin:0;font-family:Impact,Arial Narrow,Arial,sans-serif;font-size:${featured ? 30 : 25}px;font-weight:bold;line-height:1.15;letter-spacing:0.5px;text-transform:uppercase;color:#F5F1E8">${e(s.title)}</h3>
        <p style="margin:8px 0 0;font-size:13px;color:#d8d2c7">${e(s.instructor)}</p></td>
      </tr></table>
      ${featured && s.description ? `<p style="margin:18px 0;font-size:14px;line-height:1.7;color:#e6dfd3">${e(s.description.slice(0, 400))}</p>` : ''}
      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#F5F1E8">${cta}</p>
      </td></tr></table>`;
  };
  const weeklySchedule = () => {
    const days = new Map<string, ScheduleItem[]>();
    for (const s of input.schedule
      .filter((s) => s.status === 'SCHEDULED')
      .sort((a, b) => a.startAt.localeCompare(b.startAt))) {
      const key = easternDate(s.startAt);
      days.set(key, [...(days.get(key) || []), s]);
    }
    // Build sections from actual occurrences, so empty/cancelled-only days never render.
    return Array.from(days.values())
      .map((sessions) => {
        const date = sessions[0].startAt;
        const classes = sessions.filter((s) => !s.isEvent).length;
        const events = sessions.length - classes;
        const count = [
          classes ? `${classes} ${classes === 1 ? 'class' : 'classes'}` : '',
          events ? `${events} ${events === 1 ? 'event' : 'events'}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#1A1A1A;border:1px solid #8b7027;border-radius:12px;text-align:left;font-family:Arial,Helvetica,sans-serif"><tr><td style="padding:12px">
        <p style="margin:0 0 6px;color:#FFC72C;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">${e(dateLabel(date, { month: 'short', day: 'numeric' }))}</p>
        <h2 style="margin:0 0 6px;color:#F5F1E8;font-family:Impact,Arial Narrow,Arial,sans-serif;font-size:26px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${e(dateLabel(date, { weekday: 'long' }))}</h2>
        <p style="margin:0 0 10px;padding-bottom:10px;border-bottom:1px solid #4a4438;font-size:10px;color:#c4bfb7;letter-spacing:1px;text-transform:uppercase">${count}</p>
        ${sessions.map((s) => session(s)).join('')}
        </td></tr></table>`;
      })
      .join('');
  };
  const blocks = input.document.blocks
    .map((b) => {
      const text = e(personalize(b.text)).replaceAll('\n', '<br>');
      let html = '';
      switch (b.type) {
        case 'heading':
          html = `<h1 style="font-size:inherit;line-height:1.15;margin:0">${text}</h1>`;
          break;
        case 'text':
          html = `<p style="margin:0;line-height:1.7">${text}</p>`;
          break;
        case 'columns':
          html = `<table role="presentation" width="100%"><tr><td class="column" style="width:50%;vertical-align:top;padding-right:12px">${text}</td><td class="column" style="width:50%;vertical-align:top">${e(personalize(b.secondary)).replaceAll('\n', '<br>')}</td></tr></table>`;
          break;
        case 'button':
          html = button(personalize(b.text), b.url);
          break;
        case 'image':
          html =
            b.url && safeLink(b.url)
              ? `<img src="${url(b.url)}" width="560" alt="${e(b.alt)}" style="display:block;max-width:100%;width:100%;height:auto;border:0">`
              : '<p>Add an approved image</p>';
          break;
        case 'divider':
          html = '<hr style="border:0;border-top:1px solid #ded8cd">';
          break;
        case 'schedule':
          html = weeklySchedule();
          break;
        case 'class':
        case 'event': {
          const s = input.schedule.find((s) => s.id === b.occurrenceId);
          html = s
            ? session(s, true)
            : '<p>Select a class or event before sending.</p>';
          break;
        }
      }
      return `<tr><td style="padding:${b.padding}px;font-size:${b.fontSize}px;font-weight:${b.weight};text-align:${b.align};color:${b.color};background:${b.background}">${html}</td></tr>`;
    })
    .join('');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:480px){.column{display:block!important;width:100%!important;padding:8px 0!important}.agenda-card td[width="52"]{width:40px!important;font-size:12px!important}.agenda-card td[width="54"]{width:38px!important}.agenda-card img{width:32px!important;height:32px!important}.agenda-card td[width="62"]{width:52px!important}.agenda-card h3{font-size:17px!important}.agenda-card p{font-size:10px!important}.agenda-card a{padding:14px 6px!important;font-size:10px!important}}</style><title>${e(personalize(input.subject))}</title></head><body style="margin:0;background:${input.document.background};font-family:'${input.document.font}',Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${e(personalize(input.previewText))}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:white"><tr><td style="padding:28px;background:#111;border-top:5px solid ${input.document.accent}"><img src="${e(input.origin)}/newsletter-brand/rhyze-logo-916c2282a7bd.png" alt="RHYZE FITNESS" width="120"><p style="color:#f7a928;font-size:10px;letter-spacing:2px">IN RHYTHM, WE RISE.</p></td></tr>${blocks}<tr><td style="padding:28px;background:#111;color:#eee;font-size:12px;line-height:1.8"><strong>RHYZE FITNESS</strong><br>${e(input.postalAddress)}<br><a style="color:#f7a928" href="${e(input.origin)}/schedule">View the current schedule</a><br>Schedules may change. Check the website before attending.<br><a style="color:#eee" href="${e(input.unsubscribeUrl)}">Unsubscribe from marketing emails</a> · Reply to us with questions.</td></tr></table></td></tr></table></body></html>`;
  return {
    subject: personalize(input.subject),
    html,
    text: [
      personalize(input.subject),
      ...input.document.blocks.map((b) => personalize(b.text)),
      ...input.schedule.map(
        (s) =>
          `${formatScheduleDate(s.startAt)} ${s.title} ${s.status} ${new URL(s.href, input.origin)}`,
      ),
      'RHYZE FITNESS',
      input.postalAddress,
      'Unsubscribe: ' + input.unsubscribeUrl,
    ].join('\n\n'),
  };
}
