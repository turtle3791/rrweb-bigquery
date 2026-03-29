const API_BASE_URL = import.meta.env.VITE_REPLAY_API_BASE_URL ?? 'http://localhost:4318';
export async function fetchSessions(query) {
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
    return request(`/sessions?${searchParams.toString()}`);
}
export async function fetchSessionReplay(sessionId) {
    return request(`/sessions/${sessionId}/replay`);
}
export async function fetchMetricsSummary() {
    return request('/metrics/summary');
}
async function request(path) {
    const response = await fetch(`${API_BASE_URL}${path}`);
    if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
    }
    return (await response.json());
}
function normalizeDateValue(value) {
    return new Date(value).toISOString();
}
//# sourceMappingURL=api.js.map