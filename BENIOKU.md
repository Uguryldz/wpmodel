# WhatsApp Multi-Account Yönetim Sistemi

Baileys kütüphanesi kullanarak WhatsApp Web API üzerinden çoklu hesap yönetimi yapan modern bir web uygulaması.

## 🚀 Özellikler

- ✅ Çoklu WhatsApp hesabı yönetimi
- ✅ Gerçek zamanlı mesajlaşma (WebSocket)
- ✅ Chat listesi ve mesaj geçmişi
- ✅ Kişi listesi ve profil fotoğrafları
- ✅ Medya mesajları (resim, video, ses, belge)
- ✅ Grup yönetimi
- ✅ Mesaj şablonları (Template Messages)
- ✅ İnteraktif mesajlar (Button, List)
- ✅ Veritabanı senkronizasyonu (SQLite + Prisma)
- ✅ Modern React + TypeScript frontend
- ✅ RESTful API + Swagger dokümantasyonu

## 📋 Gereksinimler

- **Node.js**: v18 veya üzeri
- **npm**: v9 veya üzeri
- **SQLite**: Prisma ile otomatik kurulur

## 🔧 Kurulum

### 1. Projeyi Klonlayın

```bash
git clone <repository-url>
cd wpmodel
```

### 2. Bağımlılıkları Yükleyin

```bash
npm install
```

### 3. Veritabanını Hazırlayın

```bash
# Prisma Client'ı oluştur
npm run prisma:generate

# Veritabanı migration'larını çalıştır
npm run prisma:migrate
```

**Not:** İlk kurulumda migration'lar otomatik çalışır. Eğer hata alırsanız:

```bash
# Migration'ları sıfırdan çalıştır (DİKKAT: Veriler silinir!)
npx prisma migrate reset
```

### 4. Ortam Değişkenlerini Ayarlayın (Opsiyonel)

Eğer varsa `.env` dosyası oluşturun:

```env
DATABASE_URL="file:./prisma/dev.db"
PORT=3000
```

**Not:** `DATABASE_URL` belirtilmezse varsayılan olarak `file:./prisma/dev.db` kullanılır.

## 🎯 Çalıştırma

### Geliştirme Modu (Backend + Frontend birlikte)

```bash
npm run dev
```

Bu komut hem backend'i (port 3000) hem de frontend'i (port 5173) birlikte başlatır.

**Erişim:**
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Swagger Docs: `http://localhost:3000/docs`

### Sadece Backend

```bash
npm run dev:backend
# veya
npm start
```

Backend: `http://localhost:3000`

### Sadece Frontend

```bash
npm run dev:frontend
```

Frontend: `http://localhost:5173`

### Production Build

```bash
# Frontend'i build et
npm run build

# Build'i önizle
npm run preview
```

## 📁 Proje Yapısı

```
wpmodel/
├── src/                    # Backend kaynak kodları
│   ├── baileys/           # Baileys API modülleri
│   │   ├── business/      # Business API (catalog, profile)
│   │   ├── chats/         # Chat işlemleri
│   │   ├── contacts/      # Kişi işlemleri
│   │   ├── core/          # Çekirdek (connection, events, session)
│   │   ├── groups/        # Grup işlemleri
│   │   ├── media/         # Medya işlemleri
│   │   ├── messages/      # Mesaj işlemleri
│   │   └── utils/         # Yardımcı fonksiyonlar
│   ├── index.js           # Express server ve route'lar
│   ├── baileysClient.js   # Baileys client wrapper
│   └── swagger.js         # Swagger/OpenAPI dokümantasyonu
├── client/                 # Frontend kaynak kodları
│   ├── api/               # API client fonksiyonları
│   ├── components/        # React bileşenleri
│   ├── hooks/             # Custom React hooks
│   ├── pages/             # Sayfa bileşenleri
│   ├── utils/             # Yardımcı fonksiyonlar
│   └── types.ts           # TypeScript tip tanımlamaları
├── prisma/                # Prisma veritabanı şeması
│   ├── schema.prisma      # Veritabanı şeması
│   └── migrations/        # Migration dosyaları
├── auth_info/             # WhatsApp oturum bilgileri (otomatik oluşur)
└── package.json           # Proje bağımlılıkları ve script'ler
```

## 🔌 API Kullanımı

### Swagger Dokümantasyonu

Backend çalıştıktan sonra Swagger UI'ya erişin:

```
http://localhost:3000/docs
```

### Temel Endpoint'ler

#### Session Yönetimi

```bash
# Tüm session'ları listele
GET /sessions

# Session durumunu kontrol et
GET /sessions/:sessionId/status

# Yeni session oluştur
POST /sessions/add
Body: { "sessionId": "my-session" }

# Session başlat (QR kod üretimi için)
GET /sessions/:sessionId/start
```

#### Chat İşlemleri

```bash
# Chat listesi
GET /:sessionId/chats?limit=50

# Mesaj geçmişi
GET /:sessionId/messages/:jid?limit=50

# Mesaj gönder
POST /:sessionId/messages/send
Body: {
  "jid": "905551234567@s.whatsapp.net",
  "text": "Merhaba!"
}
```

#### Kişi İşlemleri

```bash
# Kişi listesi
GET /:sessionId/contacts?limit=50

# Cihazdaki kişi listesi
GET /:sessionId/contacts/device

# Profil fotoğrafı
GET /:sessionId/contacts/:jid/photo
```

## 🗄️ Veritabanı

Proje SQLite veritabanı kullanır. Veritabanı dosyası `prisma/dev.db` konumunda otomatik oluşturulur.

### Prisma Komutları

```bash
# Prisma Client'ı yeniden oluştur
npm run prisma:generate

# Yeni migration oluştur ve uygula
npm run prisma:migrate

# Prisma Studio'yu aç (veritabanı görüntüleyici)
npm run prisma:studio
```

## 🔐 Güvenlik Notları

- `auth_info/` klasörü WhatsApp oturum bilgilerini içerir. **Bu klasörü asla commit etmeyin!**
- `.env` dosyasını `.gitignore`'a ekleyin.
- Production ortamında HTTPS kullanın.

## 🐛 Sorun Giderme

### Port Zaten Kullanımda

```bash
# Port 3000 kullanımda mı kontrol et
lsof -i :3000

# Port 5173 kullanımda mı kontrol et
lsof -i :5173

# Port'u kullanan process'i öldür
kill -9 <PID>
```

### Veritabanı Hatası

```bash
# Prisma Client'ı yeniden oluştur
npm run prisma:generate

# Migration'ları sıfırla (DİKKAT: Veriler silinir!)
npx prisma migrate reset

# Veritabanı dosyasını kontrol et
ls -la prisma/dev.db
```

### WhatsApp Bağlantı Sorunları

- QR kod yenilenmesi için session'ı silip yeniden oluşturun
- `auth_info/` klasöründeki session dosyalarını kontrol edin
- Backend loglarını kontrol edin
- Session durumunu kontrol edin: `GET /sessions/:sessionId/status`

### Frontend Bağlanamıyor

- Backend'in çalıştığından emin olun: `http://localhost:3000`
- Browser console'da hataları kontrol edin
- WebSocket bağlantısını kontrol edin: `ws://localhost:3000/ws`

## 📚 Dokümantasyon

- **Baileys API**: [Baileys Wiki](https://baileys.wiki)
- **Proje Kuralları**: `.cursor/rules/projectrules/RULE.md`
- **API Kullanım Raporu**: `BAILEYS_API_KULLANIM_RAPORU.md`
- **Baileys Detay Referans**: `BaileysDetailApiReferance.md`
- **Baileys Tips**: `BaileyTipREADME.md`

## 🛠️ Geliştirme

### Kod Standartları

- Backend: JavaScript (ES Modules)
- Frontend: TypeScript + React
- Stil: Tailwind CSS
- Linting: TypeScript compiler

### Yeni Özellik Ekleme

1. **Backend için**: `src/baileys/` altındaki ilgili modüle ekleyin
2. **Frontend için**: `client/` altındaki ilgili klasöre ekleyin
3. **API endpoint'i için**: `src/index.js` dosyasına route ekleyin
4. **Swagger dokümantasyonu için**: `src/swagger.js` dosyasını güncelleyin

### Test

```bash
# Backend'i test et
curl http://localhost:3000/sessions

# Frontend'i test et
curl http://localhost:5173
```

## 📝 Hızlı Başlangıç Özeti

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. Veritabanını hazırla
npm run prisma:generate
npm run prisma:migrate

# 3. Projeyi başlat
npm run dev

# 4. Tarayıcıda aç
# Frontend: http://localhost:5173
# Swagger: http://localhost:3000/docs
```

## ⚠️ Önemli Notlar

- Bu proje WhatsApp'ın resmi API'si değildir
- Kullanımınız kendi sorumluluğunuzdadır
- WhatsApp'ın kullanım şartlarına uygun kullanın
- Spam göndermeyin, kullanıcı gizliliğine saygı gösterin

## 📞 Destek

Sorularınız için issue açabilirsiniz veya proje dokümantasyonlarını inceleyebilirsiniz.

---

**İyi kullanımlar! 🚀**
