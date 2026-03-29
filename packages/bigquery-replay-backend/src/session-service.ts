import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  buildChunkPath,
  buildManifestPath,
  buildStoragePrefix,
  type eventWithTime,
  nowIsoString,
  toDurationMs,
  type FinishSessionRequest,
  type FinishSessionResponse,
  type IngestMetrics,
  type ReplayChunkDescriptor,
  type ReplayManifest,
  type SearchSessionsResponse,
  type SessionIndexRecord,
  type SessionReplayResponse,
  type StartSessionRequest,
  type StartSessionResponse,
  type UploadChunkRequest,
  type UploadChunkResponse,
} from '@rrweb/bigquery-replay-contracts';
import type { PerformanceMetricsStore } from './metrics.js';
import type { ObjectStore } from './object-store.js';
import type { SearchFilters, SessionIndex } from './session-index.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export class SessionService {
  private readonly manifestLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly sessionIndex: SessionIndex,
    private readonly objectStore: ObjectStore,
    private readonly metricsStore: PerformanceMetricsStore,
  ) {}

  private withManifestLock<T>(
    sessionId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = this.manifestLocks.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.manifestLocks.set(sessionId, next);
    next.finally(() => {
      if (this.manifestLocks.get(sessionId) === next) {
        this.manifestLocks.delete(sessionId);
      }
    });
    return next;
  }

  async ensureReady(): Promise<void> {
    await this.sessionIndex.ensureReady();
  }

  async startSession(
    request: StartSessionRequest,
  ): Promise<StartSessionResponse> {
    const now = nowIsoString();
    const session: SessionIndexRecord = {
      sessionId: request.sessionId,
      userId: request.userId,
      startedAt: request.startedAt,
      status: 'active',
      eventCount: 0,
      chunkCount: 0,
      storagePrefix: buildStoragePrefix(request.sessionId),
      manifestPath: buildManifestPath(request.sessionId),
      pageUrl: request.pageUrl,
      appVersion: request.appVersion,
      sdkVersion: request.sdkVersion,
      environment: request.environment,
      tags: request.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await this.writeManifest({
      sessionId: session.sessionId,
      userId: session.userId,
      storagePrefix: session.storagePrefix,
      createdAt: now,
      updatedAt: now,
      totalEventCount: 0,
      chunks: [],
    });
    await this.sessionIndex.upsertSession(session);

    return { session };
  }

  async appendChunk(
    request: UploadChunkRequest,
  ): Promise<UploadChunkResponse> {
    const session = await this.requireSession(request.sessionId);
    if (session.userId !== request.userId) {
      throw new ValidationError('Chunk userId does not match the session userId');
    }

    const startedAt = Date.now();
    const serializedEvents = Buffer.from(JSON.stringify(request.events));
    const compressedEvents = await gzipAsync(serializedEvents);
    const chunkPath = buildChunkPath(request.sessionId, request.chunkIndex);
    await this.objectStore.write(chunkPath, compressedEvents);

    const chunk: ReplayChunkDescriptor = {
      chunkIndex: request.chunkIndex,
      objectPath: chunkPath,
      eventCount: request.events.length,
      startedAt: request.startedAt,
      endedAt: request.endedAt,
      byteSize: compressedEvents.byteLength,
      payloadBytes: serializedEvents.byteLength,
      compression: 'gzip-json' as const,
    };

    const updatedSession = await this.withManifestLock(
      request.sessionId,
      async () => {
        const manifest = await this.readManifest(session);
        const existingIndex = manifest.chunks.findIndex(
          (entry: ReplayChunkDescriptor) =>
            entry.chunkIndex === chunk.chunkIndex,
        );
        if (existingIndex >= 0) {
          manifest.chunks[existingIndex] = chunk;
        } else {
          manifest.chunks.push(chunk);
        }
        manifest.chunks.sort(
          (left: ReplayChunkDescriptor, right: ReplayChunkDescriptor) =>
            left.chunkIndex - right.chunkIndex,
        );
        manifest.totalEventCount = manifest.chunks.reduce(
          (sum: number, entry: ReplayChunkDescriptor) =>
            sum + entry.eventCount,
          0,
        );
        manifest.updatedAt = nowIsoString();
        await this.writeManifest(manifest);

        const result: SessionIndexRecord = {
          ...session,
          status: 'active',
          eventCount: manifest.totalEventCount,
          chunkCount: manifest.chunks.length,
          lastChunkUploadedAt: manifest.updatedAt,
          updatedAt: manifest.updatedAt,
        };
        await this.sessionIndex.upsertSession(result);
        return result;
      },
    );

    const metrics: IngestMetrics = {
      requestDurationMs: Date.now() - startedAt,
      payloadBytes: serializedEvents.byteLength,
      storedBytes: compressedEvents.byteLength,
    };
    this.metricsStore.recordIngest({
      durationMs: metrics.requestDurationMs,
      payloadBytes: metrics.payloadBytes,
      storedBytes: metrics.storedBytes,
    });

    return {
      session: updatedSession,
      chunk,
      metrics,
    };
  }

  async finishSession(
    sessionId: string,
    request: FinishSessionRequest,
  ): Promise<FinishSessionResponse> {
    const session = await this.requireSession(sessionId);
    const updatedAt = nowIsoString();
    const status = request.status ?? 'completed';
    const updatedSession: SessionIndexRecord = {
      ...session,
      endedAt: request.endedAt,
      durationMs: toDurationMs(session.startedAt, request.endedAt),
      status,
      updatedAt,
    };
    await this.sessionIndex.upsertSession(updatedSession);

    const manifest = await this.readManifest(updatedSession);
    manifest.updatedAt = updatedAt;
    await this.writeManifest(manifest);

    return {
      session: updatedSession,
    };
  }

  async searchSessions(filters: SearchFilters): Promise<SearchSessionsResponse> {
    const result = await this.sessionIndex.searchSessions(filters);
    this.metricsStore.recordQueryDuration(result.queryDurationMs);

    return {
      sessions: result.sessions,
      page: filters.page,
      pageSize: filters.pageSize,
      totalCount: result.totalCount,
    };
  }

  async getSessionOverview(
    sessionId: string,
  ): Promise<Pick<SessionReplayResponse, 'manifest' | 'session'>> {
    const queryStartedAt = Date.now();
    const session = await this.requireSession(sessionId);
    const queryDurationMs = Date.now() - queryStartedAt;
    this.metricsStore.recordQueryDuration(queryDurationMs);

    return {
      session,
      manifest: await this.readManifest(session),
    };
  }

  async getReplay(sessionId: string): Promise<SessionReplayResponse> {
    const queryStartedAt = Date.now();
    const session = await this.requireSession(sessionId);
    const queryDurationMs = Date.now() - queryStartedAt;
    this.metricsStore.recordQueryDuration(queryDurationMs);

    const fetchStartedAt = Date.now();
    const manifest = await this.readManifest(session);
    const chunkEvents = await Promise.all(
      manifest.chunks.map((chunk: ReplayChunkDescriptor) =>
        this.readChunkEvents(chunk.objectPath),
      ),
    );
    const events = chunkEvents.flat();
    const fetchDurationMs = Date.now() - fetchStartedAt;
    this.metricsStore.recordReplay({ fetchDurationMs });

    return {
      session,
      manifest,
      events,
      metrics: {
        queryDurationMs,
        fetchDurationMs,
        eventCount: events.length,
        chunkCount: manifest.chunks.length,
      },
    };
  }

  private async readChunkEvents(objectPath: string): Promise<eventWithTime[]> {
    const contents = await this.objectStore.read(objectPath);
    const decompressed = await gunzipAsync(contents);
    return JSON.parse(decompressed.toString('utf8')) as eventWithTime[];
  }

  private async readManifest(session: SessionIndexRecord): Promise<ReplayManifest> {
    try {
      const manifestContents = await this.objectStore.read(session.manifestPath);
      return JSON.parse(manifestContents.toString('utf8')) as ReplayManifest;
    } catch (error) {
      if (isMissingObjectError(error)) {
        return {
          sessionId: session.sessionId,
          userId: session.userId,
          storagePrefix: session.storagePrefix,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          totalEventCount: 0,
          chunks: [],
        };
      }

      throw error;
    }
  }

  private async writeManifest(manifest: ReplayManifest): Promise<void> {
    await this.objectStore.write(
      buildManifestPath(manifest.sessionId),
      Buffer.from(JSON.stringify(manifest, null, 2)),
    );
  }

  private async requireSession(sessionId: string): Promise<SessionIndexRecord> {
    const session = await this.sessionIndex.getSession(sessionId);
    if (!session) {
      throw new NotFoundError(`Session ${sessionId} was not found`);
    }

    return session;
  }
}

function isMissingObjectError(error: unknown): boolean {
  const candidate = error as { code?: number | string };
  return candidate.code === 'ENOENT' || candidate.code === 404;
}
