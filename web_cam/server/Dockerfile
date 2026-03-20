# server/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Tải MediaMTX binary (thay ffmpeg — không cần ffmpeg nữa!)
ARG MEDIAMTX_VERSION=v1.9.1
RUN apk add --no-cache curl ca-certificates && \
  curl -fsSL \
  "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_amd64.tar.gz" \
  | tar -xz -C /usr/local/bin mediamtx && \
  chmod +x /usr/local/bin/mediamtx

# Copy deps và source
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./

RUN mkdir -p /tmp/hls && chmod 777 /tmp/hls

# Non-root user
RUN addgroup -S camwatch && adduser -S camwatch -G camwatch
USER camwatch

# HTTP/Socket.IO, RTSP, HLS-internal, RTMP
EXPOSE 3001 8554 8888 1935

ENV NODE_ENV=production
ENV HLS_PATH=/tmp/hls
ENV MEDIAMTX_PATH=/usr/local/bin/mediamtx

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]