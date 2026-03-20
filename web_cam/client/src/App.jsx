// src/App.jsx
import { useState } from 'react';
import { useStreams } from './hooks/useStreams';
import CameraCard   from './components/CameraCard';
import StatusBar    from './components/StatusBar';
import './styles.css';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'CamWatch';

export default function App() {
  const { cameras, loading, error, serverOk, socketConnected, refetch } = useStreams();
  const [expanded, setExpanded]   = useState(null);
  const [layout,   setLayout]     = useState('grid'); // 'grid' | 'single'

  const liveCount = cameras.filter(c => c.live).length;

  function handleExpand(id) {
    setExpanded(prev => prev === id ? null : id);
    setLayout('single');
  }

  function handleGrid() {
    setExpanded(null);
    setLayout('grid');
  }

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header__brand">
          <span className="brand-icon">◈</span>
          <h1>{APP_NAME}</h1>
          {liveCount > 0 && (
            <span className="brand-badge">{liveCount} LIVE</span>
          )}
        </div>

        <nav className="app-header__nav">
          <button
            className={`nav-btn ${layout === 'grid' ? 'nav-btn--active' : ''}`}
            onClick={handleGrid}
            title="Lưới camera"
          >
            ⊞ Lưới
          </button>
          <button
            className="nav-btn"
            onClick={refetch}
            title="Làm mới"
          >
            ↻ Refresh
          </button>
        </nav>
      </header>

      {/* ── Status bar ─────────────────────────────────────────── */}
      <StatusBar
        serverOk={serverOk}
        socketConnected={socketConnected}
        liveCount={liveCount}
        totalCount={cameras.length}
      />

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="app-main">
        {loading && (
          <div className="center-state">
            <div className="big-spinner" />
            <p>Đang tải danh sách camera...</p>
          </div>
        )}

        {error && !loading && (
          <div className="center-state center-state--error">
            <span className="error-icon">⚡</span>
            <p>{error}</p>
            <button className="btn-retry" onClick={refetch}>Thử lại</button>
          </div>
        )}

        {!loading && !error && cameras.length === 0 && (
          <div className="center-state">
            <span>Không có camera nào được cấu hình.</span>
          </div>
        )}

        {!loading && cameras.length > 0 && (
          <div className={`camera-grid camera-grid--${layout}`}>
            {cameras
              .filter(c => layout === 'grid' || c.id === expanded || !expanded)
              .map(camera => (
                <CameraCard
                  key={camera.id}
                  camera={camera}
                  expanded={camera.id === expanded}
                  onToggleExpand={handleExpand}
                />
              ))
            }
          </div>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="app-footer">
        <span>{APP_NAME} · Camera Monitoring System · v1.0.0</span>
      </footer>
    </div>
  );
}
