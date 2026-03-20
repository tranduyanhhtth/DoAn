// src/hooks/useStreams.js
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useSocket } from './useSocket';

/**
 * Top-level data hook.
 * Fetches camera list from REST, then keeps live status in sync via Socket.IO.
 */
export function useStreams() {
  const [cameras, setCameras]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [serverOk, setServerOk] = useState(false);

  // Fetch cameras from REST
  const fetchCameras = useCallback(async () => {
    try {
      const streams = await api.getStreams();
      setCameras(streams);
      setServerOk(true);
      setError(null);
    } catch (err) {
      setError('Cannot reach server. Retrying...');
      setServerOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep live status updated from socket events
  const { connected, liveKeys } = useSocket({
    onStreamLive: ({ key }) => {
      setCameras(prev =>
        prev.map(c => c.streamKey === key ? { ...c, live: true } : c)
      );
    },
    onStreamEnded: ({ key }) => {
      setCameras(prev =>
        prev.map(c => c.streamKey === key ? { ...c, live: false, viewers: 0 } : c)
      );
    },
    onViewers: ({ key, count }) => {
      setCameras(prev =>
        prev.map(c => c.streamKey === key ? { ...c, viewers: count } : c)
      );
    },
  });

  // Initial fetch + polling fallback every 30 s
  useEffect(() => {
    fetchCameras();
    const id = setInterval(fetchCameras, 30_000);
    return () => clearInterval(id);
  }, [fetchCameras]);

  // Merge real-time liveKeys into cameras array whenever socket updates arrive
  useEffect(() => {
    setCameras(prev =>
      prev.map(c => ({
        ...c,
        live:    c.streamKey in liveKeys,
        viewers: liveKeys[c.streamKey]?.clientCount ?? c.viewers,
      }))
    );
  }, [liveKeys]);

  return { cameras, loading, error, serverOk, socketConnected: connected, refetch: fetchCameras };
}
