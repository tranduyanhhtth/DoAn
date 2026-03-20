// src/services/api.js
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

const http = axios.create({
  baseURL: BASE,
  timeout: 10_000,
});

export const api = {
  /** Fetch all configured cameras with live status */
  getStreams: () =>
    http.get('/api/streams').then(r => r.data.streams),

  /** Fetch single stream metadata */
  getStream: (key) =>
    http.get(`/api/streams/${key}`).then(r => r.data.stream),

  /** Quick HLS readiness probe */
  hlsReady: (key) =>
    http.get(`/api/hls-check/${key}`).then(r => r.data.ready),

  /** Server health */
  health: () =>
    http.get('/api/health').then(r => r.data),
};
