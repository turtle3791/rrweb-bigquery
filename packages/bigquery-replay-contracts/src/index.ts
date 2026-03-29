export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type ChunkCompression = 'none' | 'gzip-json';
export type eventWithTime = {
  timestamp: number;
  delay?: number;
  type?: number;
  data?: unknown;
  [key: string]: unknown;
};

export const DEFAULT_CHUNK_EVENT_LIMIT = 300;
export const DEFAULT_CHUNK_FLUSH_MS = 4_000;
export const DEFAULT_SEARCH_PAGE_SIZE = 20;

export type SessionIndexRecord = {
  sessionId: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: SessionStatus;
  eventCount: number;
  chunkCount: number;
  storagePrefix: string;
  manifestPath: string;
  pageUrl?: string;
  appVersion?: string;
  sdkVersion?: string;
  environment?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastChunkUploadedAt?: string;
};

export type ReplayChunkDescriptor = {
  chunkIndex: number;
  objectPath: string;
  eventCount: number;
  startedAt: string;
  endedAt: string;
  byteSize: number;
  payloadBytes: number;
  compression: ChunkCompression;
};

export type ReplayManifest = {
  sessionId: string;
  userId: string;
  storagePrefix: string;
  createdAt: string;
  updatedAt: string;
  totalEventCount: number;
  chunks: ReplayChunkDescriptor[];
};

export type StartSessionRequest = {
  sessionId: string;
  userId: string;
  startedAt: string;
  pageUrl?: string;
  appVersion?: string;
  sdkVersion?: string;
  environment?: string;
  tags?: string[];
};

export type StartSessionResponse = {
  session: SessionIndexRecord;
};

export type UploadChunkRequest = {
  sessionId: string;
  userId: string;
  chunkIndex: number;
  events: eventWithTime[];
  startedAt: string;
  endedAt: string;
};

export type UploadChunkResponse = {
  session: SessionIndexRecord;
  chunk: ReplayChunkDescriptor;
  metrics: IngestMetrics;
};

export type FinishSessionRequest = {
  endedAt: string;
  status?: Extract<SessionStatus, 'completed' | 'abandoned'>;
};

export type FinishSessionResponse = {
  session: SessionIndexRecord;
};

export type SearchSessionsResponse = {
  sessions: SessionIndexRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export type SessionReplayResponse = {
  session: SessionIndexRecord;
  manifest: ReplayManifest;
  events: eventWithTime[];
  metrics: ReplayMetrics;
};

export type IngestMetrics = {
  requestDurationMs: number;
  payloadBytes: number;
  storedBytes: number;
};

export type ReplayMetrics = {
  queryDurationMs: number;
  fetchDurationMs: number;
  eventCount: number;
  chunkCount: number;
};

export type PerformanceMetricSnapshot = {
  ingestCount: number;
  replayCount: number;
  averageIngestDurationMs: number;
  averageReplayFetchDurationMs: number;
  averageChunkPayloadBytes: number;
  averageStoredChunkBytes: number;
  averageBigQueryQueryDurationMs: number;
};

export function createSessionId(): string {
  if (
    'crypto' in globalThis &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `session_${randomPart}`;
}

export function createRandomUserId(): string {
  let result = '';
  for (let index = 0; index < 10; index += 1) {
    const min = index === 0 ? 1 : 0;
    const digit = Math.floor(Math.random() * (10 - min)) + min;
    result += digit.toString();
  }

  return result;
}

export function buildStoragePrefix(sessionId: string): string {
  return `sessions/${sessionId}`;
}

export function buildManifestPath(sessionId: string): string {
  return `${buildStoragePrefix(sessionId)}/manifest.json`;
}

export function buildChunkPath(sessionId: string, chunkIndex: number): string {
  return `${buildStoragePrefix(sessionId)}/chunks/${chunkIndex
    .toString()
    .padStart(6, '0')}.json.gz`;
}

export function nowIsoString(): string {
  return new Date().toISOString();
}

export function toDurationMs(startedAt: string, endedAt: string): number {
  return new Date(endedAt).getTime() - new Date(startedAt).getTime();
}
