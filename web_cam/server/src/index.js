require('dotenv').config();
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const { Server } = require('socket.io');
const config     = require('./config');
const logger     = require('./config/logger');

const app    = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: { origin: config.ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.id}`));
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.ALLOWED_ORIGINS, credentials: true }));
app.use(morgan('dev', { stream: { write: (m) => logger.http(m.trim()) } }));
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────────

// GET /api/streams — danh sách camera + HLS URL
app.get('/api/streams', async (req, res) => {
  const hlsBase = config.HLS_BASE_URL;

  const streams = await Promise.all(config.CAMERAS.map(async (cam) => {
    // Probe m3u8 để biết cam có đang live không
    const m3u8Url = `${hlsBase}/${cam.streamKey}/index.m3u8`;
    let isLive = false;
    try {
      const resp = await fetch(m3u8Url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      isLive = resp.ok;
    } catch (_) {
      isLive = false;
    }

    return {
      id:        cam.id,
      label:     cam.label,
      streamKey: cam.streamKey,
      live:      isLive,
      hlsUrl:    isLive ? m3u8Url : null,
    };
  }));

  res.json({ ok: true, streams });
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    ok:        true,
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    version:   '1.0.0',
  });
});

// Root
app.get('/', (req, res) => {
  res.json({ service: 'CamWatch API', status: 'running', version: '1.0.0' });
});

// Error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error: ' + err.message);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// Start
server.listen(config.PORT, '0.0.0.0', () => {
  logger.info('═══════════════════════════════════════');
  logger.info(` CamWatch API Server v1.0.0`);
  logger.info(` Port    : ${config.PORT}`);
  logger.info(` HLS Base: ${config.HLS_BASE_URL}`);
  logger.info(` Env     : ${config.NODE_ENV}`);
  logger.info('═══════════════════════════════════════');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));