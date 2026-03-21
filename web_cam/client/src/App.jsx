// src/App.jsx
import { useState } from 'react';
import { useStreams } from './hooks/useStreams';
import CameraCard   from './components/CameraCard';
import StatusBar    from './components/StatusBar';
import './styles.css';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'CamWatch';

// Camera mặc định — hiện ngay cả khi server chưa kết nối
const DEFAULT_CAMERAS = [
  { id: 'cam0', label: 'Camera chính',  streamKey: 'cam0', live: false, viewers: 0, startedAt: null, hlsUrl: '' },
  { id: 'cam1', label: 'Camera phụ 1',  streamKey: 'cam1', live: false, viewers: 0, startedAt: null, hlsUrl: '' },
  { id: 'cam2', label: 'Camera phụ 2',  streamKey: 'cam2', live: false, viewers: 0, startedAt: null, hlsUrl: '' },
  { id: 'cam3', label: 'Camera phụ 3',  streamKey: 'cam3', live: false, viewers: 0, startedAt: null, hlsUrl: '' },
];

export default function App() {
  const { cameras, loading, error, serverOk, socketConnected, refetch } = useStreams();
  const [expanded, setExpanded] = useState(null);
  const [layout,   setLayout]   = useState('grid');

  // Dùng cameras từ server nếu có, fallback về DEFAULT_CAMERAS
  const displayCameras = cameras.length > 0 ? cameras : DEFAULT_CAMERAS;
  const liveCount = displayCameras.filter(c => c.live).length;

  function handleExpand(id) {
    setExpanded(prev => prev === id ? null : id);
    setLayout('single');
  }

  function handleGrid() {
    setExpanded(null);
    setLayout('grid');
  }

  const visibleCameras = layout === 'grid'
    ? displayCameras
    : displayCameras.filter(c => c.id === expanded || !expanded);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-header__brand">
          <div className="brand-icon" />
          <h1>{APP_NAME}</h1>
          {liveCount > 0 && (
            <span className="brand-badge">{liveCount} live</span>
          )}
        </div>
        <nav className="app-header__nav">
          <button
            className={`nav-btn ${layout === 'grid' ? 'nav-btn--active' : ''}`}
            onClick={handleGrid}
          >
            ⊞ Lưới
          </button>
          <button className="nav-btn" onClick={refetch}>
            ↻ Refresh
          </button>
        </nav>
      </header>

      {/* Status bar */}
      <StatusBar
        serverOk={serverOk}
        socketConnected={socketConnected}
        liveCount={liveCount}
        totalCount={displayCameras.length}
      />

      {/* Main */}
      <main className="app-main">
        {/* Banner lỗi nhỏ phía trên — không che camera grid */}
        {error && !loading && (
          <div className="error-banner">
            <span>{error}</span>
            <button className="btn-retry-inline" onClick={refetch}>Thử lại</button>
          </div>
        )}

        {/* Camera grid — luôn hiện */}
        <div className={`camera-grid camera-grid--${layout}`}>
          {visibleCameras.map(camera => (
            <CameraCard
              key={camera.id}
              camera={camera}
              expanded={camera.id === expanded}
              onToggleExpand={handleExpand}
            />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        {APP_NAME} · Camera Monitoring System · v1.0.0
      </footer>
    </div>
  );
}