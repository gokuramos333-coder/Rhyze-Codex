import Stripe from 'stripe';
import fs from 'node:fs';

function loadEnv(path: string) {
  const text = fs.readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx);
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

async function main() {
  loadEnv('.env.local');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_')) throw new Error('Missing Stripe key');
  const stripe = new Stripe(key);
  const sessions = await stripe.checkout.sessions.list({ limit: 30 });
  const rows = sessions.data.map((s) => ({
    id: s.id,
    created: new Date(s.created * 1000).toISOString(),
    status: s.status,
    payment_status: s.payment_status,
    amount_total: s.amount_total,
    name: s.customer_details?.name,
    email: s.customer_details?.email,
    metadata: s.metadata,
  }));
  console.log(JSON.stringify(rows, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
