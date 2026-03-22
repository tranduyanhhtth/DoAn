import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useSocket } from './useSocket';

async function probeHls(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function useStreams() {
  const [cameras, setCameras]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [serverOk, setServerOk] = useState(false);
  const probeIntervalRef        = useRef(null);

  const fetchCameras = useCallback(async () => {
    try {
      const streams = await api.getStreams();

      // Client tự probe từng hlsUrl
      const probed = await Promise.all(streams.map(async (cam) => {
        const isLive = await probeHls(cam.hlsUrl);
        return {
          ...cam,
          live:   isLive,
          hlsUrl: isLive ? cam.hlsUrl : null,
        };
      }));

      setCameras(probed);
      setServerOk(true);
      setError(null);
    } catch {
      setError('Cannot reach server. Retrying...');
      setServerOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connected } = useSocket({
    onStreamLive:  ()         => fetchCameras(),
    onStreamEnded: ({ key })  => setCameras(prev =>
      prev.map(c => c.streamKey === key
        ? { ...c, live: false, hlsUrl: null, viewers: 0 } : c)),
    onViewers: ({ key, count }) => setCameras(prev =>
      prev.map(c => c.streamKey === key ? { ...c, viewers: count } : c)),
  });

  // Poll mỗi 15s (probe nhanh hơn để detect camera lên/xuống)
  useEffect(() => {
    fetchCameras();
    probeIntervalRef.current = setInterval(fetchCameras, 15_000);
    return () => clearInterval(probeIntervalRef.current);
  }, [fetchCameras]);

  return { cameras, loading, error, serverOk, socketConnected: connected, refetch: fetchCameras };
}