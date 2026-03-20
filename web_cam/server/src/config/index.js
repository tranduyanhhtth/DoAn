require('dotenv').config();

module.exports = {
  PORT:         parseInt(process.env.PORT) || 3001,
  NODE_ENV:     process.env.NODE_ENV || 'development',

  // URL Cloudflare Tunnel trên camera box
  // Ví dụ: https://stream.tranduyanh20225256.id.vn
  //    hoặc: https://abc-xyz.trycloudflare.com
  HLS_BASE_URL: process.env.HLS_BASE_URL || 'http://localhost:8888',

  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin',

  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(' '),

  CAMERAS: [
    { id: 'cam0', label: 'Camera Chính',  streamKey: 'cam0' },
    { id: 'cam1', label: 'Camera Phụ 1',  streamKey: 'cam1' },
    { id: 'cam2', label: 'Camera Phụ 2',  streamKey: 'cam2' },
    { id: 'cam3', label: 'Camera Phụ 3',  streamKey: 'cam3' },
  ],
};