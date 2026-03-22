// src/hooks/useSocket.js
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

let _socket = null;

function getSocket() {
  if (!_socket || _socket.disconnected) {
    _socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 15000,
      timeout: 20000,
    });
  }
  return _socket;
}

export function useSocket({ onStreamLive, onStreamEnded, onViewers } = {}) {
  const [connected, setConnected] = useState(false);

  // Dùng ref để callback luôn mới nhất, không tạo lại effect
  const cbLive    = useRef(onStreamLive);
  const cbEnded   = useRef(onStreamEnded);
  const cbViewers = useRef(onViewers);
  cbLive.current    = onStreamLive;
  cbEnded.current   = onStreamEnded;
  cbViewers.current = onViewers;

  useEffect(() => {
    const sock = getSocket();

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onLive       = (d) => cbLive.current?.(d);
    const onEnded      = (d) => cbEnded.current?.(d);
    const onViewersEvt = (d) => cbViewers.current?.(d);

    sock.on('connect',        onConnect);
    sock.on('disconnect',     onDisconnect);
    sock.on('stream:live',    onLive);
    sock.on('stream:ended',   onEnded);
    sock.on('stream:viewers', onViewersEvt);

    if (sock.connected) setConnected(true);

    return () => {
      sock.off('connect',        onConnect);
      sock.off('disconnect',     onDisconnect);
      sock.off('stream:live',    onLive);
      sock.off('stream:ended',   onEnded);
      sock.off('stream:viewers', onViewersEvt);
    };
  }, []);

  return { connected };
}