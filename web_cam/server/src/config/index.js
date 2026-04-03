// web_cam/server/src/config/index.js
require('dotenv').config();

module.exports = {
  PORT:           parseInt(process.env.PORT) || 3001,
  NODE_ENV:       process.env.NODE_ENV || 'development',

  // URL public của server này (dùng để build hlsUrl)
  HLS_PUBLIC_URL: process.env.HLS_PUBLIC_URL || 'http://localhost:3001',

  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(' '),
  ADMIN_PASSWORD:  process.env.ADMIN_PASSWORD || 'admin',

  // Mỗi camera có UDP port riêng — firmware biết port này
  CAMERAS: [
    { id: 'cam0', label: 'Camera Chính',  streamKey: 'cam0', udpPort: 5001 },
    { id: 'cam1', label: 'Camera Phụ 1',  streamKey: 'cam1', udpPort: 5002 },
    { id: 'cam2', label: 'Camera Phụ 2',  streamKey: 'cam2', udpPort: 5003 },
    { id: 'cam3', label: 'Camera Phụ 3',  streamKey: 'cam3', udpPort: 5004 },
  ],
};