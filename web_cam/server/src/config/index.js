// src/config/index.js
require('dotenv').config();

module.exports = {
  // ── HTTP / WebSocket ──────────────────────────────────────────
  PORT: parseInt(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // ── RTMP Ingest ───────────────────────────────────────────────
  // Camera box pushes RTMP to this server on port 1935
  RTMP_PORT: parseInt(process.env.RTMP_PORT) || 1935,

  // ── HLS Output ────────────────────────────────────────────────
  // node-media-server writes HLS segments here; Express serves them
  HLS_PATH: process.env.HLS_PATH || '/tmp/hls',
  HLS_FRAGMENT_DURATION: parseInt(process.env.HLS_FRAGMENT_DURATION) || 2, // seconds
  HLS_PLAYLIST_LENGTH:   parseInt(process.env.HLS_PLAYLIST_LENGTH)   || 6, // segments kept

  // ── Security ─────────────────────────────────────────────────
  // Optional stream-key auth: cameras must push to rtmp://<host>/live/<STREAM_SECRET>
  STREAM_SECRET:  process.env.STREAM_SECRET  || '',  // '' = no auth
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'change_me_in_env',

  // ── CORS ─────────────────────────────────────────────────────
  // Space-separated allowed origins, e.g. "https://myapp.vercel.app http://localhost:5173"
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(' '),

  // ── Camera metadata (editable at runtime via API) ────────────
  CAMERAS: [
    { id: 'cam0', label: 'Camera Chính',     streamKey: 'cam0' },
    { id: 'cam1', label: 'Camera Phụ 1',     streamKey: 'cam1' },
    { id: 'cam2', label: 'Camera Phụ 2',     streamKey: 'cam2' },
    { id: 'cam3', label: 'Camera Phụ 3',     streamKey: 'cam3' },
  ],
};
