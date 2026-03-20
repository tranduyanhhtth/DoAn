# server/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
#  Multi-stage build:
#   Stage 1 (deps)   – install production dependencies only
#   Stage 2 (runner) – minimal runtime image with ffmpeg
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install ffmpeg (needed by node-media-server for HLS transcoding)
RUN apk add --no-cache ffmpeg curl

# Copy deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY src/ ./src/
COPY package.json ./

# HLS output directory
RUN mkdir -p /tmp/hls && chmod 777 /tmp/hls

# Non-root user for security
RUN addgroup -S camwatch && adduser -S camwatch -G camwatch
USER camwatch

EXPOSE 3001 1935

ENV NODE_ENV=production
ENV HLS_PATH=/tmp/hls
ENV FFMPEG_PATH=/usr/bin/ffmpeg

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
