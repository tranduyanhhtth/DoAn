# CamWatch — Live Camera Streaming System
> Node.js · React · HLS · Socket.IO · GStreamer RTMP

---

## Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│  Camera Box (ARM / RK3568)                                  │
│                                                             │
│  main.c  →  GStreamer  →  rtmpsink                          │
│                              │                              │
│                              │  RTMP (port 1935)            │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  VPS / Render.com  (Media Server)                           │
│                                                             │
│  node-media-server  →  ffmpeg  →  HLS segments (.ts)        │
│  Express + Socket.IO  →  serve /hls/* + /api/*              │
│                              │                              │
│                              │  HTTP (port 3001)            │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Browser  (Vercel / GitHub Pages)                           │
│                                                             │
│  React + hls.js  →  fetch m3u8  →  decode .ts  →  <video>  │
│  Socket.IO client  →  real-time live/offline status         │
└─────────────────────────────────────────────────────────────┘
```

---

## Cấu trúc project

```
camera-streaming/
├── server/                   # Node.js backend
│   ├── src/
│   │   ├── index.js          # Entry point (Express + Socket.IO)
│   │   ├── mediaServer.js    # node-media-server (RTMP → HLS)
│   │   ├── config/
│   │   │   ├── index.js      # Tất cả config từ .env
│   │   │   └── logger.js     # Winston logger
│   │   └── routes/
│   │       └── api.js        # REST endpoints
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
│
├── client/                   # React frontend
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── styles.css
│   │   ├── components/
│   │   │   ├── VideoPlayer.jsx   # HLS player với auto-reconnect
│   │   │   ├── CameraCard.jsx    # Card hiển thị mỗi camera
│   │   │   └── StatusBar.jsx     # Thanh trạng thái realtime
│   │   ├── hooks/
│   │   │   ├── useSocket.js      # Socket.IO connection
│   │   │   └── useStreams.js     # Data hook tổng hợp
│   │   └── services/
│   │       └── api.js            # Axios REST calls
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── nginx-spa.conf
│   └── package.json
│
├── gstreamer_rtmp_patch.c    # Patch cho main.c camera box
├── docker-compose.yml        # Local full-stack dev
├── ecosystem.config.cjs      # PM2 config cho VPS
├── render.yaml               # Render.com IaC
├── .github/workflows/
│   └── deploy.yml            # CI/CD tự động
└── .gitignore
```

---

## PHẦN 1 — Chạy Local (Development)

### Bước 1.1 — Clone và cài dependencies

```bash
git clone https://github.com/YOUR_USERNAME/camera-streaming.git
cd camera-streaming

# Cài tất cả dependencies một lệnh
npm run install:all
```

### Bước 1.2 — Tạo file .env

**Server** (`server/.env`):
```bash
cp server/.env.example server/.env
```
Sửa file `server/.env`:
```env
PORT=3001
RTMP_PORT=1935
HLS_PATH=/tmp/hls
HLS_FRAGMENT_DURATION=2
HLS_PLAYLIST_LENGTH=6
STREAM_SECRET=
ADMIN_PASSWORD=mypassword123
ALLOWED_ORIGINS=http://localhost:5173
FFMPEG_PATH=/usr/bin/ffmpeg
NODE_ENV=development
```

**Client** (`client/.env`):
```bash
cp client/.env.example client/.env
```
```env
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_APP_NAME=CamWatch
```

### Bước 1.3 — Cài ffmpeg (bắt buộc cho server)

```bash
# Ubuntu / Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Kiểm tra
ffmpeg -version
which ffmpeg   # ghi lại path này vào FFMPEG_PATH trong .env
```

### Bước 1.4 — Chạy dev server

```bash
# Terminal 1: chạy cả hai cùng lúc
npm run dev

# Hoặc chạy riêng:
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Mở browser: **http://localhost:5173**

### Bước 1.5 — Test stream giả lập (không cần camera thật)

```bash
# Cần cài ffmpeg trên máy dev
ffmpeg -re \
  -f lavfi -i "testsrc=size=1280x720:rate=15" \
  -f lavfi -i "sine=frequency=440" \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -b:v 1500k -maxrate 1500k -bufsize 3000k \
  -g 30 -c:a aac -b:a 128k \
  -f flv "rtmp://localhost:1935/live/cam0"
```

Xem log server — sẽ thấy:
```
[info] Stream LIVE { key: 'cam0' }
[info] HLS segments → /tmp/hls
```

Website tự cập nhật badge **LIVE** nhờ Socket.IO.

---

## PHẦN 2 — Sửa main.c để push RTMP

### Bước 2.1 — Cài GStreamer RTMP plugin trên board

```bash
# Trên board ARM (Ubuntu/Debian):
sudo apt-get install -y \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-plugins-bad

# Kiểm tra
gst-inspect-1.0 rtmpsink   # phải thấy output mô tả plugin
```

Nếu board dùng `gst-plugins-bad >= 1.18`, dùng `rtmp2sink` thay vì `rtmpsink`:
```bash
gst-inspect-1.0 rtmp2sink
```

### Bước 2.2 — Áp dụng patch vào main.c

Xem file `gstreamer_rtmp_patch.c` trong project.
Tóm tắt thay đổi:

**1. Thêm field vào struct `CameraConfig`:**
```c
char *rtmp_url;
```

**2. Thay hàm `build_stream_pipeline`:**
```c
// Xoá hàm cũ, thêm hàm mới:
static GstElement *build_stream_pipeline_rtmp(const char *rtmp_url)
{
    gchar *desc = g_strdup_printf(
        "appsrc name=stream_src "
        "    is-live=true format=time block=true do-timestamp=false "
        "    max-bytes=%d ! "
        "video/x-raw,format=BGRx,width=%d,height=%d,framerate=15/1 ! "
        "videoconvert ! video/x-raw,format=NV12 ! "
        "queue leaky=downstream max-size-buffers=2 ! "
        "mpph264enc bps=1500000 rc-mode=cbr gop=30 ! "
        "h264parse disable-passthrough=true ! "
        "flvmux streamable=true name=mux ! "
        "rtmpsink name=rtmpsink0 location=\"%s live=1\"",
        4 * WIDTH * HEIGHT * 5, WIDTH, HEIGHT, rtmp_url
    );
    GstElement *pipeline = gst_parse_launch(desc, NULL);
    g_free(desc);
    return pipeline;
}
```

**3. Cập nhật default config:**
```c
#define RTMP_SERVER_URL "rtmp://YOUR_VPS_IP:1935/live"

CameraConfig g_camcfg[MAX_CAMERAS] = {
    {0, "/dev/video0",
     .rtmp_url = RTMP_SERVER_URL "/cam0",
     ...
    }
};
```

**4. Trong `camera_thread()`, thay dòng build pipeline:**
```c
// CŨ:
cfg->stream_pipeline = build_stream_pipeline(cfg->udp_ip, cfg->udp_port);

// MỚI:
cfg->stream_pipeline = build_stream_pipeline_rtmp(cfg->rtmp_url);
cfg->stream_src = gst_bin_get_by_name(GST_BIN(cfg->stream_pipeline), "stream_src");
cfg->udpsink = NULL;
```

---

## PHẦN 3 — Deploy lên Internet (miễn phí)

> **Chiến lược deploy tối ưu:**
> - **Backend** (Node.js + RTMP) → **Railway** hoặc **Render** (cần TCP port 1935)
> - **Frontend** (React static) → **Vercel** (miễn phí, CDN toàn cầu)

### OPTION A: Railway (Backend) + Vercel (Frontend)
*Railway hỗ trợ TCP port → RTMP hoạt động được*

---

#### BƯỚC 3.1 — Push code lên GitHub

```bash
cd camera-streaming
git init
git add .
git commit -m "feat: initial camera streaming setup"

# Tạo repo trên github.com, rồi:
git remote add origin https://github.com/YOUR_USERNAME/camera-streaming.git
git push -u origin main
```

---

#### BƯỚC 3.2 — Deploy Backend lên Railway

1. Truy cập **https://railway.app** → Sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Chọn repo `camera-streaming`
4. Railway tự detect — chọn **Deploy server folder**:
   - Root directory: `server`
   - Build command: `npm ci`
   - Start command: `node src/index.js`

5. Mở tab **Variables**, thêm:
   ```
   NODE_ENV          = production
   PORT              = 3001
   RTMP_PORT         = 1935
   HLS_PATH          = /tmp/hls
   FFMPEG_PATH       = /usr/bin/ffmpeg
   ADMIN_PASSWORD    = your_strong_password
   STREAM_SECRET     = (để trống hoặc đặt secret key)
   ```

6. Tab **Settings → Networking**:
   - Click **Add port** → thêm port `1935` (TCP) cho RTMP
   - Ghi lại Railway public domain, ví dụ: `camwatch-server.railway.app`
   - Ghi lại TCP address cho RTMP, ví dụ: `roundhouse.proxy.rlwy.net:12345`

7. Quay lại Variables, thêm:
   ```
   ALLOWED_ORIGINS = https://your-app.vercel.app
   ```

8. Click **Deploy** → đợi build xong (~2 phút)

9. Kiểm tra:
   ```bash
   curl https://camwatch-server.railway.app/api/health
   # {"ok":true,"uptime":...}
   ```

---

#### BƯỚC 3.3 — Deploy Frontend lên Vercel

**Cách 1: Vercel CLI (nhanh nhất)**
```bash
# Cài Vercel CLI
npm install -g vercel

# Vào thư mục client
cd client

# Tạo file .env.production
cat > .env.production << EOF
VITE_API_URL=https://camwatch-server.railway.app
VITE_SOCKET_URL=https://camwatch-server.railway.app
VITE_APP_NAME=CamWatch
EOF

# Build
npm run build

# Deploy
vercel --prod
# Làm theo hướng dẫn: link to existing project hoặc create new
# → Vercel sẽ hỏi: root directory → nhập "." (đang ở thư mục client)
```

**Cách 2: Vercel Dashboard (GUI)**
1. Truy cập **https://vercel.com** → New Project
2. Import từ GitHub → chọn repo `camera-streaming`
3. **Root Directory**: `client`
4. **Framework Preset**: Vite
5. **Environment Variables**:
   ```
   VITE_API_URL    = https://camwatch-server.railway.app
   VITE_SOCKET_URL = https://camwatch-server.railway.app
   VITE_APP_NAME   = CamWatch
   ```
6. Click **Deploy** → đợi ~1 phút
7. Ghi lại URL, ví dụ: `https://camwatch-abc123.vercel.app`

**Cập nhật CORS trên Railway:**
```
ALLOWED_ORIGINS = https://camwatch-abc123.vercel.app
```

---

#### BƯỚC 3.4 — Cập nhật RTMP URL trên camera box

Sửa `main.c`:
```c
// Railway cấp TCP address dạng: host:port
// Ví dụ: roundhouse.proxy.rlwy.net:12345
#define RTMP_SERVER_URL "rtmp://roundhouse.proxy.rlwy.net:12345/live"
```

---

### OPTION B: VPS riêng (DigitalOcean / Vultr / Linode ~$4/tháng)
*Ổn định hơn, không có free tier nhưng control hoàn toàn*

#### BƯỚC 3.B.1 — Setup VPS

```bash
# SSH vào VPS
ssh root@YOUR_VPS_IP

# Cài Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cài ffmpeg
sudo apt-get install -y ffmpeg

# Cài PM2
npm install -g pm2

# Clone project
git clone https://github.com/YOUR_USERNAME/camera-streaming.git
cd camera-streaming

# Cài dependencies
cd server && npm ci && cd ..
cd client && npm ci && npm run build && cd ..
```

#### BƯỚC 3.B.2 — Cấu hình và chạy server

```bash
# Tạo .env
cp server/.env.example server/.env
nano server/.env
# Điền đầy đủ các biến

# Tạo thư mục HLS
mkdir -p /tmp/hls && chmod 777 /tmp/hls

# Tạo thư mục log
mkdir -p logs

# Chạy với PM2
pm2 start ecosystem.config.cjs --env production

# Lưu config để tự khởi động sau reboot
pm2 save
pm2 startup
# Copy lệnh systemctl mà PM2 in ra và chạy

# Kiểm tra
pm2 status
pm2 logs camwatch-server
```

#### BƯỚC 3.B.3 — Serve React build bằng nginx

```bash
sudo apt install nginx

# Copy build
sudo mkdir -p /var/www/camwatch
sudo cp -r client/dist/* /var/www/camwatch/

# Cấu hình nginx
sudo nano /etc/nginx/sites-available/camwatch
```

```nginx
server {
    listen 80;
    server_name YOUR_VPS_IP;  # hoặc domain của bạn

    # Serve React SPA
    root /var/www/camwatch;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API và HLS về Node.js
    location /api/ {
        proxy_pass         http://localhost:3001;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
    location /hls/ {
        proxy_pass         http://localhost:3001;
        add_header         Cache-Control no-cache;
        add_header         Access-Control-Allow-Origin *;
    }
    location /socket.io/ {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/camwatch /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Mở port firewall
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 1935   # RTMP
sudo ufw enable
```

Mở browser: **http://YOUR_VPS_IP** ✅

#### BƯỚC 3.B.4 — Thêm HTTPS miễn phí (nếu có domain)

```bash
sudo apt install certbot python3-certbot-nginx

# Đổi server_name YOUR_VPS_IP → your-domain.com trong nginx config
sudo certbot --nginx -d your-domain.com

# Tự gia hạn
sudo crontab -e
# Thêm dòng:
# 0 3 * * * certbot renew --quiet
```

---

## PHẦN 4 — CI/CD tự động với GitHub Actions

### Bước 4.1 — Cấu hình GitHub Secrets

Vào repo GitHub → **Settings → Secrets and variables → Actions → New secret**:

| Secret name | Lấy từ đâu |
|-------------|-----------|
| `RENDER_DEPLOY_HOOK_URL` | Render: Service → Settings → Deploy Hooks |
| `VERCEL_TOKEN` | vercel.com → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | `vercel whoami --token=<token>` |
| `VERCEL_PROJECT_ID` | Vercel Dashboard → project → Settings |
| `VITE_API_URL` | URL backend đã deploy |
| `VITE_SOCKET_URL` | URL backend đã deploy |

### Bước 4.2 — Workflow hoạt động

Mỗi khi push code lên nhánh `main`:
```
push to main
    │
    ├─ Job: build         → npm ci + npm run build
    ├─ Job: deploy-backend → POST tới Render deploy hook
    └─ Job: deploy-frontend → vercel deploy --prod
```

---

## PHẦN 5 — Kiểm tra toàn bộ hệ thống

### Checklist cuối

```bash
# 1. Server API health
curl https://camwatch-server.railway.app/api/health

# 2. Danh sách camera (chưa live)
curl https://camwatch-server.railway.app/api/streams

# 3. Test push stream từ bất kỳ máy nào có ffmpeg
ffmpeg -re \
  -f lavfi -i "testsrc=size=1280x720:rate=15" \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -b:v 1500k -g 30 -f flv \
  "rtmp://roundhouse.proxy.rlwy.net:12345/live/cam0"

# 4. Kiểm tra HLS đã được tạo
curl https://camwatch-server.railway.app/api/hls-check/cam0
# {"ok":true,"ready":true,"key":"cam0"}

# 5. Mở website và xem stream
open https://your-app.vercel.app
```

---

## Troubleshooting

| Triệu chứng | Nguyên nhân | Cách sửa |
|-------------|-------------|----------|
| Website hiện "Cannot reach server" | CORS sai | Kiểm tra `ALLOWED_ORIGINS` trong server .env |
| Stream badge luôn OFFLINE | Socket.IO không kết nối | Kiểm tra `VITE_SOCKET_URL` trong client .env |
| Video player quay mãi không load | HLS chưa ready | Đợi 5-10s sau khi stream bắt đầu; kiểm tra ffmpeg chạy trên server |
| `rtmpsink` not found trên board | Plugin chưa cài | `sudo apt install gstreamer1.0-plugins-ugly` |
| Render free tier ngủ | Inactive 15 phút | Upgrade plan hoặc dùng Railway |
| RTMP port 1935 blocked | Render/Vercel không cho TCP | Dùng Railway hoặc VPS riêng |

---

## Tóm tắt các URL sau khi deploy xong

| Service | URL |
|---------|-----|
| Website (React) | `https://your-app.vercel.app` |
| API health | `https://server.railway.app/api/health` |
| HLS stream cam0 | `https://server.railway.app/hls/live/cam0/index.m3u8` |
| RTMP ingest cam0 | `rtmp://tcp.railway.app:PORT/live/cam0` |

Camera box push RTMP → Server chuyển sang HLS → Website hiển thị realtime ✅
