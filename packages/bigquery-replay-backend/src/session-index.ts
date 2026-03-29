import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BigQuery } from '@google-cloud/bigquery';
import type {
  SessionIndexRecord,
  SessionStatus,
} from '@rrweb/bigquery-replay-contracts';

export type SearchFilters = {
  userId?: string;
  from?: string;
  page: number;
  pageSize: number;
  status?: SessionStatus;
  to?: string;
};

export type SearchResult = {
  queryDurationMs: number;
  sessions: SessionIndexRecord[];
  totalCount: number;
};

export interface SessionIndex {
  ensureReady(): Promise<void>;
  getSession(sessionId: string): Promise<SessionIndexRecord | null>;
  searchSessions(filters: SearchFilters): Promise<SearchResult>;
  upsertSession(session: SessionIndexRecord): Promise<void>;
}

export class FileSessionIndex implements SessionIndex {
  constructor(private readonly dataDir: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const sessions = await this.readSessions();
    await this.writeSessions(sessions);
  }

  async getSession(sessionId: string): Promise<SessionIndexRecord | null> {
    const sessions = await this.readSessions();
    return sessions.find((session) => session.sessionId === sessionId) ?? null;
  }

  async searchSessions(filters: SearchFilters): Promise<SearchResult> {
    const startedAt = Date.now();
    const sessions = await this.readSessions();
    const filtered = sessions
      .filter((session) => matchesFilters(session, filters))
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      );
    const offset = filters.page * filters.pageSize;

    return {
      queryDurationMs: Date.now() - startedAt,
      sessions: filtered.slice(offset, offset + filters.pageSize),
      totalCount: filtered.length,
    };
  }

  async upsertSession(session: SessionIndexRecord): Promise<void> {
    const sessions = await this.readSessions();
    const index = sessions.findIndex(
      (entry) => entry.sessionId === session.sessionId,
    );
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    await this.writeSessions(sessions);
  }

  private async readSessions(): Promise<SessionIndexRecord[]> {
    const filePath = this.filePath();

    try {
      const contents = await readFile(filePath, 'utf8');
      return JSON.parse(contents) as SessionIndexRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  private async writeSessions(sessions: SessionIndexRecord[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.filePath(), JSON.stringify(sessions, null, 2));
  }

  private filePath(): string {
    return resolve(this.dataDir, 'sessions-index.json');
  }
}

export class BigQuerySessionIndex implements SessionIndex {
  private readonly bigQuery = new BigQuery();

  constructor(
    private readonly datasetName: string,
    private readonly tableName: string,
  ) {}

  async ensureReady(): Promise<void> {
    const dataset = this.bigQuery.dataset(this.datasetName);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
      await dataset.create();
    }

    const table = dataset.table(this.tableName);
    const [tableExists] = await table.exists();
    if (!tableExists) {
      await table.create({
        schema: [
          { name: 'sessionId', type: 'STRING', mode: 'REQUIRED' },
          { name: 'userId', type: 'STRING', mode: 'REQUIRED' },
          { name: 'startedAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'endedAt', type: 'TIMESTAMP' },
          { name: 'durationMs', type: 'INT64' },
          { name: 'status', type: 'STRING', mode: 'REQUIRED' },
          { name: 'eventCount', type: 'INT64', mode: 'REQUIRED' },
          { name: 'chunkCount', type: 'INT64', mode: 'REQUIRED' },
          { name: 'storagePrefix', type: 'STRING', mode: 'REQUIRED' },
          { name: 'manifestPath', type: 'STRING', mode: 'REQUIRED' },
          { name: 'pageUrl', type: 'STRING' },
          { name: 'appVersion', type: 'STRING' },
          { name: 'sdkVersion', type: 'STRING' },
          { name: 'environment', type: 'STRING' },
          { name: 'tags', type: 'STRING', mode: 'REPEATED' },
          { name: 'createdAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'updatedAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'lastChunkUploadedAt', type: 'TIMESTAMP' },
        ],
      });
    }
  }

  async getSession(sessionId: string): Promise<SessionIndexRecord | null> {
    const query = `SELECT * FROM \`${this.datasetName}.${this.tableName}\`
      WHERE sessionId = @sessionId
      LIMIT 1`;
    const [rows] = await this.bigQuery.query({
      query,
      params: { sessionId },
    });
    const row = rows[0] as Record<string, unknown> | undefined;

    return row ? mapBigQueryRow(row) : null;
  }

  async searchSessions(filters: SearchFilters): Promise<SearchResult> {
    const startedAt = Date.now();
    const whereClauses = ['1 = 1'];
    const params: Record<string, unknown> = {};

    if (filters.userId) {
      whereClauses.push('userId = @userId');
      params.userId = filters.userId;
    }

    if (filters.status) {
      whereClauses.push('status = @status');
      params.status = filters.status;
    }

    if (filters.from) {
      whereClauses.push('startedAt >= @from');
      params.from = filters.from;
    }

    if (filters.to) {
      whereClauses.push('startedAt <= @to');
      params.to = filters.to;
    }

    params.limit = filters.pageSize;
    params.offset = filters.page * filters.pageSize;
    const where = whereClauses.join(' AND ');
    const tableName = `\`${this.datasetName}.${this.tableName}\``;

    const [rows] = await this.bigQuery.query({
      query: `SELECT * FROM ${tableName}
        WHERE ${where}
        ORDER BY startedAt DESC
        LIMIT @limit OFFSET @offset`,
      params,
    });
    const [countRows] = await this.bigQuery.query({
      query: `SELECT COUNT(*) AS totalCount FROM ${tableName}
        WHERE ${where}`,
      params,
    });

    return {
      queryDurationMs: Date.now() - startedAt,
      sessions: rows.map((row) => mapBigQueryRow(row as Record<string, unknown>)),
      totalCount: Number(
        (countRows[0] as Record<string, unknown> | undefined)?.totalCount ?? 0,
      ),
    };
  }

  async upsertSession(session: SessionIndexRecord): Promise<void> {
    const query = `MERGE \`${this.datasetName}.${this.tableName}\` AS target
      USING (
        SELECT
          @sessionId AS sessionId,
          @userId AS userId,
          TIMESTAMP(@startedAt) AS startedAt,
          CASE
            WHEN @endedAt IS NULL THEN NULL
            ELSE TIMESTAMP(@endedAt)
          END AS endedAt,
          CAST(@durationMs AS INT64) AS durationMs,
          @status AS status,
          CAST(@eventCount AS INT64) AS eventCount,
          CAST(@chunkCount AS INT64) AS chunkCount,
          @storagePrefix AS storagePrefix,
          @manifestPath AS manifestPath,
          @pageUrl AS pageUrl,
          @appVersion AS appVersion,
          @sdkVersion AS sdkVersion,
          @environment AS environment,
          @tags AS tags,
          TIMESTAMP(@createdAt) AS createdAt,
          TIMESTAMP(@updatedAt) AS updatedAt,
          CASE
            WHEN @lastChunkUploadedAt IS NULL THEN NULL
            ELSE TIMESTAMP(@lastChunkUploadedAt)
          END AS lastChunkUploadedAt
      ) AS source
      ON target.sessionId = source.sessionId
      WHEN MATCHED THEN UPDATE SET
        userId = source.userId,
        startedAt = source.startedAt,
        endedAt = source.endedAt,
        durationMs = source.durationMs,
        status = source.status,
        eventCount = source.eventCount,
        chunkCount = source.chunkCount,
        storagePrefix = source.storagePrefix,
        manifestPath = source.manifestPath,
        pageUrl = source.pageUrl,
        appVersion = source.appVersion,
        sdkVersion = source.sdkVersion,
        environment = source.environment,
        tags = source.tags,
        createdAt = source.createdAt,
        updatedAt = source.updatedAt,
        lastChunkUploadedAt = source.lastChunkUploadedAt
      WHEN NOT MATCHED THEN INSERT (
        sessionId,
        userId,
        startedAt,
        endedAt,
        durationMs,
        status,
        eventCount,
        chunkCount,
        storagePrefix,
        manifestPath,
        pageUrl,
        appVersion,
        sdkVersion,
        environment,
        tags,
        createdAt,
        updatedAt,
        lastChunkUploadedAt
      ) VALUES (
        source.sessionId,
        source.userId,
        source.startedAt,
        source.endedAt,
        source.durationMs,
        source.status,
        source.eventCount,
        source.chunkCount,
        source.storagePrefix,
        source.manifestPath,
        source.pageUrl,
        source.appVersion,
        source.sdkVersion,
        source.environment,
        source.tags,
        source.createdAt,
        source.updatedAt,
        source.lastChunkUploadedAt
      )`;

    await this.bigQuery.query({
      query,
      params: {
        sessionId: session.sessionId,
        userId: session.userId,
        startedAt: session.startedAt,
        endedAt: session.endedAt ?? null,
        durationMs: session.durationMs ?? null,
        status: session.status,
        eventCount: session.eventCount,
        chunkCount: session.chunkCount,
        storagePrefix: session.storagePrefix,
        manifestPath: session.manifestPath,
        pageUrl: session.pageUrl ?? null,
        appVersion: session.appVersion ?? null,
        sdkVersion: session.sdkVersion ?? null,
        environment: session.environment ?? null,
        tags: session.tags,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastChunkUploadedAt: session.lastChunkUploadedAt ?? null,
      },
      types: {
        sessionId: 'STRING',
        userId: 'STRING',
        startedAt: 'STRING',
        endedAt: 'STRING',
        durationMs: 'INT64',
        status: 'STRING',
        eventCount: 'INT64',
        chunkCount: 'INT64',
        storagePrefix: 'STRING',
        manifestPath: 'STRING',
        pageUrl: 'STRING',
        appVersion: 'STRING',
        sdkVersion: 'STRING',
        environment: 'STRING',
        tags: ['STRING'],
        createdAt: 'STRING',
        updatedAt: 'STRING',
        lastChunkUploadedAt: 'STRING',
      },
    });
  }
}

function matchesFilters(
  session: SessionIndexRecord,
  filters: SearchFilters,
): boolean {
  if (filters.userId && session.userId !== filters.userId) {
    return false;
  }

  if (filters.status && session.status !== filters.status) {
    return false;
  }

  if (filters.from) {
    const fromTime = new Date(filters.from).getTime();
    if (new Date(session.startedAt).getTime() < fromTime) {
      return false;
    }
  }

  if (filters.to) {
    const toTime = new Date(filters.to).getTime();
    if (new Date(session.startedAt).getTime() > toTime) {
      return false;
    }
  }

  return true;
}

function mapBigQueryRow(row: Record<string, unknown>): SessionIndexRecord {
  return {
    sessionId: String(row.sessionId),
    userId: String(row.userId),
    startedAt: toIsoString(row.startedAt),
    endedAt: row.endedAt ? toIsoString(row.endedAt) : undefined,
    durationMs: row.durationMs ? Number(row.durationMs) : undefined,
    status: row.status as SessionStatus,
    eventCount: Number(row.eventCount ?? 0),
    chunkCount: Number(row.chunkCount ?? 0),
    storagePrefix: String(row.storagePrefix),
    manifestPath: String(row.manifestPath),
    pageUrl: row.pageUrl ? String(row.pageUrl) : undefined,
    appVersion: row.appVersion ? String(row.appVersion) : undefined,
    sdkVersion: row.sdkVersion ? String(row.sdkVersion) : undefined,
    environment: row.environment ? String(row.environment) : undefined,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    lastChunkUploadedAt: row.lastChunkUploadedAt
      ? toIsoString(row.lastChunkUploadedAt)
      : undefined,
  };
}

function toIsoString(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return new Date(String((value as { value: unknown }).value)).toISOString();
  }

  return new Date(String(value)).toISOString();
}
