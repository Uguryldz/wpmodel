import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';

// .env dosyasını yükle (tüm değişkenler için)
config();

// Environment variables - Vite'ın loadEnv fonksiyonunu kullan (VITE_ prefix'li değişkenler için)
// mode: development veya production
// process.cwd(): proje kök dizini
const viteEnv = loadEnv(process.env.MODE || 'development', process.cwd(), '');

// Environment variables - .env dosyasından oku (her zaman güncel)
const FRONTEND_PORT = Number(process.env.VITE_PORT || viteEnv.VITE_PORT || 5173);
const BACKEND_PORT = Number(process.env.PORT || 3000);
// Backend URL - eğer VITE_BACKEND_URL tanımlıysa onu kullan, yoksa localhost:PORT kullan
const BACKEND_URL = process.env.VITE_BACKEND_URL || viteEnv.VITE_BACKEND_URL || `http://localhost:${BACKEND_PORT}`;

// EPIPE ve ECONNRESET hatalarını filtrele
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, fd) => {
  const message = chunk.toString();
  // EPIPE ve ECONNRESET hatalarını filtrele
  if (message.includes('EPIPE') || message.includes('ECONNRESET')) {
    return true; // Hata yazılmadı olarak işaretle
  }
  return originalStderrWrite(chunk, encoding, fd);
};

// HTTPS sertifikalarını yükle
let httpsConfig = false;
try {
  const keyPath = path.resolve(__dirname, '.cert/key.pem');
  const certPath = path.resolve(__dirname, '.cert/cert.pem');
  
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    httpsConfig = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    console.log('[Vite] HTTPS sertifikaları yüklendi');
  } else {
    console.warn('[Vite] HTTPS sertifikaları bulunamadı, HTTPS devre dışı');
  }
} catch (error) {
  console.warn('[Vite] HTTPS sertifikaları yüklenemedi:', error.message);
}

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
  logLevel: 'warn', // EPIPE gibi normal hataları gizle
  server: {
    port: FRONTEND_PORT,
    host: true,
    https: httpsConfig, // HTTPS desteği ekle (mikrofon/kamera erişimi için gerekli)
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] /api proxy error (backend çalışmıyor olabilir):', err.message);
          });
        },
      },
      '/sessions': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            // EPIPE hatası normal (bağlantı kapandıktan sonra yazma denemesi)
            if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
              console.log('[Vite Proxy] /sessions proxy error:', err.message);
            }
          });
        },
      },
      '/ws': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            // EPIPE ve ECONNRESET hataları normal (bağlantı kapandıktan sonra yazma denemesi)
            // Bu hataları tamamen sessizce handle et
            const ignoredCodes = ['EPIPE', 'ECONNRESET', 'ECONNREFUSED'];
            if (!ignoredCodes.includes(err.code)) {
              console.log('[Vite Proxy] /ws proxy error:', err.message, err.code);
            }
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', (err) => {
              // Socket hatalarını sessizce handle et
              // "This socket has been ended by the other party" - Normal durum (bağlantı kapanırken)
              const ignoredCodes = ['EPIPE', 'ECONNRESET', 'ECONNREFUSED'];
              const ignoredMessages = [
                'This socket has been ended by the other party',
                'socket has been ended',
                'writeAfterFIN'
              ];
              
              const shouldIgnore = ignoredCodes.includes(err.code) || 
                                   ignoredMessages.some(msg => err.message?.includes(msg));
              
              if (!shouldIgnore) {
                console.log('[Vite Proxy] WebSocket socket error:', err.message, err.code);
              }
            });
          });
        },
      },
      '/health': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
      },
      // SessionId ile başlayan route'lar (örn: /default/chats, /test/chats, /temp-xxx/templates)
      '^/([a-zA-Z0-9_-]+)/(chats|contacts|groups|messages|templates)': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        rewrite: (path) => path, // Path'i olduğu gibi bırak
      },
    },
    // /docs route'unu yakalayıp direkt backend'e yönlendir
    middlewareMode: false,
  },
});

