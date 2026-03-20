// src/components/CameraCard.jsx
import VideoPlayer from './VideoPlayer';

export default function CameraCard({ camera, expanded, onToggleExpand }) {
  const { id, label, streamKey, live, viewers, startedAt } = camera;

  function formatUptime(ms) {
    if (!ms) return '';
    const secs  = Math.floor((Date.now() - ms) / 1000);
    const h     = Math.floor(secs / 3600);
    const m     = Math.floor((secs % 3600) / 60);
    const s     = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <article className={`cam-card ${live ? 'cam-card--live' : 'cam-card--offline'} ${expanded ? 'cam-card--expanded' : ''}`}>
      {/* ── Header ── */}
      <header className="cam-card__header">
        <div className="cam-card__title">
          <span className={`live-dot ${live ? 'live-dot--on' : ''}`} />
          <strong>{label}</strong>
          <code className="stream-key">{streamKey}</code>
        </div>

        <div className="cam-card__meta">
          {live && (
            <>
              <span className="badge badge--live">LIVE</span>
              {viewers > 0 && <span className="badge badge--viewers">👁 {viewers}</span>}
              {startedAt && <span className="badge badge--uptime">⏱ {formatUptime(startedAt)}</span>}
            </>
          )}
          {!live && <span className="badge badge--offline">OFFLINE</span>}

          <button
            className="btn-expand"
            onClick={() => onToggleExpand(id)}
            title={expanded ? 'Thu nhỏ' : 'Mở rộng'}
          >
            {expanded ? '⊡' : '⊞'}
          </button>
        </div>
      </header>

      {/* ── Video ── */}
      <div className="cam-card__video">
        <VideoPlayer streamKey={streamKey} live={live} label={label} />
      </div>

      {/* ── Footer ── */}
      <footer className="cam-card__footer">
        <span>1280 × 720 · 15 fps · H.264</span>
        {live
          ? <span className="text-green">● Đang phát trực tiếp</span>
          : <span className="text-muted">Chờ tín hiệu từ camera...</span>
        }
      </footer>
    </article>
  );
}
