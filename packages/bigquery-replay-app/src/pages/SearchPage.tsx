import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  PerformanceMetricSnapshot,
  SessionIndexRecord,
} from '@rrweb/bigquery-replay-contracts';
import { fetchMetricsSummary, fetchSessions } from '~/lib/api';

type SearchState = {
  from: string;
  to: string;
  userId: string;
};

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<SessionIndexRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [metrics, setMetrics] = useState<PerformanceMetricSnapshot>();
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<SearchState>({
    userId: searchParams.get('userId') ?? '',
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  });

  const query = useMemo(
    () => ({
      userId: searchParams.get('userId') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      page: Number(searchParams.get('page') ?? '0'),
      pageSize: Number(searchParams.get('pageSize') ?? '20'),
    }),
    [searchParams],
  );

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(undefined);
    void fetchSessions(query)
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setSessions(response.sessions);
        setTotalCount(response.totalCount);
      })
      .catch((fetchError: Error) => {
        if (!isMounted) {
          return;
        }
        setError(fetchError.message);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [query]);

  useEffect(() => {
    let isMounted = true;
    void fetchMetricsSummary()
      .then((response) => {
        if (isMounted) {
          setMetrics(response);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMetrics(undefined);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sessions.length]);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Find stored sessions</h2>
          <p>Search by generated user ID or a start time window.</p>
        </div>
        <span className="metric-pill">{totalCount} matches</span>
      </div>

      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSearchParams(compactParams(filters));
        }}
      >
        <label>
          <span>User ID</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                userId: event.target.value,
              }))
            }
            placeholder="1234567890"
            value={filters.userId}
          />
        </label>
        <label>
          <span>From</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                from: event.target.value,
              }))
            }
            type="datetime-local"
            value={filters.from}
          />
        </label>
        <label>
          <span>To</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                to: event.target.value,
              }))
            }
            type="datetime-local"
            value={filters.to}
          />
        </label>
        <button type="submit">Search</button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p>Loading sessions...</p> : null}

      {metrics ? (
        <div className="detail-grid">
          <div>
            <span className="detail-label">Avg ingest</span>
            <strong>{metrics.averageIngestDurationMs.toFixed(1)} ms</strong>
          </div>
          <div>
            <span className="detail-label">Avg replay fetch</span>
            <strong>{metrics.averageReplayFetchDurationMs.toFixed(1)} ms</strong>
          </div>
          <div>
            <span className="detail-label">Avg chunk payload</span>
            <strong>{formatBytes(metrics.averageChunkPayloadBytes)}</strong>
          </div>
          <div>
            <span className="detail-label">Avg stored chunk</span>
            <strong>{formatBytes(metrics.averageStoredChunkBytes)}</strong>
          </div>
          <div>
            <span className="detail-label">Avg query time</span>
            <strong>{metrics.averageBigQueryQueryDurationMs.toFixed(1)} ms</strong>
          </div>
          <div>
            <span className="detail-label">Captured chunks</span>
            <strong>{metrics.ingestCount}</strong>
          </div>
        </div>
      ) : null}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>User ID</th>
              <th>Started</th>
              <th>Status</th>
              <th>Events</th>
              <th>Chunks</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionId}>
                <td>{session.userId}</td>
                <td>{new Date(session.startedAt).toLocaleString()}</td>
                <td>{session.status}</td>
                <td>{session.eventCount}</td>
                <td>{session.chunkCount}</td>
                <td>
                  <Link to={`/sessions/${session.sessionId}`}>Open replay</Link>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && !loading ? (
              <tr>
                <td className="empty-state" colSpan={6}>
                  No sessions matched the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function compactParams(filters: SearchState): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value.length > 0),
  );
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value.toFixed(0)} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
