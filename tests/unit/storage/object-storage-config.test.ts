import { describe, expect, it } from 'vitest';
import { resolveStorageConfig } from '@/lib/storage/storage-config';

describe('object storage configuration', () => {
  it('uses local storage only when explicitly selected', () => {
    expect(
      resolveStorageConfig({
        NODE_ENV: 'development',
        STORAGE_DRIVER: 'local',
      }),
    ).toEqual({ driver: 'local' });
  });

  it('requires durable object storage in production', () => {
    expect(() =>
      resolveStorageConfig({
        NODE_ENV: 'production',
      }),
    ).toThrow(/STORAGE_DRIVER/);
  });

  it('accepts a complete S3-compatible configuration', () => {
    expect(
      resolveStorageConfig({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 's3',
        STORAGE_S3_BUCKET: 'rhyze-files',
        STORAGE_S3_REGION: 'auto',
        STORAGE_S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        STORAGE_S3_ACCESS_KEY_ID: 'access',
        STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toMatchObject({
      driver: 's3',
      bucket: 'rhyze-files',
      region: 'auto',
    });
  });

  it('accepts Netlify Blobs as durable production storage', () => {
    expect(
      resolveStorageConfig({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 'netlify',
      }),
    ).toEqual({ driver: 'netlify' });
  });

  it('rejects incomplete S3-compatible configuration', () => {
    expect(() =>
      resolveStorageConfig({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 's3',
        STORAGE_S3_BUCKET: 'rhyze-files',
      }),
    ).toThrow(/STORAGE_S3_REGION/);
  });
});
