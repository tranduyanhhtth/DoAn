// src/components/VideoPlayer.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

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
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);

  const [status,   setStatus]   = useState('idle');
  const [showCtrl, setShowCtrl] = useState(false);

  const destroyHls = useCallback(() => {
    clearTimeout(timerRef.current);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
  }, []);

  // Dùng ref để tránh circular dep giữa initPlayer ↔ scheduleReconnect
  const initPlayerRef = useRef(null);

  const scheduleReconnect = useCallback(() => {
    setStatus('loading');
    destroyHls();
    retryRef.current = 0;
    timerRef.current = setTimeout(() => initPlayerRef.current?.(), RECONNECT_DELAY_MS);
  }, [destroyHls]);

  const initPlayer = useCallback(() => {
    if (!videoRef.current || !live || !hlsUrl) {
      setStatus('offline');
      return;
    }

    setStatus('loading');
    destroyHls();

    if (!Hls.isSupported()) {
      videoRef.current.src = hlsUrl;
      videoRef.current.play().catch(() => {});
      setStatus('playing');
      return;
    }

    const hls = new Hls({
      // Giảm mạnh buffer để giảm latency
      maxBufferLength:             8,    // từ 30 xuống 8
      maxMaxBufferLength:          15,   // từ 60 xuống 15
      maxBufferSize:               10 * 1000 * 1000,  // 10MB

      // Sync chặt hơn với live edge
      liveSyncDurationCount:       2,    // từ 4 xuống 2
      liveMaxLatencyDurationCount: 4,    // từ 10 xuống 4
      maxLiveSyncPlaybackRate:     1.3,  // tăng tốc nhanh hơn để bắt kịp

      lowLatencyMode:  false,
      enableWorker:    true,

      // Retry nhẹ hơn — không cần retry mạnh cho live
      manifestLoadingMaxRetry:   3,
      levelLoadingMaxRetry:      3,
      fragLoadingMaxRetry:       3,
      abrEwmaFastLive:           3,
      abrEwmaSlowLive:           9,
    });

    hls.loadSource(hlsUrl);
    hls.attachMedia(videoRef.current);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      retryRef.current = 0;
      videoRef.current?.play().catch(() => {});
      setStatus('playing');
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (data.response?.code === 404) {
          scheduleReconnect();
          return;
        }
        retryRef.current < FATAL_RETRY_LIMIT
          ? (retryRef.current++, setStatus('loading'), hls.startLoad())
          : scheduleReconnect();
      } else {
        setStatus('error');
        hls.recoverMediaError();
      }
    });

    hlsRef.current = hls;
  }, [hlsUrl, live, destroyHls, scheduleReconnect]);

  // Đồng bộ ref với function mới nhất
  useEffect(() => { initPlayerRef.current = initPlayer; }, [initPlayer]);

  useEffect(() => {
    initPlayer();
    return destroyHls;
  }, [initPlayer, destroyHls]);

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