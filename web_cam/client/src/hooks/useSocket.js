// src/hooks/useSocket.js
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

/**
 * Singleton socket connection – shared across all components via module scope.
 */
let _socket = null;

function getSocket() {
  if (!_socket || _socket.disconnected) {
    _socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
  }
  return _socket;
}

/**
 * Returns { connected, liveKeys } and emits real-time updates from server.
 * @param {function} onStreamLive   called with { key, startedAt }
 * @param {function} onStreamEnded  called with { key }
 * @param {function} onViewers      called with { key, count }
 */
export function useSocket({ onStreamLive, onStreamEnded, onViewers } = {}) {
  const [connected, setConnected] = useState(false);
  const [liveKeys, setLiveKeys] = useState({});

  const cbLive    = useRef(onStreamLive);
  const cbEnded   = useRef(onStreamEnded);
  const cbViewers = useRef(onViewers);
  cbLive.current    = onStreamLive;
  cbEnded.current   = onStreamEnded;
  cbViewers.current = onViewers;

  useEffect(() => {
    const sock = getSocket();

    const onConnect    = ()    => setConnected(true);
    const onDisconnect = ()    => setConnected(false);
    const onSnapshot   = (data) => setLiveKeys(data.live || {});

    const onLive = (data) => {
      setLiveKeys(prev => ({ ...prev, [data.key]: { startedAt: data.startedAt, clientCount: 0 } }));
      cbLive.current?.(data);
    };

    const onEnded = (data) => {
      setLiveKeys(prev => { const n = { ...prev }; delete n[data.key]; return n; });
      cbEnded.current?.(data);
    };

    const onViewersEvt = (data) => {
      setLiveKeys(prev =>
        prev[data.key]
          ? { ...prev, [data.key]: { ...prev[data.key], clientCount: data.count } }
          : prev
      );
      cbViewers.current?.(data);
    };

    sock.on('connect',         onConnect);
    sock.on('disconnect',      onDisconnect);
    sock.on('stream:snapshot', onSnapshot);
    sock.on('stream:live',     onLive);
    sock.on('stream:ended',    onEnded);
    sock.on('stream:viewers',  onViewersEvt);

    if (sock.connected) setConnected(true);

    return () => {
      sock.off('connect',         onConnect);
      sock.off('disconnect',      onDisconnect);
      sock.off('stream:snapshot', onSnapshot);
      sock.off('stream:live',     onLive);
      sock.off('stream:ended',    onEnded);
      sock.off('stream:viewers',  onViewersEvt);
    };
  }, []);

  return { connected, liveKeys };
}
