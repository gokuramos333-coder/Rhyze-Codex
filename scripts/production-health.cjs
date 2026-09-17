#!/usr/bin/env node
// Read-only, no sessions, POSTs, reset emails, purchases or database mutations.
const fs = require('node:fs');
const path = require('node:path');
const ORIGIN = 'https://www.rhyzefitness.com';
function routeStatus(route, status, finalUrl) {
  const url = new URL(finalUrl);
  if (status !== 200 || url.origin !== ORIGIN) return 'FAIL';
  if (/^\/(admin|member|instructor)(\/|$)/.test(route) && url.pathname !== '/sign-in') return 'FAIL';
  return 'PASS';
}
function discoverLinks(html) {
  const links = new Set();
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    try {
      const url = new URL(match[1].replaceAll('&amp;', '&'), ORIGIN);
      if (url.origin === ORIGIN && !url.pathname.startsWith('/api/') && !/sign-out|logout/.test(url.pathname)) links.add(url.pathname + url.search);
    } catch { /* Non-HTTP links are not a public route. */ }
  }
  return [...links].sort();
}
function healthScore(items) {
  const pass = items.filter(x => x.status === 'PASS').length;
  return {pass, total: items.length, percent: items.length ? Math.floor(100 * pass / items.length) : 0, status: items.length && pass === items.length ? 'PASS' : 'ATTENTION'};
}
const checks = {
  future_assignment: `SELECT o.id FROM "ClassOccurrence" o LEFT JOIN "User" u ON u.id=o."instructorId" LEFT JOIN "InstructorProfile" i ON i."userId"=u.id WHERE o.status='SCHEDULED' AND o."endAt">now() AND (u.id IS NULL OR u.status<>'ACTIVE' OR u.role NOT IN ('INSTRUCTOR','OWNER','ADMIN','MANAGER') OR u."passwordHash" IS NULL OR u.email ILIKE '%@rhyze.local' OR (NOT COALESCE(i."isActive",false) AND u.email NOT IN ('vanessa@rhyzefit.com','melissa@rhyzefit.com')))`,
  historical_assignment: `SELECT o.id, o."startAt", o."instructorId", o."internalNotes", o."substituteInstructorName", t.name, (SELECT count(*)::int FROM "Booking" b WHERE b."occurrenceId"=o.id) AS bookings FROM "ClassOccurrence" o JOIN "ClassTemplate" t ON t.id=o."templateId" LEFT JOIN "User" u ON u.id=o."instructorId" WHERE o.status='SCHEDULED' AND o."endAt"<=now() AND (u.id IS NULL OR u.status<>'ACTIVE' OR u.role NOT IN ('INSTRUCTOR','OWNER','ADMIN','MANAGER') OR u."passwordHash" IS NULL OR u.email ILIKE '%@rhyze.local') ORDER BY o."startAt"`,
  cancelled_class_confirmed_bookings: `SELECT b.id, b."occurrenceId" FROM "Booking" b JOIN "ClassOccurrence" o ON o.id=b."occurrenceId" WHERE o.status='CANCELLED' AND b.status='CONFIRMED'`,
  cancelled_booking_attendance: `SELECT a.id, a."bookingId" FROM "AttendanceRecord" a JOIN "Booking" b ON b.id=a."bookingId" WHERE b.status='CANCELLED'`,
  attendance_booking_mismatch: `SELECT a.id FROM "AttendanceRecord" a JOIN "Booking" b ON b.id=a."bookingId" WHERE a."userId"<>b."userId" OR a."occurrenceId"<>b."occurrenceId"`,
  negative_finite_credits: `SELECT c.id, sum(e.quantity)::int AS balance FROM "CreditAccount" c JOIN "CreditLedgerEntry" e ON e."creditAccountId"=c.id WHERE NOT c."isUnlimited" GROUP BY c.id HAVING sum(e.quantity)<0`,
  orphan_credit_booking: `SELECT e.id, e."bookingId" FROM "CreditLedgerEntry" e LEFT JOIN "Booking" b ON b.id=e."bookingId" WHERE e."bookingId" IS NOT NULL AND b.id IS NULL`,
  purchase_refund_bounds: `SELECT id FROM "Purchase" WHERE "refundedAmountCents"<0 OR "refundedAmountCents">"amountCents"`,
  paid_purchase_without_paid_time: `SELECT id FROM "Purchase" WHERE status='PAID' AND "paidAt" IS NULL`,
  discounted_purchase_missing_commission: `SELECT p.id FROM "Purchase" p JOIN "DiscountRedemption" d ON d."purchaseId"=p.id JOIN "ReferralCode" r ON r.id=d."referralCodeId" JOIN "Product" pr ON pr.id=p."productId" LEFT JOIN "ReferralCommission" c ON c."purchaseId"=p.id WHERE p.status='PAID' AND d."discountCents">0 AND r."isActive" AND pr.kind IN ('MONTHLY_UNLIMITED','LIMITED_MEMBERSHIP','VIP','DROP_IN') AND c.id IS NULL`,
  commission_invalid_purchase: `SELECT c.id,c."purchaseId" FROM "ReferralCommission" c JOIN "Purchase" p ON p.id=c."purchaseId" WHERE c.status IN ('EARNED','PAID') AND p.status NOT IN ('PAID','PARTIALLY_REFUNDED')`,
  failed_email_24h: `SELECT id, status FROM "EmailMessage" WHERE status='FAILED' AND "createdAt">now()-interval '24 hours'`,
};
async function run() {
  const output = path.resolve(process.env.RHYZE_HEALTH_OUTPUT || 'production-health.json');
  const report = { at: new Date().toISOString(), origin: ORIGIN, siteId: 'e7002b82-50f2-4760-8a35-e4f9591bec4f', routes: [], data: [], limitations: ['Authenticated instructor/member/admin sessions NOT TESTED', 'Actual checkout, Stripe settlement and email delivery NOT TESTED', 'Historical ownership and financial exceptions require evidence before repair'] };
  const save = () => { fs.mkdirSync(path.dirname(output), {recursive:true}); fs.writeFileSync(output, JSON.stringify(report, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2), {mode:0o600}); };
  report.complete = false;
  report.requiredNotTested = ['Signed-in portal E2E', 'Provider payment settlement', 'Email delivery'].map(name => ({name,status:'NOT TESTED'}));
  save();
  const queue = new Set(['/', '/schedule', '/events', '/memberships', '/sign-in', '/sign-up', '/forgot-password', '/admin', '/member', '/instructor', '/api/auth/session']);
  const configFile = process.env.RHYZE_READONLY_DB_CONFIG;
  if (configFile) {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (config.target !== 'production') throw new Error('Expected explicitly verified production read-only DB config');
    const {PrismaClient} = require('@prisma/client');
    const db = new PrismaClient({datasources:{db:{url:config.database.connectionString}}});
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        for (const [name, sql] of Object.entries(checks)) {
          const rows = await tx.$queryRawUnsafe(sql);
          report.data.push({name, status: rows.length ? 'FAIL' : 'PASS', count: rows.length, rows}); save();
        }
        const occurrences = await tx.classOccurrence.findMany({where:{status:'SCHEDULED',endAt:{gt:new Date()}},select:{id:true,template:{select:{slug:true,isEvent:true}}}});
        report.futureScheduled = occurrences.length;
        for (const o of occurrences) {
          queue.add(o.template.isEvent ? `/events/${o.template.slug}` : `/book/${o.template.slug}?occurrence=${encodeURIComponent(o.id)}`);
          if (!o.template.isEvent) queue.add(`/schedule?class=${o.template.slug}`);
        }
      }, {timeout:60000});
    } catch (error) {
      report.databaseError = 'Database check failed; remaining checks are NOT TESTED';
      // Do not expose connection strings via Prisma error messages.
      process.exitCode=2;
    } finally { await db.$disconnect(); }
  }
  for (const name of Object.keys(checks)) {
    if (!report.data.some(x => x.name === name)) report.data.push({name,status:'NOT TESTED',reason:report.databaseError || 'RHYZE_READONLY_DB_CONFIG not supplied'});
  }
  const seen = new Set();
  for (let depth=0; depth<2; depth++) {
    const batch=[...queue].filter(x=>!seen.has(x));
    for (let i=0;i<batch.length;i+=4) {
      await Promise.all(batch.slice(i,i+4).map(async route=>{
        seen.add(route);
        try {
          const response=await fetch(ORIGIN+route,{signal:AbortSignal.timeout(30000)});
          const html=await response.text();
          const result={route,status:routeStatus(route,response.status,response.url),http:response.status,finalUrl:response.url};
          if (route==='/api/auth/session' && html.trim()!=='null') {result.status='FAIL';result.reason='Unexpected unauthenticated session response';}
          report.routes.push(result);
          if(depth===0 && response.headers.get('content-type')?.includes('text/html')) {
            for(const link of discoverLinks(html)) queue.add(link);
            for(const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^"]*)?"/g)) queue.add(match[1].replaceAll('&amp;','&'));
          }
        } catch {report.routes.push({route,status:'FAIL',reason:'Request failed or timed out'});}
      }));
      save();
    }
  }
  report.routes.sort((a,b)=>a.route.localeCompare(b.route));
  report.complete = true;
  report.healthScore = healthScore([...report.routes,...report.data,...report.requiredNotTested]);
  report.summary={routes:report.routes.length,routeFailures:report.routes.filter(x=>x.status==='FAIL').length,dataChecks:report.data.length,dataFailures:report.data.filter(x=>x.status==='FAIL').length,notTested:report.data.filter(x=>x.status==='NOT TESTED').length,undiscoveredDepthLimit:'two levels; not a full application proof'};
  save(); console.log(JSON.stringify({output,summary:report.summary,healthScore:report.healthScore,failures:[...report.routes,...report.data].filter(x=>x.status!=='PASS')},null,2));
  if(report.summary.routeFailures || report.summary.dataFailures) process.exitCode=1;
  else if(report.summary.notTested || report.requiredNotTested.length) process.exitCode=2;
}
module.exports={routeStatus,discoverLinks,healthScore};
if(require.main===module) run().catch(()=>{console.error('Health scan failed before completion; inspect private config/path');process.exitCode=2;});
