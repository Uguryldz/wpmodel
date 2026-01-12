#!/bin/bash

# Uygulamayı durdurma script'i

LOG_DIR="./logs"

echo "🛑 Uygulama durduruluyor..."

if [ -f "$LOG_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$LOG_DIR/backend.pid")
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo "   Backend durduruluyor (PID: $BACKEND_PID)..."
        kill $BACKEND_PID 2>/dev/null || true
        rm "$LOG_DIR/backend.pid"
        echo "   ✅ Backend durduruldu"
    else
        echo "   ⚠️  Backend zaten durmuş"
        rm "$LOG_DIR/backend.pid"
    fi
else
    echo "   ⚠️  Backend PID dosyası bulunamadı"
fi

if [ -f "$LOG_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$LOG_DIR/frontend.pid")
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo "   Frontend durduruluyor (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID 2>/dev/null || true
        rm "$LOG_DIR/frontend.pid"
        echo "   ✅ Frontend durduruldu"
    else
        echo "   ⚠️  Frontend zaten durmuş"
        rm "$LOG_DIR/frontend.pid"
    fi
else
    echo "   ⚠️  Frontend PID dosyası bulunamadı"
fi

# Eğer hala çalışan süreçler varsa, onları da temizle
pkill -f "node src/index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

echo ""
echo "✅ Tüm süreçler durduruldu"

