import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { productionDatabaseUrl, readProductionDataHealth } from '../lib/automation/production-data-health';

async function main() {
  const configPath = process.env.RHYZE_READONLY_DB_CONFIG || join(homedir(), '.config/rhyze/production-readonly.json');
  if ((statSync(configPath).mode & 0o077) !== 0) throw new Error('Private configuration permissions required.');
  const url = productionDatabaseUrl(JSON.parse(readFileSync(configPath, 'utf8')));
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    console.log(JSON.stringify(await readProductionDataHealth(prisma), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Connection exceptions may embed credentials. Fail clearly without exposing them.
  console.error('Production read-only telemetry unavailable. Check the private production-readonly configuration and database connectivity; no fallback or writes were attempted.');
  process.exitCode = 1;
});
