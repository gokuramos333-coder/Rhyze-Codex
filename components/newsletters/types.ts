import type {
  Audience,
  Customer,
  NewsletterDocument,
  ScheduleItem,
} from '@/lib/newsletters/domain';
import type { campaignMetrics } from '@/lib/newsletters/analytics';
export type Recipient = {
  id: string;
  email: string;
  userId: string | null;
  firstName: string | null;
  membershipAtSend: string;
  status: string;
  exclusionReason: string | null;
  lastError: string | null;
  attempts: number;
  acceptedAt: string | null;
  events: {
    id: string;
    type: string;
    occurredAt: string;
    link: string | null;
    automated: boolean | null;
    detail: string | null;
  }[];
  emailMessage: {
    providerId: string | null;
    htmlBody: string | null;
    sentAt: string | null;
  } | null;
};
export type Campaign = {
  id: string;
  name: string;
  subject: string;
  previewText: string | null;
  status: string;
  version: number;
  templateType: string;
  document: NewsletterDocument | null;
  audience: Audience | null;
  targetWeek: string | null;
  scheduleMode: string;
  timezone: string;
  createdAt: string;
  scheduledFor: string | null;
  sentAt: string | null;
  archivedAt: string | null;
  holdReason: string | null;
  createdBy: { name: string | null };
  recipients: Recipient[];
  metrics: ReturnType<typeof campaignMetrics>;
  sentSnapshot: unknown;
  legacyMessages?: {
    id: string;
    to: string;
    subject: string;
    status: string;
    providerId: string | null;
    sentAt: string | null;
    htmlBody: string | null;
    textBody: string | null;
  }[];
  body?: string;
};
export type Template = {
  id: string;
  name: string;
  type: string;
  version: number;
  subject: string;
  previewText: string;
  document: NewsletterDocument;
};
export type Asset = { id: string; url: string; name: string; alt: string };
export type Settings = {
  version: number;
  replyTo: string;
  postalAddress: string;
  googleReviewUrl: string;
  engagementDays: number;
  attributionDays: number;
  opensSupported: boolean;
  clicksSupported: boolean;
};
export type Bundle = {
  campaigns: Campaign[];
  templates: Template[];
  catalog: {
    type: string;
    name: string;
    subject: string;
    previewText: string;
    document: NewsletterDocument;
  }[];
  assets: Asset[];
  suppressions: { email: string; reason: string; createdAt: string }[];
  customers: Customer[];
  schedule: ScheduleItem[];
  week: string;
  settings: Settings;
  outcomes: {
    id: string;
    campaignId: string;
    kind: string;
    status: string;
    net: boolean;
    date: string;
    rule: string;
  }[];
  capture: boolean;
  health: {
    sender: string;
    providerConfigured: boolean;
    webhookConfigured: boolean;
    deliveryEnabled: boolean;
    origin: string;
  };
  actor: { id: string; name: string };
};
export async function command(body: unknown) {
  const r = await fetch('/api/admin/newsletters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const x = await r.json();
  if (!r.ok) throw Error(x.error || 'Request failed');
  return x.result;
}
