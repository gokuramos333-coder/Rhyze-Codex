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
  const expected = { candidateSha: 'c'.repeat(40), deployId: 'a'.repeat(24), sourceSha: 'b'.repeat(40) };
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
  const candidateSha = 'c'.repeat(40);
  const expected = { ...bridge, candidateSha };
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const reportPath = join(root,'report.md');
  writeFileSync(reportPath,'reviewed');
  const reviewPath = join(root,'review.json');
  const operationalFiles = { 'verifier.py': hash('fixture') };
  writeFileSync(join(root,'verifier.py'),'fixture');
  const review = { verdict:'APPROVED', candidateSha, reportPath, reportSha256:hash('reviewed'), operationalFiles };
  writeFileSync(reviewPath,JSON.stringify(review));
  const evidenceDir = join(root, 'release-evidence');
  mkdirSync(evidenceDir);
  const initialState = { generation: 1, enabledDeployId: bridge.deployId, sourceSha: bridge.sourceSha, evidenceHash: '1'.repeat(64) };
  const closedState = { generation: 2, enabledDeployId: null, sourceSha: null, evidenceHash: null };
  const closeRequest = { candidateSha, reviewPath, reviewSha256:hash(JSON.stringify(review)), reportSha256:review.reportSha256,
    actorId:'owner', runtime:bridge, state:initialState, operationalFiles, operationalRoot:root };
  const evidenceHash = hash(JSON.stringify(closeRequest));
  const approval = { ...closeRequest, auditId:'close-audit', closedGeneration:2, evidenceHash,
    closeResultSha256:'', closeAuditSha256:'', databaseIdentity:'d'.repeat(64) };
  const close = { before:{runtime:bridge,state:initialState}, after:{runtime:bridge,state:closedState}, confirmed:true, candidateSha, evidenceHash };
  const audit = { production:bridge, databaseIdentity:approval.databaseIdentity, readOnly:true, gate:[closedState],
    audits:[{id:approval.auditId,actorId:'owner',action:'financial.release.close',entityId:'rhyze',entityType:'FinancialRelease',before:initialState,
      after:{...closedState,approvalEvidenceHash:evidenceHash}}] };
  function writeEvidence(name:string,value:unknown) {
    const bytes=JSON.stringify(value);
    writeFileSync(join(evidenceDir,name),bytes);
    return hash(bytes);
  }
  writeEvidence('close-attempt.json',{...closeRequest,evidenceHash});
  approval.closeResultSha256 = writeEvidence('close-result.json',close);
  approval.closeAuditSha256 = writeEvidence('close-audit.json',audit);
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
      occurrenceIds: [
        'cmw026ajl0001jn09jsqpqzij',
        'cmvv9bp4g0001gt09ewtk8n57',
        'schedule-import-d7e5b1377dccf88d1d90068c557d',
        'schedule-import-e54e7b12d550433a85e6e7f495ec',
        'schedule-import-12cc3b9897966042d0954cb495b0',
      ],
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
    approval,
    bridge,
    fencedAt,
    completedAt,
    review: {
      reviewer: 'independent-review',
      conclusion: 'NO_UNRESOLVED_PRE_BRIDGE_OPERATIONS',
    },
    decemberAdmission: {
      phase: 'PRE_MIGRATION_INVENTORY',
      legacyAdmissionUntilMigration: true,
      boundaryMigration: '20261123013000_special_event_admission_review',
      activationRequiresFinalReceipt: true,
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
      verifyBridgeReconciliation(record, expected, now).reports.scheduler
        .requests,
    ).toHaveLength(1);
    expect(() => verifyBridgeReconciliation(record, { ...expected, candidateSha: 'd'.repeat(40) }, now)).toThrow('candidate');
    writeFileSync(reportPath,'changed');
    expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow('review');
    writeFileSync(reportPath,'reviewed');
    const transplantedReview = { ...review, reportSha256: hash('another full report') };
    writeFileSync(reportPath, 'another full report');
    writeFileSync(reviewPath, JSON.stringify(transplantedReview));
    const transplanted = { ...record, approval: { ...approval, reviewSha256:hash(JSON.stringify(transplantedReview)), reportSha256:transplantedReview.reportSha256 } };
    expect(() => verifyBridgeReconciliation(transplanted, expected, now)).toThrow('CLOSE');
    writeFileSync(reportPath, 'reviewed');
    writeFileSync(reviewPath, JSON.stringify(review));
    writeEvidence('close-audit.json', { ...audit, audits: [] });
    expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow('CLOSE');
    writeEvidence('close-audit.json', audit);
    const decemberAdmission = record.decemberAdmission;
    delete record.decemberAdmission;
    expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow('Scoped December');
    record.decemberAdmission = { ...decemberAdmission, activationRequiresFinalReceipt: false };
    expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow('Scoped December');
    record.decemberAdmission = decemberAdmission;
    const coveredEvents = [...reports.events.occurrenceIds];
    for (const omitted of coveredEvents) {
      reports.events.occurrenceIds = coveredEvents.filter(id => id !== omitted);
      save();
      expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow('Event sessions unresolved');
    }
    reports.events.occurrenceIds = coveredEvents;
    reports.scheduler.publishedIdentity.after.observedAt = 'invalid'; save(); expect(()=>verifyBridgeReconciliation(record,expected,now)).toThrow('boundary'); reports.scheduler.publishedIdentity.after.observedAt=completedAt;
    reports.scheduler.requestPaginationComplete = false;
    save();
    expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow(
      'boundary',
    );
    reports.scheduler.requestPaginationComplete = true;
    reports.provider.operations[0].status = 'pending';
    save();
    expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow(
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
    expect(() => verifyBridgeReconciliation(record, expected, now)).not.toThrow();
    writeFileSync(record.receipts[0].path, '{}');
    expect(() => verifyBridgeReconciliation(record, expected, now)).toThrow(
      'changed',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([['wrong','wrong',false],['right','wrong',true]] as const)('final F4 rejects managed target %s then %s and cleans up any issued approval',async(first,second,issued)=>{
 const targets=[first,second],calls:string[]=[];
 const {submitBoundHostedBuild}=await import('../../../scripts/release/closed-cutover');
 const {runHostedWorkflow}=require('../../../scripts/release/hosted-workflow.cjs');
 let approval=false;
 const result=await runHostedWorkflow({
  prepare:()=>submitBoundHostedBuild('right',async()=>targets.shift()!,async()=>{approval=true;calls.push('createEnvVars');},
   async()=>{calls.push('recheck');},async()=>{calls.push('createSiteBuild');}),
  removeApproval:async()=>{if(approval){approval=false;calls.push('deleteEnvVar');}},
  ensureLocked:async()=>{},patOff:async()=>{},
 });
 expect(result.status).toBe('BLOCKED');expect(result.failures).toEqual(['prepare']);expect(approval).toBe(false);
 expect(calls).toEqual(issued?['createEnvVars','recheck','deleteEnvVar']:[]);
});
