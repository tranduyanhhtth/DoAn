// src/mediaServer.js
// ─────────────────────────────────────────────────────────────────────────────
//  node-media-server  →  receives RTMP from camera box
//                     →  writes HLS segments to HLS_PATH
//                     →  emits socket.io events for real-time UI updates
// ─────────────────────────────────────────────────────────────────────────────
const NodeMediaServer = require('node-media-server');
const path   = require('path');
const fs     = require('fs');
const logger = require('./config/logger');
const config = require('./config');

// Runtime registry: which stream keys are currently live
const liveStreams = new Map();   // key → { startedAt, clientCount }

/**
 * Build and start the Node Media Server.
 * @param {import('socket.io').Server} io  – Socket.IO server (for push events)
 */
function startMediaServer(io) {
  // Ensure HLS output directory exists
  fs.mkdirSync(config.HLS_PATH, { recursive: true });

  const nmsConfig = {
    rtmp: {
      port:      config.RTMP_PORT,
      chunk_size: 60000,
      gop_cache: true,
      ping:      30,
      ping_timeout: 60,
    },
    http: {
      // node-media-server has its own HTTP; we use Express instead,
      // so set allow_origin and disable its HTTP serving.
      port:        config.PORT + 100,  // internal only – not exposed
      allow_origin: '*',
      mediaroot:   config.HLS_PATH,
    },
    trans: {
      ffmpeg: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
      tasks: [
        {
          app:  'live',
          hls:  true,
          hlsFlags: [
            `-hls_time ${config.HLS_FRAGMENT_DURATION}`,
            `-hls_list_size ${config.HLS_PLAYLIST_LENGTH}`,
            '-hls_flags delete_segments+append_list',
          ].join(' '),
          hlsKeep: false,
          dash: false,
        },
      ],
    },
  };

  const nms = new NodeMediaServer(nmsConfig);

  // ── Auth hook (optional) ─────────────────────────────────────────────────
  nms.on('preConnect', (id, args) => {
    logger.debug('RTMP preConnect', { id, args });
  });

  nms.on('postConnect', (id, args) => {
    logger.info('RTMP client connected', { id });
  });

  nms.on('doneConnect', (id, args) => {
    logger.info('RTMP client disconnected', { id });
  });

  // ── Stream publish events ────────────────────────────────────────────────
  nms.on('prePublish', (id, streamPath, args) => {
    // Validate stream secret if configured
    if (config.STREAM_SECRET) {
      const key = streamPath.split('/').pop();
      if (!key.endsWith(`_${config.STREAM_SECRET}`)) {
        logger.warn('Rejected unauthorized stream', { streamPath });
        const session = nms.getSession(id);
        session && session.reject();
        return;
      }
    }
    logger.info('Stream publish started', { id, streamPath });
  });

  nms.on('postPublish', (id, streamPath, args) => {
    const key = extractStreamKey(streamPath);
    liveStreams.set(key, { startedAt: Date.now(), clientCount: 0 });
    logger.info('Stream LIVE', { key });

    // Notify all connected browsers
    io.emit('stream:live', { key, startedAt: liveStreams.get(key).startedAt });
  });

  nms.on('donePublish', (id, streamPath, args) => {
    const key = extractStreamKey(streamPath);
    liveStreams.delete(key);
    logger.info('Stream ended', { key });

    // Notify browsers
    io.emit('stream:ended', { key });

    // Clean up stale HLS segments
    cleanHlsSegments(key);
  });

  // ── Playback events ──────────────────────────────────────────────────────
  nms.on('postPlay', (id, streamPath, args) => {
    const key = extractStreamKey(streamPath);
    if (liveStreams.has(key)) {
      liveStreams.get(key).clientCount++;
      io.emit('stream:viewers', { key, count: liveStreams.get(key).clientCount });
    }
  });

  nms.on('donePlay', (id, streamPath, args) => {
    const key = extractStreamKey(streamPath);
    if (liveStreams.has(key)) {
      liveStreams.get(key).clientCount = Math.max(0, liveStreams.get(key).clientCount - 1);
      io.emit('stream:viewers', { key, count: liveStreams.get(key).clientCount });
    }
  });

  nms.run();
  logger.info(`Media server (RTMP) listening on port ${config.RTMP_PORT}`);
  logger.info(`HLS segments → ${config.HLS_PATH}`);

  return nms;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractStreamKey(streamPath) {
  // streamPath looks like: /live/cam0  or  /live/cam0_secret
  const parts = streamPath.split('/');
  let key = parts[parts.length - 1];
  if (config.STREAM_SECRET) {
    key = key.replace(`_${config.STREAM_SECRET}`, '');
  }
  return key;
}

function cleanHlsSegments(key) {
  const dir = path.join(config.HLS_PATH, 'live', key);
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir)
    .filter(f => f.endsWith('.ts'))
    .forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    });
  logger.debug(`Cleaned HLS segments for ${key}`);
}

function getLiveStreams() {
  return Object.fromEntries(liveStreams);
}

module.exports = { startMediaServer, getLiveStreams, liveStreams };
