import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchSessionReplay } from '~/lib/api';
const RRWEB_PLAYER_VERSION = '2.0.0-alpha.20';
export function ReplayPage() {
    const { sessionId } = useParams();
    const playerElementRef = useRef(null);
    const playerRef = useRef(null);
    const [replay, setReplay] = useState();
    const [error, setError] = useState();
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!sessionId) {
            return;
        }
        let isMounted = true;
        setLoading(true);
        setError(undefined);
        void fetchSessionReplay(sessionId)
            .then((response) => {
            if (!isMounted) {
                return;
            }
            setReplay(response);
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
    }, [sessionId]);
    useEffect(() => {
        if (!replay || !playerElementRef.current) {
            return;
        }
        let isMounted = true;
        void ensurePlayerAssets().then(() => {
            if (!isMounted || !playerElementRef.current) {
                return;
            }
            if (playerRef.current) {
                playerRef.current.pause();
                playerRef.current.$destroy();
                playerRef.current = null;
            }
            playerRef.current = new window.rrwebPlayer({
                target: playerElementRef.current,
                props: {
                    autoPlay: false,
                    events: replay.events,
                    showController: true,
                },
            });
        });
        return () => {
            isMounted = false;
            playerRef.current?.pause();
            playerRef.current?.$destroy();
            playerRef.current = null;
        };
    }, [replay]);
    return (_jsxs("section", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Replay" }), _jsx("h2", { children: sessionId })] }), _jsx(Link, { className: "header-link", to: "/", children: "Back to search" })] }), loading ? _jsx("p", { children: "Loading replay..." }) : null, error ? _jsx("p", { className: "error-text", children: error }) : null, replay ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "detail-grid", children: [_jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "User ID" }), _jsx("strong", { children: replay.session.userId })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Started" }), _jsx("strong", { children: new Date(replay.session.startedAt).toLocaleString() })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Chunks" }), _jsx("strong", { children: replay.metrics.chunkCount })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Events" }), _jsx("strong", { children: replay.metrics.eventCount })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Query time" }), _jsxs("strong", { children: [replay.metrics.queryDurationMs, " ms"] })] }), _jsxs("div", { children: [_jsx("span", { className: "detail-label", children: "Replay fetch time" }), _jsxs("strong", { children: [replay.metrics.fetchDurationMs, " ms"] })] })] }), _jsx("div", { className: "player-shell", children: _jsx("div", { ref: playerElementRef }) })] })) : null] }));
}
async function ensurePlayerAssets() {
    ensurePlayerStylesheet();
    await ensurePlayerScript();
}
function ensurePlayerStylesheet() {
    const stylesheetId = 'rrweb-player-stylesheet';
    if (document.getElementById(stylesheetId)) {
        return;
    }
    const linkElement = document.createElement('link');
    linkElement.id = stylesheetId;
    linkElement.rel = 'stylesheet';
    linkElement.href = `https://cdn.jsdelivr.net/npm/rrweb-player@${RRWEB_PLAYER_VERSION}/dist/style.css`;
    document.head.appendChild(linkElement);
}
async function ensurePlayerScript() {
    const scriptId = 'rrweb-player-script';
    if (window.rrwebPlayer) {
        return;
    }
    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
        await waitForPlayerGlobal();
        return;
    }
    await new Promise((resolve, reject) => {
        const scriptElement = document.createElement('script');
        scriptElement.id = scriptId;
        scriptElement.src = `https://cdn.jsdelivr.net/npm/rrweb-player@${RRWEB_PLAYER_VERSION}/dist/index.js`;
        scriptElement.onload = () => resolve();
        scriptElement.onerror = () => reject(new Error('Failed to load rrweb-player script'));
        document.body.appendChild(scriptElement);
    });
    await waitForPlayerGlobal();
}
async function waitForPlayerGlobal() {
    if (window.rrwebPlayer) {
        return;
    }
    await new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const intervalId = window.setInterval(() => {
            if (window.rrwebPlayer) {
                window.clearInterval(intervalId);
                resolve();
                return;
            }
            if (Date.now() - startedAt > 5_000) {
                window.clearInterval(intervalId);
                reject(new Error('Timed out waiting for rrweb-player'));
            }
        }, 50);
    });
}
//# sourceMappingURL=ReplayPage.js.map