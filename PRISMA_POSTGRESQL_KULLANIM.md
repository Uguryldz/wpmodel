# PostgreSQL Prisma Kullanım Rehberi

## 🎯 Hızlı Başlangıç

### 1. Database Oluştur

```bash
# setupDB.js script'ini çalıştır
npm run setup:db
# veya
node setupDB.js
```

Bu script:
- ✅ PostgreSQL sunucusuna bağlanır
- ✅ `wpmodel` database'ini oluşturur (yoksa)
- ✅ Bağlantıyı test eder

### 2. Prisma Migration

```bash
# Migration oluştur ve uygula
npx prisma migrate dev --name init_postgresql

# Prisma Client'ı generate et
npx prisma generate
```

### 3. JSONB Index'leri Ekle (Opsiyonel - Performans için)

```bash
# PostgreSQL'e bağlan
psql -U postgres -h 127.0.0.1 -d wpmodel

# Index'leri ekle
\i prisma/migrations/postgresql_indexes.sql
```

---

## 📊 Projede Prisma Kullanımı

### Mevcut Kullanım

Projede Prisma zaten aktif olarak kullanılıyor:

#### 1. **Chat İşlemleri**

```javascript
// src/baileys/chats/list.js
const chats = await prisma.chat.findMany({
  where: { sessionId },
  orderBy: { conversationTimestamp: "desc" },
});

// src/baileys/core/events.js
await prisma.chat.upsert({
  where: {
    sessionId_id: { sessionId, id: normalizedChatId }
  },
  create: { /* ... */ },
  update: { /* ... */ }
});
```

#### 2. **Message İşlemleri**

```javascript
// src/baileys/shared.js
const dbMessage = await prisma.message.findFirst({
  where: {
    sessionId,
    remoteJid: normalized,
    id: messageId
  }
});
```

#### 3. **Contact İşlemleri**

```javascript
// src/baileys/core/events.js
await prisma.contact.upsert({
  where: {
    sessionId_id: { sessionId, id: contactId }
  },
  create: { /* ... */ },
  update: { /* ... */ }
});
```

---

## 🔧 Schema Yapısı

### Chat Model

```prisma
model Chat {
  pkId                      Int      @id @default(autoincrement())
  sessionId                 String
  id                        String   // JID
  conversationTimestamp     BigInt?
  unreadCount               Int      @default(0)
  archived                  Boolean  @default(false)
  pinned                    BigInt?
  name                      String?
  participant               Json?    // JSONB - index'lenebilir!
  // ... diğer alanlar
  
  @@unique([sessionId, id])
  @@index([sessionId, conversationTimestamp])
}
```

### Message Model

```prisma
model Message {
  pkId         Int      @id @default(autoincrement())
  sessionId    String
  remoteJid    String   // Chat JID
  id           String   // Mesaj ID
  key          Json     // JSONB - index'lenebilir!
  message      Json?    // JSONB - index'lenebilir!
  reactions    Json?    // JSONB - index'lenebilir!
  // ... diğer alanlar
  
  @@unique([sessionId, remoteJid, id])
  @@index([sessionId, remoteJid])
}
```

### Contact Model

```prisma
model Contact {
  pkId         Int     @id @default(autoincrement())
  sessionId    String
  id           String  // JID
  name         String?
  vcard        Json?   // JSONB
  // ... diğer alanlar
  
  @@unique([sessionId, id])
}
```

---

## 🚀 Yeni Özellikler (PostgreSQL)

### 1. **JSONB Sorguları**

PostgreSQL'de JSONB alanlarını sorgulayabilirsiniz:

```javascript
// Message type'a göre filtreleme
const imageMessages = await prisma.$queryRaw`
  SELECT * FROM messages 
  WHERE message->>'type' = 'imageMessage'
  AND session_id = ${sessionId}
`;

// Reaction'ları kontrol etme
const messagesWithReactions = await prisma.$queryRaw`
  SELECT * FROM messages 
  WHERE reactions IS NOT NULL 
  AND jsonb_array_length(reactions) > 0
  AND session_id = ${sessionId}
`;
```

### 2. **Composite Index'ler**

Hızlı sorgular için composite index'ler:

```prisma
@@index([sessionId, conversationTimestamp]) // Chat listesi için
@@index([sessionId, remoteJid])              // Chat bazında mesajlar için
```

### 3. **BigInt Desteği**

Timestamp'ler için `BigInt` kullanılıyor:

```javascript
conversationTimestamp: chat.conversationTimestamp 
  ? BigInt(chat.conversationTimestamp) 
  : null
```

---

## 📝 Örnek Kullanım Senaryoları

### Senaryo 1: Chat Listesi Getir

```javascript
import { prisma } from '../shared.js';

const getChats = async (sessionId, limit = 25) => {
  return await prisma.chat.findMany({
    where: { sessionId },
    orderBy: { conversationTimestamp: 'desc' },
    take: limit,
  });
};
```

### Senaryo 2: Mesaj Ekle/Güncelle

```javascript
const saveMessage = async (sessionId, messageData) => {
  return await prisma.message.upsert({
    where: {
      sessionId_remoteJid_id: {
        sessionId,
        remoteJid: messageData.remoteJid,
        id: messageData.id,
      },
    },
    create: {
      sessionId,
      remoteJid: messageData.remoteJid,
      id: messageData.id,
      key: messageData.key, // JSONB
      message: messageData.message, // JSONB
      messageTimestamp: messageData.timestamp 
        ? BigInt(messageData.timestamp) 
        : null,
    },
    update: {
      message: messageData.message,
      reactions: messageData.reactions, // JSONB
    },
  });
};
```

### Senaryo 3: Contact Bilgisi Güncelle

```javascript
const updateContact = async (sessionId, contactId, data) => {
  return await prisma.contact.upsert({
    where: {
      sessionId_id: { sessionId, id: contactId }
    },
    create: {
      sessionId,
      id: contactId,
      name: data.name,
      vcard: data.vcard, // JSONB
    },
    update: {
      name: data.name,
      imgUrl: data.imgUrl,
      status: data.status,
    },
  });
};
```

---

## 🔍 Sorgu Optimizasyonları

### 1. **Index Kullanımı**

```javascript
// ✅ İYİ: Index kullanıyor
const chats = await prisma.chat.findMany({
  where: { 
    sessionId, 
    conversationTimestamp: { gte: BigInt(timestamp) }
  },
  orderBy: { conversationTimestamp: 'desc' }
});

// ❌ KÖTÜ: Index kullanmıyor
const chats = await prisma.chat.findMany({
  where: { name: { contains: 'test' } } // name'de index yok
});
```

### 2. **Batch İşlemler**

```javascript
// ✅ İYİ: Batch insert
await prisma.message.createMany({
  data: messages.map(msg => ({
    sessionId,
    remoteJid: msg.remoteJid,
    id: msg.id,
    // ...
  })),
  skipDuplicates: true,
});

// ❌ KÖTÜ: Tek tek insert
for (const msg of messages) {
  await prisma.message.create({ data: msg });
}
```

---

## 🛠️ Troubleshooting

### Problem: "Database does not exist"

**Çözüm:**
```bash
npm run setup:db
```

### Problem: "Relation does not exist"

**Çözüm:**
```bash
npx prisma migrate dev
npx prisma generate
```

### Problem: "BigInt serialization error"

**Çözüm:**
```javascript
// Prisma BigInt'leri string olarak serialize eder
const chat = await prisma.chat.findFirst({ where: { id } });
const timestamp = chat.conversationTimestamp.toString();
```

---

## 📚 Daha Fazla Bilgi

- [Prisma PostgreSQL Docs](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [PostgreSQL JSONB Docs](https://www.postgresql.org/docs/current/datatype-json.html)
- [Prisma Migration Guide](https://www.prisma.io/docs/guides/migrate)

---

## ✅ Checklist

- [x] `schema.postgresql.prisma` → `schema.prisma` kopyalandı
- [ ] `npm run setup:db` ile database oluşturuldu
- [ ] `npx prisma migrate dev` ile migration uygulandı
- [ ] `npx prisma generate` ile client generate edildi
- [ ] JSONB index'leri eklendi (opsiyonel)
- [ ] Test edildi ve çalışıyor

---

**Son Güncelleme:** PostgreSQL Prisma entegrasyonu tamamlandı! 🎉

