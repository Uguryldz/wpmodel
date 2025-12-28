# Baileys API Detaylı Referans Dokümantasyonu

Bu dokümantasyon, [Baileys API Referans Sayfası](https://baileys.wiki/docs/api/)'ndan alınan tüm API öğelerinin detaylı listesini içermektedir.

---

## 📚 İçindekiler

1. [Namespaces](#namespaces)
2. [Enumerations](#enumerations)
3. [Classes](#classes)
4. [Interfaces](#interfaces)
5. [Type Aliases](#type-aliases)
6. [Variables](#variables)
7. [Functions](#functions)
8. [References](#references)

---

## Namespaces

### proto
WhatsApp protobuf mesaj formatları için namespace.

---

## Enumerations

### DisconnectReason
Bağlantı kopma nedenlerini tanımlayan enum.

### QueryIds
Query ID'lerini tanımlayan enum.

### SyncState
Senkronizasyon durumlarını tanımlayan enum.

### WAJIDDomains
WhatsApp JID domain'lerini tanımlayan enum.

### WAMessageAddressingMode
Mesaj adresleme modlarını tanımlayan enum.

### XWAPaths
XWA (WhatsApp Web) path'lerini tanımlayan enum.

---

## Classes

### BinaryInfo
Binary veri bilgilerini yöneten class.

### MessageRetryManager
Mesaj yeniden deneme yönetimi için class.

### USyncContactProtocol
Contact senkronizasyon protokolü için class.

### USyncDeviceProtocol
Cihaz senkronizasyon protokolü için class.

### USyncDisappearingModeProtocol
Kaybolan mesaj modu senkronizasyon protokolü için class.

### USyncQuery
Senkronizasyon sorguları için class.

### USyncStatusProtocol
Status senkronizasyon protokolü için class.

### USyncUser
Kullanıcı senkronizasyonu için class.

---

## Interfaces

### BaileysEventEmitter
Baileys event'lerini yöneten interface.

### Contact
WhatsApp contact bilgilerini tanımlayan interface.

### GroupMetadata
Grup metadata bilgilerini tanımlayan interface.

### GroupModificationResponse
Grup değişiklik yanıtını tanımlayan interface.

### NewsletterCreateResponse
Newsletter oluşturma yanıtını tanımlayan interface.

### NewsletterMetadata
Newsletter metadata bilgilerini tanımlayan interface.

### PresenceData
Kullanıcı varlık (presence) verilerini tanımlayan interface.

### RecentMessage
Son mesaj bilgilerini tanımlayan interface.

### RecentMessageKey
Son mesaj anahtarını tanımlayan interface.

### RetryCounter
Yeniden deneme sayacını tanımlayan interface.

### RetryStatistics
Yeniden deneme istatistiklerini tanımlayan interface.

### SessionRecreateHistory
Session yeniden oluşturma geçmişini tanımlayan interface.

### SignalRepositoryWithLIDStore
LID store ile Signal repository'sini tanımlayan interface.

### WAGroupCreateResponse
WhatsApp grup oluşturma yanıtını tanımlayan interface.

### WAUrlInfo
WhatsApp URL bilgilerini tanımlayan interface.

---

## Type Aliases

### AccountSettings
Hesap ayarları tipi.

### AnyMediaMessageContent
Herhangi bir medya mesaj içeriği tipi.

### AnyMessageContent
Herhangi bir mesaj içeriği tipi.

### AnyRegularMessageContent
Herhangi bir normal mesaj içeriği tipi.

### AuthenticationCreds
Kimlik doğrulama bilgileri tipi.

### AuthenticationState
Kimlik doğrulama durumu tipi.

### BaileysEvent
Baileys event tipi.

### BaileysEventMap
Baileys event map tipi.

### BinaryNode
Binary node tipi.

### BinaryNodeAttributes
Binary node özellikleri tipi.

### BinaryNodeCodingOptions
Binary node kodlama seçenekleri tipi.

### BinaryNodeData
Binary node verisi tipi.

### BotListInfo
Bot listesi bilgisi tipi.

### BrowsersMap
Tarayıcılar map tipi.

### BufferedEventData
Tamponlanmış event verisi tipi.

### ButtonReplyInfo
Buton yanıt bilgisi tipi.

### CacheStore
Önbellek deposu tipi.

### CatalogCollection
Katalog koleksiyonu tipi.

### CatalogCursor
Katalog cursor tipi.

### CatalogResult
Katalog sonucu tipi.

### CatalogStatus
Katalog durumu tipi.

### Chat
Chat tipi.

### ChatModification
Chat değişikliği tipi.

### ChatMutation
Chat mutasyonu tipi.

### ChatMutationMap
Chat mutasyon map tipi.

### ChatUpdate
Chat güncellemesi tipi.

### ConnectionState
Bağlantı durumu tipi.

### CurveKeyPair
Eğri anahtar çifti tipi.

### DebouncedTimeout
Geciktirilmiş timeout tipi.

### DeviceListData
Cihaz listesi verisi tipi.

### DisappearingModeData
Kaybolan mod verisi tipi.

### DownloadableMessage
İndirilebilir mesaj tipi.

### Event
Event tipi.

### EventInputType
Event giriş tipi.

### EventMessageOptions
Event mesaj seçenekleri tipi.

### FullJid
Tam JID tipi.

### GetCatalogOptions
Katalog alma seçenekleri tipi.

### Global
Global tip.

### GroupInviteInfo
Grup davet bilgisi tipi.

### GroupMetadataParticipants
Grup metadata katılımcıları tipi.

### GroupParticipant
Grup katılımcısı tipi.

### InitialAppStateSyncOptions
İlk uygulama durumu senkronizasyon seçenekleri tipi.

### InitialReceivedChatsState
İlk alınan chat durumu tipi.

### JidServer
JID sunucu tipi.

### JidWithDevice
Cihaz ile JID tipi.

### KeyIndexData
Anahtar indeks verisi tipi.

### KeyPair
Anahtar çifti tipi.

### LastMessageList
Son mesaj listesi tipi.

### LIDMapping
LID mapping tipi.

### LTHashState
LT hash durumu tipi.

### MediaConnInfo
Medya bağlantı bilgisi tipi.

### MediaDecryptionKeyInfo
Medya şifre çözme anahtarı bilgisi tipi.

### MediaDownloadOptions
Medya indirme seçenekleri tipi.

### MediaGenerationOptions
Medya oluşturma seçenekleri tipi.

### MediaType
Medya tipi.

### MessageContentGenerationOptions
Mesaj içeriği oluşturma seçenekleri tipi.

### MessageGenerationOptions
Mesaj oluşturma seçenekleri tipi.

### MessageGenerationOptionsFromContent
İçerikten mesaj oluşturma seçenekleri tipi.

### MessageReceiptType
Mesaj alındı tipi.

### MessageRelayOptions
Mesaj aktarma seçenekleri tipi.

### MessageType
Mesaj tipi.

### MessageUpsertType
Mesaj ekleme/güncelleme tipi.

### MessageUserReceipt
Mesaj kullanıcı alındısı tipi.

### MessageUserReceiptUpdate
Mesaj kullanıcı alındı güncellemesi tipi.

### MessageWithContextInfo
Bağlam bilgisi ile mesaj tipi.

### MinimalMessage
Minimal mesaj tipi.

### MiscMessageGenerationOptions
Çeşitli mesaj oluşturma seçenekleri tipi.

### NewsletterUpdate
Newsletter güncellemesi tipi.

### NewsletterViewRole
Newsletter görüntüleme rolü tipi.

### OrderDetails
Sipariş detayları tipi.

### OrderPrice
Sipariş fiyatı tipi.

### OrderProduct
Sipariş ürünü tipi.

### ParsedDeviceInfo
Ayrıştırılmış cihaz bilgisi tipi.

### ParticipantAction
Katılımcı eylemi tipi.

### PatchedMessageWithRecipientJID
Alıcı JID ile yamalı mesaj tipi.

### PendingPhoneRequest
Bekleyen telefon isteği tipi.

### PollMessageOptions
Anket mesajı seçenekleri tipi.

### PossiblyExtendedCacheStore
Muhtemelen genişletilmiş önbellek deposu tipi.

### Product
Ürün tipi.

### ProductAvailability
Ürün müsaitliği tipi.

### ProductBase
Temel ürün tipi.

### ProductCreate
Ürün oluşturma tipi.

### ProductCreateResult
Ürün oluşturma sonucu tipi.

### ProductUpdate
Ürün güncellemesi tipi.

### ProtocolAddress
Protokol adresi tipi.

### RequestJoinAction
Katılma isteği eylemi tipi.

### RequestJoinMethod
Katılma isteği metodu tipi.

### SignalAuthState
Signal kimlik doğrulama durumu tipi.

### SignalCreds
Signal kimlik bilgileri tipi.

### SignalDataSet
Signal veri seti tipi.

### SignalDataTypeMap
Signal veri tipi map tipi.

### SignalIdentity
Signal kimliği tipi.

### SignalKeyStore
Signal anahtar deposu tipi.

### SignalKeyStoreWithTransaction
İşlem ile Signal anahtar deposu tipi.

### SignalRepository
Signal repository tipi.

### SignedKeyPair
İmzalı anahtar çifti tipi.

### SocketConfig
Socket yapılandırması tipi.

### StatusData
Status verisi tipi.

### TransactionCapabilityOptions
İşlem yetenek seçenekleri tipi.

### UploadParams
Yükleme parametreleri tipi.

### URLGenerationOptions
URL oluşturma seçenekleri tipi.

### UserFacingSocketConfig
Kullanıcıya yönelik socket yapılandırması tipi.

### USyncQueryResult
USync sorgu sonucu tipi.

### USyncQueryResultList
USync sorgu sonuç listesi tipi.

### Value
Değer tipi.

### WABrowserDescription
WhatsApp tarayıcı açıklaması tipi.

### WABusinessHoursConfig
WhatsApp işletme saatleri yapılandırması tipi.

### WABusinessProfile
WhatsApp işletme profili tipi.

### WACallEvent
WhatsApp arama event'i tipi.

### WACallUpdateType
WhatsApp arama güncelleme tipi.

### WAConnectionState
WhatsApp bağlantı durumu tipi.

### WAContactMessage
WhatsApp contact mesajı tipi.

### WAContactsArrayMessage
WhatsApp contact dizisi mesajı tipi.

### WAContextInfo
WhatsApp bağlam bilgisi tipi.

### WAGenericMediaMessage
WhatsApp genel medya mesajı tipi.

### WAInitResponse
WhatsApp başlatma yanıtı tipi.

### WALocationMessage
WhatsApp konum mesajı tipi.

### WAMediaPayloadStream
WhatsApp medya payload akışı tipi.

### WAMediaPayloadURL
WhatsApp medya payload URL tipi.

### WAMediaUpload
WhatsApp medya yükleme tipi.

### WAMediaUploadFunction
WhatsApp medya yükleme fonksiyonu tipi.

### WAMessage
WhatsApp mesajı tipi.

### WAMessageContent
WhatsApp mesaj içeriği tipi.

### WAMessageCursor
WhatsApp mesaj cursor tipi.

### WAMessageKey
WhatsApp mesaj anahtarı tipi.

### WAMessageUpdate
WhatsApp mesaj güncellemesi tipi.

### WAPatchCreate
WhatsApp patch oluşturma tipi.

### WAPatchName
WhatsApp patch adı tipi.

### WAPresence
WhatsApp varlık (presence) tipi.

### WAPrivacyCallValue
WhatsApp gizlilik arama değeri tipi.

### WAPrivacyGroupAddValue
WhatsApp gizlilik grup ekleme değeri tipi.

### WAPrivacyMessagesValue
WhatsApp gizlilik mesaj değeri tipi.

### WAPrivacyOnlineValue
WhatsApp gizlilik çevrimiçi değeri tipi.

### WAPrivacyValue
WhatsApp gizlilik değeri tipi.

### WAReadReceiptsValue
WhatsApp okundu bilgisi değeri tipi.

### WASendableProduct
WhatsApp gönderilebilir ürün tipi.

### WASocket
WhatsApp socket tipi.

### WATextMessage
WhatsApp metin mesajı tipi.

### WAVersion
WhatsApp versiyon tipi.

---

## Variables

### ALL_WA_PATCH_NAMES
Tüm WhatsApp patch isimlerini içeren değişken.

### Browsers
Tarayıcı tanımlamalarını içeren değişken.

### BufferJSON
Buffer JSON işlemleri için değişken.

### CALL_AUDIO_PREFIX
Sesli arama öneki.

### CALL_VIDEO_PREFIX
Görüntülü arama öneki.

### Curve
Eğri kriptografi için değişken.

### DECRYPTION_RETRY_CONFIG
Şifre çözme yeniden deneme yapılandırması.

### DEF_CALLBACK_PREFIX
Varsayılan callback öneki.

### DEF_TAG_PREFIX
Varsayılan tag öneki.

### DEFAULT_CACHE_TTLS
Varsayılan önbellek TTL'leri.

### DEFAULT_CONNECTION_CONFIG
Varsayılan bağlantı yapılandırması.

### DEFAULT_ORIGIN
Varsayılan origin.

### DICT_VERSION
Sözlük versiyonu.

### FLAG_BYTE
Bayrak byte'ı.

### FLAG_EVENT
Event bayrağı.

### FLAG_EXTENDED
Genişletilmiş bayrak.

### FLAG_FIELD
Alan bayrağı.

### FLAG_GLOBAL
Global bayrak.

### INITIAL_PREKEY_COUNT
İlk prekey sayısı.

### KEY_BUNDLE_TYPE
Anahtar paketi tipi.

### LT_HASH_ANTI_TAMPERING
LT hash sahtecilik önleme.

### MEDIA_HKDF_KEY_MAPPING
Medya HKDF anahtar eşlemesi.

### MEDIA_KEYS
Medya anahtarları.

### MEDIA_PATH_MAP
Medya path map'i.

### META_AI_JID
Meta AI JID'i.

### MIN_PREKEY_COUNT
Minimum prekey sayısı.

### MIN_UPLOAD_INTERVAL
Minimum yükleme aralığı.

### MISSING_KEYS_ERROR_TEXT
Eksik anahtarlar hata metni.

### NACK_REASONS
NACK nedenleri.

### NOISE_MODE
Gürültü modu.

### NOISE_WA_HEADER
WhatsApp gürültü başlığı.

### NO_MESSAGE_FOUND_ERROR_TEXT
Mesaj bulunamadı hata metni.

### OFFICIAL_BIZ_JID
Resmi işletme JID'i.

### PHONE_CONNECTION_CB
Telefon bağlantı callback'i.

### PROCESSABLE_HISTORY_TYPES
İşlenebilir geçmiş tipleri.

### PSA_WID
PSA WID.

### S_WHATSAPP_NET
WhatsApp net sunucusu.

### SERVER_JID
Sunucu JID'i.

### STORIES_JID
Hikayeler JID'i.

### UNAUTHORIZED_CODES
Yetkisiz kodlar.

### UPLOAD_TIMEOUT
Yükleme zaman aşımı.

### URL_REGEX
URL regex'i.

### WA_ADV_ACCOUNT_SIG_PREFIX
WhatsApp hesap imza öneki.

### WA_ADV_DEVICE_SIG_PREFIX
WhatsApp cihaz imza öneki.

### WA_ADV_HOSTED_ACCOUNT_SIG_PREFIX
WhatsApp barındırılan hesap imza öneki.

### WA_ADV_HOSTED_DEVICE_SIG_PREFIX
WhatsApp barındırılan cihaz imza öneki.

### WA_CERT_DETAILS
WhatsApp sertifika detayları.

### WA_DEFAULT_EPHEMERAL
WhatsApp varsayılan geçici mesaj süresi.

### WAMessageStatus
WhatsApp mesaj durumu.

### WAMessageStubType
WhatsApp mesaj stub tipi.

### WEB_EVENTS
Web event'leri.

### WEB_GLOBALS
Web global'leri.

---

## Functions

### addTransactionCapability
İşlem yeteneği ekler.

### aesDecrypt
AES şifre çözme işlemi.

### aesDecryptCTR
AES CTR modunda şifre çözme.

### aesDecryptGCM
AES GCM modunda şifre çözme.

### aesDecryptWithIV
IV ile AES şifre çözme.

### aesEncrypt
AES şifreleme işlemi.

### aesEncryptCTR
AES CTR modunda şifreleme.

### aesEncryptGCM
AES GCM modunda şifreleme.

### aesEncrypWithIV
IV ile AES şifreleme.

### aggregateMessageKeysNotFromMe
Benden olmayan mesaj anahtarlarını toplar.

### areJidsSameUser
İki JID'in aynı kullanıcıya ait olup olmadığını kontrol eder.

### assertMediaContent
Medya içeriğini doğrular.

### assertNodeErrorFree
Node'un hata içermediğini doğrular.

### binaryNodeToString
Binary node'u string'e çevirir.

### bindWaitForConnectionUpdate
Bağlantı güncellemesi için bekleme bağlar.

### bindWaitForEvent
Event için bekleme bağlar.

### bytesToCrockford
Byte'ları Crockford formatına çevirir.

### chatModificationToAppPatch
Chat değişikliğini app patch'e çevirir.

### cleanMessage
Mesajı temizler.

### configureSuccessfulPairing
Başarılı eşleştirmeyi yapılandırır.

### createSignalIdentity
Signal kimliği oluşturur.

### debouncedTimeout
Geciktirilmiş timeout oluşturur.

### decodeBinaryNode
Binary node'u çözer.

### decodeDecompressedBinaryNode
Sıkıştırılmamış binary node'u çözer.

### decodeMediaRetryNode
Medya yeniden deneme node'unu çözer.

### decodeMessageNode
Mesaj node'unu çözer.

### decodePatches
Patch'leri çözer.

### decodeSyncdMutations
Senkronize mutasyonları çözer.

### decodeSyncdPatch
Senkronize patch'i çözer.

### decodeSyncdSnapshot
Senkronize snapshot'ı çözer.

### decompressingIfRequired
Gerekirse sıkıştırmayı açar.

### decryptEventResponse
Event yanıtını şifre çözer.

### decryptMediaRetryData
Medya yeniden deneme verisini şifre çözer.

### decryptMessageNode
Mesaj node'unu şifre çözer.

### decryptPollVote
Anket oyunu şifre çözer.

### delay
Gecikme oluşturur.

### delayCancellable
İptal edilebilir gecikme oluşturur.

### derivePairingCodeKey
Eşleştirme kodu anahtarını türetir.

### downloadAndProcessHistorySyncNotification
Geçmiş senkronizasyon bildirimini indirir ve işler.

### downloadContentFromMessage
Mesajdan içerik indirir.

### downloadEncryptedContent
Şifrelenmiş içeriği indirir.

### downloadExternalBlob
Harici blob'u indirir.

### downloadExternalPatch
Harici patch'i indirir.

### downloadHistory
Geçmişi indirir.

### downloadMediaMessage
Medya mesajını indirir.

### encodeBase64EncodedStringForUpload
Yükleme için base64 kodlanmış string'i kodlar.

### encodeBigEndian
Big endian kodlama.

### encodeBinaryNode
Binary node'u kodlar.

### encodeNewsletterMessage
Newsletter mesajını kodlar.

### encodeSignedDeviceIdentity
İmzalı cihaz kimliğini kodlar.

### encodeSyncdPatch
Senkronize patch'i kodlar.

### encodeWAM
WAM (WhatsApp Message) kodlar.

### encodeWAMessage
WhatsApp mesajını kodlar.

### encryptedStream
Şifrelenmiş akış oluşturur.

### encryptMediaRetryRequest
Medya yeniden deneme isteğini şifreler.

### extensionForMediaMessage
Medya mesajı için uzantı döndürür.

### extractAddressingContext
Adresleme bağlamını çıkarır.

### extractDeviceJids
Cihaz JID'lerini çıkarır.

### extractImageThumb
Görüntü küçük resmini çıkarır.

### extractMessageContent
Mesaj içeriğini çıkarır.

### extractSyncdPatches
Senkronize patch'leri çıkarır.

### extractUrlFromText
Metinden URL çıkarır.

### fetchLatestBaileysVersion
En son Baileys versiyonunu getirir.

### fetchLatestWaWebVersion
En son WhatsApp Web versiyonunu getirir.

### generateForwardMessageContent
İletilen mesaj içeriği oluşturur.

### generateLinkPreviewIfRequired
Gerekirse link önizlemesi oluşturur.

### generateLoginNode
Giriş node'u oluşturur.

### generateMdTagPrefix
MD tag öneki oluşturur.

### generateMessageID
Mesaj ID'si oluşturur.

### generateMessageIDV2
Mesaj ID'si v2 oluşturur.

### generateOrGetPreKeys
Prekey'leri oluşturur veya getirir.

### generateParticipantHashV2
Katılımcı hash'i v2 oluşturur.

### generateProfilePicture
Profil resmi oluşturur.

### generateRegistrationId
Kayıt ID'si oluşturur.

### generateRegistrationNode
Kayıt node'u oluşturur.

### generateSignalPubKey
Signal genel anahtarı oluşturur.

### generateThumbnail
Küçük resim oluşturur.

### generateWAMessage
WhatsApp mesajı oluşturur.

### generateWAMessageContent
WhatsApp mesaj içeriği oluşturur.

### generateWAMessageFromContent
İçerikten WhatsApp mesajı oluşturur.

### getAggregateResponsesInEventMessage
Event mesajındaki toplu yanıtları getirir.

### getAggregateVotesInPollMessage
Anket mesajındaki toplu oyları getirir.

### getAllBinaryNodeChildren
Tüm binary node çocuklarını getirir.

### getAudioDuration
Ses süresini getirir.

### getAudioWaveform
Ses dalga formunu getirir.

### getBinaryNodeChild
Binary node çocuğunu getirir.

### getBinaryNodeChildBuffer
Binary node çocuk buffer'ını getirir.

### getBinaryNodeChildren
Binary node çocuklarını getirir.

### getBinaryNodeChildString
Binary node çocuk string'ini getirir.

### getBinaryNodeChildUInt
Binary node çocuk unsigned int'ini getirir.

### getBinaryNodeMessages
Binary node mesajlarını getirir.

### getCallStatusFromNode
Node'dan arama durumunu getirir.

### getChatId
Chat ID'sini getirir.

### getCodeFromWSError
WebSocket hatasından kod getirir.

### getContentType
İçerik tipini getirir.

### getDecryptionJid
Şifre çözme JID'ini getirir.

### getDevice
Cihaz bilgisini getirir.

### getErrorCodeFromStreamError
Akış hatasından hata kodu getirir.

### getHistoryMsg
Geçmiş mesajını getirir.

### getHttpStream
HTTP akışını getirir.

### getKeyAuthor
Anahtar yazarını getirir.

### getMediaKeys
Medya anahtarlarını getirir.

### getNextPreKeys
Sonraki prekey'leri getirir.

### getNextPreKeysNode
Sonraki prekey node'unu getirir.

### getPlatformId
Platform ID'sini getirir.

### getPreKeys
Prekey'leri getirir.

### getRawMediaUploadData
Ham medya yükleme verisini getirir.

### getServerFromDomainType
Domain tipinden sunucu getirir.

### getStatusCodeForMediaRetry
Medya yeniden deneme için durum kodu getirir.

### getStatusFromReceiptType
Alındı tipinden durum getirir.

### getStream
Akışı getirir.

### getUrlFromDirectPath
Doğrudan path'ten URL getirir.

### getUrlInfo
URL bilgisini getirir.

### getWAUploadToServer
WhatsApp sunucuya yükleme fonksiyonunu getirir.

### hkdf
HKDF (HMAC-based Key Derivation Function) işlemi.

### hkdfInfoKey
HKDF info anahtarı.

### hmacSign
HMAC imzalama.

### initAuthCreds
Kimlik doğrulama bilgilerini başlatır.

### isHostedLidUser
Barındırılan LID kullanıcısı olup olmadığını kontrol eder.

### isHostedPnUser
Barındırılan PN kullanıcısı olup olmadığını kontrol eder.

### isJidBot
JID'in bot olup olmadığını kontrol eder.

### isJidBroadcast
JID'in yayın olup olmadığını kontrol eder.

### isJidGroup
JID'in grup olup olmadığını kontrol eder.

### isJidMetaAI
JID'in Meta AI olup olmadığını kontrol eder.

### isJidNewsletter
JID'in newsletter olup olmadığını kontrol eder.

### isJidStatusBroadcast
JID'in status yayını olup olmadığını kontrol eder.

### isLidUser
LID kullanıcısı olup olmadığını kontrol eder.

### isPnUser
PN kullanıcısı olup olmadığını kontrol eder.

### isRealMessage
Gerçek mesaj olup olmadığını kontrol eder.

### isWABusinessPlatform
WhatsApp işletme platformu olup olmadığını kontrol eder.

### jidDecode
JID'i decode eder.

### jidEncode
JID'i encode eder.

### jidNormalizedUser
JID'i normalize edilmiş kullanıcı formatına çevirir.

### makeCacheableSignalKeyStore
Önbelleklenebilir Signal anahtar deposu oluşturur.

### makeEventBuffer
Event buffer'ı oluşturur.

### makeNoiseHandler
Gürültü handler'ı oluşturur.

### makeWASocket
WhatsApp socket'i oluşturur.

### md5
MD5 hash işlemi.

### mediaMessageSHA256B64
Medya mesajı SHA256 base64 hash'i.

### newLTHashState
Yeni LT hash durumu oluşturur.

### normalizeMessageContent
Mesaj içeriğini normalize eder.

### parseAndInjectE2ESessions
E2E session'ları parse eder ve enjekte eder.

### prepareDisappearingMessageSettingContent
Kaybolan mesaj ayarı içeriğini hazırlar.

### prepareWAMessageMedia
WhatsApp mesaj medyasını hazırlar.

### processHistoryMessage
Geçmiş mesajını işler.

### processSyncAction
Senkronizasyon eylemini işler.

### promiseTimeout
Promise zaman aşımı.

### reduceBinaryNodeToDictionary
Binary node'u dictionary'ye indirger.

### sha256
SHA256 hash işlemi.

### shouldIncrementChatUnread
Chat okunmamış sayısını artırmalı mı kontrol eder.

### signedKeyPair
İmzalı anahtar çifti oluşturur.

### toBuffer
Buffer'a çevirir.

### toNumber
Sayıya çevirir.

### toReadable
Okunabilir formata çevirir.

### transferDevice
Cihazı transfer eder.

### trimUndefined
Tanımsız değerleri temizler.

### unixTimestampSeconds
Unix zaman damgası (saniye).

### unpadRandomMax16
Rastgele maksimum 16 padding'i kaldırır.

### updateMessageWithEventResponse
Event yanıtı ile mesajı günceller.

### updateMessageWithPollUpdate
Anket güncellemesi ile mesajı günceller.

### updateMessageWithReaction
Reaksiyon ile mesajı günceller.

### updateMessageWithReceipt
Alındı bilgisi ile mesajı günceller.

### uploadWithNodeHttp
Node HTTP ile yükleme.

### useMultiFileAuthState
Çoklu dosya kimlik doğrulama durumu kullanır.

### writeRandomPadMax16
Rastgele maksimum 16 padding yazar.

### xmppPreKey
XMPP prekey.

### xmppSignedPreKey
XMPP imzalı prekey.

---

## References

### default
`makeWASocket` fonksiyonunu yeniden adlandırır ve export eder.

### WAProto
`proto` namespace'ini yeniden adlandırır ve export eder.

---

## 📝 Notlar

- Bu dokümantasyon [Baileys API Referans Sayfası](https://baileys.wiki/docs/api/)'ndan alınmıştır.
- Her bir öğe için detaylı kullanım örnekleri ve açıklamalar için resmi dokümantasyonu ziyaret edin.
- API'deki değişiklikler için güncel dokümantasyonu kontrol edin.

---

**Kaynak:** [baileys.wiki/docs/api/](https://baileys.wiki/docs/api/)

**Son Güncelleme:** 2025-01-27




