/**
 * gstreamer_rtmp_patch.c
 * ─────────────────────────────────────────────────────────────────────────────
 *  Patch để áp dụng vào main.c hiện tại:
 *  Thay thế UDP streaming bằng RTMP push tới media server.
 *
 *  Cách dùng:
 *    1. Copy hàm build_stream_pipeline_rtmp() vào main.c
 *       (thay thế hàm build_stream_pipeline cũ)
 *    2. Cập nhật struct CameraConfig (thêm rtmp_url)
 *    3. Sửa camera_thread() theo hướng dẫn trong file này
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── 1. Thêm field vào CameraConfig (trong struct definition) ─────────────── */
/*
typedef struct {
    // ... các field cũ giữ nguyên ...
    char *rtmp_url;          // <-- THÊM DÒNG NÀY
} CameraConfig;
*/

/* ── 2. Cập nhật default config ───────────────────────────────────────────── */
/*
// Thay YOUR_SERVER_IP bằng IP thực của VPS / Render / Railway
#define RTMP_SERVER_URL "rtmp://YOUR_SERVER_IP:1935/live"

CameraConfig g_camcfg[MAX_CAMERAS] = {
    {
        .cam_index      = 0,
        .device         = "/dev/video0",
        .udp_ip         = "127.0.0.1",   // giữ để không sửa nhiều
        .udp_port       = 5001,
        .rtmp_url       = RTMP_SERVER_URL "/cam0",
        .display_info   = {"30G123","001","Alice","105.1","20.1","45km/h"},
        .streaming_enabled  = 1,
        .recording_enabled  = 1,
        .playback_enabled   = 0,
    },
};
*/

/* ── 3. Hàm build pipeline RTMP (thay thế build_stream_pipeline cũ) ────────── */
static GstElement *build_stream_pipeline_rtmp(const char *rtmp_url)
{
    /*
     *  appsrc  →  BGRx  →  videoconvert  →  NV12
     *         →  mpph264enc (Rockchip HW)
     *         →  h264parse
     *         →  flvmux
     *         →  rtmpsink  →  rtmp://server/live/camX
     *
     *  Nếu không có mpph264enc (board x86), thay bằng:
     *    x264enc tune=zerolatency speed-preset=veryfast bitrate=1500
     */
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
        4 * WIDTH * HEIGHT * 5,
        WIDTH, HEIGHT,
        rtmp_url
    );

    GstElement *pipeline = gst_parse_launch(desc, NULL);
    g_free(desc);

    if (!pipeline) {
        write_log(TAG_ERROR, "build_stream_pipeline_rtmp: parse failed for url=%s", rtmp_url);
    }
    return pipeline;
}

/* ── 4. Patch trong camera_thread() ──────────────────────────────────────── */
/*
    // ── Build stream pipeline (RTMP) ──────────────────────────────────────
    // CŨ:
    //   cfg->stream_pipeline = build_stream_pipeline(cfg->udp_ip, cfg->udp_port);
    //   cfg->udpsink = gst_bin_get_by_name(GST_BIN(cfg->stream_pipeline), "udpsink0");

    // MỚI:
    cfg->stream_pipeline = build_stream_pipeline_rtmp(cfg->rtmp_url);
    cfg->stream_src      = gst_bin_get_by_name(GST_BIN(cfg->stream_pipeline), "stream_src");
    // udpsink không còn dùng; giữ pointer NULL hoặc xoá bỏ
    cfg->udpsink = NULL;

    GstCaps *caps = gst_caps_new_simple("video/x-raw",
        "format",    G_TYPE_STRING,       "BGRx",
        "width",     G_TYPE_INT,           WIDTH,
        "height",    G_TYPE_INT,           HEIGHT,
        "framerate", GST_TYPE_FRACTION,    15, 1,
        NULL);
    gst_app_src_set_caps(GST_APP_SRC(cfg->stream_src), caps);
    gst_caps_unref(caps);
*/

/* ── 5. Test pipeline từ command line (không cần compile lại) ────────────── */
/*
# Trên board ARM — test push RTMP:
gst-launch-1.0 videotestsrc pattern=smpte ! \
    video/x-raw,width=1280,height=720,framerate=15/1 ! \
    videoconvert ! video/x-raw,format=NV12 ! \
    mpph264enc bps=1500000 ! \
    h264parse ! \
    flvmux streamable=true ! \
    rtmpsink location="rtmp://YOUR_SERVER_IP:1935/live/cam0 live=1"

# Trên x86 (không có mpph264enc):
gst-launch-1.0 videotestsrc pattern=smpte ! \
    video/x-raw,width=1280,height=720,framerate=15/1 ! \
    x264enc tune=zerolatency speed-preset=veryfast bitrate=1500 ! \
    h264parse ! \
    flvmux streamable=true ! \
    rtmpsink location="rtmp://YOUR_SERVER_IP:1935/live/cam0 live=1"
*/

/* ── 6. Cài plugin GStreamer RTMP trên board ─────────────────────────────── */
/*
# Ubuntu / Debian (RK3568, RK3588):
sudo apt-get install -y \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-plugins-bad \
    libgstreamer-plugins-bad1.0-dev

# Kiểm tra rtmpsink có sẵn chưa:
gst-inspect-1.0 rtmpsink

# Nếu không có rtmpsink, thử rtmp2sink (từ gst-plugins-bad >= 1.18):
gst-inspect-1.0 rtmp2sink
# Và đổi "rtmpsink" → "rtmp2sink" trong pipeline string ở trên.
*/
