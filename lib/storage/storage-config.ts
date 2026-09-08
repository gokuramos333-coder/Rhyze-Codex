export type StorageEnvironment = Record<string, string | undefined>;

export type StorageConfig =
  | { driver: 'local' }
  | { driver: 'netlify' }
  | {
      driver: 's3';
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
    };

function required(
  environment: StorageEnvironment,
  key: string,
): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required for S3 object storage.`);
  return value;
}

export function resolveStorageConfig(
  environment: StorageEnvironment = process.env,
): StorageConfig {
  const driver = environment.STORAGE_DRIVER?.trim().toLowerCase();

  if (!driver && environment.NODE_ENV !== 'production') {
    return { driver: 'local' };
  }
  if (driver === 'local' && environment.NODE_ENV !== 'production') {
    return { driver: 'local' };
  }
  if (driver === 'netlify') {
    return { driver: 'netlify' };
  }
  if (driver !== 's3') {
    throw new Error(
      'STORAGE_DRIVER must be set to "netlify" or "s3" in production so uploads are durable.',
    );
  }

  return {
    driver: 's3',
    bucket: required(environment, 'STORAGE_S3_BUCKET'),
    region: required(environment, 'STORAGE_S3_REGION'),
    endpoint: environment.STORAGE_S3_ENDPOINT?.trim() || undefined,
    accessKeyId: required(environment, 'STORAGE_S3_ACCESS_KEY_ID'),
    secretAccessKey: required(
      environment,
      'STORAGE_S3_SECRET_ACCESS_KEY',
    ),
    forcePathStyle: environment.STORAGE_S3_FORCE_PATH_STYLE === 'true',
  };
}
