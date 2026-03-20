// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev proxy: forward /api and /hls requests to backend
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/hls': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'hls':    ['hls.js'],
          'socket': ['socket.io-client'],
          'react':  ['react', 'react-dom'],
        },
      },
    },
  },
});
