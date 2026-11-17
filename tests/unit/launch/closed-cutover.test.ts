import { expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  closedCutoverPlan,
  verifyBridgeReconciliation,
  verifyQuarantine,
} from '../../../scripts/release/closed-cutover';
it('rejects active SQL in a bridge and runtime changes outside its manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'closed-cutover-'));
  mkdirSync(join(root, 'scripts/release'), { recursive: true });
  mkdirSync(join(root, 'lib'));
  try {
    writeFileSync(join(root, 'lib/fixture.ts'), 'closed');
    const plan = {
      version: 1,
      phase: 'BRIDGE',
      base: '48460727d4e17484c4826b08e6087d4c18e32283',
      runtimeFiles: {
        'lib/fixture.ts': createHash('sha256').update('closed').digest('hex'),
      },
    };
    writeFileSync(
      join(root, 'scripts/release/closed-cutover.json'),
      JSON.stringify(plan),
    );
    expect(closedCutoverPlan(root, plan.base, ['lib/fixture.ts'])).toEqual(
      plan,
    );
    expect(() =>
      closedCutoverPlan(root, plan.base, ['prisma/migrations/active.sql']),
    ).toThrow('schema');
    expect(() =>
      closedCutoverPlan(root, plan.base, ['lib/unreviewed.ts']),
    ).toThrow('Unreviewed');
    writeFileSync(join(root, 'lib/fixture.ts'), 'opened');
    expect(() => closedCutoverPlan(root, plan.base, [])).toThrow('manifest');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('never interprets anonymous success/redirect/error as old runtime exclusion', async () => {
  for (const status of [200, 302, 500])
    await expect(
      verifyQuarantine(
        'a'.repeat(24),
        'b'.repeat(24),
        vi.fn(async () => new Response('', { status })) as any,
      ),
    ).rejects.toThrow('quarantined');
});
it('checks immutable and canonical skew ingress and current runtime separately', async () => {
  const old = 'a'.repeat(24),
    current = 'b'.repeat(24);
  const fetcher = vi.fn(async (_url: string, options: any) => {
    return fetcher.mock.calls.length <= 6
      ? new Response('blocked', { status: 404 })
      : new Response('{}', { headers: { 'content-type': 'application/json' } });
  });
  const e = await verifyQuarantine(old, current, fetcher as any);
  expect(e.receipts).toHaveLength(6);
  expect(fetcher).toHaveBeenCalledTimes(8);
  expect(e.limitation).toContain('not scheduler drain');
});
it('requires fresh exact independently saved drain/provider/session receipts', () => {
  const expected = { deployId: 'a'.repeat(24), sourceSha: 'b'.repeat(40) };
  expect(() =>
    verifyBridgeReconciliation(
      {
        version: 1,
        phase: 'BRIDGE_RECONCILED',
        bridge: expected,
        completedAt: new Date().toISOString(),
      },
      expected,
    ),
  ).toThrow('conclusion');
  expect(() =>
    verifyBridgeReconciliation(
      {
        version: 1,
        phase: 'BRIDGE_RECONCILED',
        bridge: expected,
        completedAt: new Date(0).toISOString(),
      },
      expected,
    ),
  ).toThrow('Fresh');
});
it('accepts bound canonical request evidence and rejects substitutions, incomplete logs and unresolved operations', () => {
  const root = mkdtempSync(join(tmpdir(), 'bridge-receipts-'));
  const bridge = { deployId: 'a'.repeat(24), sourceSha: 'b'.repeat(40) };
  const now = Date.now(),
    fencedAt = new Date(now - 120000).toISOString(),
    completedAt = new Date(now - 1000).toISOString();
  const common = {
    version: 1,
    bridge,
    observedFrom: fencedAt,
    observedThrough: completedAt,
    providerReference: 'saved-provider-evidence',
  };
  const identity = { ...bridge, locked: true };
  const reports: any = {
    ingress: {
      ...common,
      policy: {
        unpublished: 'BLOCK_ALL',
        published: 'ALLOW_ALL',
        exceptions: [],
      },
      probes: Array.from({ length: 6 }, (_, i) => ({
        url: 'https://old.invalid/' + i,
        status: 404,
      })),
    },
    scheduler: {
      ...common,
      inventoryComplete: true,
      functions: [
        {
          name: 'stripe-sync',
          transport: 'CANONICAL_HTTP',
          directFinancialWrites: false,
          deploymentPinning: false,
        },
      ],
      publishedIdentity: {
        before: { ...identity, observedAt: fencedAt },
        after: { ...identity, observedAt: completedAt },
      },
      requestPaginationComplete: true,
      runtimeAttribution: 'INFERRED_FROM_LOCKED_PUBLISHED_INTERVAL',
      outstandingRelevantRequests: 0,
      runtimeBound: {
        seconds: 60,
        providerReference:
          'https://docs.netlify.com/build/functions/configuration/',
      },
      requests: [
        {
          requestId: 'request-1',
          url: '/api/jobs/stripe-sync',
          startedAt: fencedAt,
          status: 200,
          durationMs: 400,
        },
      ],
    },
    provider: {
      ...common,
      accountId: 'acct_1Tu0UqRIYui0I7dP',
      livemode: true,
      paginationComplete: true,
      operations: [
        {
          id: 're_fixture',
          kind: 'refund',
          status: 'succeeded',
          applicationReconciled: true,
        },
      ],
    },
    events: {
      ...common,
      paginationComplete: true,
      occurrenceIds: ['cmw026ajl0001jn09jsqpqzij', 'cmvv9bp4g0001gt09ewtk8n57'],
      sessions: [
        {
          id: 'cs_fixture',
          status: 'complete',
          payment_status: 'paid',
          bookingId: 'booking-fixture',
          applicationPaymentStatus: 'SUCCEEDED',
        },
      ],
    },
  };
  const record: any = {
    version: 1,
    phase: 'BRIDGE_RECONCILED',
    bridge,
    fencedAt,
    completedAt,
    review: {
      reviewer: 'independent-review',
      conclusion: 'NO_UNRESOLVED_PRE_BRIDGE_OPERATIONS',
    },
    receipts: [],
  };
  function save() {
    record.receipts = Object.entries(reports).map(([kind, r]) => {
      const path = join(root, kind + '.json'),
        bytes = JSON.stringify(r);
      writeFileSync(path, bytes);
      return {
        kind,
        path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
  }
  try {
    save();
    expect(
      verifyBridgeReconciliation(record, bridge, now).reports.scheduler
        .requests,
    ).toHaveLength(1);
    reports.scheduler.requestPaginationComplete = false;
    save();
    expect(() => verifyBridgeReconciliation(record, bridge, now)).toThrow(
      'boundary',
    );
    reports.scheduler.requestPaginationComplete = true;
    reports.provider.operations[0].status = 'pending';
    save();
    expect(() => verifyBridgeReconciliation(record, bridge, now)).toThrow(
      'unresolved',
    );
    reports.provider.operations[0].status = 'succeeded';
    reports.events.sessions[0] = {
      id: 'cs_refunded',
      status: 'complete',
      payment_status: 'paid',
      disposition: 'FULLY_REFUNDED',
      verifiedRefundIds: ['re_fixture'],
      accountingReconciled: true,
    };
    save();
    expect(() => verifyBridgeReconciliation(record, bridge, now)).not.toThrow();
    writeFileSync(record.receipts[0].path, '{}');
    expect(() => verifyBridgeReconciliation(record, bridge, now)).toThrow(
      'changed',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
