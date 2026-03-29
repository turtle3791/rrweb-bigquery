import type {
  PerformanceMetricSnapshot,
  SearchSessionsResponse,
  SessionReplayResponse,
} from '@rrweb/bigquery-replay-contracts';
export declare function fetchSessions(query: {
  from?: string;
  page?: number;
  pageSize?: number;
  to?: string;
  userId?: string;
}): Promise<SearchSessionsResponse>;
export declare function fetchSessionReplay(
  sessionId: string,
): Promise<SessionReplayResponse>;
export declare function fetchMetricsSummary(): Promise<PerformanceMetricSnapshot>;
