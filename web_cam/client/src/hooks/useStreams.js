import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useSocket } from './useSocket';

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
  try {
    const streams = await api.getStreams();
    // Server đã probe qua file mtime — không cần client probe nữa
    setCameras(streams);
    setServerOk(true);
    setError(null);
    const hasLive = streams.some(c => c.live);
    timerRef.current = setTimeout(
      () => fetchRef.current?.(),
      hasLive ? 10_000 : 20_000
    );
  } catch {
    setError('Cannot reach server. Retrying...');
    setServerOk(false);
    timerRef.current = setTimeout(() => fetchRef.current?.(), 15_000);
  } finally {
    if (mountedRef.current) setLoading(false);
  }
}, []);

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