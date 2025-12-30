# 🚀 PostgreSQL Prisma - Hızlı Başlangıç

## ✅ Yapılanlar

1. ✅ `schema.postgresql.prisma` → `schema.prisma` kopyalandı
2. ✅ `setupDB.js` script'i oluşturuldu
3. ✅ `shared.js` PostgreSQL için güncellendi
4. ✅ Kullanım rehberi oluşturuldu

---

## 📝 Adım Adım Kurulum

### 1. Database Oluştur

```bash
npm run setup:db
```

Bu komut:
- PostgreSQL sunucusuna bağlanır
- `wpmodel` database'ini oluşturur
- Bağlantıyı test eder

### 2. Migration Oluştur ve Uygula

```bash
npx prisma migrate dev --name init_postgresql
```

Bu komut:
- Migration dosyalarını oluşturur
- Database'e tabloları ekler
- Prisma Client'ı otomatik generate eder

### 3. (Opsiyonel) JSONB Index'leri Ekle

```bash
psql -U postgres -h 127.0.0.1 -d wpmodel -f prisma/migrations/postgresql_indexes.sql
```

---

## 🎯 Kullanım

### Mevcut Kod

Projede Prisma zaten kullanılıyor, **hiçbir kod değişikliği gerekmez!**

```javascript
// Chat listesi
const chats = await prisma.chat.findMany({
  where: { sessionId },
  orderBy: { conversationTimestamp: 'desc' }
});

// Message kaydet
await prisma.message.upsert({
  where: { sessionId_remoteJid_id: { ... } },
  create: { ... },
  update: { ... }
});
```

### Yeni Özellikler

PostgreSQL ile artık **JSONB sorguları** yapabilirsiniz:

```javascript
// Message type'a göre filtreleme
const imageMessages = await prisma.$queryRaw`
  SELECT * FROM messages 
  WHERE message->>'type' = 'imageMessage'
  AND session_id = ${sessionId}
`;
```

---

## ⚠️ Önemli Notlar

### JSON.stringify

Mevcut kodda `JSON.stringify()` kullanımları var. Prisma PostgreSQL'de **otomatik olarak** JavaScript objelerini JSONB'ye çevirir, bu yüzden `JSON.stringify()` **gerekli değil** ama **zararlı da değil** - Prisma bunu handle eder.

**Örnek:**
```javascript
// ✅ Çalışır (mevcut kod)
participant: chat.participants ? JSON.stringify(chat.participants) : null

// ✅ Daha temiz (opsiyonel - sonra optimize edilebilir)
participant: chat.participants || null
```

### BigInt

Timestamp'ler için `BigInt` kullanılıyor:

```javascript
conversationTimestamp: chat.conversationTimestamp 
  ? BigInt(chat.conversationTimestamp) 
  : null
```

---

## 🔍 Kontrol Listesi

- [ ] PostgreSQL servisi çalışıyor mu? (`psql -U postgres -h 127.0.0.1`)
- [ ] `.env` dosyasında `DATABASE_URL` var mı?
- [ ] `npm run setup:db` çalıştırıldı mı?
- [ ] `npx prisma migrate dev` çalıştırıldı mı?
- [ ] `npx prisma generate` çalıştırıldı mı? (migrate otomatik yapar)
- [ ] Test edildi mi?

---

## 🐛 Sorun Giderme

### "Database does not exist"
```bash
npm run setup:db
```

### "Relation does not exist"
```bash
npx prisma migrate dev
npx prisma generate
```

### "Connection refused"
- PostgreSQL servisinin çalıştığından emin olun
- `.env` dosyasındaki bağlantı bilgilerini kontrol edin

---

## 📚 Daha Fazla Bilgi

- Detaylı kullanım: `PRISMA_POSTGRESQL_KULLANIM.md`
- Migration rehberi: `prisma/POSTGRESQL_MIGRATION.md`

---

**Hazır! Artık PostgreSQL kullanıyorsunuz! 🎉**

