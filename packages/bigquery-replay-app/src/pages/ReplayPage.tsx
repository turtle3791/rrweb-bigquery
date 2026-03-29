import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SessionReplayResponse } from '@rrweb/bigquery-replay-contracts';
import { fetchSessionReplay } from '~/lib/api';

declare global {
  interface Window {
    rrweb?: {
      Replayer: new (
        events: unknown[],
        config?: Partial<{
          root: HTMLElement;
          speed: number;
          autoPlay: boolean;
          skipInactive: boolean;
        }>,
      ) => RRwebReplayerInstance;
    };
  }
}

type PlayerMetaData = {
  startTime: number;
  endTime: number;
  totalTime: number;
};

type RRwebReplayerInstance = {
  wrapper: HTMLElement;
  iframe: HTMLIFrameElement;
  play: (timeOffset?: number) => void;
  pause: (timeOffset?: number) => void;
  getCurrentTime: () => number;
  getMetaData: () => PlayerMetaData;
  destroy: () => void;
};

export function ReplayPage() {
  const { sessionId } = useParams();
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<RRwebReplayerInstance | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const [replay, setReplay] = useState<SessionReplayResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let isMounted = true;
    setLoading(true);
    setError(undefined);
    void fetchSessionReplay(sessionId)
      .then((r) => isMounted && setReplay(r))
      .catch((e: Error) => isMounted && setError(e.message))
      .finally(() => isMounted && setLoading(false));
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!replay || !playerContainerRef.current) return;
    let isMounted = true;

    void loadRRwebFromCDN()
      .then(() => {
        if (!isMounted || !playerContainerRef.current || !window.rrweb) return;

        if (replayerRef.current) {
          replayerRef.current.destroy();
          replayerRef.current = null;
        }
        playerContainerRef.current.innerHTML = '';

        const replayer = new window.rrweb.Replayer(replay.events, {
          root: playerContainerRef.current,
          speed: 1,
          autoPlay: false,
          skipInactive: true,
        });

        replayerRef.current = replayer;

        setTimeout(() => computeScale(), 150);

        const meta = replayer.getMetaData();
        setTotalTime(meta.totalTime);
        setReady(true);
        setPlaying(false);
        setProgress(0);
      })
      .catch((err: Error) => {
        if (isMounted) setPlayerError(err.message);
      });

    return () => {
      isMounted = false;
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current);
      if (replayerRef.current) {
        replayerRef.current.destroy();
        replayerRef.current = null;
      }
    };
  }, [replay]);

  const startProgressLoop = useCallback(() => {
    const tick = () => {
      const r = replayerRef.current;
      if (!r) return;
      const t = r.getCurrentTime();
      setProgress(t);
      const meta = r.getMetaData();
      if (t >= meta.totalTime) {
        setPlaying(false);
        setProgress(meta.totalTime);
        return;
      }
      progressTimerRef.current = requestAnimationFrame(tick);
    };
    progressTimerRef.current = requestAnimationFrame(tick);
  }, []);

  const stopProgressLoop = useCallback(() => {
    if (progressTimerRef.current) {
      cancelAnimationFrame(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const handlePlay = useCallback(() => {
    const r = replayerRef.current;
    if (!r) return;
    const meta = r.getMetaData();
    if (progress >= meta.totalTime) {
      r.play(0);
      setProgress(0);
    } else {
      r.play(progress);
    }
    setPlaying(true);
    startProgressLoop();
  }, [progress, startProgressLoop]);

  const handlePause = useCallback(() => {
    replayerRef.current?.pause();
    setPlaying(false);
    stopProgressLoop();
  }, [stopProgressLoop]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = Number(e.target.value);
      setProgress(t);
      const r = replayerRef.current;
      if (!r) return;
      if (playing) {
        r.play(t);
      } else {
        r.pause(t);
      }
    },
    [playing],
  );

  const handleSpeed = useCallback((s: number) => {
    setSpeed(s);
    const r = replayerRef.current;
    if (!r) return;
    r.pause();
    const cur = r.getCurrentTime();
    (r as unknown as { config: { speed: number } }).config.speed = s;
    r.play(cur);
    setPlaying(true);
  }, []);

  const [scaleFactor, setScaleFactor] = useState(1);
  const [iframeDims, setIframeDims] = useState({ w: 0, h: 0 });

  const computeScale = useCallback(() => {
    const container = playerContainerRef.current;
    const replayer = replayerRef.current;
    if (!container || !replayer) return;

    const iframe = replayer.iframe;
    if (!iframe) return;

    const iw = iframe.offsetWidth || 1024;
    const ih = iframe.offsetHeight || 768;
    const cw = container.parentElement?.clientWidth ?? container.clientWidth;

    setIframeDims({ w: iw, h: ih });
    setScaleFactor(Math.min(1, cw / iw));
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    const onResize = () => computeScale();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ready, computeScale]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Replay</p>
          <h2>{sessionId}</h2>
        </div>
        <Link className="header-link" to="/">
          Back to search
        </Link>
      </div>

      {loading ? <p>Loading replay...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {playerError ? (
        <p className="error-text">Player error: {playerError}</p>
      ) : null}

      {replay ? (
        <>
          <div className="detail-grid">
            <div>
              <span className="detail-label">User ID</span>
              <strong>{replay.session.userId}</strong>
            </div>
            <div>
              <span className="detail-label">Started</span>
              <strong>
                {new Date(replay.session.startedAt).toLocaleString()}
              </strong>
            </div>
            <div>
              <span className="detail-label">Chunks</span>
              <strong>{replay.metrics.chunkCount}</strong>
            </div>
            <div>
              <span className="detail-label">Events</span>
              <strong>{replay.metrics.eventCount}</strong>
            </div>
            <div>
              <span className="detail-label">Query time</span>
              <strong>{replay.metrics.queryDurationMs} ms</strong>
            </div>
            <div>
              <span className="detail-label">Replay fetch time</span>
              <strong>{replay.metrics.fetchDurationMs} ms</strong>
            </div>
          </div>

          {ready ? (
            <div className="replay-controls">
              <button
                className="replay-btn"
                onClick={playing ? handlePause : handlePlay}
              >
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <input
                className="replay-slider"
                type="range"
                min={0}
                max={totalTime}
                value={progress}
                onChange={handleSeek}
              />
              <span className="replay-time">
                {formatTime(progress)} / {formatTime(totalTime)}
              </span>
              <span className="replay-speed-group">
                {[1, 2, 4, 8].map((s) => (
                  <button
                    key={s}
                    className={`replay-speed-btn${speed === s ? ' active' : ''}`}
                    onClick={() => handleSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </span>
            </div>
          ) : null}

          <div
            className="player-shell"
            style={
              iframeDims.w > 0
                ? {
                    width: '100%',
                    height: iframeDims.h * scaleFactor,
                    overflow: 'hidden',
                  }
                : undefined
            }
          >
            <div
              ref={playerContainerRef}
              style={
                iframeDims.w > 0
                  ? {
                      transform: `scale(${scaleFactor})`,
                      transformOrigin: 'top left',
                      width: iframeDims.w,
                      height: iframeDims.h,
                    }
                  : undefined
              }
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

async function loadRRwebFromCDN(): Promise<void> {
  if (window.rrweb?.Replayer) return;

  const styleId = 'rrweb-replayer-css';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/style.css';
    document.head.appendChild(link);
  }

  const scriptId = 'rrweb-replayer-js';
  if (!document.getElementById(scriptId)) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load rrweb from CDN'));
      document.head.appendChild(s);
    });
  }

  await new Promise<void>((resolve, reject) => {
    const t0 = Date.now();
    const check = () => {
      if (window.rrweb?.Replayer) {
        resolve();
        return;
      }
      if (Date.now() - t0 > 10_000) {
        reject(new Error('Timed out waiting for rrweb.Replayer global'));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}
