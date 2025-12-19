// Shared constants and helper functions for Baileys modules
import { jidNormalizedUser, isJidBroadcast } from "baileys";
import { prisma, logger } from "../shared.js";
import { serializePrisma } from "../utils.js";

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

export const normalizeJid = (value) => {
  if (!value || typeof value !== "string") {
    throw new Error("Alıcı (jid) değeri zorunludur.");
  }

  if (value.includes("@")) {
    return value;
  }

  const suffix = value.includes("-") ? "@g.us" : "@s.whatsapp.net";
  return `${value}${suffix}`;
};

// Instance management
export const getOrCreateInstance = (accountId) => {
  const id = getAccountId(accountId);
  if (!instances.has(id)) {
    instances.set(id, {
      id,
      sock: null,
      authState: null,
      saveCredsFn: null,
      waVersion: null,
      reconnectTimer: null,
      chatsStore: new Map(),
      contactsStore: new Map(),
      messagesStore: new Map(),
      chatsSetReceived: false,
      chatsUpsertTimer: null,
      syncChatsInterval: null,
      syncChatsTimeout: null,
      connectionTimers: [],
      eventListeners: new Map(),
      connectionState: {
        status: "initializing",
        version: null,
        isLatest: null,
        lastError: null,
        lastQr: null,
        qrGeneratedAt: null,
        startedAt: null,
      },
    });
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
    message: msg.message,
    key: msg.key,
    messageStubType: messageStubType || null,
    messageStubParameters: messageStubParameters || null,
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

// Message saving functions
export const saveMessagesToPrisma = async (sessionId, messages = []) => {
  if (!messages.length) return;

  for (const msg of messages) {
    if (!msg.key?.remoteJid || !msg.key?.id) continue;
    if (isJidBroadcast(msg.key.remoteJid)) continue;

    try {
      await prisma.message.upsert({
        where: {
          sessionId_remoteJid_id: {
            sessionId,
            remoteJid: msg.key.remoteJid,
            id: msg.key.id,
          },
        },
        create: {
          sessionId,
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
    } catch (error) {
      logger.error({ error, sessionId, msgId: msg.key.id }, "Mesaj kaydedilemedi");
    }
  }
};

export const saveMessages = (instance, jid, messages = []) => {
  if (!jid) return;
  const normalized = jidNormalizedUser(jid);
  const existing = instance.messagesStore.get(normalized) || [];
  
  const existingIds = new Set(
    existing.map(m => m.key?.id || m.id || `${m.timestamp || m.messageTimestamp || 0}-${m.from || ''}`)
  );
  
  const formatted = messages.map(formatMessage);
  const newMessages = formatted.filter(msg => {
    const msgId = msg.key?.id || msg.id || `${msg.timestamp || msg.messageTimestamp || 0}-${msg.from || ''}`;
    return !existingIds.has(msgId);
  });
  
  const updated = [...existing, ...newMessages].slice(-200);
  instance.messagesStore.set(normalized, updated);
};

/**
 * Mesaj store'dan mesaj al (getMessage config için)
 * Baileys README'ye göre poll votes decrypt için gereklidir
 */
export const getMessageFromStore = async (key, sessionId) => {
  if (!key || !key.remoteJid || !key.id) {
    return null;
  }

  const instance = instances.get(sessionId);
  if (!instance) {
    return null;
  }

  const normalized = jidNormalizedUser(key.remoteJid);
  const messages = instance.messagesStore.get(normalized) || [];
  
  // Memory store'dan ara
  const found = messages.find(m => {
    const msgId = m.key?.id || m.id;
    return msgId === key.id;
  });

  if (found && found.message) {
    return {
      key: found.key || key,
      message: found.message,
      messageTimestamp: found.timestamp || found.messageTimestamp,
    };
  }

  // Memory store'da yoksa Prisma'dan ara
  try {
    const dbMessage = await prisma.message.findFirst({
      where: {
        sessionId,
        remoteJid: normalized,
        id: key.id,
      },
    });

    if (dbMessage) {
      const serialized = serializePrisma(dbMessage);
      return {
        key: serialized.key ? (typeof serialized.key === "string" ? JSON.parse(serialized.key) : serialized.key) : key,
        message: serialized.message ? (typeof serialized.message === "string" ? JSON.parse(serialized.message) : serialized.message) : null,
        messageTimestamp: Number(serialized.messageTimestamp || 0),
      };
    }
  } catch (error) {
    logger.error({ error, sessionId, key }, "Mesaj store'dan alınamadı");
  }

  return null;
};
