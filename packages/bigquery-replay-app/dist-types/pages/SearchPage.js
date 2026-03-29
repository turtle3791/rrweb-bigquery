import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchMetricsSummary, fetchSessions } from '~/lib/api';
export function SearchPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState();
    const [metrics, setMetrics] = useState();
    const [totalCount, setTotalCount] = useState(0);
    const [filters, setFilters] = useState({
        userId: searchParams.get('userId') ?? '',
        from: searchParams.get('from') ?? '',
        to: searchParams.get('to') ?? '',
    });
    const query = useMemo(() => ({
        userId: searchParams.get('userId') ?? undefined,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        page: Number(searchParams.get('page') ?? '0'),
        pageSize: Number(searchParams.get('pageSize') ?? '20'),
    }), [searchParams]);
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
            .catch((fetchError) => {
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
    return (_jsxs("section", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Find stored sessions" }), _jsx("p", { children: "Search by generated user ID or a start time window." })] }), _jsxs("span", { className: "metric-pill", children: [totalCount, " matches"] })] }), _jsxs("form", { className: "search-form", onSubmit: (event) => {
                    event.preventDefault();
                    setSearchParams(compactParams(filters));
                }, children: [_jsxs("label", { children: [_jsx("span", { children: "User ID" }), _jsx("input", { onChange: (event) => setFilters((current) => ({
                                    ...current,
                                    userId: event.target.value,
                                })), placeholder: "1234567890", value: filters.userId })] }), _jsxs("label", { children: [_jsx("span", { children: "From" }), _jsx("input", { onChange: (event) => setFilters((current) => ({
                                    ...current,
                                    from: event.target.value,
                                })), type: "datetime-local", value: filters.from })] }), _jsxs("label", { children: [_jsx("span", { children: "To" }), _jsx("input", { onChange: (event) => setFilters((current) => ({
                                    ...current,
                                    to: event.target.value,
                                })), type: "datetime-local", value: filters.to })] }), _jsx("button", { type: "submit", children: "Search" })] }), error ? _jsx("p", { className: "error-text", children: error }) : null, loading ? _jsx("p", { children: "Loading sessions..." }) : null, metrics ? (_jsxs("div", { className: "detail-grid", children: [_jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Avg ingest" }), _jsxs("strong", { children: [metrics.averageIngestDurationMs.toFixed(1), " ms"] })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Avg replay fetch" }), _jsxs("strong", { children: [metrics.averageReplayFetchDurationMs.toFixed(1), " ms"] })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Avg chunk payload" }), _jsx("strong", { children: formatBytes(metrics.averageChunkPayloadBytes) })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Avg stored chunk" }), _jsx("strong", { children: formatBytes(metrics.averageStoredChunkBytes) })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Avg query time" }), _jsxs("strong", { children: [metrics.averageBigQueryQueryDurationMs.toFixed(1), " ms"] })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Captured chunks" }), _jsx("strong", { children: metrics.ingestCount })] })] })) : null, _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "User ID" }), _jsx("th", { children: "Started" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Events" }), _jsx("th", { children: "Chunks" }), _jsx("th", { children: "Replay" })] }) }), _jsxs("tbody", { children: [sessions.map((session) => (_jsxs("tr", { children: [_jsx("td", { children: session.userId }), _jsx("td", { children: new Date(session.startedAt).toLocaleString() }), _jsx("td", { children: session.status }), _jsx("td", { children: session.eventCount }), _jsx("td", { children: session.chunkCount }), _jsx("td", { children: _jsx(Link, { to: `/sessions/${session.sessionId}`, children: "Open replay" }) })] }, session.sessionId))), sessions.length === 0 && !loading ? (_jsx("tr", { children: _jsx("td", { className: "empty-state", colSpan: 6, children: "No sessions matched the current filters." }) })) : null] })] }) })] }));
}
function compactParams(filters) {
    return Object.fromEntries(Object.entries(filters).filter(([, value]) => value.length > 0));
}
function formatBytes(value) {
    if (value < 1024) {
        return `${value.toFixed(0)} B`;
    }
    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
//# sourceMappingURL=SearchPage.js.map