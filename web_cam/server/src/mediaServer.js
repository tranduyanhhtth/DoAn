// server/src/mediaServer.js
const { spawn }  = require('child_process');
const fs         = require('fs');
const path       = require('path');
const http       = require('http');
const logger     = require('./config/logger');
const config     = require('./config');

const liveStreams = new Map();

/**
 * Dùng MediaMTX (binary) làm RTSP server → tự xuất HLS.
 * Node.js chỉ cần watch thư mục HLS để biết stream nào đang live.
 */
function startMediaServer(io) {
  fs.mkdirSync(config.HLS_PATH, { recursive: true });

  // ── Ghi file config cho MediaMTX ──────────────────────────────────────────
  const mtxConfig = `
# mediamtx.yml — tự sinh bởi server
hlsAddress: :8888
rtspAddress: :8554
rtmpAddress: :1935
webrtcAddress: :8889

# Cho phép mọi nguồn publish (thêm auth nếu cần)
authInternalUsers:
  - user: any
    pass: any
    ips: []
    permissions:
      - action: publish
        path: ""
      - action: read
        path: ""

paths:
  all_others:
    # Ghi HLS ra thư mục cho Express serve
    hlsVariant: lowLatency
    hlsSegmentCount: ${config.HLS_PLAYLIST_LENGTH}
    hlsSegmentDuration: ${config.HLS_FRAGMENT_DURATION}s
    hlsDirectory: ${config.HLS_PATH}
`;

  const cfgPath = '/tmp/mediamtx.yml';
  fs.writeFileSync(cfgPath, mtxConfig);

  // ── Khởi động MediaMTX process ─────────────────────────────────────────────
  const mtxBin = process.env.MEDIAMTX_PATH || '/usr/local/bin/mediamtx';

  if (!fs.existsSync(mtxBin)) {
    logger.error(`MediaMTX binary not found at ${mtxBin}. Check Dockerfile.`);
    process.exit(1);
  }

  const mtx = spawn(mtxBin, [cfgPath], { stdio: ['ignore', 'pipe', 'pipe'] });

  mtx.stdout.on('data', (d) => {
    const line = d.toString().trim();
    logger.debug('[mediamtx] ' + line);

    // Phát hiện stream bắt đầu / kết thúc từ log mediamtx
    const pubMatch = line.match(/\[RTSP\].*?path=(\S+).*?is publishing/i) ||
                     line.match(/path (\S+), ready/i);
    if (pubMatch) {
      const key = pubMatch[1].replace(/^\//, '');
      liveStreams.set(key, { startedAt: Date.now(), clientCount: 0 });
      logger.info('Stream LIVE', { key });
      io.emit('stream:live', { key, startedAt: liveStreams.get(key).startedAt });
    }

    const stopMatch = line.match(/path (\S+), not in use anymore/i) ||
                      line.match(/\[RTSP\].*?path=(\S+).*?is not publishing/i);
    if (stopMatch) {
      const key = stopMatch[1].replace(/^\//, '');
      liveStreams.delete(key);
      logger.info('Stream ended', { key });
      io.emit('stream:ended', { key });
    }
  });

  mtx.stderr.on('data', (d) => logger.warn('[mediamtx] ' + d.toString().trim()));
  mtx.on('close', (code) => {
    logger.error(`MediaMTX exited with code ${code}. Restarting in 3s...`);
    setTimeout(() => startMediaServer(io), 3000);
  });

  // ── Polling fallback: quét HLS dir để cập nhật live status ─────────────────
  // MediaMTX ghi file .m3u8 khi stream live → dùng để sync trạng thái
  setInterval(() => {
    const hlsLive = path.join(config.HLS_PATH);
    if (!fs.existsSync(hlsLive)) return;

    const activeDirs = new Set();
    try {
      fs.readdirSync(hlsLive).forEach(name => {
        const m3u8 = path.join(hlsLive, name, 'index.m3u8');
        if (!fs.existsSync(m3u8)) return;

        const age = Date.now() - fs.statSync(m3u8).mtimeMs;
        if (age < 8000) {  // file được cập nhật trong 8 giây gần đây = đang live
          activeDirs.add(name);
          if (!liveStreams.has(name)) {
            liveStreams.set(name, { startedAt: Date.now(), clientCount: 0 });
            io.emit('stream:live', { key: name, startedAt: Date.now() });
            logger.info('Stream detected via polling', { key: name });
          }
        }
      });
    } catch (_) {}

    // Xoá stream không còn active
    liveStreams.forEach((_, key) => {
      if (!activeDirs.has(key)) {
        liveStreams.delete(key);
        io.emit('stream:ended', { key });
      }
    });
  }, 3000);

  logger.info('MediaMTX started');
  logger.info(`  RTSP  : rtsp://0.0.0.0:8554/<streamKey>`);
  logger.info(`  HLS   : http://0.0.0.0:8888/<streamKey>/index.m3u8`);
  logger.info(`  HLS→Express: ${config.HLS_PATH}/<streamKey>/index.m3u8`);
}

function getLiveStreams() { return Object.fromEntries(liveStreams); }

module.exports = { startMediaServer, getLiveStreams, liveStreams };