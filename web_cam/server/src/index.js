// src/index.js
// ─────────────────────────────────────────────────────────────────────────────
//  Entry point:  Express HTTP  +  Socket.IO  +  node-media-server (RTMP→HLS)
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const express   = require('express');
const http      = require('http');
const path      = require('path');
const fs        = require('fs');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const { Server } = require('socket.io');

const config    = require('./config');
const logger    = require('./config/logger');
const apiRoutes = require('./routes/api');
const { startMediaServer, getLiveStreams } = require('./mediaServer');

// ── App bootstrap ─────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:  config.ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Socket events
io.on('connection', (socket) => {
  logger.debug(`Socket connected: ${socket.id}`);

  // On connect, immediately send current live state
  socket.emit('stream:snapshot', { live: getLiveStreams() });

  socket.on('disconnect', () => {
    logger.debug(`Socket disconnected: ${socket.id}`);
  });
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // HLS players need loose CSP
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin & configured origins (and tools without Origin header)
    if (!origin || config.ALLOWED_ORIGINS.includes(origin) || config.ALLOWED_ORIGINS.includes('*')) {
      cb(null, true);
    } else {
      cb(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));

app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));
app.use(express.json());

// ── HLS static files ──────────────────────────────────────────────────────────
// Serve HLS .m3u8 playlists and .ts segments written by node-media-server/ffmpeg
const hlsDir = config.HLS_PATH;
fs.mkdirSync(hlsDir, { recursive: true });

app.use('/hls', (req, res, next) => {
  // Correct MIME types so browsers handle them properly
  if (req.path.endsWith('.m3u8')) res.set('Content-Type', 'application/vnd.apple.mpegurl');
  if (req.path.endsWith('.ts'))   res.set('Content-Type', 'video/mp2t');
  res.set('Cache-Control', 'no-cache, no-store');
  res.set('Access-Control-Allow-Origin', '*');
  next();
}, express.static(hlsDir));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── Root health check ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'Camera Streaming Server',
    status:  'running',
    version: '1.0.0',
    rtmpPort:    config.RTMP_PORT,
    httpPort:    config.PORT,
    liveStreams: Object.keys(getLiveStreams()),
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// ── Start RTMP media server THEN HTTP server ──────────────────────────────────
startMediaServer(io);

server.listen(config.PORT, '0.0.0.0', () => {
  logger.info('═══════════════════════════════════════════════');
  logger.info(` Camera Streaming Server  v1.0.0`);
  logger.info(`   HTTP  : http://0.0.0.0:${config.PORT}`);
  logger.info(`   RTMP  : rtmp://0.0.0.0:${config.RTMP_PORT}/live/<key>`);
  logger.info(`   HLS   : http://<host>:${config.PORT}/hls/live/<key>/index.m3u8`);
  logger.info(`   Env   : ${config.NODE_ENV}`);
  logger.info('═══════════════════════════════════════════════');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received – shutting down gracefully');
  server.close(() => { logger.info('HTTP server closed'); process.exit(0); });
});
process.on('SIGINT', () => {
  logger.info('SIGINT received – shutting down');
  server.close(() => process.exit(0));
});
