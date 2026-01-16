#!/bin/bash

# Uygulamayı durdurma script'i

LOG_DIR="./logs"

echo "🛑 Uygulama durduruluyor..."

if [ -f "$LOG_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$LOG_DIR/backend.pid")
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo "   Backend durduruluyor (PID: $BACKEND_PID)..."
        # Ana süreci ve tüm alt süreçlerini öldür
        kill $BACKEND_PID 2>/dev/null || true
        pkill -P $BACKEND_PID 2>/dev/null || true
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
        # Ana süreci ve tüm alt süreçlerini öldür
        kill $FRONTEND_PID 2>/dev/null || true
        pkill -P $FRONTEND_PID 2>/dev/null || true
        rm "$LOG_DIR/frontend.pid"
        echo "   ✅ Frontend durduruldu"
    else
        echo "   ⚠️  Frontend zaten durmuş"
        rm "$LOG_DIR/frontend.pid"
    fi
else
    echo "   ⚠️  Frontend PID dosyası bulunamadı"
fi

# Eğer hala çalışan süreçler varsa, onları da temizle (proje dizinine özgü)
PROJECT_DIR=$(pwd)
# Backend süreçlerini temizle
pkill -f "node.*${PROJECT_DIR}/src/index.js" 2>/dev/null || true
# Frontend süreçlerini temizle (npx, vite, ve tüm alt süreçler)
pkill -f "npx.*vite" 2>/dev/null || true
# Vite süreçlerini proje dizinine göre bul ve öldür
ps aux | grep -E "[n]ode.*vite|vite.*${PROJECT_DIR}" | grep "${PROJECT_DIR}" | awk '{print $2}' | while read pid; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
done

echo ""
echo "✅ Tüm süreçler durduruldu"

