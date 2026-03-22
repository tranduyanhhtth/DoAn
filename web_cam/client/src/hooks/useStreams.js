import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useSocket } from './useSocket';

async function probeHls(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-100' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

const POLL_LIVE_MS    = 15_000;
const POLL_OFFLINE_MS = 30_000;

export function useStreams() {
  const [cameras,  setCameras]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [serverOk, setServerOk] = useState(false);

  const timerRef   = useRef(null);
  const mountedRef = useRef(true);
  // Ref giữ hàm fetch mới nhất — tránh stale closure trong setTimeout
  const fetchRef   = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  const fetchAndProbe = useCallback(async () => {
    clearTimeout(timerRef.current);
    try {
      const streams = await api.getStreams();

      const probed = await Promise.all(
        streams.map(async (cam) => {
          const isLive = await probeHls(cam.hlsUrl);
          return { ...cam, live: isLive, hlsUrl: isLive ? cam.hlsUrl : null };
        })
      );

      if (!mountedRef.current) return;
      setCameras(probed);
      setServerOk(true);
      setError(null);

      const hasLive = probed.some(c => c.live);
      // Dùng ref thay vì gọi trực tiếp để tránh circular dep
      timerRef.current = setTimeout(
        () => fetchRef.current?.(),
        hasLive ? POLL_LIVE_MS : POLL_OFFLINE_MS
      );
    } catch {
      if (!mountedRef.current) return;
      setError('Cannot reach server. Retrying...');
      setServerOk(false);
      timerRef.current = setTimeout(() => fetchRef.current?.(), POLL_OFFLINE_MS);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []); // deps rỗng — an toàn vì dùng ref

  // Cập nhật ref mỗi khi hàm thay đổi
  useEffect(() => { fetchRef.current = fetchAndProbe; }, [fetchAndProbe]);

  const { connected } = useSocket({
    onStreamLive:  ()           => fetchRef.current?.(),
    onStreamEnded: ({ key })    => setCameras(prev =>
      prev.map(c => c.streamKey === key
        ? { ...c, live: false, hlsUrl: null, viewers: 0 } : c)),
    onViewers: ({ key, count }) => setCameras(prev =>
      prev.map(c => c.streamKey === key ? { ...c, viewers: count } : c)),
  });

  useEffect(() => {
    fetchAndProbe();
  }, [fetchAndProbe]);

  return { cameras, loading, error, serverOk, socketConnected: connected, refetch: fetchAndProbe };
}