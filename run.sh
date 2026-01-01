#!/bin/bash

# Uygulama Kurulum ve Başlatma Script'i
# Bu script tüm bağımlılıkları yükler ve uygulamayı başlatır

set -e  # Hata durumunda script'i durdur

echo "=========================================="
echo "🚀 Uygulama Kurulum ve Başlatma"
echo "=========================================="
echo ""

# Node.js'in yüklü olup olmadığını kontrol et
if ! command -v node &> /dev/null; then
    echo "❌ HATA: Node.js yüklü değil!"
    echo "   Lütfen Node.js'i yükleyin: https://nodejs.org/"
    exit 1
fi

# npm'in yüklü olup olmadığını kontrol et
if ! command -v npm &> /dev/null; then
    echo "❌ HATA: npm yüklü değil!"
    exit 1
fi

echo "✅ Node.js ve npm kontrol edildi"
echo "   Node.js versiyonu: $(node --version)"
echo "   npm versiyonu: $(npm --version)"
echo ""

# .env dosyasının varlığını kontrol et (uyarı olarak)
if [ ! -f .env ]; then
    echo "⚠️  UYARI: .env dosyası bulunamadı!"
    echo "   Uygulama çalışabilir ama veritabanı bağlantısı için .env dosyası gerekli."
    echo "   Devam ediliyor..."
    echo ""
fi

# 1. npm install - Bağımlılıkları yükle
echo "📦 Adım 1/3: Bağımlılıklar yükleniyor (npm install)..."
echo "   Bu işlem birkaç dakika sürebilir..."
if npm install; then
    echo "✅ Bağımlılıklar başarıyla yüklendi"
else
    echo "❌ Bağımlılık yükleme başarısız!"
    exit 1
fi
echo ""

# 2. Prisma Client'ı generate et
echo "📦 Adım 2/3: Prisma Client generate ediliyor..."
if npx prisma generate; then
    echo "✅ Prisma Client generate edildi"
else
    echo "⚠️  Prisma Client generate başarısız (devam ediliyor...)"
    echo "   Not: Veritabanı bağlantısı yoksa bu normal olabilir."
fi
echo ""

# 3. Uygulamayı başlat
echo "📦 Adım 3/3: Uygulama başlatılıyor..."
echo ""
echo "=========================================="
echo "🎉 Kurulum tamamlandı! Uygulama başlatılıyor..."
echo "=========================================="
echo ""
echo "💡 İpucu: Uygulamayı durdurmak için Ctrl+C tuşlarına basın"
echo ""

# Uygulamayı başlat
npm run dev

