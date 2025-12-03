import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/sessions': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // SessionId ile başlayan route'lar (örn: /default/chats, /test/chats)
      '^/([a-zA-Z0-9_-]+)/(chats|contacts|groups|messages)': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path, // Path'i olduğu gibi bırak
      },
    },
    // /docs route'unu yakalayıp direkt backend'e yönlendir
    middlewareMode: false,
  },
});

