require('dotenv').config();
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const helmet     = require('helmet');
const { Server } = require('socket.io');
const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const config     = require('./config');
const logger     = require('./config/logger');

const app    = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: { origin: config.ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

// HLS output directory
const HLS_DIR = path.join(__dirname, '../hls');
fs.mkdirSync(HLS_DIR, { recursive: true });

// Serve HLS files
app.use('/hls', express.static(HLS_DIR, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
  }
}));

// FFmpeg processes map
const ffmpegProcs = new Map(); // streamKey -> child_process

function startFFmpeg(cam) {
  const outDir = path.join(HLS_DIR, cam.streamKey);
  fs.mkdirSync(outDir, { recursive: true });

  fs.readdirSync(outDir)
    .filter(f => f.endsWith('.ts') || f.endsWith('.m3u8'))
    .forEach(f => {try { fs.unlinkSync(path.join(outDir, f)); } catch (_) {} });

  const args = [
    '-loglevel', 'warning',
    // Nhận UDP RTP/H264
    '-i', `udp://0.0.0.0:${cam.udpPort}?overrun_nonfatal=1&fifo_size=50000000`,
    // HLS output
    '-c:v',        'copy',          // không re-encode
    '-an',                          // bỏ audio
    '-f',          'hls',
    '-hls_time',   '2',
    '-hls_list_size', '6',
    '-hls_flags',  'delete_segments+append_list',
    '-hls_segment_filename', path.join(outDir, 'seg%03d.ts'),
    path.join(outDir, 'index.m3u8'),
  ];

  logger.info(`[FFmpeg] Starting cam ${cam.id} on UDP port ${cam.udpPort}`);
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  
  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) logger.warn(`[FFmpeg ${cam.id}] ${msg}`);
  })

  proc.on('exit', (code) => {
    logger.warn(`[FFmpeg ${cam.id}] exited with code ${code}, restarting in 3 seconds...`);
    ffmpegProcs.delete(cam.streamKey);
    setTimeout(() => startFFmpeg(cam), 3000);
  });

  ffmpegProcs.set(cam.streamKey, proc);
  return proc;
}

// ── Probe HLS live ────────────────────────────────────────────────────────────
function isLive(streamKey) {
  const playlist = path.join(HLS_DIR, streamKey, 'index.m3u8');
  try {
    const stat = fs.statSync(playlist);
    // File tồn tại và được cập nhật trong 10 giây gần đây
    return (Date.now() - stat.mtimeMs) < 10000;
  } catch {
    return false;
  }
}

// ── API Routes ────────────────────────────────────────────────────────────────
app.get('/api/streams', (req, res) => {
  const streams = config.CAMERAS.map(cam => {
    const live   = isLive(cam.streamKey);
    const hlsUrl = `${config.HLS_PUBLIC_URL}/hls/${cam.streamKey}/index.m3u8`;
    return {
      id:        cam.id,
      label:     cam.label,
      streamKey: cam.streamKey,
      udpPort:   cam.udpPort,
      live,
      hlsUrl:    live ? hlsUrl : null,
    };
  });
  res.json({ ok: true, streams });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok:      true,
    uptime:  process.uptime(),
    streams: config.CAMERAS.map(c => ({
      id:   c.id,
      live: isLive(c.streamKey),
      port: c.udpPort,
    })),
  });
});

app.get('/', (req, res) => {
  res.json({ service: 'CamWatch API', status: 'running' });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`Socket: ${socket.id} connected`);

  // Gửi snapshot trạng thái hiện tại
  const snapshot = {};
  config.CAMERAS.forEach(c => {
    if (isLive(c.streamKey)) snapshot[c.streamKey] = { live: true };
  });
  socket.emit('stream:snapshot', { live: snapshot });

  socket.on('disconnect', () => logger.info(`Socket: ${socket.id} disconnected`));
});

// Kiểm tra live status mỗi 5s, emit socket event khi thay đổi
const liveState = {};
setInterval(() => {
  config.CAMERAS.forEach(cam => {
    const prev = liveState[cam.streamKey] || false;
    const curr = isLive(cam.streamKey);
    if (curr !== prev) {
      liveState[cam.streamKey] = curr;
      if (curr) {
        io.emit('stream:live', { key: cam.streamKey });
        logger.info(`[Live] ${cam.id} → LIVE`);
      } else {
        io.emit('stream:ended', { key: cam.streamKey });
        logger.info(`[Live] ${cam.id} → OFFLINE`);
      }
    }
  });
}, 5000);

// ── Start ─────────────────────────────────────────────────────────────────────
// Khởi động FFmpeg cho tất cả cameras
config.CAMERAS.forEach(cam => startFFmpeg(cam));

server.listen(config.PORT, '0.0.0.0', () => {
  logger.info('═══════════════════════════════════════');
  logger.info(` CamWatch API Server`);
  logger.info(` Port        : ${config.PORT}`);
  logger.info(` HLS Public  : ${config.HLS_PUBLIC_URL}`);
  logger.info(` Cameras     : ${config.CAMERAS.length}`);
  config.CAMERAS.forEach(c =>
    logger.info(`   ${c.id} → UDP:${c.udpPort} → /hls/${c.streamKey}/`)
  );
  logger.info('═══════════════════════════════════════');
});

process.on('SIGTERM', () => {
  ffmpegProcs.forEach(p => p.kill());
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  ffmpegProcs.forEach(p => p.kill());
  server.close(() => process.exit(0));
});
