# Frontend Yapısı ve İşleyiş Raporu

## 📁 Dosya Yapısı

### 🎯 Ana Dosyalar
- **main.tsx** - React uygulamasının giriş noktası
- **whatsapp_multi_account.tsx** - Ana uygulama component'i (1716 satır)
- **types.ts** - TypeScript tip tanımlamaları

### 📦 Component'ler (15 adet)
1. **AccountSidebar.tsx** - Sol taraftaki hesap listesi sidebar'ı
2. **ChatList.tsx** - Sohbet listesi component'i
3. **MessageList.tsx** - Mesaj listesi component'i
4. **MessageInput.tsx** - Mesaj giriş alanı (emoji, attach, voice)
5. **AddAccountModal.tsx** - Yeni hesap ekleme modal'ı (QR kod gösterimi)
6. **ContactsModal.tsx** - Kişiler modal'ı
7. **ContactSelector.tsx** - Kişi seçici modal (forward, yeni mesaj için)
8. **ContactProfileModal.tsx** - Kişi profil modal'ı
9. **MediaMessage.tsx** - Medya mesajı gösterimi
10. **MediaPreviewModal.tsx** - Medya önizleme modal'ı
11. **TemplateSelectorModal.tsx** - Şablon seçici modal
12. **TemplatesModal.tsx** - Şablon yönetim modal'ı
13. **Toast.tsx** - Bildirim component'i
14. **MessageStatus.tsx** - Mesaj durumu (gönderildi, iletildi, okundu)
15. **MessageError.tsx** - Mesaj hata gösterimi
16. **DateSeparator.tsx** - Tarih ayırıcı component

### 🔧 Hook'lar (7 adet)
1. **useAccounts.ts** - Hesap yönetimi (ekleme, silme, switch, QR kod)
2. **useChats.ts** - Sohbet listesi yönetimi
3. **useMessages.ts** - Mesaj yönetimi (yükleme, gönderme, cache)
4. **useContacts.ts** - Kişi yönetimi
5. **useWebSocket.ts** - WebSocket bağlantı yönetimi
6. **useProfilePictures.ts** - Profil resmi yönetimi
7. **useAutoScroll.ts** - Otomatik scroll yönetimi

### 🌐 API Modülleri (9 adet)
1. **api/index.ts** - Ana API export dosyası
2. **api/sessions.ts** - Session yönetimi API'leri
3. **api/chats.ts** - Sohbet API'leri
4. **api/messages.ts** - Mesaj API'leri (gönderme, silme, düzenleme)
5. **api/contacts.ts** - Kişi API'leri
6. **api/media.ts** - Medya API'leri
7. **api/presence.ts** - Durum API'leri (typing, online)
8. **api/templates.ts** - Şablon API'leri
9. **api/calls.ts** - Arama API'leri
10. **api/special.ts** - Özel API'ler

### 📡 WebSocket Handler'lar (7 adet)
1. **websocket/handlers/index.ts** - Handler export'ları
2. **websocket/handlers/chatHandlers.ts** - Chat event handler'ları
3. **websocket/handlers/messageHandlers.ts** - Mesaj event handler'ları
4. **websocket/handlers/contactHandlers.ts** - Kişi event handler'ları
5. **websocket/handlers/groupHandlers.ts** - Grup event handler'ları
6. **websocket/handlers/presenceHandlers.ts** - Durum event handler'ları
7. **websocket/handlers/connectionHandlers.ts** - Bağlantı event handler'ları

### 🛠️ Utility Dosyaları
1. **utils/contactUtils.ts** - Kişi utility fonksiyonları
2. **utils/messageUtils.ts** - Mesaj utility fonksiyonları
3. **utils/dateUtils.ts** - Tarih utility fonksiyonları
4. **utils/mediaCache.ts** - Medya cache yönetimi
5. **utils/messageStatusUtils.ts** - Mesaj durumu utility'leri

### 📄 Sayfalar
1. **pages/TemplatesPage.tsx** - Şablon yönetim sayfası

### ⚙️ Sabitler
1. **constants/appConstants.ts** - Uygulama sabitleri (renkler, emoji'ler, attachment seçenekleri)

---

## 🏗️ Mimari Yapı

### Component Hiyerarşisi
```
WhatsAppMultiAccount (Ana Component)
├── AccountSidebar (Sol Panel)
│   └── Account Listesi
├── ChatList (Orta Panel - Sol)
│   ├── Chat Arama
│   ├── Chat Filtreleme
│   └── Chat Listesi
├── MessageList (Orta Panel - Sağ - Üst)
│   ├── Mesaj Listesi
│   ├── Medya Mesajları
│   └── Mesaj Menüleri
├── MessageInput (Orta Panel - Sağ - Alt)
│   ├── Emoji Picker
│   ├── Attachment Menu
│   └── Voice Recorder
└── Modals
    ├── AddAccountModal
    ├── ContactsModal
    ├── ContactSelector
    ├── ContactProfileModal
    ├── MediaPreviewModal
    ├── TemplateSelectorModal
    └── Toast
```

---

## 🔄 Veri Akışı

### 1. Hesap Yönetimi (useAccounts Hook)
```
loadAccounts() → API: GET /sessions
  ↓
Accounts state güncellenir
  ↓
activeAccount belirlenir (useMemo ile)
  ↓
Diğer hook'lar aktif hesap değişikliğini algılar
```

### 2. WebSocket Bağlantısı (useWebSocket Hook)
```
connectWebSocket()
  ↓
ws://localhost:5173/ws (Vite proxy)
  ↓
Event handler'lar bağlanır:
  - chats.set
  - chats.upsert
  - chats.update
  - messages.upsert
  - messages.set
  - messages.update
  - contacts.set
  - contacts.upsert
  - presence.update
  - groups.update
  - group-participants.update
  - connection.update
  ↓
Handler'lar state'i günceller
```

### 3. Sohbet Yükleme (useChats Hook)
```
activeAccount değiştiğinde
  ↓
loadChats(accountId, limit)
  ↓
API: GET /api/chats?accountId=xxx&limit=50
  ↓
Chats state güncellenir
  ↓
ChatList component'i render edilir
```

### 4. Mesaj Yükleme (useMessages Hook)
```
selectedChat değiştiğinde
  ↓
loadMessages(accountId, chatId)
  ↓
Cache'den kontrol (messagesCacheRef)
  ↓
Cache yoksa API: GET /api/messages/:jid?accountId=xxx
  ↓
Messages state güncellenir
  ↓
MessageList component'i render edilir
```

### 5. Mesaj Gönderme
```
MessageInput → sendMessage()
  ↓
Optimistic UI: Mesaj hemen listeye eklenir (status: 'sending')
  ↓
API: POST /api/messages/text
  ↓
WebSocket'ten gerçek mesaj gelir (messages.upsert)
  ↓
Optimistic mesaj gerçek mesajla değiştirilir
```

### 6. Profil Resmi Yönetimi (useProfilePictures Hook)
```
Chat listesi yüklendiğinde
  ↓
queueProfilePicture() ile kuyruğa eklenir
  ↓
Batch işleme (5'erli gruplar)
  ↓
API: GET /:sessionId/contacts/:jid/photo
  ↓
chatProfilePictures Map'i güncellenir
  ↓
Chat component'leri render edilir
```

---

## 🎨 UI/UX Özellikleri

### 1. Responsive Tasarım
- Flexbox layout kullanılıyor
- 3 panel yapısı: Sidebar | ChatList | MessageList
- Mobile-first yaklaşım

### 2. Optimistic UI
- Mesaj gönderilirken hemen UI'da görünür
- WebSocket'ten gerçek mesaj gelince güncellenir
- Hata durumunda status 'error' olur

### 3. Cache Mekanizması
- **Chats Cache**: useChats hook içinde
- **Messages Cache**: messagesCacheRef (Map<string, Message[]>)
- **Contacts Cache**: contactsCacheRef (TTL: 5 dakika)
- **Media Cache**: mediaCache.ts (localStorage)

### 4. Real-time Güncellemeler
- WebSocket ile gerçek zamanlı mesajlar
- Presence güncellemeleri (typing, online)
- Chat listesi otomatik güncellenir (10 saniyede bir poll)

### 5. Modal Yönetimi
- 7 farklı modal türü
- State ile kontrol edilir (showXxxModal)
- Overlay ile arka plan karartılır

---

## 🔌 WebSocket Event İşleme

### Event Türleri ve Handler'ları

| Event Type | Handler | Açıklama |
|------------|---------|----------|
| `chats.set` | handleChatsSet | İlk chat listesi yükleme |
| `chats.upsert` | handleChatsUpsert | Yeni chat eklendiğinde |
| `chats.update` | handleChatsUpdate | Chat güncellendiğinde |
| `messages.upsert` | handleMessagesUpsert | Yeni mesaj geldiğinde |
| `messages.set` | handleMessagesSet | Mesaj geçmişi yüklendiğinde |
| `messages.update` | handleMessagesUpdate | Mesaj güncellendiğinde (okundu, düzenlendi) |
| `contacts.set` | handleContactsSet | İlk contact listesi |
| `contacts.upsert` | handleContactsUpsert | Yeni contact eklendiğinde |
| `presence.update` | handlePresenceUpdate | Online durumu, typing |
| `groups.update` | handleGroupsUpdate | Grup güncellemeleri |
| `group-participants.update` | handleGroupParticipantsUpdate | Grup üye güncellemeleri |
| `connection.update` | handleConnectionUpdate | Bağlantı durumu (QR, open, close) |

---

## 📊 State Yönetimi

### Ana State'ler (WhatsAppMultiAccount Component)
```typescript
// Accounts
const accountsHook = useAccounts(); // accounts, activeAccount

// Chats
const chatsHook = useChats(); // chats, selectedChat

// Messages
const messagesHook = useMessages(); // messages, message (input)

// Contacts
const contactsHook = useContacts(); // contacts, filteredContacts

// Profile Pictures
const { chatProfilePictures, setChatProfilePictures } = useProfilePictures();

// UI State
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
const [showAttachMenu, setShowAttachMenu] = useState(false);
const [showContactsModal, setShowContactsModal] = useState(false);
// ... diğer modal state'leri
```

### Ref Kullanımı
- `activeAccountRef` - WebSocket handler'ları için
- `selectedChatRef` - WebSocket handler'ları için
- `contactsCacheRef` - Contact cache'i için
- `messagesCacheRef` - Message cache'i için
- `chatsLoadedRef` - Chat yükleme durumu için
- `chatsInitialLoadRef` - İlk yükleme flag'i
- `messagesInitialLoadRef` - İlk yükleme flag'i

---

## 🎯 Önemli Özellikler

### 1. Çoklu Hesap Desteği
- Birden fazla WhatsApp hesabı eklenebilir
- Hesap arasında geçiş yapılabilir
- Her hesap için ayrı session yönetimi

### 2. QR Kod ile Giriş
- QR kod üretimi ve gösterimi
- SSE (Server-Sent Events) ile QR kod takibi
- Otomatik bağlantı algılama

### 3. Mesaj İşlemleri
- ✅ Mesaj gönderme (text, media, voice)
- ✅ Mesaj düzenleme
- ✅ Mesaj silme (benim için / herkes için)
- ✅ Mesaj iletme (forward)
- ✅ Mesaj yanıtlama (reply)
- ✅ Mesaj yıldızlama
- ✅ Mesaj sabitleme (pin)

### 4. Chat İşlemleri
- ✅ Chat arşivleme/kaldırma
- ✅ Chat sessize alma
- ✅ Chat sabitleme
- ✅ Chat silme
- ✅ Chat okundu/okunmadı işaretleme

### 5. Medya Desteği
- Resim, video, ses, belge gönderimi
- Medya önizleme modal'ı
- Medya cache yönetimi

### 6. Şablon Yönetimi
- Button mesajları
- List mesajları
- Template mesajları
- Product mesajları

### 7. Gerçek Zamanlı Özellikler
- Anlık mesaj alma
- Typing indicator
- Online durumu
- Mesaj durumu (sent, delivered, read)

---

## 🚀 Performans Optimizasyonları

### 1. Memoization
- `useMemo` ile activeAccount hesaplama
- `useMemo` ile contactsMap hesaplama
- Component memoization (React.memo kullanılabilir)

### 2. Lazy Loading
- Mesajlar scroll edildikçe yüklenir
- Profil resimleri batch'ler halinde yüklenir
- Medya cache ile tekrar yükleme önlenir

### 3. Debouncing
- Profil resmi yükleme debounce (500ms)
- Chat arama debounce
- Contact arama debounce

### 4. Cache Stratejisi
- Mesaj cache (Map<string, Message[]>)
- Contact cache (5 dakika TTL)
- Media cache (localStorage)
- Profile picture cache (Map<string, string>)

---

## 🔄 Lifecycle Akışı

### Uygulama Başlangıcı
```
1. main.tsx render → WhatsAppMultiAccount mount
2. useAccounts.loadAccounts() → API: GET /sessions
3. Accounts yüklenir → activeAccount belirlenir
4. useWebSocket → WebSocket bağlantısı kurulur
5. activeAccount değişince:
   - useChats.loadChats() → Chat listesi yüklenir
   - useContacts.loadContacts() → Contact listesi yüklenir
   - useProfilePictures → Profil resimleri yüklenir
```

### Mesaj Gönderme Akışı
```
1. MessageInput → Kullanıcı mesaj yazar
2. Send butonuna tıklanır → sendMessage() çağrılır
3. Optimistic UI: Mesaj listeye eklenir (status: 'sending')
4. API: POST /api/messages/text
5. Backend mesajı gönderir
6. WebSocket: messages.upsert event'i gelir
7. Handler: Optimistic mesaj gerçek mesajla değiştirilir
8. UI güncellenir (status: 'sent' → 'delivered' → 'read')
```

### WebSocket Event Akışı
```
1. Backend → WebSocket event gönderir
2. useWebSocket → ws.onmessage handler
3. Event tipine göre ilgili handler çağrılır
4. Handler state'i günceller
5. Component re-render edilir
```

---

## 🎨 Stil ve Tasarım

### CSS Framework
- **Tailwind CSS** kullanılıyor
- Utility-first yaklaşım
- Responsive breakpoint'ler

### Renkler
- Primary: Blue (mesaj gönderme butonu)
- Secondary: Green (WhatsApp yeşili)
- Gray tonları (background, borders)
- 8 farklı hesap rengi (COLORS constant)

### Icon Library
- **Lucide React** kullanılıyor
- 20+ farklı icon

---

## 📱 Sayfa Yapısı

### Ana Sayfa (Main)
- 3 panel layout
- AccountSidebar (sol)
- ChatList (orta sol)
- MessageList + MessageInput (orta sağ)

### Templates Sayfası
- Şablon listesi
- Şablon ekleme/düzenleme formu
- 4 şablon tipi desteği

---

## 🔐 Güvenlik

### API İstekleri
- Tüm API istekleri REST üzerinden
- Session ID ile kimlik doğrulama
- CORS ayarları backend'de

### WebSocket
- ws:// (development) veya wss:// (production)
- Session ID event'lerde kontrol edilir
- Sadece aktif hesap için event işlenir

---

## 📝 Notlar

1. **Temp Session'lar**: Hesap ekleme sırasında temp- ile başlayan session'lar kullanılır
2. **QR Kod Takibi**: SSE endpoint'i ile QR kod takip edilir
3. **Bağlantı Durumu**: connection.update event'i ile takip edilir
4. **Chat Polling**: 10 saniyede bir chat listesi yenilenir (backup mekanizması)
5. **Profile Picture Batch**: 5'erli gruplar halinde yüklenir
6. **Media Cache**: localStorage'da saklanır
7. **Message Cache**: Memory'de Map olarak saklanır

---

## 🐛 Bilinen Sorunlar / İyileştirme Alanları

1. **Chat Polling**: WebSocket kullanılıyor ama chat listesi için polling de var (gereksiz olabilir)
2. **Memory Leaks**: Ref cleanup'ları kontrol edilmeli
3. **Error Handling**: Bazı API hatalarında alert() kullanılıyor (Toast kullanılabilir)
4. **Type Safety**: Bazı any tipleri var (improve edilebilir)
5. **Performance**: Büyük mesaj listelerinde performans sorunları olabilir (virtual scrolling)

## 🔄 WebSocket Migration Plan

### API'lerin WebSocket'e Çevrilmesi

Frontend'de gereksiz API çağrıları kaldırılacak ve WebSocket event'leri kullanılacak.

**Kaldırılacak/Optimize Edilecek API'ler:**
1. ❌ `getChats()` → ✅ `chats.set / chats.upsert` (WebSocket)
2. ❌ `getContacts()` → ✅ `contacts.set / contacts.upsert` (WebSocket)
3. ❌ `getSessionStatus()` polling → ✅ `connection.update` (WebSocket)
4. ⚠️ `getMessages()` → ✅ `messages.set / messages.upsert` (WebSocket - ilk yükleme için API gerekebilir)
5. ⚠️ `getProfilePicture()` → ✅ `contacts.upsert` içinde `imgUrl` (WebSocket - fallback için API)

**API Olarak Kalacak İşlemler:**
- Mesaj gönderme işlemleri (POST)
- Chat işlemleri (archive, pin, mute, delete)
- Mesaj işlemleri (edit, delete, star, forward)
- Session işlemleri (create, delete)
- Template işlemleri

Detaylı plan için: `WEBSOCKET_MIGRATION_PLAN.md` dosyasına bakın.

---

## 📈 İstatistikler

- **Toplam Component**: 16
- **Toplam Hook**: 7
- **Toplam API Modül**: 10
- **Toplam WebSocket Handler**: 7
- **Ana Component Satır Sayısı**: ~1716 satır
- **Toplam TypeScript Dosyası**: 37
- **Toplam TSX Dosyası**: 19

---

*Bu rapor frontend kod tabanının tamamının analizine dayanmaktadır.*

