# Frontend Modülerleştirme - Ek Tavsiyeler

## Mevcut Durum Analizi

`whatsapp_multi_account.tsx` dosyasında şu anda:

1. ✅ **Hook'lar oluşturuldu ama tam entegre edilmedi:**
   - `useProfilePictures` ✅
   - `useAccounts` ✅
   - `useChats` ✅
   - `useMessages` ✅
   - `useContacts` ✅
   - `useWebSocket` ✅ (oluşturuldu ama kullanılmadı)

2. ⚠️ **Eski kodlar hala duruyor:**
   - `loadProfilePicturesBatch`, `queueProfilePicture` (useProfilePictures hook'unda var)
   - `loadAccounts`, `loadContacts`, `loadChats`, `loadMessages` (hook'larda var ama eski kodlar hala duruyor)
   - WebSocket kodu hala component içinde (useWebSocket hook'u kullanılmıyor)

3. 🔴 **Ayrılması gereken yeni modeller:**

## Önerilen Yeni Hook'lar

### 1. `useMessageActions` Hook
**Konum:** `client/hooks/useMessageActions.ts`

**İçerik:**
- `sendMessage` - Mesaj gönderme
- `handleReplyMessage` - Mesaj yanıtlama
- `handleForwardMessage` - Mesaj iletme
- `handleEditMessage` - Mesaj düzenleme
- `handleDeleteMessage` - Mesaj silme
- `handleStarMessage` - Mesaj yıldızlama
- `handleMarkAsRead` - Okundu işaretleme

**State'ler:**
- `replyingTo` - Yanıtlanan mesaj
- `editingMessage` - Düzenlenen mesaj
- `editingText` - Düzenleme metni
- `selectedMessage` - Seçili mesaj
- `showMessageMenu` - Mesaj menüsü görünürlüğü

**Faydalar:**
- Mesaj işlemleri mantığı tek yerde toplanır
- Test edilebilirlik artar
- Component daha temiz olur

---

### 2. `useUIState` Hook
**Konum:** `client/hooks/useUIState.ts`

**İçerik:**
- Modal state'leri (showContactsModal, showContactSelector, showForwardSelector)
- UI state'leri (showEmojiPicker, showAttachMenu, showAccountMenu)
- Helper fonksiyonlar (insertEmoji, handleAttachment)

**State'ler:**
- `showEmojiPicker`
- `showAttachMenu`
- `showAccountMenu`
- `showContactsModal`
- `showContactSelector`
- `showForwardSelector`
- `forwardingMessage`

**Faydalar:**
- UI state yönetimi merkezileşir
- Modal açma/kapama mantığı tek yerde

---

### 3. `useChatActions` Hook (Opsiyonel)
**Konum:** `client/hooks/useChatActions.ts`

**İçerik:**
- `handleSelectContactForMessage` - Kişi seçerek mesaj gönderme
- Chat seçme mantığı
- Chat filtreleme mantığı

**Faydalar:**
- Chat işlemleri mantığı ayrılır

---

## Yapılması Gerekenler (Öncelik Sırasına Göre)

### Faz 1: Hook'ları Entegre Et (Yüksek Öncelik)
1. ✅ Hook'ları oluşturuldu
2. ⚠️ **Eski kodları kaldır ve hook'ları kullan**
3. ⚠️ **useWebSocket hook'unu entegre et**
4. ⚠️ **useProfilePictures hook'unu tam entegre et**

### Faz 2: Yeni Hook'ları Oluştur (Orta Öncelik)
1. `useMessageActions` hook'unu oluştur
2. `useUIState` hook'unu oluştur

### Faz 3: Temizlik (Düşük Öncelik)
1. Gereksiz state'leri kaldır
2. Duplicate kodları temizle
3. TypeScript interface'lerini `types.ts`'e taşı (Chat, Message)

---

## Örnek Kullanım

### useMessageActions Hook Kullanımı:
```typescript
const {
  sendMessage,
  handleReplyMessage,
  handleForwardMessage,
  handleEditMessage,
  handleDeleteMessage,
  handleStarMessage,
  handleMarkAsRead,
  replyingTo,
  editingMessage,
  selectedMessage,
  showMessageMenu,
} = useMessageActions({
  activeAccount,
  selectedChat,
  message,
  setMessage,
  setMessages,
  setChats,
  loadMessages,
});
```

### useUIState Hook Kullanımı:
```typescript
const {
  showEmojiPicker,
  setShowEmojiPicker,
  showAttachMenu,
  setShowAttachMenu,
  showContactsModal,
  setShowContactsModal,
  insertEmoji,
  handleAttachment,
} = useUIState({
  message,
  setMessage,
});
```

---

## Sonuç

Ana component şu anda **~1982 satır**. Hook'ları tam entegre edip yeni hook'ları oluşturduktan sonra:
- **~800-1000 satır** olması bekleniyor
- Kod daha okunabilir ve bakımı kolay olacak
- Her hook tek bir sorumluluğa sahip olacak
