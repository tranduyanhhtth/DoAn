// src/routes/api.js
// ─────────────────────────────────────────────────────────────────────────────
//  REST endpoints consumed by the React frontend
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const config  = require('../config');
const { getLiveStreams } = require('../mediaServer');

const router = express.Router();

// ── GET /api/streams ─────────────────────────────────────────────────────────
router.get('/streams', (req, res) => {
  const streams = config.CAMERAS.map(cam => ({
    id:       cam.id,
    label:    cam.label,
    streamKey: cam.streamKey,
    // HLS URL trỏ thẳng đến Cloudflare Tunnel trên camera box
    hlsUrl: `${config.HLS_BASE_URL}/${cam.streamKey}/index.m3u8`,
    live:    true,  // MediaMTX luôn sẵn sàng khi camera chạy
  }));
  res.json({ ok: true, streams });
});

// ── GET /api/streams/:key ─────────────────────────────────────────────────────
router.get('/streams/:key', (req, res) => {
  const { key } = req.params;
  const cam = config.CAMERAS.find(c => c.streamKey === key);
  if (!cam) return res.status(404).json({ ok: false, error: 'Camera not found' });

  const live    = getLiveStreams();
  const isLive  = key in live;

  res.json({
    ok: true,
    stream: {
      ...cam,
      live:      isLive,
      startedAt: isLive ? live[key].startedAt : null,
      viewers:   isLive ? live[key].clientCount : 0,
      hlsUrl: `${req.protocol}://${req.get('host')}/hls/live/${key}/index.m3u8`,
    },
  });
});

// ── GET /api/health ──────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    ok:        true,
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version || '1.0.0',
    liveCount: Object.keys(getLiveStreams()).length,
  });
});

// ── GET /api/hls-check/:key ──────────────────────────────────────────────────
// Checks whether the HLS playlist file exists on disk (quick readiness probe)
router.get('/hls-check/:key', (req, res) => {
  const playlist = path.join(config.HLS_PATH, 'live', req.params.key, 'index.m3u8');
  const exists   = fs.existsSync(playlist);
  res.json({ ok: true, ready: exists, key: req.params.key });
});

// ── POST /api/admin/restart-stream ───────────────────────────────────────────
// Simple admin endpoint to forcibly clean HLS segments for a key
router.post('/admin/restart-stream', (req, res) => {
  const { password, key } = req.body || {};
  if (password !== config.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const dir = path.join(config.HLS_PATH, 'live', key);
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.m3u8'))
      .forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} });
  }
  res.json({ ok: true, message: `Segments cleared for ${key}` });
});

module.exports = router;
