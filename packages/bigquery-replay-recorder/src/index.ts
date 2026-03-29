import { record } from '@rrweb/record';
import {
  createRandomUserId,
  createSessionId,
  DEFAULT_CHUNK_EVENT_LIMIT,
  DEFAULT_CHUNK_FLUSH_MS,
  type eventWithTime,
  type FinishSessionRequest,
  type FinishSessionResponse,
  type StartSessionRequest,
  type StartSessionResponse,
  type UploadChunkRequest,
  type UploadChunkResponse,
} from '@rrweb/bigquery-replay-contracts';

export type RecorderClientOptions = {
  apiBaseUrl: string;
  appVersion?: string;
  environment?: string;
  pageUrl?: string;
  tags?: string[];
  sessionId?: string;
  userId?: string;
  chunkEventLimit?: number;
  flushIntervalMs?: number;
  recordOptions?: Omit<Parameters<typeof record>[0], 'emit'>;
  fetcher?: typeof fetch;
};

export type RecorderSessionIdentity = {
  sessionId: string;
  userId: string;
};

export class BigQueryReplayRecorder {
  private readonly apiBaseUrl: string;
  private readonly chunkEventLimit: number;
  private readonly fetcher: typeof fetch;
  private readonly flushIntervalMs: number;
  private readonly identity: RecorderSessionIdentity;
  private readonly startRequest: StartSessionRequest;
  private readonly recordOptions?: RecorderClientOptions['recordOptions'];
  private readonly startedAt: string;
  private buffer: eventWithTime[] = [];
  private chunkIndex = 0;
  private flushChain: Promise<void> = Promise.resolve();
  private timerId?: number;
  private stopRecording?: ReturnType<typeof record>;

  constructor(options: RecorderClientOptions) {
    const sessionId = options.sessionId ?? createSessionId();
    const userId = options.userId ?? createRandomUserId();
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, '');
    this.chunkEventLimit = options.chunkEventLimit ?? DEFAULT_CHUNK_EVENT_LIMIT;
    this.fetcher = options.fetcher ?? fetch;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_CHUNK_FLUSH_MS;
    this.identity = { sessionId, userId };
    this.recordOptions = options.recordOptions;
    this.startedAt = new Date().toISOString();
    this.startRequest = {
      sessionId,
      userId,
      startedAt: this.startedAt,
      pageUrl: options.pageUrl ?? window.location.href,
      appVersion: options.appVersion,
      environment: options.environment,
      sdkVersion: '@rrweb/bigquery-replay-recorder@0.0.0',
      tags: options.tags ?? [],
    };
  }

  getSessionIdentity(): RecorderSessionIdentity {
    return this.identity;
  }

  async start(): Promise<RecorderSessionIdentity> {
    await this.request<StartSessionResponse>('/sessions/start', {
      method: 'POST',
      body: JSON.stringify(this.startRequest),
    });

    this.stopRecording = record({
      ...this.recordOptions,
      emit: (event: eventWithTime) => {
        this.buffer.push(event);
        if (this.buffer.length >= this.chunkEventLimit) {
          void this.flush();
        }
      },
    });

    this.timerId = window.setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    window.addEventListener('pagehide', this.handlePageHide);

    return this.identity;
  }

  async flush(): Promise<void> {
    this.flushChain = this.flushChain.then(async () => {
      if (this.buffer.length === 0) {
        return;
      }

      const events = this.buffer;
      this.buffer = [];
      const chunkRequest: UploadChunkRequest = {
        sessionId: this.identity.sessionId,
        userId: this.identity.userId,
        chunkIndex: this.chunkIndex,
        events,
        startedAt: new Date(events[0].timestamp).toISOString(),
        endedAt: new Date(events[events.length - 1].timestamp).toISOString(),
      };
      this.chunkIndex += 1;

      await this.request<UploadChunkResponse>(
        `/sessions/${this.identity.sessionId}/chunks`,
        {
          method: 'POST',
          body: JSON.stringify(chunkRequest),
          keepalive: true,
        },
      );
    });

    return this.flushChain;
  }

  async stop(
    status: FinishSessionRequest['status'] = 'completed',
  ): Promise<void> {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = undefined;
    }
    window.removeEventListener('pagehide', this.handlePageHide);
    this.stopRecording?.();
    await this.flush();
    await this.request<FinishSessionResponse>(
      `/sessions/${this.identity.sessionId}/finish`,
      {
        method: 'POST',
        body: JSON.stringify({
          endedAt: new Date().toISOString(),
          status,
        } satisfies FinishSessionRequest),
        keepalive: true,
      },
    );
  }

  private readonly handlePageHide = () => {
    void this.flush();
  };

  private async request<T>(
    path: string,
    init: RequestInit & { body?: string },
  ): Promise<T> {
    const response = await this.fetcher(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  }
}

export function createBigQueryReplayRecorder(
  options: RecorderClientOptions,
): BigQueryReplayRecorder {
  return new BigQueryReplayRecorder(options);
}
