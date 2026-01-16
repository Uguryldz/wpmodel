#!/bin/bash

# Production başlatma script'i
# Bu script uygulamayı arka planda çalıştırır ve SIGHUP sinyallerini ignore eder

set -e

# NVM'i yükle ve Node.js 20'yi kullan
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20 > /dev/null 2>&1 || nvm use default

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

echo "🚀 Uygulama başlatılıyor..."
echo "📝 Loglar: $LOG_DIR/backend.log ve $LOG_DIR/frontend.log"
echo ""

# Backend'i arka planda başlat
echo "🔧 Backend başlatılıyor..."
nohup node src/index.js > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "✅ Backend başlatıldı (PID: $BACKEND_PID)"

# Kısa bir bekleme
sleep 2

# Frontend'i arka planda başlat
echo "🎨 Frontend başlatılıyor..."
nohup npx vite > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend başlatıldı (PID: $FRONTEND_PID)"

# PID'leri dosyaya kaydet (durdurma için)
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

echo ""
echo "=========================================="
echo "✅ Uygulama başarıyla başlatıldı!"
echo "=========================================="
echo ""
echo "📊 Süreçler:"
echo "   Backend PID:  $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo ""
echo "📝 Logları görüntülemek için:"
echo "   tail -f $LOG_DIR/backend.log"
echo "   tail -f $LOG_DIR/frontend.log"
echo ""
echo "🛑 Durdurmak için:"
echo "   ./stop.sh"
echo "   veya"
echo "   kill $BACKEND_PID $FRONTEND_PID"
echo ""

