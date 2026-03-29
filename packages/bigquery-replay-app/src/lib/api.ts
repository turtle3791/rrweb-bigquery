import type {
  PerformanceMetricSnapshot,
  SearchSessionsResponse,
  SessionReplayResponse,
} from '@rrweb/bigquery-replay-contracts';

const API_BASE_URL =
  import.meta.env.VITE_REPLAY_API_BASE_URL ?? 'http://localhost:4318';

export async function fetchSessions(query: {
  from?: string;
  page?: number;
  pageSize?: number;
  to?: string;
  userId?: string;
}): Promise<SearchSessionsResponse> {
  const searchParams = new URLSearchParams();
  if (query.userId) {
    searchParams.set('userId', query.userId);
  }
  if (query.from) {
    searchParams.set('from', normalizeDateValue(query.from));
  }
  if (query.to) {
    searchParams.set('to', normalizeDateValue(query.to));
  }
  searchParams.set('page', String(query.page ?? 0));
  searchParams.set('pageSize', String(query.pageSize ?? 20));

  return request<SearchSessionsResponse>(`/sessions?${searchParams.toString()}`);
}

export async function fetchSessionReplay(
  sessionId: string,
): Promise<SessionReplayResponse> {
  return request<SessionReplayResponse>(`/sessions/${sessionId}/replay`);
}

export async function fetchMetricsSummary(): Promise<PerformanceMetricSnapshot> {
  return request<PerformanceMetricSnapshot>('/metrics/summary');
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function normalizeDateValue(value: string): string {
  return new Date(value).toISOString();
}
