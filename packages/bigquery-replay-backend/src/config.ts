import { resolve } from 'node:path';

export type SessionIndexDriver = 'file' | 'bigquery';
export type ObjectStoreDriver = 'filesystem' | 'gcs';

export type ServerConfig = {
  allowedOrigin: string;
  dataDir: string;
  host: string;
  port: number;
  objectStoreDriver: ObjectStoreDriver;
  sessionIndexDriver: SessionIndexDriver;
  gcsBucket?: string;
  gcsPrefix: string;
  bigQueryDataset?: string;
  bigQueryTable?: string;
};

function parseDriver<T extends string>(
  value: string | undefined,
  supported: readonly T[],
  fallback: T,
): T {
  if (!value) {
    return fallback;
  }

  if (supported.includes(value as T)) {
    return value as T;
  }

  throw new Error(`Unsupported driver: ${value}`);
}

export function readServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  return {
    allowedOrigin: env.REPLAY_ALLOWED_ORIGIN ?? '*',
    dataDir: resolve(env.REPLAY_DATA_DIR ?? './.bigquery-replay'),
    host: env.REPLAY_HOST ?? '0.0.0.0',
    port: Number(env.REPLAY_PORT ?? '4318'),
    objectStoreDriver: parseDriver(
      env.OBJECT_STORE_DRIVER,
      ['filesystem', 'gcs'] as const,
      'filesystem',
    ),
    sessionIndexDriver: parseDriver(
      env.SESSION_INDEX_DRIVER,
      ['file', 'bigquery'] as const,
      'file',
    ),
    gcsBucket: env.GCS_BUCKET,
    gcsPrefix: env.GCS_PREFIX ?? 'rrweb-replay',
    bigQueryDataset: env.BIGQUERY_DATASET,
    bigQueryTable: env.BIGQUERY_TABLE ?? 'sessions',
  };
}
