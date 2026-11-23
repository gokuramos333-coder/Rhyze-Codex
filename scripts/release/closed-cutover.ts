import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export type ClosedCutover = {
  version: 1;
  phase: 'BRIDGE' | 'FINAL';
  base: string;
  runtimeFiles: Record<string, string>;
};
const sha = (s: Buffer | string) =>
  createHash('sha256').update(s).digest('hex');
/** Deliberate closed publication, never an ordinary pre-publication HTTP pass.
 * The source-bound bridge cannot refund/collect fees or admit the two events.
 * FINAL requires the independently reconciled bridge receipt before its build
 * can apply active event SQL. Activation is a separate audited owner action.
 */
export function closedCutoverPlan(
  root: string,
  base: string,
  changes: string[],
): ClosedCutover | null {
  const file = join(root, 'scripts/release/closed-cutover.json');
  if (!existsSync(file)) return null;
  const plan = JSON.parse(readFileSync(file, 'utf8')) as ClosedCutover;
  if (
    plan.version !== 1 ||
    !['BRIDGE', 'FINAL'].includes(plan.phase) ||
    plan.base !== base ||
    !/^[a-f0-9]{40}$/.test(base)
  )
    throw Error('Closed cutover source/base mismatch');
  if (!plan.runtimeFiles || !Object.keys(plan.runtimeFiles).length)
    throw Error('Reviewed runtime manifest missing');
  for (const [path, hash] of Object.entries(plan.runtimeFiles)) {
    if (
      !/^(app|lib)\/[\w/().\[\]-]+\.tsx?$/.test(path) ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      sha(readFileSync(join(root, path))) !== hash
    )
      throw Error('Closed runtime differs from reviewed manifest');
  }
  if (plan.phase === 'BRIDGE') {
    if (base !== '48460727d4e17484c4826b08e6087d4c18e32283')
      throw Error('Bridge is restricted to the inspected live baseline');
    for (const path of changes) {
      if (
        path.startsWith('prisma/migrations/') ||
        path.startsWith('netlify/database/migrations/')
      )
        throw Error('Bridge must not apply schema/trigger changes');
      if (
        !plan.runtimeFiles[path] &&
        !/^(scripts\/release\/|tests\/unit\/|docs\/)/.test(path)
      )
        throw Error('Unreviewed bridge change');
    }
  }
  return plan;
}
export async function verifyQuarantine(
  oldId: string,
  currentId: string,
  fetcher: typeof fetch = fetch,
) {
  if (
    !/^[a-f0-9]{24}$/.test(oldId) ||
    !/^[a-f0-9]{24}$/.test(currentId) ||
    oldId === currentId
  )
    throw Error('Distinct provider deployment IDs required');
  const canonical = 'https://www.rhyzefitness.com';
  const host = (id: string) =>
    `https://${id}--rhyze-fitness-rhyze-2.netlify.app`;
  const denied: Array<{ url: string; headers?: Record<string, string> }> = [
    { url: host(oldId) + '/api/auth/session' },
    { url: host(oldId) + '/_rhyze-release.json' },
    { url: host(oldId) + '/.netlify/functions/___netlify-server-handler' },
    {
      url: canonical + '/_rhyze-release.json',
      headers: { 'X-Deployment-Id': oldId },
    },
    {
      url: canonical + '/_rhyze-release.json',
      headers: { Cookie: `__vdpl=${oldId}` },
    },
    { url: canonical + '/_rhyze-release.json?dpl=' + oldId },
  ];
  const receipts = [];
  for (const request of denied) {
    const response = await fetcher(request.url, {
      headers: request.headers,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.text();
    if (![403, 404].includes(response.status))
      throw Error('Old runtime ingress is not quarantined');
    receipts.push({
      url: request.url,
      headers: request.headers,
      status: response.status,
      bodyHash: sha(body),
    });
  }
  for (const origin of [canonical, host(currentId)]) {
    const r = await fetcher(origin + '/api/auth/session', {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (r.status !== 200 || !r.headers.get('content-type')?.includes('json'))
      throw Error('Published runtime is unavailable');
    await r.json();
  }
  return {
    at: new Date().toISOString(),
    oldId,
    currentId,
    receipts,
    limitation:
      'Ingress denial is not scheduler drain or provider reconciliation proof.',
  };
}
function verifyReviewedClose(approval: any, bridge: { deployId: string; sourceSha: string }) {
  const dir = join(approval.operationalRoot, 'release-evidence');
  const read = (name: string) => readFileSync(join(dir, name), 'utf8');
  const { evidenceHash, ...attempt } = JSON.parse(read('close-attempt.json'));
  const closeBytes = read('close-result.json');
  const auditBytes = read('close-audit.json');
  const close = JSON.parse(closeBytes);
  const snapshot = JSON.parse(auditBytes);
  const audit = snapshot.audits?.[0];
  const sameRuntime = (value: any) =>
    value?.deployId === bridge.deployId && value?.sourceSha === bridge.sourceSha;
  const sameState = (left: any, right: any) => left && right &&
    ['generation', 'enabledDeployId', 'sourceSha', 'evidenceHash'].every(key => left[key] === right[key]);
  const before = close.before?.state;
  const after = close.after?.state;
  if (sha(JSON.stringify(attempt)) !== evidenceHash || evidenceHash !== approval.evidenceHash ||
      evidenceHash !== close.evidenceHash || close.confirmed !== true ||
      sha(closeBytes) !== approval.closeResultSha256 || sha(auditBytes) !== approval.closeAuditSha256 ||
      ['candidateSha','reviewPath','reviewSha256','reportSha256','operationalRoot'].some(key => approval[key] !== attempt[key]) ||
      JSON.stringify(attempt.operationalFiles) !== JSON.stringify(approval.operationalFiles) ||
      close.candidateSha !== attempt.candidateSha || !sameRuntime(attempt.runtime) ||
      !sameRuntime(close.before?.runtime) || !sameRuntime(close.after?.runtime) || !sameRuntime(snapshot.production) ||
      !sameState(before, attempt.state) || before.enabledDeployId !== bridge.deployId || before.sourceSha !== bridge.sourceSha ||
      !after || after.generation !== before.generation + 1 || after.generation !== approval.closedGeneration ||
      after.enabledDeployId !== null || after.sourceSha !== null || after.evidenceHash !== null ||
      snapshot.databaseIdentity !== approval.databaseIdentity || snapshot.readOnly !== true ||
      snapshot.gate?.length !== 1 || !sameState(snapshot.gate[0], after) ||
      snapshot.audits?.length !== 1 || audit.id !== approval.auditId || !attempt.actorId || audit.actorId !== attempt.actorId ||
      audit.action !== 'financial.release.close' || audit.entityType !== 'FinancialRelease' || audit.entityId !== 'rhyze' ||
      !sameState(audit.before, before) || !sameState(audit.after, after) || audit.after.approvalEvidenceHash !== evidenceHash) {
    throw Error('Reviewed candidate differs from original audited CLOSE');
  }
}
export function verifyBridgeReconciliation(
  value: unknown,
  expected: { deployId: string; sourceSha: string; candidateSha: string },
  now = Date.now(),
) {
  const e = value as any;
  if (
    !e ||
    e.version !== 1 ||
    e.phase !== 'BRIDGE_RECONCILED' ||
    e.bridge?.deployId !== expected.deployId ||
    e.bridge?.sourceSha !== expected.sourceSha ||
    !Number.isFinite(Date.parse(e.completedAt)) ||
    now - Date.parse(e.completedAt) > 30 * 60_000 ||
    Date.parse(e.completedAt) > now
  )
    throw Error('Fresh exact bridge reconciliation required');
  if (
    !Number.isFinite(Date.parse(e.fencedAt)) ||
    Date.parse(e.completedAt) < Date.parse(e.fencedAt) ||
    e.review?.conclusion !== 'NO_UNRESOLVED_PRE_BRIDGE_OPERATIONS' ||
    typeof e.review?.reviewer !== 'string' ||
    e.review.reviewer.length < 3
  )
    throw Error('Explicit reviewed bridge conclusion required');
  const approval = e.approval;
  if (!/^[a-f0-9]{40}$/.test(expected.candidateSha) ||
      approval?.candidateSha !== expected.candidateSha ||
      !approval.auditId || !Number.isSafeInteger(approval.closedGeneration) ||
      !/^[a-f0-9]{64}$/.test(approval.evidenceHash)) {
    throw Error('Audited CLOSE for the exact candidate required');
  }
  const reviewBytes = readFileSync(approval.reviewPath);
  const review = JSON.parse(reviewBytes.toString());
  if (sha(reviewBytes) !== approval.reviewSha256 || review.verdict !== 'APPROVED' ||
      review.candidateSha !== expected.candidateSha || review.reportSha256 !== approval.reportSha256 ||
      sha(readFileSync(review.reportPath)) !== review.reportSha256 ||
      !Object.keys(review.operationalFiles).length ||
      JSON.stringify(review.operationalFiles) !== JSON.stringify(approval.operationalFiles) ||
      Object.entries(review.operationalFiles).some(([name, hash]) =>
        !/^[a-z0-9_.-]+$/.test(name) || sha(readFileSync(join(approval.operationalRoot, name))) !== hash)) {
    throw Error('Technical review or operational files changed');
  }
  verifyReviewedClose(approval, expected);
  // CLOSE on the previous artifact protects its registered November offers.
  // December's legacy writers are fenced by the new migration, so this
  // pre-build inventory cannot replace a drained, bidirectional final receipt.
  if (
    e.decemberAdmission?.phase !== 'PRE_MIGRATION_INVENTORY' ||
    e.decemberAdmission?.legacyAdmissionUntilMigration !== true ||
    e.decemberAdmission?.boundaryMigration !==
      '20261123013000_special_event_admission_review' ||
    e.decemberAdmission?.activationRequiresFinalReceipt !== true
  )
    throw Error('Scoped December inventory and final receipt requirement missing');
  if (
    !Array.isArray(e.receipts) ||
    e.receipts.length !== 4 ||
    new Set(e.receipts.map((r: any) => r.kind)).size !== 4
  )
    throw Error('Distinct typed provider receipts required');
  const reports: Record<string, any> = {};
  for (const receipt of e.receipts) {
    if (
      !['ingress', 'scheduler', 'provider', 'events'].includes(receipt.kind) ||
      typeof receipt.path !== 'string' ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256)
    )
      throw Error('Invalid typed receipt');
    const bytes = readFileSync(receipt.path);
    if (sha(bytes) !== receipt.sha256)
      throw Error('Reconciliation receipt changed');
    const r = JSON.parse(bytes.toString());
    if (
      r.version !== 1 ||
      r.bridge?.deployId !== expected.deployId ||
      r.bridge?.sourceSha !== expected.sourceSha ||
      Date.parse(r.observedFrom) > Date.parse(e.fencedAt) ||
      Date.parse(r.observedThrough) < Date.parse(e.completedAt) ||
      !Number.isFinite(Date.parse(r.observedFrom)) ||
      !Number.isFinite(Date.parse(r.observedThrough)) ||
      !r.providerReference
    )
      throw Error('Receipt identity or observation coverage mismatch');
    reports[receipt.kind] = r;
  }
  const { ingress, scheduler, provider, events } = reports;
  if (
    ingress.policy?.unpublished !== 'BLOCK_ALL' ||
    ingress.policy?.published !== 'ALLOW_ALL' ||
    ingress.policy?.exceptions?.length !== 0 ||
    !Array.isArray(ingress.probes) ||
    ingress.probes.length < 6 ||
    ingress.probes.some((p: any) => ![403, 404].includes(p.status) || !p.url)
  )
    throw Error('Global old-runtime exclusion incomplete');
  // Provider request logs do not expose a deploy ID. Bind attribution to the
  // independently observed locked production interval; do not fabricate fields.
  const identities = scheduler.publishedIdentity;
  if (
    scheduler.inventoryComplete !== true ||
    !Array.isArray(scheduler.functions) ||
    !scheduler.functions.length ||
    scheduler.functions.some(
      (f: any) =>
        !f.name ||
        f.transport !== 'CANONICAL_HTTP' ||
        f.directFinancialWrites !== false ||
        f.deploymentPinning !== false,
    ) ||
    scheduler.requestPaginationComplete !== true ||
    !Array.isArray(scheduler.requests) ||
    !identities ||
    !Number.isFinite(Date.parse(identities.before?.observedAt)) ||
    !Number.isFinite(Date.parse(identities.after?.observedAt)) ||
    ['before', 'after'].some(
      (k) =>
        identities[k]?.deployId !== expected.deployId ||
        identities[k]?.sourceSha !== expected.sourceSha ||
        identities[k]?.locked !== true,
    ) ||
    Date.parse(identities.before.observedAt) > Date.parse(e.fencedAt) ||
    Date.parse(identities.after.observedAt) < Date.parse(e.completedAt) ||
    scheduler.runtimeAttribution !==
      'INFERRED_FROM_LOCKED_PUBLISHED_INTERVAL' ||
    scheduler.outstandingRelevantRequests !== 0 ||
    !scheduler.runtimeBound?.providerReference ||
    !Number.isFinite(scheduler.runtimeBound.seconds) ||
    scheduler.runtimeBound.seconds <= 0 ||
    Date.parse(e.completedAt) - Date.parse(e.fencedAt) <
      scheduler.runtimeBound.seconds * 1000 ||
    scheduler.requests.some(
      (x: any) =>
        !x.requestId ||
        !x.url ||
        !Number.isFinite(Date.parse(x.startedAt)) ||
        !Number.isFinite(x.durationMs) ||
        x.durationMs < 0 ||
        !Number.isInteger(x.status) ||
        x.status < 200 ||
        x.status > 599 ||
        Date.parse(x.startedAt) + x.durationMs > Date.parse(e.completedAt),
    )
  )
    throw Error('Canonical request boundary incomplete');
  if (
    provider.paginationComplete !== true ||
    provider.accountId !== 'acct_1Tu0UqRIYui0I7dP' ||
    provider.livemode !== true ||
    !Array.isArray(provider.operations) ||
    provider.operations.some(
      (x: any) =>
        !x.id ||
        !x.kind ||
        !['succeeded', 'failed', 'canceled'].includes(x.status) ||
        !x.applicationReconciled,
    )
  )
    throw Error('Provider operations unresolved');
  const eventIds = [
    'cmw026ajl0001jn09jsqpqzij',
    'cmvv9bp4g0001gt09ewtk8n57',
    'schedule-import-d7e5b1377dccf88d1d90068c557d',
    'schedule-import-e54e7b12d550433a85e6e7f495ec',
    'schedule-import-12cc3b9897966042d0954cb495b0',
  ];
  if (
    events.paginationComplete !== true ||
    !Array.isArray(events.occurrenceIds) ||
    eventIds.some((id) => !events.occurrenceIds.includes(id)) ||
    !Array.isArray(events.sessions) ||
    events.sessions.some(
      (x: any) =>
        !x.id ||
        x.status === 'open' ||
        !['complete', 'expired'].includes(x.status) ||
        (x.payment_status === 'paid' &&
          !(
            (x.bookingId && x.applicationPaymentStatus === 'SUCCEEDED') ||
            (x.disposition === 'FULLY_REFUNDED' &&
              Array.isArray(x.verifiedRefundIds) &&
              x.verifiedRefundIds.length > 0 &&
              x.accountingReconciled === true)
          )),
    )
  )
    throw Error('Event sessions unresolved');
  return { record: e, evidenceHash: sha(JSON.stringify(e)), reports };
}
