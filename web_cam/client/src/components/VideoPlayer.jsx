// src/components/VideoPlayer.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  Self-contained HLS video player.
//  • Uses hls.js when browser doesn't support native HLS (Chrome, Firefox).
//  • Falls back to native <video src> for Safari.
//  • Handles auto-reconnect when stream drops.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Build the full HLS URL for a stream key
function hlsUrl(streamKey) {
  return `${API_BASE}/hls/live/${streamKey}/index.m3u8`;
}

const RECONNECT_DELAY_MS  = 5_000;
const FATAL_RETRY_LIMIT   = 6;

export default function VideoPlayer({ streamKey, live, label }) {
  const videoRef    = useRef(null);
  const hlsRef      = useRef(null);
  const retryRef    = useRef(0);
  const timerRef    = useRef(null);

  const [status, setStatus]   = useState('idle');   // idle | loading | playing | error | offline
  const [showCtrl, setShowCtrl] = useState(false);

  const destroyHls = useCallback(() => {
    clearTimeout(timerRef.current);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const initPlayer = useCallback(() => {
    if (!videoRef.current || !live) { setStatus('offline'); return; }
    const url = hlsUrl(streamKey);
    setStatus('loading');

    // ── Safari: native HLS support ──────────────────────────────────────────
    if (!Hls.isSupported()) {
      videoRef.current.src = url;
      videoRef.current.play().catch(() => {});
      setStatus('playing');
      return;
    }

    // ── hls.js ──────────────────────────────────────────────────────────────
    destroyHls();

    const hls = new Hls({
      // Low-latency tuning
      liveSyncDurationCount:      2,
      liveMaxLatencyDurationCount: 5,
      maxBufferLength:             10,
      maxMaxBufferLength:          30,
      enableWorker:                true,
      startFragPrefetch:           true,
      // Retry on network errors
      manifestLoadingMaxRetry:     6,
      levelLoadingMaxRetry:        6,
      fragLoadingMaxRetry:         6,
    });

    hls.loadSource(url);
    hls.attachMedia(videoRef.current);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      retryRef.current = 0;
      videoRef.current?.play().catch(() => {});
      setStatus('playing');
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (retryRef.current < FATAL_RETRY_LIMIT) {
          retryRef.current++;
          setStatus('loading');
          hls.startLoad();   // soft recover
        } else {
          scheduleReconnect();
        }
      } else {
        // Fatal media error → hard recover
        setStatus('error');
        hls.recoverMediaError();
      }
    });

    hlsRef.current = hls;
  }, [streamKey, live, destroyHls]);

  const scheduleReconnect = useCallback(() => {
    setStatus('loading');
    destroyHls();
    retryRef.current = 0;
    timerRef.current = setTimeout(initPlayer, RECONNECT_DELAY_MS);
  }, [initPlayer, destroyHls]);

  // Re-init player whenever live status or streamKey changes
  useEffect(() => {
    initPlayer();
    return destroyHls;
  }, [initPlayer, destroyHls]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="player-wrap"
      onMouseEnter={() => setShowCtrl(true)}
      onMouseLeave={() => setShowCtrl(false)}
    >
      {/* Overlay states */}
      {status === 'offline' && (
        <div className="player-overlay">
          <span className="overlay-icon">📷</span>
          <span>Không có tín hiệu</span>
        </div>
      )}
      {status === 'loading' && (
        <div className="player-overlay">
          <span className="spinner" />
          <span>Đang kết nối...</span>
        </div>
      )}
      {status === 'error' && (
        <div className="player-overlay">
          <span className="overlay-icon">⚠️</span>
          <span>Lỗi stream — thử lại...</span>
        </div>
      )}

      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        controls={showCtrl && status === 'playing'}
        style={{ width: '100%', display: 'block', background: '#000', aspectRatio: '16/9' }}
      />
    </div>
  );
}
