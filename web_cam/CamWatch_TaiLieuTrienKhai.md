# CamWatch — Tài liệu kỹ thuật triển khai toàn hệ thống

**Phiên bản:** 1.0  
**Ngày:** 21/03/2026  
**Nền tảng mục tiêu:** RZV2L / RK3568 (ARM64) · Render.com · Vercel · Cloudflare

---

## Mục lục

1. [Kiến trúc tổng thể](#1-kiến-trúc-tổng-thể)
2. [Cấu trúc dự án](#2-cấu-trúc-dự-án)
3. [Yêu cầu hệ thống](#3-yêu-cầu-hệ-thống)
4. [Khởi tạo dự án](#4-khởi-tạo-dự-án)
5. [Backend — Node.js API Server](#5-backend--nodejs-api-server)
6. [Frontend — React Client](#6-frontend--react-client)
7. [Camera Box — MediaMTX + Cloudflare Tunnel](#7-camera-box--mediamtx--cloudflare-tunnel)
8. [Deploy Backend lên Render.com](#8-deploy-backend-lên-rendercom)
9. [Deploy Frontend lên Vercel](#9-deploy-frontend-lên-vercel)
10. [CI/CD với GitHub Actions](#10-cicd-với-github-actions)
11. [Khởi động tự động trên Camera Box](#11-khởi-động-tự-động-trên-camera-box)
12. [Kiểm tra toàn hệ thống](#12-kiểm-tra-toàn-hệ-thống)
13. [Troubleshooting](#13-troubleshooting)
14. [Vận hành & Bảo trì](#14-vận-hành--bảo-trì)

---

## 1. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│  Camera Box (RZV2L / ARM64)                                         │
│                                                                     │
│  traffic_violation app                                              │
│    └─▶ GStreamer pipeline                                           │
│         └─▶ rtspclientsink ──▶ rtsp://127.0.0.1:8554/cam0         │
│                                        │                            │
│  MediaMTX (port 8554)  ◀──────────────┘                            │
│    └─▶ HLS segments ──▶ http://localhost:8888/cam0/index.m3u8      │
│                                        │                            │
│  cloudflared tunnel  ◀─────────────────┘                           │
│    └─▶ stream.your-domain.id.vn (HTTPS public)                     │
└─────────────────────────────────────────────────────────────────────┘
                │
                │ HTTPS
                ▼
┌─────────────────────────────────────────┐
│  Cloudflare CDN                          │
│  stream.your-domain.id.vn               │
└─────────────────────────────────────────┘
                │
       ┌────────┴────────┐
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────────────────┐
│  Render.com  │  │  Browser                  │
│  Node.js API │  │  Vercel (React + hls.js)  │
│  + Socket.IO │  │  ← fetch hlsUrl từ API    │
│              │  │  ← hls.js phát HLS stream │
└──────────────┘  └──────────────────────────┘
```

**Luồng dữ liệu:**

1. App push RTSP → MediaMTX (localhost)
2. MediaMTX chuyển thành HLS segments
3. cloudflared expose HLS ra internet qua HTTPS
4. Browser gọi Render API → nhận `hlsUrl` (Cloudflare URL)
5. hls.js tải `.m3u8` → decode `.ts` segments → phát video

---

## 2. Cấu trúc dự án

```
camera-streaming/                    ← root repo (GitHub)
├── web_cam/
│   ├── server/                      ← Node.js backend
│   │   ├── src/
│   │   │   ├── index.js             ← Entry point (Express + Socket.IO)
│   │   │   ├── config/
│   │   │   │   ├── index.js         ← Tất cả config từ .env
│   │   │   │   └── logger.js        ← Winston logger
│   │   │   └── routes/
│   │   │       └── api.js           ← REST endpoints
│   │   ├── package.json
│   │   └── .env.example
│   │
│   └── client/                      ← React frontend
│       ├── src/
│       │   ├── main.jsx
│       │   ├── App.jsx              ← Layout chính, camera grid
│       │   ├── styles.css           ← Theme sáng tối giản
│       │   ├── components/
│       │   │   ├── VideoPlayer.jsx  ← hls.js player, auto-reconnect
│       │   │   ├── CameraCard.jsx   ← Card mỗi camera
│       │   │   └── StatusBar.jsx    ← Thanh trạng thái realtime
│       │   ├── hooks/
│       │   │   ├── useSocket.js     ← Socket.IO singleton
│       │   │   └── useStreams.js    ← Data hook (API là nguồn sự thật)
│       │   └── services/
│       │       └── api.js           ← Axios calls
│       ├── index.html
│       ├── vite.config.js
│       ├── vercel.json
│       └── package.json
│
├── .github/
│   └── workflows/
│       └── deploy.yml               ← CI/CD tự động
├── .gitignore
└── package.json                     ← Root scripts (monorepo)
```

---

## 3. Yêu cầu hệ thống

### Máy tính phát triển
- Node.js >= 18
- Git
- npm >= 9

### Camera Box (RZV2L / RK3568)
- OS: Ubuntu / Yocto Linux (ARM64)
- GStreamer đã cài: `gstreamer1.0-plugins-good`, `gstreamer1.0-plugins-bad`
- Plugin `rtspclientsink` hoặc `rtmpsink`
- Kết nối internet 24/7
- RAM: >= 400MB free sau khi load AI model
- MediaMTX binary (ARM64)
- cloudflared binary (ARM64)

### Tài khoản cần có
- GitHub (lưu code)
- Render.com (backend — free tier)
- Vercel (frontend — free tier)
- Cloudflare (tunnel + DNS — free tier, không cần thẻ)
- Nhà đăng ký domain (Nhanhoa, PAVIE, v.v.)

---

## 4. Khởi tạo dự án

### 4.1 Tạo repo GitHub

```bash
mkdir camera-streaming && cd camera-streaming
git init
git remote add origin https://github.com/USERNAME/camera-streaming.git
```

### 4.2 Cài dependencies

```bash
# Root
npm install

# Backend
cd web_cam/server && npm install

# Frontend
cd ../client && npm install
```

### 4.3 Tạo .env files

**Backend** (`web_cam/server/.env`):
```env
PORT=3001
NODE_ENV=development
HLS_BASE_URL=https://stream.your-domain.id.vn
ALLOWED_ORIGINS=http://localhost:5173
ADMIN_PASSWORD=your_password
```

**Frontend** (`web_cam/client/.env`):
```env
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_APP_NAME=CamWatch
```

---

## 5. Backend — Node.js API Server

### 5.1 Logic cốt lõi

Server **không xử lý video**. Vai trò duy nhất:
- Trả danh sách camera kèm `hlsUrl`
- Probe HLS endpoint để biết camera nào đang live
- Socket.IO push realtime events

### 5.2 API endpoint chính

**`GET /api/streams`** — Probe từng camera:

```js
// web_cam/server/src/index.js

const http  = require('http');
const https = require('https');

function probeHls(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: 'HEAD', timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

app.get('/api/streams', async (req, res) => {
  const hlsBase = config.HLS_BASE_URL;
  const streams = await Promise.all(config.CAMERAS.map(async (cam) => {
    const hlsUrl = `${hlsBase}/${cam.streamKey}/index.m3u8`;
    const isLive = await probeHls(hlsUrl);
    return {
      id:        cam.id,
      label:     cam.label,
      streamKey: cam.streamKey,
      live:      isLive,
      hlsUrl:    isLive ? hlsUrl : null,
    };
  }));
  res.json({ ok: true, streams });
});
```

**`GET /api/health`**:
```js
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});
```

### 5.3 Cấu hình cameras

`web_cam/server/src/config/index.js`:
```js
CAMERAS: [
  { id: 'cam0', label: 'Camera Chính', streamKey: 'cam0' },
  { id: 'cam1', label: 'Camera Phụ 1', streamKey: 'cam1' },
  // ...
],
HLS_BASE_URL: process.env.HLS_BASE_URL || 'http://localhost:8888',
ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(' '),
```

### 5.4 Chạy local

```bash
cd web_cam/server
npm run dev
# Server chạy tại http://localhost:3001
```

---

## 6. Frontend — React Client

### 6.1 VideoPlayer — nguyên tắc thiết kế

- `hlsUrl` nhận trực tiếp từ props (không tự build URL)
- Nếu `hlsUrl` null hoặc `live` false → hiện "Không có tín hiệu", không retry
- Nếu lỗi 404 → `scheduleReconnect()` sau 5 giây
- hls.js config tối ưu cho live camera:

```js
// web_cam/client/src/components/VideoPlayer.jsx

const initPlayer = useCallback(() => {
  if (!videoRef.current || !live || !hlsUrl) {
    setStatus('offline');
    return;
  }

  const hls = new Hls({
    maxBufferLength:             30,
    maxMaxBufferLength:          60,
    liveSyncDurationCount:       4,
    liveMaxLatencyDurationCount: 10,
    maxLiveSyncPlaybackRate:     1.1,
    lowLatencyMode:              false,   // dùng fmp4, không phải LL-HLS
    manifestLoadingMaxRetry:     8,
    fragLoadingMaxRetry:         8,
    enableWorker:                true,
  });

  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (!data.fatal) return;
    if (data.response?.code === 404) {
      scheduleReconnect();   // camera offline → thử lại sau 5s, không spam
      return;
    }
    // ... xử lý lỗi khác
  });
}, [hlsUrl, live, destroyHls]);
```

### 6.2 useStreams — nguồn sự thật là API

```js
// web_cam/client/src/hooks/useStreams.js

// API probe HLS → là nguồn sự thật duy nhất về live/offline
// Socket chỉ dùng để cập nhật viewers và khi stream kết thúc
// KHÔNG dùng socket để set live: true (socket không biết HLS sẵn chưa)

const { connected } = useSocket({
  onStreamLive: () => fetchCameras(),          // fetch lại API để probe
  onStreamEnded: ({ key }) => { /* set live: false */ },
  onViewers:    ({ key, count }) => { /* update count */ },
});

// Poll mỗi 30s
useEffect(() => {
  fetchCameras();
  const id = setInterval(fetchCameras, 30_000);
  return () => clearInterval(id);
}, [fetchCameras]);
```

### 6.3 Chạy frontend local

```bash
cd web_cam/client
npm run dev
# Mở http://localhost:5173
```

---

## 7. Camera Box — MediaMTX + Cloudflare Tunnel

### 7.1 Cài MediaMTX (ARM64)

```bash
cd /home/root

# Tải binary ARM64
wget https://github.com/bluenviron/mediamtx/releases/download/v1.9.1/mediamtx_v1.9.1_linux_arm64v8.tar.gz
tar -xzf mediamtx_v1.9.1_linux_arm64v8.tar.gz
mv mediamtx /usr/local/bin/
chmod +x /usr/local/bin/mediamtx

# Kiểm tra
mediamtx --version
```

### 7.2 Config MediaMTX

```bash
mkdir -p /home/root/config

cat > /home/root/config/mediamtx.yml << 'EOF'
logLevel: info
rtspAddress: :8554
hlsAddress: :8888
rtmpAddress: :1935
webrtcAddress: :8889
hlsAlwaysRemux: yes
hlsVariant: fmp4
hlsSegmentCount: 6
hlsSegmentDuration: 2s
hlsDeleteAfterSegments: 8
paths:
  all_others: {}
EOF
```

**Lý do chọn `fmp4` thay vì `lowLatency`:**
- `lowLatency` yêu cầu tối thiểu 7 segments → với camera 1-2 FPS AI inference, segment tạo rất chậm gây 404 liên tục
- `fmp4` ổn định hơn, tương thích browser rộng hơn
- Latency ~4-6 giây — chấp nhận được cho surveillance camera

### 7.3 Systemd service cho MediaMTX

```bash
cat > /etc/systemd/system/mediamtx.service << 'EOF'
[Unit]
Description=MediaMTX RTSP/HLS Server
After=network.target

[Service]
ExecStart=/usr/local/bin/mediamtx /home/root/config/mediamtx.yml
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mediamtx
systemctl start mediamtx
```

### 7.4 Cài cloudflared (ARM64)

```bash
# Thường đã có sẵn trên board — kiểm tra
which cloudflared && cloudflared --version

# Nếu chưa có, tải từ máy tính rồi SCP lên
# Trên máy tính Ubuntu:
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
scp cloudflared-linux-arm64 root@BOARD_IP:/usr/local/bin/cloudflared

# Trên board
chmod +x /usr/local/bin/cloudflared
```

### 7.5 Setup Cloudflare Tunnel

**Bước 1 — Trỏ Nameserver domain về Cloudflare:**

Đăng nhập Cloudflare → Add domain → lấy 2 Nameserver.

Vào Nhanhoa (hoặc nơi mua domain) → Chỉnh sửa Nameserver:
```
DNS 1: aria.ns.cloudflare.com     (IP: để trống)
DNS 2: brad.ns.cloudflare.com     (IP: để trống)
```
Đợi 10-30 phút propagate.

Kiểm tra:
```bash
nslookup -type=NS your-domain.id.vn 8.8.8.8
# Phải thấy cloudflare.com trong kết quả
```

**Bước 2 — Login cloudflared trên board:**

```bash
cloudflared tunnel login
# Copy URL được in ra → mở browser → đăng nhập Cloudflare → chọn domain → Authorize
# File cert.pem được tạo tại ~/.cloudflared/cert.pem
```

**Lưu ý:** Trên RZV2L, `~` = `/home/root/`, không phải `/root/`. Copy cert sang `/root/`:
```bash
mkdir -p /root/.cloudflared
cp -r /home/root/.cloudflared/* /root/.cloudflared/
```

**Bước 3 — Tạo tunnel:**

```bash
cloudflared tunnel create camwatch
# In ra: Tunnel ID = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# File JSON credentials tạo tại ~/.cloudflared/TUNNEL-ID.json
```

**Bước 4 — Tạo DNS record:**

```bash
cloudflared tunnel route dns camwatch stream.your-domain.id.vn
# Tự tạo CNAME record trong Cloudflare DNS
```

**Bước 5 — Config tunnel:**

```bash
# Thay TUNNEL-ID bằng ID thật
TUNNEL_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

cat > /root/.cloudflared/config.yml << EOF
tunnel: ${TUNNEL_ID}
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json
origincert: /root/.cloudflared/cert.pem

ingress:
  - hostname: stream.your-domain.id.vn
    service: http://localhost:8888
  - service: http_status:404
EOF
```

**Bước 6 — Systemd service:**

```bash
cat > /etc/systemd/system/cloudflared.service << 'EOF'
[Unit]
Description=Cloudflare Tunnel
After=network-online.target mediamtx.service
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/cloudflared tunnel --config /root/.cloudflared/config.yml run camwatch
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cloudflared
systemctl start cloudflared
```

Kiểm tra:
```bash
systemctl status cloudflared
# Phải thấy: INF Registered tunnel connection
```

### 7.6 GStreamer pipeline trong app

App đẩy RTSP vào MediaMTX localhost:

```c
// Pipeline trong traffic_violation/src/stream.cpp (ví dụ)
"appsrc name=src is-live=true format=time block=true max-bytes=10485760 ! "
"video/x-raw,format=BGR,width=1280,height=720,framerate=15/1 ! "
"videoconvert ! video/x-raw,format=NV12 ! "
"omxh264enc target-bitrate=1500000 interval-intraframes=30 ! "
"video/x-h264 ! h264parse config-interval=1 ! "
"rtspclientsink name=sink location=\"rtsp://127.0.0.1:8554/cam0\" protocols=tcp"
```

**config.yaml của app:**
```yaml
output:
  mode: stream
  stream_url: rtsp://127.0.0.1:8554/cam0
  stream_width: 1280
  stream_height: 720
  stream_fps: 15
  stream_bitrate: 1500000
```

### 7.7 Thứ tự khởi động (quan trọng)

Phải khởi động theo đúng thứ tự để tránh OOM:

```
1. MediaMTX (chạy nhẹ, ~10MB RAM)
2. Camera app (load AI model ~400MB RAM)
   → Đợi app push RTSP thành công
3. cloudflared (chỉ start sau khi app đang stream)
```

Lý do: Board có giới hạn CMA memory cho multimedia. Nếu cloudflared chạy trước, nó chiếm virtual memory khiến `omxh264enc` fail → app fallback software encoder → OOM kill.

---

## 8. Deploy Backend lên Render.com

### 8.1 Tạo Web Service

1. Vào **https://render.com** → **New → Web Service**
2. Connect GitHub repo → chọn `camera-streaming`

### 8.2 Cấu hình

| Trường | Giá trị |
|--------|---------|
| Root Directory | `web_cam/server` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node src/index.js` |
| Instance Type | `Free` |

### 8.3 Environment Variables

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `HLS_BASE_URL` | `https://stream.your-domain.id.vn` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` |
| `ADMIN_PASSWORD` | `your_strong_password` |

### 8.4 Kiểm tra

```bash
curl https://your-server.onrender.com/api/health
# {"ok":true,"uptime":...}

curl https://your-server.onrender.com/api/streams
# {"ok":true,"streams":[{"id":"cam0","live":true/false,...}]}
```

**Lưu ý Render free tier:** Service ngủ sau 15 phút không có request. Lần đầu truy cập mất 30-60 giây wake up.

---

## 9. Deploy Frontend lên Vercel

### 9.1 Import project

1. Vào **https://vercel.com** → **New Project → Import** repo
2. Cấu hình:

| Trường | Giá trị |
|--------|---------|
| Root Directory | `web_cam/client` |
| Framework | `Vite` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### 9.2 Environment Variables

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://your-server.onrender.com` |
| `VITE_SOCKET_URL` | `https://your-server.onrender.com` |
| `VITE_APP_NAME` | `CamWatch` |

### 9.3 vercel.json

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 9.4 Sau khi deploy

Cập nhật `ALLOWED_ORIGINS` trên Render thành URL Vercel thật:
```
ALLOWED_ORIGINS = https://your-app.vercel.app
```

---

## 10. CI/CD với GitHub Actions

### 10.1 File `.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render deploy hook
        run: curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Vercel CLI
        run: npm install -g vercel
      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          cd web_cam/client
          vercel deploy --prod --token=$VERCEL_TOKEN
```

### 10.2 GitHub Secrets cần thiết

| Secret | Lấy từ đâu |
|--------|-----------|
| `RENDER_DEPLOY_HOOK_URL` | Render → Service → Settings → Deploy Hooks |
| `VERCEL_TOKEN` | vercel.com → Settings → Tokens |
| `VERCEL_ORG_ID` | `vercel whoami` hoặc `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Sau khi `vercel link` trong thư mục client |

---

## 11. Khởi động tự động trên Camera Box

### 11.1 Thứ tự service dependencies

```
network-online.target
       └─▶ mediamtx.service
              └─▶ cloudflared.service (After: mediamtx)
              └─▶ traffic-violation.service (After: mediamtx)
```

### 11.2 Service cho camera app

```bash
cat > /etc/systemd/system/traffic-violation.service << 'EOF'
[Unit]
Description=Traffic Violation Detection App
After=mediamtx.service network.target
Wants=mediamtx.service

[Service]
WorkingDirectory=/home/root/traffic_violation
ExecStart=/home/root/traffic_violation/traffic_violation
Restart=on-failure
RestartSec=30
User=root
StandardOutput=append:/tmp/traffic.log
StandardError=append:/tmp/traffic.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable traffic-violation
```

### 11.3 Kiểm tra sau reboot

```bash
reboot

# Sau khi SSH lại:
systemctl status mediamtx
systemctl status cloudflared
systemctl status traffic-violation

# Test HLS local
wget -q -O - http://localhost:8888/cam0/index.m3u8 | head -5
```

---

## 12. Kiểm tra toàn hệ thống

Chạy theo thứ tự từ dưới lên:

```bash
# 1. HLS trên board
wget -q -O - http://localhost:8888/cam0/index.m3u8
# Phải thấy #EXTM3U

# 2. HLS qua Cloudflare tunnel (từ máy tính)
curl https://stream.your-domain.id.vn/cam0/index.m3u8
# Phải thấy #EXTM3U (HTTP 200, không phải 401/404/502)

# 3. API server
curl https://your-server.onrender.com/api/health
# {"ok":true}

# 4. API trả đúng hlsUrl
curl https://your-server.onrender.com/api/streams
# cam0 phải có "live":true và "hlsUrl":"https://stream.your-domain..."

# 5. Website
# Mở https://your-app.vercel.app
# cam0 hiện LIVE và load video
```

---

## 13. Troubleshooting

### App bị Killed (OOM)

```bash
# Kiểm tra CMA memory
cat /proc/meminfo | grep -i cma

# Giải phóng cache
echo 3 > /proc/sys/vm/drop_caches

# Giảm resolution trong config.yaml
# width: 1920→1280, height: 1080→720

# Chạy đúng thứ tự: mediamtx → app → cloudflared (sau cùng)
```

### cloudflared lỗi 401

```bash
# Thiếu origincert trong config
# Thêm vào /root/.cloudflared/config.yml:
origincert: /root/.cloudflared/cert.pem
```

### cloudflared lỗi "cert.pem not found"

```bash
# cert ở /home/root thay vì /root
cp -r /home/root/.cloudflared/* /root/.cloudflared/
```

### HLS 404 sau khi restart mediamtx

```bash
# App mất RTSP connection khi mediamtx restart
# Kill và restart app
kill $(pgrep traffic_violation)
sleep 2
systemctl start traffic-violation
```

### mediamtx lỗi "Low-Latency HLS requires 7 segments"

```bash
# Đổi hlsVariant từ lowLatency sang fmp4
sed -i 's/hlsVariant: lowLatency/hlsVariant: fmp4/' /home/root/config/mediamtx.yml
systemctl restart mediamtx
```

### mediamtx lỗi YAML parse

```bash
# YAML không cho phép comment trên cùng dòng với giá trị
# Dùng cat EOF để viết lại file, không dùng editor thêm comment
```

### Website "Cannot reach server"

```bash
# 1. Render đang ngủ → curl để wake up
curl https://your-server.onrender.com/api/health

# 2. CORS sai → kiểm tra ALLOWED_ORIGINS trên Render
# Phải đúng URL Vercel: https://your-app.vercel.app
```

### Video không hiện (hls.js error)

```bash
# Kiểm tra Console browser:
# 404 → camera offline, đúng behavior
# 502 → Cloudflare kết nối được board nhưng mediamtx lỗi
# 401 → mediamtx yêu cầu auth, cần xóa authMethod trong config
```

---

## 14. Vận hành & Bảo trì

### Theo dõi log real-time

```bash
# MediaMTX
journalctl -u mediamtx -f

# Cloudflare Tunnel
journalctl -u cloudflared -f

# Camera app
tail -f /tmp/traffic.log

# Xem tất cả
journalctl -f
```

### Kiểm tra RAM định kỳ

```bash
# Xem memory usage
free -m
top
```

### Cập nhật config MediaMTX

```bash
# Sau khi sửa config
systemctl restart mediamtx

# Nếu app mất kết nối sau restart
systemctl restart traffic-violation
```

### Cập nhật cloudflared

```bash
# Tải binary mới từ máy tính, SCP lên board
scp cloudflared-linux-arm64 root@BOARD_IP:/usr/local/bin/cloudflared
systemctl restart cloudflared
```

### Rollback deploy Vercel

```bash
# Vercel Dashboard → Deployments → chọn deployment cũ → Promote to Production
```

### Rollback deploy Render

```bash
# Render Dashboard → Deploys → chọn deploy cũ → Rollback
```

---

## Tóm tắt URLs sau khi deploy xong

| Thứ | URL |
|-----|-----|
| Website | `https://your-app.vercel.app` |
| API | `https://your-server.onrender.com/api/health` |
| HLS public | `https://stream.your-domain.id.vn/cam0/index.m3u8` |
| HLS local | `http://localhost:8888/cam0/index.m3u8` |

---

*Tài liệu này phản ánh kiến trúc thực tế được deploy và test thành công ngày 21/03/2026.*  
*Mọi thay đổi cấu hình cần test trên local trước khi đẩy lên production.*
