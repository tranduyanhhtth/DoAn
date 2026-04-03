import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

const WEBRTC_BASE = import.meta.env.VITE_WEBRTC_URL || '';
const RECONNECT_DELAY_MS = 5000;

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443',
    ],
    username:   'openrelayproject',
    credential: 'openrelayproject',
  },
];

const CamIcon = () => (
  <div className="cam-icon-wrap">
    <svg viewBox="0 0 24 24">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14"/>
      <rect x="3" y="6" width="12" height="12" rx="2"/>
    </svg>
  </div>
);

export default function VideoPlayer({ hlsUrl, live, streamKey }) {
  const videoRef  = useRef(null);
  const pcRef     = useRef(null);   // RTCPeerConnection
  const hlsRef    = useRef(null);   // hls.js fallback
  const timerRef  = useRef(null);
  const initRef   = useRef(null);
  const modeRef   = useRef('webrtc'); // 'webrtc' | 'hls'

  const [status,   setStatus]   = useState('idle');
  const [mode,     setMode]     = useState('webrtc');
  const [showCtrl, setShowCtrl] = useState(false);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const destroyAll = useCallback(() => {
    clearTimeout(timerRef.current);

    if (pcRef.current) {
      pcRef.current.ontrack       = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src       = '';
    }
  }, []);

  // ── WebRTC via WHEP ────────────────────────────────────────────────────────
  const initWebRTC = useCallback(async () => {
    if (!videoRef.current || !live || !streamKey) return;

    const whepUrl = `${WEBRTC_BASE}/${streamKey}/whep`;
    setStatus('loading');
    setMode('webrtc');
    modeRef.current = 'webrtc';

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      // Nhận video track
      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.play().catch(() => {});
          setStatus('playing');
        }
      };

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'disconnected') {
          setStatus('loading');
          destroyAll();
          timerRef.current = setTimeout(() => initRef.current?.(), RECONNECT_DELAY_MS);
        }
        if (state === 'closed') {
          setStatus('offline');
        }
      };

      // Tạo offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Đợi ICE gathering xong (tối đa 3 giây)
      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 3000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      // Gửi offer lên WHEP endpoint
      const resp = await fetch(whepUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body:    pc.localDescription.sdp,
        signal:  AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        throw new Error(`WHEP ${resp.status}`);
      }

      const answerSdp = await resp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    } catch (err) {
      console.warn('[WebRTC] failed:', err.message);
      destroyAll();
      setStatus('offline');
    }
  }, [streamKey, live, destroyAll]);

  // ── HLS fallback (chỉ dùng nếu WEBRTC_BASE chưa cấu hình) ─────────────────
  const initHls = useCallback(() => {
    if (!videoRef.current || !live || !hlsUrl) { setStatus('offline'); return; }
    setStatus('loading');
    setMode('hls');
    modeRef.current = 'hls';

    if (!Hls.isSupported()) {
      videoRef.current.src = hlsUrl;
      videoRef.current.play().catch(() => {});
      setStatus('playing');
      return;
    }

    const hls = new Hls({
      maxBufferLength:             8,
      maxMaxBufferLength:          15,
      liveSyncDurationCount:       2,
      liveMaxLatencyDurationCount: 4,
      maxLiveSyncPlaybackRate:     1.3,
      lowLatencyMode:              false,
      manifestLoadingMaxRetry:     3,
      fragLoadingMaxRetry:         3,
      enableWorker:                true,
    });

    hls.loadSource(hlsUrl);
    hls.attachMedia(videoRef.current);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      videoRef.current?.play().catch(() => {});
      setStatus('playing');
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      destroyAll();
      timerRef.current = setTimeout(() => initRef.current?.(), RECONNECT_DELAY_MS);
    });

    hlsRef.current = hls;
  }, [hlsUrl, live, destroyAll]);

  // ── Entry point ────────────────────────────────────────────────────────────
  const init = useCallback(() => {
    if (!live) { setStatus('offline'); return; }
    destroyAll();
    // Dùng WebRTC nếu có WEBRTC_BASE, không thì dùng HLS
    if (WEBRTC_BASE && streamKey) {
      initWebRTC();
    } else {
      initHls();
    }
  }, [live, streamKey, destroyAll, initWebRTC, initHls]);

  useEffect(() => { initRef.current = init; }, [init]);

  useEffect(() => {
    init();
    return destroyAll;
  }, [init, destroyAll]);

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
          <span>{mode === 'webrtc' ? 'Đang kết nối WebRTC...' : 'Đang kết nối...'}</span>
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