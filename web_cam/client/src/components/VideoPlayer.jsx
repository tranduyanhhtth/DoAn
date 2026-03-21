// src/components/VideoPlayer.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

const API_BASE = import.meta.env.VITE_API_URL || '';
const RECONNECT_DELAY_MS = 5000;
const FATAL_RETRY_LIMIT  = 6;

const CamIcon = () => (
  <div className="cam-icon-wrap">
    <svg viewBox="0 0 24 24">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14"/>
      <rect x="3" y="6" width="12" height="12" rx="2"/>
    </svg>
  </div>
);

export default function VideoPlayer({ hlsUrl, live }) {
  const videoRef  = useRef(null);
  const hlsRef    = useRef(null);
  const retryRef  = useRef(0);
  const timerRef  = useRef(null);

  const [status,   setStatus]   = useState('idle');
  const [showCtrl, setShowCtrl] = useState(false);

  const destroyHls = useCallback(() => {
    clearTimeout(timerRef.current);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
  }, []);

  const initPlayer = useCallback(() => {
    if (!videoRef.current || !live) { setStatus('offline'); return; }
    const url = hlsUrl;
    setStatus('loading');

    if (!Hls.isSupported()) {
      videoRef.current.src = url;
      videoRef.current.play().catch(() => {});
      setStatus('playing');
      return;
    }

    destroyHls();

    const hls = new Hls({
      liveSyncDurationCount:       3,    // giữ 3 segments buffer
      liveMaxLatencyDurationCount: 6,    // tối đa 6s lag trước khi skip
      maxBufferLength:             8,    // 8s buffer
      maxLiveSyncPlaybackRate:     1.5,  // tự tăng speed để bắt kịp live
      lowLatencyMode:              true, // bật LL-HLS
      enableWorker:                true,
      progressive:                 true,
    });

    hls.loadSource(url);
    hls.attachMedia(videoRef.current);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      retryRef.current = 0;
      videoRef.current?.play().catch(() => {});
      setStatus('playing');
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        retryRef.current < FATAL_RETRY_LIMIT
          ? (retryRef.current++, setStatus('loading'), hls.startLoad())
          : scheduleReconnect();
      } else {
        setStatus('error');
        hls.recoverMediaError();
      }
    });

    hlsRef.current = hls;
  }, [hlsUrl, live, destroyHls]);

  const scheduleReconnect = useCallback(() => {
    setStatus('loading');
    destroyHls();
    retryRef.current = 0;
    timerRef.current = setTimeout(initPlayer, RECONNECT_DELAY_MS);
  }, [initPlayer, destroyHls]);

  useEffect(() => { initPlayer(); return destroyHls; }, [initPlayer, destroyHls]);

  return (
    <div
      className="player-wrap"
      onMouseEnter={() => setShowCtrl(true)}
      onMouseLeave={() => setShowCtrl(false)}
    >
      {status === 'offline' && (
        <div className="player-overlay">
          <CamIcon />
          <span>Không có tín hiệu</span>
        </div>
      )}
      {status === 'loading' && (
        <div className="player-overlay">
          <div className="spinner" />
          <span>Đang kết nối...</span>
        </div>
      )}
      {status === 'error' && (
        <div className="player-overlay">
          <CamIcon />
          <span>Lỗi stream — thử lại...</span>
        </div>
      )}
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        controls={showCtrl && status === 'playing'}
        style={{ width: '100%', display: 'block', background: '#0f0f0e', aspectRatio: '16/9' }}
      />
    </div>
  );
}