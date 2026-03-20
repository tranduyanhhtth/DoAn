// ecosystem.config.cjs
// PM2 process manager config for VPS deployment
// Usage:  pm2 start ecosystem.config.cjs
//         pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name:         'camwatch-server',
      script:       './server/src/index.js',
      cwd:          __dirname,
      instances:    1,             // RTMP server must be single-instance
      exec_mode:    'fork',
      watch:        false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV:    'production',
        PORT:        3001,
        RTMP_PORT:   1935,
        HLS_PATH:    '/tmp/hls',
        FFMPEG_PATH: '/usr/bin/ffmpeg',
      },
      error_file:   './logs/server-err.log',
      out_file:     './logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Auto-restart on crash with exponential backoff
      autorestart:  true,
      min_uptime:   '10s',
      max_restarts: 10,
    },
  ],
};
