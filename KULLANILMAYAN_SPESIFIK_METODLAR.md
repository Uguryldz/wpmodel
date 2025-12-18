# Kullanılmayan Spesifik Baileys API Metodları

Bu dokümanda, Baileys API dokümantasyonunda mevcut olan ancak henüz projede kullanılmayan spesifik/internal metodlar listelenmiştir.

**Not:** Bu metodlar genellikle çok teknik, internal kullanım için veya çok spesifik senaryolar için tasarlanmıştır.

---

## 🔐 Encryption/Decryption Functions (Şifreleme Fonksiyonları)

Bu fonksiyonlar genellikle Baileys'in internal şifreleme işlemleri için kullanılır ve doğrudan kullanıcı tarafından çağrılmaz.

- `aesEncrypt` - AES şifreleme
- `aesDecrypt` - AES şifre çözme
- `aesEncryptCTR` - AES CTR modu şifreleme
- `aesDecryptCTR` - AES CTR modu şifre çözme
- `aesEncryptGCM` - AES GCM modu şifreleme
- `aesDecryptGCM` - AES GCM modu şifre çözme
- `aesDecryptWithIV` - IV ile AES şifre çözme
- `aesEncrypWithIV` - IV ile AES şifreleme
- `encryptedStream` - Şifreli stream oluşturma

**Neden kullanılmıyor:** Baileys bu işlemleri otomatik olarak yönetir, manuel şifreleme/şifre çözme gerekmez.

---

## 📦 Binary Node Functions (Binary Node Fonksiyonları)

Bu fonksiyonlar WhatsApp protokolünün binary node formatını işlemek için kullanılır.

- `encodeBinaryNode` - Binary node encode etme
- `decodeBinaryNode` - Binary node decode etme
- `decodeDecompressedBinaryNode` - Sıkıştırılmış binary node decode etme
- `encodeBase64EncodedStringForUpload` - Upload için base64 encode
- `binaryNodeToString` - Binary node'u string'e çevirme
- `getBinaryNodeChild` - Binary node child alma
- `getBinaryNodeChildBuffer` - Binary node child buffer alma
- `getBinaryNodeChildren` - Binary node children alma
- `getBinaryNodeChildString` - Binary node child string alma
- `getBinaryNodeChildUInt` - Binary node child uint alma
- `getBinaryNodeMessages` - Binary node'dan mesajlar alma
- `getAllBinaryNodeChildren` - Tüm binary node children alma
- `reduceBinaryNodeToDictionary` - Binary node'u dictionary'ye çevirme

**Neden kullanılmıyor:** Bu fonksiyonlar Baileys'in internal protokol işlemleri için kullanılır, normal kullanımda gerekmez.

---

## 🔑 Signal/Key Management Functions (Signal/Anahtar Yönetimi)

Bu fonksiyonlar Signal protokolü ve anahtar yönetimi için kullanılır.

- `generateSignalPubKey` - Signal public key oluşturma
- `createSignalIdentity` - Signal identity oluşturma
- `generateOrGetPreKeys` - Pre-key oluşturma/alma
- `getNextPreKeys` - Sonraki pre-key'leri alma
- `getNextPreKeysNode` - Pre-key node oluşturma
- `getPreKeys` - Pre-key'leri alma
- `generateRegistrationId` - Registration ID oluşturma
- `generateRegistrationNode` - Registration node oluşturma
- `generateMdTagPrefix` - MD tag prefix oluşturma
- `signedKeyPair` - İmzalı key pair oluşturma
- `derivePairingCodeKey` - Pairing code key türetme
- `encodeSignedDeviceIdentity` - İmzalı device identity encode etme
- `parseAndInjectE2ESessions` - E2E session'ları parse ve inject etme

**Neden kullanılmıyor:** Baileys bu işlemleri otomatik olarak yönetir, manuel anahtar yönetimi gerekmez.

---

## 🔒 Hash/Cryptographic Functions (Hash/Şifreleme Fonksiyonları)

- `sha256` - SHA-256 hash hesaplama
- `md5` - MD5 hash hesaplama
- `hkdf` - HKDF key derivation
- `hkdfInfoKey` - HKDF info key
- `hmacSign` - HMAC imzalama

**Neden kullanılmıyor:** Bu fonksiyonlar Baileys'in internal işlemleri için kullanılır, normal kullanımda gerekmez.

---

## 🌐 Network/Stream Functions (Ağ/Akış Fonksiyonları)

- `getStream` - Stream alma
- `getHttpStream` - HTTP stream alma
- `getUrlFromDirectPath` - Direct path'ten URL alma
- `getWAUploadToServer` - WhatsApp upload server bilgisi
- `uploadWithNodeHttp` - Node.js HTTP ile upload
- `getRawMediaUploadData` - Ham medya upload verisi

**Neden kullanılmıyor:** Baileys bu işlemleri otomatik olarak yönetir, manuel stream/upload yönetimi gerekmez.

---

## ⏱️ Utility/Helper Functions (Yardımcı Fonksiyonlar)

- `delay` - Gecikme fonksiyonu
- `delayCancellable` - İptal edilebilir gecikme
- `promiseTimeout` - Promise timeout
- `debouncedTimeout` - Debounced timeout
- `toBuffer` - Buffer'a çevirme
- `toNumber` - Sayıya çevirme
- `toReadable` - Readable stream'e çevirme
- `bytesToCrockford` - Bytes'ı Crockford encoding'e çevirme
- `unixTimestampSeconds` - Unix timestamp (saniye)
- `trimUndefined` - Undefined değerleri temizleme
- `unpadRandomMax16` - Random padding kaldırma
- `writeRandomPadMax16` - Random padding ekleme

**Neden kullanılmıyor:** Bu fonksiyonlar genellikle internal kullanım için veya çok spesifik senaryolar için tasarlanmıştır.

---

## 📡 Protocol/XMPP Functions (Protokol/XMPP Fonksiyonları)

- `xmppPreKey` - XMPP pre-key
- `xmppSignedPreKey` - XMPP signed pre-key
- `generateLoginNode` - Login node oluşturma
- `getCodeFromWSError` - WebSocket hatasından kod alma
- `getErrorCodeFromStreamError` - Stream hatasından kod alma
- `getStatusCodeForMediaRetry` - Medya retry için status kodu
- `getStatusFromReceiptType` - Receipt tipinden status alma
- `getKeyAuthor` - Key author alma
- `getServerFromDomainType` - Domain tipinden server alma

**Neden kullanılmıyor:** Bu fonksiyonlar Baileys'in internal protokol işlemleri için kullanılır.

---

## 🔄 Sync/State Functions (Senkronizasyon/Durum Fonksiyonları)

- `decodeSyncdMutations` - Syncd mutations decode etme
- `decodeSyncdPatch` - Syncd patch decode etme
- `decodeSyncdSnapshot` - Syncd snapshot decode etme
- `encodeSyncdPatch` - Syncd patch encode etme
- `extractSyncdPatches` - Syncd patches çıkarma
- `newLTHashState` - Yeni LT hash state oluşturma
- `makeCacheableSignalKeyStore` - Cacheable signal key store oluşturma
- `makeEventBuffer` - Event buffer oluşturma
- `makeNoiseHandler` - Noise handler oluşturma
- `bindWaitForConnectionUpdate` - Connection update bekleme
- `bindWaitForEvent` - Event bekleme

**Neden kullanılmıyor:** Bu fonksiyonlar Baileys'in internal sync işlemleri için kullanılır.

---

## 📨 Message Processing Functions (Mesaj İşleme Fonksiyonları)

- `decodeMessageNode` - Mesaj node decode etme
- `decodePatches` - Patch'leri decode etme
- `decodeMediaRetryNode` - Medya retry node decode etme
- `decryptEventResponse` - Event response decrypt etme
- `decryptMediaRetryData` - Medya retry verisi decrypt etme
- `decryptMessageNode` - Mesaj node decrypt etme
- `encodeWAM` - WAM encode etme
- `encodeWAMessage` - WAMessage encode etme
- `decompressingIfRequired` - Gerekirse sıkıştırma açma
- `extractAddressingContext` - Addressing context çıkarma

**Neden kullanılmıyor:** Bu fonksiyonlar Baileys'in internal mesaj işleme için kullanılır.

---

## 🎯 Advanced/Internal Functions (Gelişmiş/Internal Fonksiyonlar)

- `initAuthCreds` - Auth credentials başlatma
- `getContentType` - İçerik tipi alma (NOT: Bu zaten kullanılıyor, ama burada internal versiyon var)
- `getDecryptionJid` - Decryption JID alma (NOT: Bu zaten kullanılıyor)
- `getHistoryMsg` - History mesajı alma (NOT: Bu zaten kullanılıyor)
- `getAggregateResponsesInEventMessage` - Event mesajı aggregate responses (NOT: Bu zaten kullanılıyor)
- `getAggregateVotesInPollMessage` - Poll mesajı aggregate votes (NOT: Bu zaten kullanılıyor)
- `shouldIncrementChatUnread` - Chat unread artırılmalı mı (NOT: Bu zaten kullanılıyor)
- `processHistoryMessage` - History mesajı işleme (NOT: Bu zaten kullanılıyor)
- `processSyncAction` - Sync action işleme (NOT: Bu zaten kullanılıyor)

**Not:** Bazı fonksiyonlar hem internal hem de public API'de mevcut. Public versiyonları kullanılıyor.

---

## 📊 Özet

### Kategori Bazında Kullanılmayan Metodlar

| Kategori | Metod Sayısı | Neden Kullanılmıyor |
|----------|--------------|---------------------|
| Encryption/Decryption | ~9 | Internal şifreleme, Baileys otomatik yönetir |
| Binary Node | ~13 | Protokol seviyesi, normal kullanımda gerekmez |
| Signal/Key Management | ~12 | Otomatik anahtar yönetimi |
| Hash/Cryptographic | ~5 | Internal kullanım |
| Network/Stream | ~6 | Otomatik stream/upload yönetimi |
| Utility/Helper | ~12 | Internal/çok spesifik kullanım |
| Protocol/XMPP | ~9 | Protokol seviyesi işlemler |
| Sync/State | ~10 | Internal sync işlemleri |
| Message Processing | ~10 | Internal mesaj işleme |
| **TOPLAM** | **~86** | |

---

## 💡 Sonuç

Bu metodların çoğu **internal kullanım** için tasarlanmıştır ve normal WhatsApp API kullanımında gerekmez. Baileys bu işlemleri otomatik olarak yönetir.

Eğer bu metodlardan herhangi birini kullanmak isterseniz, genellikle:
1. Çok spesifik bir senaryo için gereklidir
2. Baileys'in internal işleyişini özelleştirmek için gereklidir
3. Düşük seviye protokol manipülasyonu için gereklidir

**Öneri:** Bu metodları kullanmadan önce, Baileys'in otomatik yönetiminin yeterli olup olmadığını kontrol edin. Çoğu durumda, mevcut yüksek seviye API'ler yeterlidir.
