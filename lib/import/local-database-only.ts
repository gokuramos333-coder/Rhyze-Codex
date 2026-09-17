/** Legacy demo/catalog loaders must never rewrite a hosted production database. */
export function assertLocalDatabase(connectionString: string | undefined): void {
  let url: URL;
  try { url = new URL(connectionString || ''); } catch {
    throw new Error('A local PostgreSQL DATABASE_URL is required for this legacy loader.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Legacy schedule loaders are local-only; use audited admin scheduling in production.');
  }
}
