// Shared constants and helper functions for Baileys modules
import { jidNormalizedUser, isJidBroadcast } from "baileys";
import { prisma, logger, getPhoneMapIdFromSessionId } from "../shared.js";
import { serializePrisma } from "../utils.js";
import { MessageQueue, RateLimiter } from "./utils/queue.js";

export const AUTH_FOLDER = "./auth_info";
export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_DB_URL = `file:${process.cwd()}/prisma/dev.db`;
export const CONTACT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

// WebSocket broadcast fonksiyonu (index.js'den set edilecek)
let wsBroadcastFn = null;

export const setWebSocketBroadcast = (fn) => {
  wsBroadcastFn = fn;
};

export const getWebSocketBroadcast = () => wsBroadcastFn;

// Instances map (her modül tarafından kullanılacak)
export const instances = new Map();

// Contact cache
export const contactsCache = new Map();

// Helper functions
export const getAccountId = (accountId) => accountId || DEFAULT_ACCOUNT_ID;

/**
 * WhatsApp JID'den Türkiye formatında telefon numarası çıkar (session ID için)
 * @param {string} whatsappJid - WhatsApp JID (örn: 905335989539@s.whatsapp.net)
 * @returns {string} Türkiye formatında telefon numarası (örn: 905335989539)
 */
export const getSessionIdFromWhatsAppJid = (whatsappJid) => {
  if (!whatsappJid || typeof whatsappJid !== 'string') {
    return DEFAULT_ACCOUNT_ID;
  }
  
  try {
    // Telefon numarasını çıkar
    const phoneRaw = extractPhoneFromJid(whatsappJid);
    if (!phoneRaw) {
      logger.warn({ whatsappJid }, "Telefon numarası çıkarılamadı");
      return DEFAULT_ACCOUNT_ID;
    }
    
    // Türkiye formatına çevir
    let phoneTurkish = convertInternationalToTurkish(phoneRaw);
    
    // Normalize et (0 ile başlıyorsa 90 ekle)
    phoneTurkish = normalizePhoneNumber(phoneTurkish);
    
    // Eğer hala Türkiye formatında değilse (90 ile başlamıyorsa), tekrar dene
    if (!phoneTurkish.startsWith('90') && phoneRaw.length >= 10) {
      // Uluslararası formattan Türkiye formatına çevir
      phoneTurkish = convertInternationalToTurkish(phoneRaw);
      phoneTurkish = normalizePhoneNumber(phoneTurkish);
    }
    
    // Eğer hala geçerli bir Türkiye numarası değilse, default kullan
    if (!phoneTurkish || phoneTurkish.length < 10 || !phoneTurkish.startsWith('90')) {
      logger.warn({ whatsappJid, phoneRaw, phoneTurkish }, "Geçerli Türkiye formatı numarası çıkarılamadı, default kullanılıyor");
      return DEFAULT_ACCOUNT_ID;
    }
    
    logger.info({ whatsappJid, phoneRaw, phoneTurkish }, "Session ID oluşturuldu (Türkiye formatı)");
    return phoneTurkish;
  } catch (error) {
    logger.error({ error, whatsappJid }, "Session ID oluşturulamadı");
    return DEFAULT_ACCOUNT_ID;
  }
};

/**
 * Instance'ın session ID'sini WhatsApp numarasına göre güncelle
 * @param {object} instance - Instance objesi
 * @param {string} whatsappJid - WhatsApp JID
 * @returns {string} Yeni session ID
 */
export const updateInstanceSessionId = (instance, whatsappJid) => {
  if (!instance || !whatsappJid) {
    return instance?.id || DEFAULT_ACCOUNT_ID;
  }
  
  const newSessionId = getSessionIdFromWhatsAppJid(whatsappJid);
  const oldSessionId = instance.id;
  
  // Eğer yeni session ID farklıysa ve geçerli bir numara ise
  if (newSessionId !== oldSessionId && newSessionId !== DEFAULT_ACCOUNT_ID) {
    logger.info({ oldSessionId, newSessionId, whatsappJid }, "Session ID güncelleniyor (WhatsApp numarasına göre)");
    
    // Instance'ın ID'sini güncelle
    instance.id = newSessionId;
    
    // Eğer instance Map'te eski ID ile kayıtlıysa, yeni ID ile yeniden kaydet
    if (instances.has(oldSessionId)) {
      instances.delete(oldSessionId);
      instances.set(newSessionId, instance);
      logger.info({ oldSessionId, newSessionId }, "Instance Map'te güncellendi");
    }
    
    return newSessionId;
  }
  
  return oldSessionId;
};

export const formatContactName = (c) => {
  const fallbackFromJid = c.id ? String(c.id).split("@")[0] : "";
  return (
    c.verifiedName ||
    c.name ||
    c.notify ||
    fallbackFromJid ||
    c.id ||
    ""
  );
};

// Merkezi JID converter modülünden normalizeJid'i import et
import { 
  normalizeJid as normalizeJidFromConverter,
  extractPhoneFromJid,
  convertInternationalToTurkish,
  normalizePhoneNumber,
} from "../utils/jidConverter.js";

// Geriye dönük uyumluluk için export et
export const normalizeJid = normalizeJidFromConverter;

// Instance management
export const getOrCreateInstance = (accountId) => {
  const id = getAccountId(accountId);
  if (!instances.has(id)) {
    const instance = {
      id,
      sock: null,
      authState: null,
      saveCredsFn: null,
      waVersion: null,
      reconnectTimer: null,
      reconnectAttempts: 0, // Baileys.wiki best practice: reconnect counter
      chatsStore: new Map(),
      contactsStore: new Map(),
      messagesStore: new Map(),
      datastore: null, // PostgreSQL tabanlı datastore (startSocket'da oluşturulacak)
      chatsSetReceived: false,
      chatsUpsertTimer: null,
      syncChatsInterval: null,
      syncChatsTimeout: null,
      connectionTimers: [],
      eventListeners: new Map(),
      // Baileys.wiki best practice: Message queue ve rate limiter
      messageQueue: new MessageQueue(id, {
        messageDelay: 1000, // 1 saniye delay (rate limiting)
        maxRetries: 3,
        retryDelay: 5000,
      }),
      rateLimiter: new RateLimiter({
        maxRequests: 50, // Max 50 request
        windowMs: 60000, // 60 saniye window
      }),
      connectionState: {
        status: "initializing",
        version: null,
        isLatest: null,
        lastError: null,
        lastQr: null,
        qrGeneratedAt: null,
        startedAt: null,
        disconnectReason: null, // Baileys.wiki: disconnect reason tracking
      },
    };
    
    instances.set(id, instance);
  }

  return instances.get(id);
};

export const removeInstance = (accountId) => {
  const id = getAccountId(accountId);
  const instance = instances.get(id);
  if (!instance) return;

  // Tüm timer'ları temizle
  if (instance.reconnectTimer) {
    clearTimeout(instance.reconnectTimer);
  }
  
  if (instance.chatsUpsertTimer) {
    clearTimeout(instance.chatsUpsertTimer);
  }
  
  if (instance.syncChatsInterval) {
    clearInterval(instance.syncChatsInterval);
  }
  
  if (instance.syncChatsTimeout) {
    clearTimeout(instance.syncChatsTimeout);
  }
  
  if (instance.connectionTimers) {
    instance.connectionTimers.forEach(timer => clearTimeout(timer));
    instance.connectionTimers = [];
  }

  // Event listener'ları temizle
  if (instance.sock && instance.sock.ev) {
    if (instance.eventListeners) {
      instance.eventListeners.forEach((listener, eventName) => {
        try {
          instance.sock.ev.off(eventName, listener);
        } catch (error) {
          // ignore
        }
      });
      instance.eventListeners.clear();
    }
    try {
      instance.sock.ev.removeAllListeners();
    } catch (error) {
      // ignore
    }
  }

  // Socket'i kapat
  if (instance.sock) {
    try {
      instance.sock.end();
    } catch (error) {
      // ignore
    }
  }

  // Datastore batch processor'ı durdur
  if (instance.datastore) {
    try {
      instance.datastore.stopBatchProcessor();
    } catch (error) {
      // ignore
    }
  }

  instances.delete(id);
};

export const ensureSocket = (accountId) => {
  const instance = getOrCreateInstance(accountId);
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DB_URL;
  }
  if (!instance.sock) {
    throw new Error(
      `WhatsApp soketi (${instance.id}) henüz hazır değil. Lütfen birkaç saniye sonra tekrar deneyin.`
    );
  }
  return instance.sock;
};

// Formatting functions
export const extractText = (message) => {
  if (!message) return null;
  
  // Normal metin mesajları
  if (message.conversation) return message.conversation;
  
  // Uzun metin mesajları
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  
  // Medya mesajları - caption varsa onu döndür
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  
  // Medya mesajları - caption yoksa tip belirt
  if (message.imageMessage) return '📷 Fotoğraf';
  if (message.videoMessage) return '📹 Video';
  if (message.audioMessage) {
    if (message.audioMessage.ptt) return '🎤 Sesli Mesaj';
    return '🎵 Ses';
  }
  if (message.documentMessage) {
    const fileName = message.documentMessage.fileName || 'Belge';
    return `📄 ${fileName}`;
  }
  if (message.stickerMessage) return '🎨 Sticker';
  if (message.locationMessage) return '📍 Konum';
  if (message.contactMessage) return '👤 Kişi';
  if (message.contactsArrayMessage) return '👥 Kişiler';
  if (message.liveLocationMessage) return '📍 Canlı Konum';
  if (message.buttonsMessage) {
    const text = message.buttonsMessage.contentText || message.buttonsMessage.text;
    return text || '🔘 Butonlu Mesaj';
  }
  if (message.templateMessage) {
    const text = message.templateMessage.hydratedTemplate?.hydratedContentText;
    return text || '📋 Şablon Mesajı';
  }
  if (message.listMessage) {
    const text = message.listMessage.description || message.listMessage.title;
    return text || '📋 Liste Mesajı';
  }
  if (message.viewOnceMessage) {
    // View once mesajları iç içe olabilir
    const innerMessage = message.viewOnceMessage.message;
    if (innerMessage) {
      const innerText = extractText(innerMessage);
      return innerText ? `👁️ ${innerText}` : '👁️ Tek Seferlik Mesaj';
    }
    return '👁️ Tek Seferlik Mesaj';
  }
  if (message.reactionMessage) {
    return `👍 ${message.reactionMessage.text || 'Tepki'}`;
  }
  if (message.pollCreationMessage) {
    return `📊 ${message.pollCreationMessage.name || 'Anket'}`;
  }
  if (message.pollUpdateMessage) {
    return '📊 Anket Güncellemesi';
  }
  
  return null;
};

// Protocol mesajları için kullanıcı dostu metin oluştur
export const formatProtocolMessage = (messageStubType, messageStubParameters, participant) => {
  if (!messageStubType) return null;
  
  const params = messageStubParameters || [];
  const participantName = participant ? participant.split('@')[0] : '';
  
  switch (messageStubType) {
    case 1: // REVOKE - Mesaj silindi
      return 'Bu mesaj silindi';
    case 2: // CIPHERTEXT - Şifreli mesaj
      return 'Şifreli mesaj';
    case 3: // FUTUREPROOF - Gelecek için hazırlanmış mesaj
      return 'Mesaj';
    case 4: // NON_VERIFIED_TRANSITION - Doğrulanmamış geçiş
      return 'Doğrulanmamış mesaj';
    case 5: // UNVERIFIED_TRANSITION - Doğrulanmamış geçiş
      return 'Doğrulanmamış mesaj';
    case 6: // VERIFIED_TRANSITION - Doğrulanmış geçiş
      return 'Doğrulanmış mesaj';
    case 7: // VERIFIED_LOW - Düşük doğrulama
      return 'Doğrulanmış mesaj';
    case 8: // VERIFIED_HIGH - Yüksek doğrulama
      return 'Doğrulanmış mesaj';
    case 9: // VERIFIED_INITIAL_UNKNOWN - İlk bilinmeyen doğrulama
      return 'Doğrulanmış mesaj';
    case 10: // VERIFIED_INITIAL_LOW - İlk düşük doğrulama
      return 'Doğrulanmış mesaj';
    case 11: // VERIFIED_INITIAL_HIGH - İlk yüksek doğrulama
      return 'Doğrulanmış mesaj';
    case 12: // VERIFIED_TRANSITION_ANY_TO_NONE - Doğrulamadan geçiş
      return 'Doğrulama kaldırıldı';
    case 13: // VERIFIED_TRANSITION_ANY_TO_HIGH - Yüksek doğrulamaya geçiş
      return 'Yüksek doğrulama';
    case 14: // VERIFIED_TRANSITION_HIGH_TO_LOW - Yüksekten düşüğe geçiş
      return 'Doğrulama seviyesi düşürüldü';
    case 15: // VERIFIED_TRANSITION_HIGH_TO_UNKNOWN - Yüksekten bilinmeyene geçiş
      return 'Doğrulama kaldırıldı';
    case 16: // VERIFIED_TRANSITION_UNKNOWN_TO_LOW - Bilinmeyenden düşüğe geçiş
      return 'Düşük doğrulama';
    case 17: // VERIFIED_TRANSITION_UNKNOWN_TO_HIGH - Bilinmeyenden yükseğe geçiş
      return 'Yüksek doğrulama';
    case 18: // VERIFIED_TRANSITION_LOW_TO_UNKNOWN - Düşükten bilinmeyene geçiş
      return 'Doğrulama kaldırıldı';
    case 19: // VERIFIED_TRANSITION_LOW_TO_HIGH - Düşükten yükseğe geçiş
      return 'Yüksek doğrulama';
    case 20: // GROUP_CREATE - Grup oluşturuldu
      return `Grup oluşturuldu`;
    case 21: // GROUP_CHANGE_SUBJECT - Grup konusu değiştirildi
      const newSubject = params[0] || '';
      return `Grup konusu "${newSubject}" olarak değiştirildi`;
    case 22: // GROUP_CHANGE_ICON - Grup ikonu değiştirildi
      return 'Grup ikonu değiştirildi';
    case 23: // GROUP_CHANGE_INVITE_LINK - Davet linki değiştirildi
      return 'Davet linki değiştirildi';
    case 24: // GROUP_CHANGE_DESCRIPTION - Grup açıklaması değiştirildi
      return 'Grup açıklaması değiştirildi';
    case 25: // GROUP_CHANGE_RESTRICT - Grup kısıtlamaları değiştirildi
      return 'Grup ayarları değiştirildi';
    case 26: // GROUP_CHANGE_ANNOUNCE - Duyuru ayarları değiştirildi
      return 'Duyuru ayarları değiştirildi';
    case 27: // GROUP_PARTICIPANT_ADD - Katılımcı eklendi
      return participantName ? `${participantName} gruba katıldı` : 'Birisi gruba katıldı';
    case 28: // GROUP_PARTICIPANT_REMOVE - Katılımcı çıkarıldı
      return participantName ? `${participantName} gruptan çıkarıldı` : 'Birisi gruptan çıkarıldı';
    case 29: // GROUP_PARTICIPANT_PROMOTE - Katılımcı yönetici yapıldı
      return participantName ? `${participantName} yönetici yapıldı` : 'Birisi yönetici yapıldı';
    case 30: // GROUP_PARTICIPANT_DEMOTE - Katılımcı yöneticilikten çıkarıldı
      return participantName ? `${participantName} yöneticilikten çıkarıldı` : 'Birisi yöneticilikten çıkarıldı';
    case 31: // GROUP_PARTICIPANT_INVITE - Katılımcı davet edildi
      return participantName ? `${participantName} davet edildi` : 'Birisi davet edildi';
    case 32: // GROUP_PARTICIPANT_LEAVE - Katılımcı ayrıldı
      return participantName ? `${participantName} gruptan ayrıldı` : 'Birisi gruptan ayrıldı';
    case 33: // GROUP_PARTICIPANT_CHANGE_NUMBER - Katılımcı numarası değişti
      return participantName ? `${participantName} numarası değişti` : 'Birisi numarası değişti';
    case 34: // BROADCAST_CREATE - Yayın listesi oluşturuldu
      return 'Yayın listesi oluşturuldu';
    case 35: // BROADCAST_ADD - Yayın listesine eklendi
      return 'Yayın listesine eklendi';
    case 36: // BROADCAST_REMOVE - Yayın listesinden çıkarıldı
      return 'Yayın listesinden çıkarıldı';
    case 37: // GENERIC_NOTIFICATION - Genel bildirim
      return params[0] || 'Bildirim';
    case 38: // E2E_ENCRYPTED - Uçtan uca şifreli
      return 'Şifreli mesaj';
    case 39: // CALL_MISSED_VOICE - Kaçırılan sesli arama
      return '📞 Kaçırılan sesli arama';
    case 40: // CALL_MISSED_VIDEO - Kaçırılan görüntülü arama
      return '📹 Kaçırılan görüntülü arama';
    case 41: // INDIVIDUAL_CHANGE_NUMBER - Kişi numarası değişti
      return 'Numara değişti';
    case 42: // GROUP_DELETE - Grup silindi
      return 'Grup silindi';
    case 43: // GROUP_ANNOUNCE_MODE_MESSAGE_BOUNCE - Duyuru modu mesaj geri dönüşü
      return 'Mesaj geri döndü';
    case 44: // CALL_MISSED_GROUP_VOICE - Grup sesli arama kaçırıldı
      return '📞 Grup sesli arama kaçırıldı';
    case 45: // CALL_MISSED_GROUP_VIDEO - Grup görüntülü arama kaçırıldı
      return '📹 Grup görüntülü arama kaçırıldı';
    case 46: // PAYMENT_CIPHERTEXT - Ödeme şifreli mesajı
      return '💳 Ödeme mesajı';
    case 47: // PAYMENT_FUTUREPROOF - Gelecek ödeme mesajı
      return '💳 Ödeme mesajı';
    case 48: // PAYMENT_TRANSACTION_STATUS_UPDATE_FAILED - Ödeme işlemi başarısız
      return '💳 Ödeme başarısız';
    case 49: // PAYMENT_TRANSACTION_STATUS_UPDATE_FAILED_RECOVERED - Ödeme işlemi kurtarıldı
      return '💳 Ödeme kurtarıldı';
    case 50: // PAYMENT_TRANSACTION_STATUS_UPDATE_REFUNDED - Ödeme iade edildi
      return '💳 Ödeme iade edildi';
    case 51: // PAYMENT_TRANSACTION_STATUS_UPDATE_REFUND_FAILED - Ödeme iadesi başarısız
      return '💳 Ödeme iadesi başarısız';
    case 52: // PAYMENT_TRANSACTION_STATUS_RECEIVER_PENDING_SETUP - Alıcı ödeme kurulumu bekliyor
      return '💳 Ödeme kurulumu bekleniyor';
    case 53: // PAYMENT_TRANSACTION_STATUS_RECEIVER_SUCCESS_AFTER_HICCUP - Alıcı başarılı (kesinti sonrası)
      return '💳 Ödeme tamamlandı';
    case 54: // PAYMENT_ACTION_ACCOUNT_SETUP_REMINDER - Ödeme hesap kurulumu hatırlatması
      return '💳 Ödeme hesap kurulumu';
    case 55: // BIZ_VERIFIED_TRANSITION_TOP_TO_BOTTOM - İşletme doğrulama geçişi
      return 'İşletme doğrulaması';
    case 56: // BIZ_VERIFIED_TRANSITION_BOTTOM_TO_TOP - İşletme doğrulama geçişi
      return 'İşletme doğrulaması';
    case 57: // BIZ_INTRO_TOP - İşletme tanıtımı
      return 'İşletme tanıtımı';
    case 58: // BIZ_INTRO_BOTTOM - İşletme tanıtımı
      return 'İşletme tanıtımı';
    case 59: // BIZ_CHANGE_DOMAIN - İşletme domain değişti
      return 'İşletme domain değişti';
    case 60: // BIZ_MOVE_CONSUMER_APP - İşletme tüketici uygulamasına taşındı
      return 'İşletme uygulaması değişti';
    case 61: // TARGET_MESSAGE_FORWARD - Hedef mesaj iletildi
      return 'Mesaj iletildi';
    case 62: // TARGET_MESSAGE_REACTION - Hedef mesaja tepki
      return 'Tepki eklendi';
    case 63: // TARGET_MESSAGE_REACTION_DELETE - Hedef mesaj tepkisi silindi
      return 'Tepki silindi';
    case 64: // TARGET_MESSAGE_REACTION_ADD - Hedef mesaja tepki eklendi
      return 'Tepki eklendi';
    case 65: // TARGET_MESSAGE_REACTION_REMOVE - Hedef mesaj tepkisi kaldırıldı
      return 'Tepki kaldırıldı';
    default:
      return `Sistem mesajı (${messageStubType})`;
  }
};

export const formatMessage = (msg) => {
  let quotedMessage = null;
  if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    const quoted = msg.message.extendedTextMessage.contextInfo;
    quotedMessage = {
      id: quoted.stanzaId,
      from: quoted.participant || quoted.remoteJid,
      text: extractText(quoted.quotedMessage),
    };
  } else if (msg.message?.imageMessage?.contextInfo?.quotedMessage) {
    const quoted = msg.message.imageMessage.contextInfo;
    quotedMessage = {
      id: quoted.stanzaId,
      from: quoted.participant || quoted.remoteJid,
      text: extractText(quoted.quotedMessage) || '📷 Fotoğraf',
    };
  } else if (msg.message?.videoMessage?.contextInfo?.quotedMessage) {
    const quoted = msg.message.videoMessage.contextInfo;
    quotedMessage = {
      id: quoted.stanzaId,
      from: quoted.participant || quoted.remoteJid,
      text: extractText(quoted.quotedMessage) || '📹 Video',
    };
  }

  // Protocol mesajları için özel işleme
  const messageStubType = msg.messageStubType || msg.message?.messageStubType;
  const messageStubParameters = msg.messageStubParameters || msg.message?.messageStubParameters;
  const participant = msg.key?.participant || msg.participant;
  
  let text = null;
  let type = null;
  
  // Eğer protocol mesajı varsa, önce onu işle
  if (messageStubType) {
    text = formatProtocolMessage(messageStubType, messageStubParameters, participant);
    type = `protocol_${messageStubType}`;
  }
  
  // Protocol mesajı yoksa normal mesaj içeriğini çıkar
  if (!text && msg.message) {
    text = extractText(msg.message);
    type = msg.message?.messageStubType || Object.keys(msg.message || {})[0];
  }
  
  // Eğer hala text yoksa, messageStubType'a göre varsayılan mesaj oluştur
  if (!text && messageStubType) {
    text = formatProtocolMessage(messageStubType, messageStubParameters, participant) || 'Sistem mesajı';
  }
  
  // Son çare: boş mesaj kontrolü
  if (!text) {
    text = '';
  }

  // Reaction'ları al - hem msg.reactions hem de msg.message.reactions'dan
  // Önce direkt msg.reactions'ı kontrol et (DB'den gelen ayrı field)
  let reactions = msg.reactions || null;
  
  // Eğer msg.reactions yoksa, message.reactions'ı kontrol et
  if (!reactions && msg.message?.reactions) {
    reactions = msg.message.reactions;
  }
  
  // Eğer hala yoksa, message objesi içinde başka yerlerde ara
  if (!reactions && msg.message) {
    // message objesi içinde reactions field'ı var mı?
    if (msg.message.reactions) {
      reactions = msg.message.reactions;
    }
  }
  
  // Reaction'ları parse et (eğer string ise)
  if (reactions && typeof reactions === 'string') {
    try {
      reactions = JSON.parse(reactions);
    } catch (e) {
      logger.warn({ error: e, messageId: msg.key?.id }, "Reaction parse edilemedi (string format)");
    }
  }
  
  // Eğer message objesi varsa ve reaction'lar message içindeyse, onu da koru
  let messageObj = msg.message;
  if (messageObj && reactions) {
    // Reaction'ları message objesine ekle (kalıcılık için)
    messageObj = { ...messageObj, reactions };
  }

  // Forward edilen mesajı tespit et
  const isForwarded = msg.message?.extendedTextMessage?.contextInfo?.isForwarded ||
                     msg.message?.imageMessage?.contextInfo?.isForwarded ||
                     msg.message?.videoMessage?.contextInfo?.isForwarded ||
                     msg.message?.audioMessage?.contextInfo?.isForwarded ||
                     msg.message?.documentMessage?.contextInfo?.isForwarded ||
                     msg.message?.forwardedMessage ||
                     false;

  return {
    id: msg.key?.id,
    from: msg.key?.remoteJid,
    fromMe: Boolean(msg.key?.fromMe),
    participant: participant || null,
    timestamp: Number(
      msg.messageTimestamp || msg.messageStubParameters?.timestamp || Date.now()
    ),
    type: type || 'unknown',
    text: text,
    quotedMessage,
    message: messageObj,
    key: msg.key,
    messageStubType: messageStubType || null,
    messageStubParameters: messageStubParameters || null,
    // Reaction'ları direkt olarak da ekle (hem msg.reactions hem de message.reactions için)
    // ÖNEMLİ: Reaction'lar hem direkt field olarak hem de message.reactions içinde olmalı
    // Frontend'de msg.reactions || msg.message?.reactions kontrolü yapılıyor
    reactions: reactions || undefined,
    // Forward edilen mesaj bilgisi
    isForwarded: isForwarded || undefined,
  };
};

export const formatChat = (chat, sessionId = null) => {
  let imgUrl = null;
  let chatName = chat.name || chat.displayName || chat.subject || chat.id;
  let verifiedName = null;
  
  // @lid formatındaki chat'ler için gerçek JID'yi lidJid'den al
  // Örnek: chat.id = "52523188617453@lid", chat.lidJid = "905538781507@s.whatsapp.net"
  let chatId = chat.id;
  if (chat.id && chat.id.includes('@lid') && chat.lidJid) {
    // Gerçek JID'yi lidJid'den al
    chatId = chat.lidJid;
    console.log(`[formatChat] @lid formatı düzeltildi: ${chat.id} -> ${chatId}`);
  }
  
  if (sessionId) {
    const instance = instances.get(sessionId);
    if (instance) {
      if (chatId.includes('@g.us')) {
        imgUrl = chat.imgUrl || null;
      } else {
        // Gerçek JID ile contact'ı bul
        const contact = instance.contactsStore.get(chatId);
        if (contact) {
          if (contact.imgUrl) {
            imgUrl = contact.imgUrl;
          }
          verifiedName = contact.verifiedName || null;
          chatName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || chatId;
        }
      }
    }
  }
  
  return {
    id: chatId, // Gerçek JID'yi kullan
    name: chatName,
    verifiedName: verifiedName,
    unreadCount: chat.unreadCount ?? 0,
    conversationTimestamp: chat.conversationTimestamp ?? null,
    isMuted: Boolean(chat.isMuted),
    archived: chat.archived ?? false,
    imgUrl: imgUrl,
    lidJid: chat.lidJid || null, // Orijinal lidJid'yi de sakla (gerekirse)
  };
};

// Message saving functions with batch processing (Baileys.wiki best practice)
export const saveMessagesToPrisma = async (sessionId, messages = []) => {
  if (!messages.length) return;

  const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
  if (!phoneMapId) {
    logger.warn({ sessionId }, "saveMessagesToPrisma: phoneMapId bulunamadı");
    return;
  }

  // Batch processing için mesajları grupla (her batch'te max 100 mesaj)
  const BATCH_SIZE = 100;
  const batches = [];
  
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    batches.push(messages.slice(i, i + BATCH_SIZE));
  }

  let savedCount = 0;
  let errorCount = 0;

  for (const batch of batches) {
    try {
      // Transaction kullanarak batch'i kaydet (daha performanslı)
      await prisma.$transaction(async (tx) => {
        for (const msg of batch) {
          if (!msg.key?.remoteJid || !msg.key?.id) continue;
          if (isJidBroadcast(msg.key.remoteJid)) continue;

          try {
            await tx.message.upsert({
              where: {
                phoneMapId_remoteJid_id: {
                  phoneMapId: phoneMapId,
                  remoteJid: msg.key.remoteJid,
                  id: msg.key.id,
                },
              },
              create: {
                phoneMapId: phoneMapId,
                remoteJid: msg.key.remoteJid,
                id: msg.key.id,
                key: JSON.stringify(msg.key),
                message: msg.message ? JSON.stringify(msg.message) : null,
                messageTimestamp: msg.messageTimestamp ? BigInt(msg.messageTimestamp) : null,
                participant: msg.key.participant || null,
                messageStubType: msg.messageStubType || null,
                messageStubParameters: msg.messageStubParameters
                  ? JSON.stringify(msg.messageStubParameters)
                  : null,
              },
              update: {
                message: msg.message ? JSON.stringify(msg.message) : undefined,
                messageTimestamp: msg.messageTimestamp ? BigInt(msg.messageTimestamp) : undefined,
              },
            });
            savedCount++;
          } catch (error) {
            logger.error({ error, sessionId, msgId: msg.key.id }, "Mesaj kaydedilemedi (batch içinde)");
            errorCount++;
          }
        }
      });
    } catch (error) {
      logger.error({ error, sessionId, batchSize: batch.length }, "Mesaj batch'i kaydedilemedi");
      errorCount += batch.length;
    }
  }

  if (savedCount > 0) {
    logger.info({ sessionId, savedCount, errorCount, totalMessages: messages.length }, 
      "Mesajlar batch processing ile kaydedildi");
  }
};

// Memory management constants (Baileys.wiki best practice)
const MESSAGE_STORE_LIMIT = 200; // Her chat için max 200 mesaj tut (memory optimization)
const MESSAGE_STORE_MAX_CHATS = 100; // Max 100 chat'in mesajlarını memory'de tut

export const saveMessages = (instance, jid, messages = []) => {
  if (!jid) return;
  const normalized = jidNormalizedUser(jid);
  const existing = instance.messagesStore.get(normalized) || [];
  
  const existingIds = new Set(
    existing.map(m => m.key?.id || m.id || `${m.timestamp || m.messageTimestamp || 0}-${m.from || ''}`)
  );
  
  const formatted = messages.map((originalMsg, index) => {
    const formattedMsg = formatMessage(originalMsg);
    
    // Reaction'ları koru - orijinal mesajdan reaction'ları al
    // formatMessage zaten reaction'ları koruyor ama ekstra güvence için burada da kontrol ediyoruz
    const reactions = originalMsg.reactions || originalMsg.message?.reactions || formattedMsg.reactions;
    if (reactions) {
      formattedMsg.reactions = reactions;
      // message.reactions'ı da güncelle (tutarlılık için)
      if (formattedMsg.message) {
        formattedMsg.message.reactions = reactions;
      } else if (reactions) {
        formattedMsg.message = { reactions };
      }
      
      // Debug: Reaction'ların korunduğunu logla
      logger.debug({ 
        messageId: formattedMsg.id || formattedMsg.key?.id,
        hasReactions: !!reactions,
        reactionsCount: Array.isArray(reactions) ? reactions.length : (typeof reactions === 'object' ? Object.keys(reactions).length : 0)
      }, "Reaction'lar saveMessages'da korundu");
    }
    
    return formattedMsg;
  });
  
  const newMessages = formatted.filter(msg => {
    const msgId = msg.key?.id || msg.id || `${msg.timestamp || msg.messageTimestamp || 0}-${msg.from || ''}`;
    return !existingIds.has(msgId);
  });
  
  // Mevcut mesajları güncelle - yeni mesajlardaki reaction'ları mevcut mesajlara ekle
  const existingMap = new Map(
    existing.map(m => [m.key?.id || m.id || `${m.timestamp || m.messageTimestamp || 0}-${m.from || ''}`, m])
  );
  
  // Yeni mesajlardaki reaction'ları mevcut mesajlara ekle
  formatted.forEach(formattedMsg => {
    const msgId = formattedMsg.key?.id || formattedMsg.id || `${formattedMsg.timestamp || formattedMsg.messageTimestamp || 0}-${formattedMsg.from || ''}`;
    const existingMsg = existingMap.get(msgId);
    if (existingMsg && formattedMsg.reactions) {
      // Mevcut mesajı güncelle - reaction'ları ekle
      existingMsg.reactions = formattedMsg.reactions;
      if (existingMsg.message) {
        existingMsg.message.reactions = formattedMsg.reactions;
      } else if (formattedMsg.reactions) {
        existingMsg.message = { reactions: formattedMsg.reactions };
      }
    }
  });
  
  // Son N mesajı tut (memory optimization)
  const updated = [...Array.from(existingMap.values()), ...newMessages]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, MESSAGE_STORE_LIMIT);
  
  instance.messagesStore.set(normalized, updated);
  
  // Memory management: Eğer çok fazla chat var ise, eski chat'lerin mesajlarını temizle
  if (instance.messagesStore.size > MESSAGE_STORE_MAX_CHATS) {
    // En eski chat'leri bul ve temizle
    const allChats = Array.from(instance.messagesStore.keys());
    const chatTimestamps = allChats.map(chatJid => {
      const messages = instance.messagesStore.get(chatJid) || [];
      const lastMessage = messages[0]; // Sorted by timestamp desc
      return {
        jid: chatJid,
        timestamp: lastMessage?.timestamp || 0,
      };
    });
    
    // En eski chat'leri sil
    chatTimestamps
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, chatTimestamps.length - MESSAGE_STORE_MAX_CHATS)
      .forEach(({ jid }) => {
        instance.messagesStore.delete(jid);
      });
    
    logger.debug({ 
      sessionId: instance.id, 
      totalChats: allChats.length, 
      removedChats: chatTimestamps.length - MESSAGE_STORE_MAX_CHATS 
    }, "Message store memory optimization yapıldı");
  }
};

/**
 * Mesaj store'dan mesaj al (getMessage config için)
 * Baileys README'ye göre poll votes decrypt ve message retry için gereklidir
 * 
 * README Citation:
 * "If you want to improve sending message, retrying when error occurs 
 * and decrypt poll votes, you need to have a store and set getMessage config"
 * 
 * @param {WAMessageKey} key - Message key to retrieve
 * @param {string} sessionId - Session ID
 * @returns {Promise<WAMessage|null>} - Message object or null if not found
 */
export const getMessageFromStore = async (key, sessionId) => {
  if (!key || !key.remoteJid || !key.id) {
    logger.debug({ key, sessionId }, "Invalid message key for getMessage");
    return null;
  }

  const instance = instances.get(sessionId);
  if (!instance) {
    logger.debug({ sessionId }, "Session not found for getMessage");
    return null;
  }

  const normalized = jidNormalizedUser(key.remoteJid);
  const messages = instance.messagesStore.get(normalized) || [];
  
  // Memory store'dan ara (FAST PATH - O(n) worst case)
  const found = messages.find(m => {
    const msgId = m.key?.id || m.id;
    return msgId === key.id;
  });

  if (found && found.message) {
    logger.debug({ 
      sessionId, 
      messageId: key.id, 
      source: "memory" 
    }, "Message found in memory store");
    
    // Key'i garanti et - found.key varsa onu kullan, yoksa key parametresini kullan
    let messageKey = found.key;
    if (!messageKey || typeof messageKey !== 'object') {
      messageKey = key;
    }
    
    // Eğer hala key yoksa, temel key oluştur
    if (!messageKey || typeof messageKey !== 'object') {
      messageKey = {
        remoteJid: key.remoteJid,
        id: key.id,
        fromMe: false,
      };
    }
    
    // Key property'lerini garanti et
    if (!messageKey.remoteJid) messageKey.remoteJid = key.remoteJid;
    if (!messageKey.id) messageKey.id = key.id;
    if (messageKey.fromMe === undefined || messageKey.fromMe === null) {
      messageKey.fromMe = found.fromMe !== undefined ? Boolean(found.fromMe) : false;
    }
    messageKey.fromMe = Boolean(messageKey.fromMe);
    
    return {
      key: messageKey,
      message: found.message,
      messageTimestamp: found.timestamp || found.messageTimestamp,
    };
  }

  // Memory store'da yoksa Prisma'dan ara (SLOW PATH - Database query)
  try {
    const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
    if (!phoneMapId) {
      logger.warn({ sessionId }, "getMessageFromStore: phoneMapId bulunamadı");
      return null;
    }
    
    logger.debug({ 
      sessionId, 
      messageId: key.id,
      remoteJid: normalized
    }, "Message not in memory, querying database");
    
    const dbMessage = await prisma.message.findFirst({
      where: {
        phoneMapId: phoneMapId,
        remoteJid: normalized,
        id: key.id,
      },
    });

    if (dbMessage) {
      const serialized = serializePrisma(dbMessage);
      
      logger.debug({ 
        sessionId, 
        messageId: key.id, 
        source: "database" 
      }, "Message found in database");
      
      // Key'i parse et ve garanti et
      let messageKey = null;
      if (serialized.key) {
        try {
          messageKey = typeof serialized.key === "string" ? JSON.parse(serialized.key) : serialized.key;
        } catch (e) {
          logger.warn({ error: e.message, sessionId, messageId: key.id }, "Key parse edilemedi, fallback kullanılıyor");
          messageKey = key;
        }
      } else {
        messageKey = key;
      }
      
      // Key'in geçerli olduğundan emin ol
      if (!messageKey || typeof messageKey !== 'object') {
        messageKey = {
          remoteJid: key.remoteJid,
          id: key.id,
          fromMe: false,
        };
      }
      
      // Key property'lerini garanti et
      if (!messageKey.remoteJid) messageKey.remoteJid = key.remoteJid;
      if (!messageKey.id) messageKey.id = key.id;
      if (messageKey.fromMe === undefined || messageKey.fromMe === null) {
        messageKey.fromMe = false;
      }
      messageKey.fromMe = Boolean(messageKey.fromMe);
      
      return {
        key: messageKey,
        message: serialized.message ? (typeof serialized.message === "string" ? JSON.parse(serialized.message) : serialized.message) : null,
        messageTimestamp: Number(serialized.messageTimestamp || 0),
      };
    }
  } catch (error) {
    logger.error({ 
      error, 
      sessionId, 
      key,
      errorMessage: error.message 
    }, "Failed to retrieve message from database");
  }

  logger.debug({ 
    sessionId, 
    messageId: key.id 
  }, "Message not found in store or database");
  
  return null;
};
