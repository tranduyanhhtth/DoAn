// src/components/StatusBar.jsx
import { useState, useEffect } from 'react';

export default function StatusBar({ serverOk, socketConnected, liveCount, totalCount }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = now.toLocaleString('vi-VN', {
    weekday: 'short', year: 'numeric',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        <span className={`status-pill ${serverOk ? 'status-pill--ok' : 'status-pill--err'}`}>
          {serverOk ? '● Server' : '● Server offline'}
        </span>
        <span className={`status-pill ${socketConnected ? 'status-pill--ok' : 'status-pill--warn'}`}>
          {socketConnected ? '● Realtime' : '◌ Đang kết nối...'}
        </span>
        <span className="status-pill status-pill--info">
          {liveCount}/{totalCount} camera live
        </span>
      </div>
      <div className="status-bar__right">
        <span className="status-time">{fmt}</span>
      </div>
    </div>
  );
}
