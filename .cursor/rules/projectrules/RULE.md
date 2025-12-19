---
alwaysApply: true
---

# Baileys WhatsApp Multi-Account Projesi - Cursor Rules

Bu dosya, projede kod yazarken ve düzenlerken takip edilmesi gereken kuralları içerir.

## 📚 Referans Dosyalar

Aşağıdaki dosyalar proje geliştirme sırasında **mutlaka referans alınmalıdır**:

1. **`BAILEYS_API_KULLANIM_RAPORU.md`** - Baileys API metodlarının kullanım durumu ve detayları
2. **`BaileyTipREADME.md`** - Baileys kütüphanesinin resmi dokümantasyonu ve kullanım örnekleri
3. **`BaileysDetailApiReferance.md`** - Baileys kütüphanesinin resmi dokümantasyonu ve kullanım örnekleri

## 🏗️ Proje Yapısı

### Backend (src/)
- **`src/baileys/`** - Baileys API metodlarının modüler implementasyonu
  - `business/` - Business API metodları (catalog, profile)
  - `chats/` - Chat işlemleri (history, list, manage, messages, search, sync)
  - `contacts/` - Contact işlemleri (block, list, profile)
  - `core/` - Çekirdek işlevler (connection, events, session, socket)
  - `groups/` - Grup işlemleri (create, invite, list, manage)
  - `media/` - Medya işlemleri (download, utils)
  - `messages/` - Mesaj işlemleri (edit, link-preview, manage, presence, reactions, send, special)
  - `newsletter/` - Newsletter işlemleri (metadata, subscribe)
  - `privacy/` - Gizlilik ayarları (disappearing, settings)
  - `status/` - Status (story) işlemleri (get, set)
  - `utils/` - Yardımcı fonksiyonlar (device, download, group, jid, media-utils, media, message-utils, message, pairing, transfer, wa-version, wamessage)
  - `shared.js` - Paylaşılan fonksiyonlar
  - `index.js` - Ana export dosyası

- **`src/baileysClient.js`** - Ana Baileys client wrapper'ı ve socket yönetimi
- **`src/index.js`** - REST API endpoint'leri ve route tanımlamaları
- **`src/sessionMapper.js`** - Session mapping işlemleri
- **`src/swagger.js`** - Swagger/OpenAPI dokümantasyonu

### Frontend (client/)
- **`client/api/`** - API client fonksiyonları
  - `chats.ts` - Chat API fonksiyonları
  - `contacts.ts` - Contact API fonksiyonları
  - `messages.ts` - Message API fonksiyonları
  - `sessions.ts` - Session API fonksiyonları
  - `index.ts` - API client ana export dosyası

- **`client/components/`** - React bileşenleri
  - `AccountSidebar.tsx` - Hesap yan menüsü
  - `AddAccountModal.tsx` - Hesap ekleme modalı
  - `ChatList.tsx` - Chat listesi
  - `ContactSelector.tsx` - Contact seçici
  - `ContactsModal.tsx` - Contact modalı
  - `MessageInput.tsx` - Mesaj girişi
  - `MessageList.tsx` - Mesaj listesi

- **`client/hooks/`** - Custom React hooks
  - `useAccounts.ts` - Hesap yönetimi hook'u
  - `useChats.ts` - Chat yönetimi hook'u
  - `useContacts.ts` - Contact yönetimi hook'u
  - `useMessages.ts` - Mesaj yönetimi hook'u
  - `useProfilePictures.ts` - Profil resmi yönetimi hook'u
  - `useWebSocket.ts` - WebSocket yönetimi hook'u

- **`client/utils/`** - Yardımcı fonksiyonlar
  - `contactUtils.ts` - Contact yardımcı fonksiyonları
  - `messageUtils.ts` - Mesaj yardımcı fonksiyonları

- **`client/constants/`** - Sabitler
  - `appConstants.ts` - Uygulama sabitleri

- **`client/types.ts`** - TypeScript tip tanımlamaları
- **`client/whatsapp_multi_account.tsx`** - Ana React bileşeni

## 🔧 Kod Yazma Kuralları

### 1. Backend (src/baileys/) Kuralları

#### Modüler Yapı
- ✅ Her metod kendi kategorisine uygun klasörde olmalıdır
- ✅ Yeni metodlar eklerken mevcut modüler yapıya uygun olmalıdır
- ✅ `src/baileys/index.js` dosyasına yeni export'lar eklenmelidir

#### Baileys API Kullanımı
- ✅ **BAILEYS_API_KULLANIM_RAPORU.md** dosyasında listelenen metodlar kullanılmalıdır
- ✅ Yeni metod eklerken rapor dosyasındaki kullanım örneklerine bakılmalıdır
- ✅ `BaileyTipREADME.md` dosyasındaki örnekler ve best practice'ler takip edilmelidir
- ✅ Socket metodları (`sock.sendMessage`, `sock.groupCreate`, vb.) doğru şekilde kullanılmalıdır
- ✅ Utility fonksiyonlar (`jidNormalizedUser`, `isJidGroup`, vb.) uygun yerlerde kullanılmalıdır

#### JID Normalizasyonu
- ✅ Tüm JID'ler kullanılmadan önce normalize edilmelidir
- ✅ `jidNormalizedUser` veya benzeri fonksiyonlar kullanılmalıdır
- ✅ JID formatı: `[country code][phone number]@s.whatsapp.net` (kişiler için)
- ✅ Grup JID formatı: `123456789-123345@g.us`

#### Hata Yönetimi
- ✅ Tüm async işlemlerde try-catch blokları kullanılmalıdır
- ✅ Hatalar anlamlı mesajlarla loglanmalıdır
- ✅ Socket bağlantı hataları uygun şekilde handle edilmelidir

#### Session Yönetimi
- ✅ Her session için ayrı socket instance'ı kullanılmalıdır
- ✅ Session bilgileri güvenli şekilde saklanmalıdır
- ✅ `useMultiFileAuthState` veya benzeri yöntemler kullanılmalıdır

### 2. Frontend (client/) Kuralları

#### React Best Practices
- ✅ Functional components kullanılmalıdır
- ✅ Hooks (useState, useEffect, useMemo, useCallback) doğru şekilde kullanılmalıdır
- ✅ Custom hooks modüler yapıda olmalıdır
- ✅ Component'ler tek sorumluluk prensibine uygun olmalıdır

#### TypeScript Kullanımı
- ✅ Tüm dosyalar TypeScript ile yazılmalıdır
- ✅ `client/types.ts` dosyasındaki tip tanımlamaları kullanılmalıdır
- ✅ Yeni tipler `types.ts` dosyasına eklenmelidir

#### API Client Kullanımı
- ✅ Tüm API çağrıları `client/api/` altındaki fonksiyonlar üzerinden yapılmalıdır
- ✅ API fonksiyonları async/await kullanmalıdır
- ✅ Hata yönetimi uygun şekilde yapılmalıdır

#### State Yönetimi
- ✅ Local state için `useState` kullanılmalıdır
- ✅ Complex state yönetimi için custom hooks kullanılmalıdır
- ✅ Ref'ler sadece gerekli durumlarda kullanılmalıdır (WebSocket, timer, vb.)

#### WebSocket Kullanımı
- ✅ WebSocket bağlantısı `useWebSocket` hook'u üzerinden yönetilmelidir
- ✅ Event listener'lar uygun şekilde temizlenmelidir (cleanup)
- ✅ Reconnection logic'i hook içinde handle edilmelidir

### 3. Genel Kurallar

#### Kod Organizasyonu
- ✅ Her dosya tek bir sorumluluğa sahip olmalıdır
- ✅ Fonksiyonlar ve class'lar mantıklı şekilde organize edilmelidir
- ✅ Gereksiz kod tekrarlarından kaçınılmalıdır

#### Naming Conventions
- ✅ Dosya isimleri: camelCase (JavaScript) veya PascalCase (React components)
- ✅ Fonksiyon isimleri: camelCase
- ✅ Component isimleri: PascalCase
- ✅ Constant'lar: UPPER_SNAKE_CASE

#### Dokümantasyon
- ✅ Karmaşık fonksiyonlar için JSDoc yorumları eklenmelidir
- ✅ API endpoint'leri için Swagger dokümantasyonu güncellenmelidir
- ✅ Yeni özellikler için README güncellemeleri yapılmalıdır

#### Test
- ✅ Kullanıcı "test edelim" demeden proje test edilmemelidir
- ✅ Test kodları yazılırken mevcut test yapısına uygun olmalıdır

## 🚫 Yapılmaması Gerekenler

### Backend
- ❌ Baileys API metodlarını doğrudan kullanmak yerine wrapper fonksiyonlar kullanılmalıdır
- ❌ JID'leri normalize etmeden kullanmamalıdır
- ❌ Session bilgilerini güvensiz şekilde saklamamalıdır
- ❌ Modüler yapıyı bozacak şekilde kod yazmamalıdır

### Frontend
- ❌ API çağrılarını component içinde doğrudan fetch ile yapmamalıdır
- ❌ WebSocket bağlantısını component içinde doğrudan açmamalıdır
- ❌ Gereksiz re-render'lara neden olacak şekilde state yönetimi yapmamalıdır
- ❌ TypeScript tip güvenliğini bypass etmemelidir

## 📝 Örnek Kullanımlar

### Backend - Yeni Metod Ekleme

```javascript
// src/baileys/messages/send.js içinde
import { normalizeJid } from '../utils/jid.js';

export const sendTextMessage = async (sock, jid, text) => {
  try {
    const normalizedJid = normalizeJid(jid);
    const result = await sock.sendMessage(normalizedJid, { text });
    return result;
  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    throw error;
  }
};
```

### Frontend - API Kullanımı

```typescript
// client/api/messages.ts içinde
import { api } from './index';

export const sendMessage = async (sessionId: string, jid: string, text: string) => {
  const response = await api.post(`/${sessionId}/messages/send`, {
    jid,
    text
  });
  return response.data;
};
```

### Frontend - Hook Kullanımı

```typescript
// client/hooks/useMessages.ts içinde
export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  
  const sendMessage = useCallback(async (sessionId: string, jid: string, text: string) => {
    try {
      const result = await api.sendMessage(sessionId, jid, text);
      // State güncelleme
    } catch (error) {
      console.error('Mesaj gönderme hatası:', error);
    }
  }, []);
  
  return { messages, sendMessage };
};
```

## 🔍 Kontrol Listesi

Yeni kod yazarken aşağıdaki kontrol listesini kullanın:

### Backend
- [ ] Metod doğru klasörde mi? (chats/, messages/, groups/, vb.)
- [ ] JID normalize edildi mi?
- [ ] Hata yönetimi yapıldı mı?
- [ ] `src/baileys/index.js`'e export eklendi mi?
- [ ] BAILEYS_API_KULLANIM_RAPORU.md'deki metodlar kullanıldı mı?
- [ ] Session yönetimi doğru mu?

### Frontend
- [ ] TypeScript tipleri doğru mu?
- [ ] API çağrısı `client/api/` altında mı?
- [ ] Hook kullanımı doğru mu?
- [ ] State yönetimi optimize edildi mi?
- [ ] WebSocket event'leri temizleniyor mu?
- [ ] Component tek sorumluluğa sahip mi?

## 📖 Ek Kaynaklar

- [Baileys Wiki](https://baileys.wiki)
- [Baileys API Docs](https://baileys.whiskeysockets.io)
- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)

---

**Önemli:** Bu kurallar projenin tutarlılığını ve bakımını kolaylaştırmak için oluşturulmuştur. Kod yazarken bu kurallara uyulması zorunludur.
