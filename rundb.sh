#!/bin/bash

# Veritabanı Migration ve Setup Script'i
# Bu script tüm veritabanı migration'larını ve index'leri uygular

set -e  # Hata durumunda script'i durdur

echo "=========================================="
echo "🚀 Veritabanı Setup ve Migration Başlatılıyor"
echo "=========================================="
echo ""

# .env dosyasının varlığını kontrol et
if [ ! -f .env ]; then
    echo "❌ HATA: .env dosyası bulunamadı!"
    echo "   Lütfen .env dosyasını oluşturun ve DATABASE_URL'i tanımlayın."
    exit 1
fi

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
echo ""

# 1. Database'i oluştur (setupDB.js)
echo "📦 Adım 1/4: Database oluşturuluyor..."
if node setupDB.js; then
    echo "✅ Database setup tamamlandı"
else
    echo "❌ Database setup başarısız!"
    exit 1
fi
echo ""

# 2. Prisma Client'ı generate et
echo "📦 Adım 2/4: Prisma Client generate ediliyor..."
if npx prisma generate; then
    echo "✅ Prisma Client generate edildi"
else
    echo "❌ Prisma Client generate başarısız!"
    exit 1
fi
echo ""

# 3. Migration'ları uygula
echo "📦 Adım 3/4: Migration'lar uygulanıyor..."
if npx prisma migrate deploy; then
    echo "✅ Migration'lar başarıyla uygulandı"
else
    echo "❌ Migration'lar başarısız!"
    exit 1
fi
echo ""

# 4. Index'leri uygula
echo "📦 Adım 4/4: Index'ler uygulanıyor..."
if node applyIndexes.js; then
    echo "✅ Index'ler başarıyla uygulandı"
else
    echo "⚠️  Index'ler uygulanırken bazı hatalar oluştu (devam ediliyor...)"
fi
echo ""

echo "=========================================="
echo "🎉 Veritabanı setup tamamlandı!"
echo "=========================================="
echo ""
echo "📝 Sonraki adımlar:"
echo "   - .env dosyasını kontrol edin"
echo "   - Uygulamayı başlatmak için: ./run.sh veya npm run dev"
echo ""

