# PostgreSQL Migration Rehberi

## 📋 Baileys Store → PostgreSQL Dönüşümü

Bu rehber, Baileys store yapısını PostgreSQL'e dönüştürmek için adım adım talimatlar içerir.

---

## 🎯 Özellikler

### 1. **JSONB Desteği**
- ✅ Message content → JSONB (index'lenebilir)
- ✅ Reactions → JSONB (index'lenebilir)
- ✅ Participants → JSONB (index'lenebilir)
- ✅ Key → JSONB (index'lenebilir)

### 2. **Optimize Edilmiş Index'ler**
- ✅ Composite index'ler (sessionId + timestamp)
- ✅ Partial index'ler (sadece aktif kayıtlar için)
- ✅ JSONB GIN index'leri (JSON sorguları için)

### 3. **Multi-Account Desteği**
- ✅ Schema bazlı ayrım (her hesap için ayrı schema)
- ✅ sessionId ile ayrım (tek schema, sessionId ile filtreleme)

---

## 🚀 Migration Adımları

### Adım 1: PostgreSQL Database Oluştur

```bash
# PostgreSQL'i yükle (macOS)
brew install postgresql@14
brew services start postgresql@14

# Database oluştur
createdb wpmodel

# Veya Docker ile
docker run --name wpmodel-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=wpmodel \
  -p 5432:5432 \
  -d postgres:14
```

### Adım 2: Environment Variable Ayarla

```bash
# .env dosyasına ekle
DATABASE_URL="postgresql://user:password@localhost:5432/wpmodel?schema=public"
```

### Adım 3: Prisma Schema'yı Güncelle

```bash
# schema.postgresql.prisma dosyasını schema.prisma olarak kopyala
cp prisma/schema.postgresql.prisma prisma/schema.prisma

# Prisma Client'ı generate et
npx prisma generate

# Migration oluştur
npx prisma migrate dev --name init_postgresql
```

### Adım 4: JSONB Index'leri Ekle

```bash
# PostgreSQL'e bağlan
psql -d wpmodel

# Index'leri ekle
\i prisma/migrations/postgresql_indexes.sql
```

---

## 📊 Multi-Account Stratejileri

### Strateji 1: Schema Bazlı (Önerilen - İzolasyon)

**Her hesap için ayrı schema:**

```sql
-- Schema oluştur
CREATE SCHEMA account_1767122031097;

-- Tabloları schema'ya taşı
ALTER TABLE chats SET SCHEMA account_1767122031097;
ALTER TABLE messages SET SCHEMA account_1767122031097;
ALTER TABLE contacts SET SCHEMA account_1767122031097;
```

**Prisma ile kullanım:**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "account_1767122031097", "account_1767122031098"]
}
```

**Avantajlar:**
- ✅ Tam izolasyon
- ✅ Hesap bazında yedekleme kolay
- ✅ Hesap bazında silme kolay

**Dezavantajlar:**
- ⚠️ Her hesap için ayrı migration
- ⚠️ Cross-account sorgular zor

---

### Strateji 2: sessionId ile Ayrım (Daha Basit)

**Tek schema, sessionId ile filtreleme:**

```sql
-- Tüm hesaplar aynı tablolarda
SELECT * FROM chats WHERE session_id = 'account-1767122031097';
SELECT * FROM messages WHERE session_id = 'account-1767122031097';
```

**Avantajlar:**
- ✅ Basit yapı
- ✅ Cross-account sorgular kolay
- ✅ Tek migration

**Dezavantajlar:**
- ⚠️ Tam izolasyon yok
- ⚠️ Büyük veri setlerinde yavaşlayabilir

---

## 🔧 Prisma Client Kullanımı

### Tek Database, sessionId ile Ayrım

```typescript
// Tüm hesaplar aynı database'de
const chats = await prisma.chat.findMany({
  where: { sessionId: 'account-1767122031097' },
  orderBy: { conversationTimestamp: 'desc' }
});
```

### Schema Bazlı (Her Hesap İçin Ayrı Schema)

```typescript
// Her hesap için ayrı Prisma client
const prismaClient1 = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?schema=account_1767122031097'
    }
  }
});

const chats = await prismaClient1.chat.findMany({
  orderBy: { conversationTimestamp: 'desc' }
});
```

---

## 📈 Performans Optimizasyonları

### 1. JSONB Sorguları

```typescript
// Message type'a göre sorgu
const imageMessages = await prisma.$queryRaw`
  SELECT * FROM messages 
  WHERE message->>'type' = 'imageMessage'
  AND session_id = ${sessionId}
  LIMIT 50
`;

// Reaction'ları olan mesajlar
const messagesWithReactions = await prisma.$queryRaw`
  SELECT * FROM messages 
  WHERE reactions IS NOT NULL
  AND jsonb_array_length(reactions) > 0
  AND session_id = ${sessionId}
`;
```

### 2. Composite Index Kullanımı

```typescript
// Composite index kullanarak hızlı sorgu
const chats = await prisma.chat.findMany({
  where: { 
    sessionId: 'account-1767122031097',
    archived: false 
  },
  orderBy: { conversationTimestamp: 'desc' },
  take: 50
});
// Index: idx_chats_active kullanılır
```

### 3. Partial Index Kullanımı

```typescript
// Sadece aktif chat'ler (partial index kullanır)
const activeChats = await prisma.chat.findMany({
  where: { 
    sessionId: 'account-1767122031097',
    archived: false 
  },
  orderBy: { conversationTimestamp: 'desc' }
});
// Index: idx_chats_active kullanılır
```

---

## 🔄 SQLite'dan PostgreSQL'e Veri Aktarımı

### Script Örneği

```typescript
// migrate-sqlite-to-postgres.ts
import { PrismaClient as SQLiteClient } from '@prisma/client';
import { PrismaClient as PostgresClient } from '@prisma/client';

const sqliteClient = new SQLiteClient({
  datasources: { db: { url: 'file:./prisma/dev.db' } }
});

const postgresClient = new PostgresClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function migrate() {
  // Chat'leri aktar
  const chats = await sqliteClient.chat.findMany();
  for (const chat of chats) {
    await postgresClient.chat.upsert({
      where: { sessionId_id: { sessionId: chat.sessionId, id: chat.id } },
      create: { ...chat },
      update: { ...chat }
    });
  }
  
  // Mesajları aktar
  const messages = await sqliteClient.message.findMany();
  for (const message of messages) {
    await postgresClient.message.upsert({
      where: { 
        sessionId_remoteJid_id: { 
          sessionId: message.sessionId, 
          remoteJid: message.remoteJid, 
          id: message.id 
        } 
      },
      create: { ...message },
      update: { ...message }
    });
  }
  
  // Contact'ları aktar
  const contacts = await sqliteClient.contact.findMany();
  for (const contact of contacts) {
    await postgresClient.contact.upsert({
      where: { sessionId_id: { sessionId: contact.sessionId, id: contact.id } },
      create: { ...contact },
      update: { ...contact }
    });
  }
}
```

---

## 📊 Index Performans Testi

### Önce (Index'siz)
```sql
EXPLAIN ANALYZE
SELECT * FROM messages 
WHERE session_id = 'account-1' 
AND remote_jid = '905335989539@s.whatsapp.net'
ORDER BY message_timestamp DESC 
LIMIT 50;
-- ⏱️ ~200-500ms (Seq Scan)
```

### Sonra (Index'li)
```sql
EXPLAIN ANALYZE
SELECT * FROM messages 
WHERE session_id = 'account-1' 
AND remote_jid = '905335989539@s.whatsapp.net'
ORDER BY message_timestamp DESC 
LIMIT 50;
-- ⏱️ ~5-20ms (Index Scan)
```

---

## 🎯 Özet

### PostgreSQL Avantajları:
1. ✅ JSONB desteği (index'lenebilir JSON)
2. ✅ İlişkisel sorgular (JOIN'ler)
3. ✅ Performans (index'ler ile)
4. ✅ Multi-account (schema veya sessionId)
5. ✅ Production-ready

### Migration Stratejisi:
1. ✅ SQLite'dan başla (development)
2. ✅ PostgreSQL'e geç (production)
3. ✅ Her hesap için ayrı schema (izolasyon)
4. ✅ JSONB index'leri ekle (performans)

---

## 📝 Notlar

- JSONB alanları Prisma'da `Json` tipi olarak tanımlanır
- Index'ler migration sonrası manuel eklenebilir
- Multi-account için schema veya sessionId stratejisi seçilebilir
- Production'da connection pooling kullanın

