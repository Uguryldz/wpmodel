// Chat management functions (archive, pin, mute)
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { prisma, logger, getPhoneMapIdFromSessionId } from "../../shared.js";

/**
 * Sohbeti arşivle/kaldır (Archive a Chat)
 * README'ye göre: lastMsgInChat gereklidir
 */
export const archiveChat = async (accountId, jid, archive = true, lastMessage = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Eğer lastMessage verilmemişse, en son mesajı bul
  if (!lastMessage) {
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        remoteJid: normalizedJid,
      },
      orderBy: { messageTimestamp: 'desc' },
      take: 1,
    });

    if (messages.length > 0) {
      const msg = messages[0];
      try {
        let key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        
        // Key'in tam olması gerekiyor: remoteJid, id, fromMe
        if (!key || !key.id) {
          key = {
            remoteJid: normalizedJid,
            id: msg.id || '',
            fromMe: key?.fromMe || false,
          };
        }
        
        // Key'in remoteJid'i eksikse ekle
        if (!key.remoteJid) {
          key.remoteJid = normalizedJid;
        }
        
        lastMessage = {
          key: key,
          messageTimestamp: Number(msg.messageTimestamp),
        };
      } catch (error) {
        logger.error({ error, accountId, jid }, "Son mesaj parse edilemedi");
        // Hata durumunda mesaj ID'sini kullan
        lastMessage = {
          key: {
            remoteJid: normalizedJid,
            id: msg.id || '',
            fromMe: false,
          },
          messageTimestamp: Number(msg.messageTimestamp || Date.now()),
        };
      }
    } else {
      // Mesaj yoksa boş key ile dene
      lastMessage = {
        key: { 
          remoteJid: normalizedJid, 
          id: '', 
          fromMe: false 
        },
        messageTimestamp: Date.now(),
      };
    }
  }

  // README'ye göre: chatModify archive kullanılır, lastMessages gereklidir
  await sock.chatModify({ archive: archive, lastMessages: [lastMessage] }, normalizedJid);

  // Veritabanını güncelle
  try {
    await prisma.chat.updateMany({
      where: {
        sessionId,
        id: normalizedJid,
      },
      data: {
        archived: archive,
      },
    });
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Chat arşivleme veritabanında güncellenemedi");
  }

  return { status: archive ? "archived" : "unarchived", jid: normalizedJid };
};

/**
 * Sohbeti sabitle/kaldır (pin)
 */
export const pinChat = async (accountId, jid, pin = true) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.chatModify({ pin: pin }, normalizedJid);

  // Veritabanını güncelle
  try {
    await prisma.chat.updateMany({
      where: {
        sessionId: getAccountId(accountId),
        id: normalizedJid,
      },
      data: {
        pinned: pin ? new Date() : null,
      },
    });
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Chat pin veritabanında güncellenemedi");
  }

  return { status: pin ? "pinned" : "unpinned", jid: normalizedJid };
};

/**
 * Sohbeti sessize al/kaldır (mute)
 * README'ye göre: Supported times - Remove: null, 8h: 86.400.000, 7d: 604.800.000 (milliseconds)
 * Note: Baileys API'ye göre mute değeri milliseconds cinsinden number olmalı
 */
export const muteChat = async (accountId, jid, muteDurationMs = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  // README'ye göre: muteDurationMs milliseconds cinsinden number olmalı
  // null ise sessizliği kaldır, değilse milliseconds cinsinden süre (number)
  // Örnek: 8h = 86400000, 7d = 604800000
  await sock.chatModify({ mute: muteDurationMs }, normalizedJid);

  return { 
    status: muteDurationMs === null ? "unmuted" : "muted", 
    jid: normalizedJid,
    muteDurationMs 
  };
};

/**
 * Sohbeti okundu/okunmadı olarak işaretle (Mark Chat Read/Unread)
 * README'ye göre: lastMsgInChat gereklidir
 */
export const markChatRead = async (accountId, jid, markRead = true, lastMessage = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Eğer lastMessage verilmemişse, en son mesajı bul
  if (!lastMessage) {
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        remoteJid: normalizedJid,
      },
      orderBy: { messageTimestamp: 'desc' },
      take: 1,
    });

    if (messages.length > 0) {
      const msg = messages[0];
      try {
        let key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        
        // Key'in tam olması gerekiyor: remoteJid, id, fromMe
        if (!key || !key.id) {
          key = {
            remoteJid: normalizedJid,
            id: msg.id || '',
            fromMe: key?.fromMe || false,
          };
        }
        
        // Key'in remoteJid'i eksikse ekle
        if (!key.remoteJid) {
          key.remoteJid = normalizedJid;
        }
        
        lastMessage = {
          key: key,
          messageTimestamp: Number(msg.messageTimestamp),
        };
      } catch (error) {
        logger.error({ error, accountId, jid }, "Son mesaj parse edilemedi");
        // Hata durumunda mesaj ID'sini kullan
        lastMessage = {
          key: {
            remoteJid: normalizedJid,
            id: msg.id || '',
            fromMe: false,
          },
          messageTimestamp: Number(msg.messageTimestamp || Date.now()),
        };
      }
    } else {
      throw new Error("Chat'te mesaj bulunamadı");
    }
  }

  await sock.chatModify({ markRead: markRead, lastMessages: [lastMessage] }, normalizedJid);

  return { status: markRead ? "read" : "unread", jid: normalizedJid };
};

/**
 * Mesajı sadece benim için sil (Delete Message for Me)
 * README'ye göre: chatModify clear kullanılır
 */
export const deleteMessageForMe = async (accountId, jid, messageId, fromMe = false) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  logger.debug({ sessionId, normalizedJid, messageId }, "Mesaj sadece benden siliniyor (deleteMessageForMe)...");

  // phoneMapId'yi al
  const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
  if (!phoneMapId) {
    logger.warn({ sessionId }, "deleteMessageForMe: phoneMapId bulunamadı");
    throw new Error("phoneMapId bulunamadı");
  }

  // Önce id ile ara
  let message = await prisma.message.findFirst({
    where: {
      phoneMapId: phoneMapId,
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  // Bulamazsa, key içinde id ile ara
  if (!message) {
    logger.debug({ sessionId, normalizedJid, messageId }, "Key içinde id ile arama yapılıyor...");
    const allMessages = await prisma.message.findMany({
      where: {
        phoneMapId: phoneMapId,
        remoteJid: normalizedJid,
      },
      take: 1000,
    });

    for (const msg of allMessages) {
      try {
        const key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        const keyId = key?.id;
        const msgId = msg.id;
        
        if (keyId === messageId || msgId === messageId || keyId?.toString() === messageId?.toString() || msgId?.toString() === messageId?.toString()) {
          message = msg;
          logger.debug({ sessionId, normalizedJid, messageId, foundByKey: true }, "Mesaj key içinde bulundu!");
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Hala bulamazsa, memory store'dan ara
  if (!message) {
    logger.debug({ sessionId, normalizedJid, messageId }, "Memory store'da arama yapılıyor...");
    const { getOrCreateInstance } = await import("../shared.js");
    const instance = getOrCreateInstance(accountId);
    const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
    
    const foundMessage = memoryMessages.find(m => {
      const msgId = m.key?.id || m.id;
      return msgId === messageId || msgId?.toString() === messageId?.toString();
    });

    if (foundMessage) {
      logger.debug({ sessionId, normalizedJid, messageId, foundInMemory: true }, "Mesaj memory store'da bulundu!");
      
      const key = foundMessage.key || {
        remoteJid: normalizedJid,
        id: foundMessage.id || messageId,
        fromMe: foundMessage.fromMe || false,
      };

      // Key'in tam olması gerekiyor
      if (!key.remoteJid) {
        key.remoteJid = normalizedJid;
      }
      if (!key.id) {
        key.id = foundMessage.id || messageId;
      }

      // fromMe: mesajın kimden geldiğini belirtir (benim gönderdiğim mesaj ise true, karşı tarafın gönderdiği ise false)
      // ÖNEMLİ: Bu işlem sadece BENİM cihazımdan siler, karşı tarafa müdahale etmez
      const actualFromMe = fromMe !== undefined ? fromMe : (foundMessage.fromMe !== undefined ? foundMessage.fromMe : (key.fromMe !== undefined ? key.fromMe : false));
      let messageTimestamp = foundMessage.messageTimestamp || foundMessage.timestamp || Date.now();
      
      // Timestamp'i saniye cinsine çevir (README'de saniye cinsinden string)
      if (messageTimestamp > 1000000000000) {
        messageTimestamp = Math.floor(messageTimestamp / 1000);
      }
      const timestampStr = String(messageTimestamp);
      const actualMessageId = String(key.id || messageId);

      // README'ye göre: chatModify clear kullanılır
      await sock.chatModify(
        {
          clear: {
            messages: [
              {
                id: actualMessageId,
                fromMe: actualFromMe,
                timestamp: timestampStr,
              },
            ],
          },
        },
        normalizedJid
      );

      // KVKK uyumlu: Veritabanında isDeleted=true ve deleteType="delete_for_me" yap (memory store'dan bulunan mesaj için)
      if (phoneMapId) {
        const actualMessageId = key.id || messageId;
        await prisma.message.updateMany({
          where: {
            phoneMapId: phoneMapId,
            remoteJid: normalizedJid,
            OR: [
              { id: actualMessageId },
              { key: { path: ['id'], equals: actualMessageId } },
            ],
          },
          data: {
            isDeleted: true,
            deleteType: "delete_for_me", // Sadece benden sil
          },
        });
        logger.info({ sessionId, normalizedJid, messageId: actualMessageId }, "Mesaj veritabanında işaretlendi (isDeleted=true, deleteType=delete_for_me) - KVKK uyumlu (memory store)");
      }

      logger.info({ sessionId, normalizedJid, messageId }, "✅ Mesaj başarıyla silindi (memory store, deleteMessageForMe)");
      return { status: "deleted_for_me", messageId, jid: normalizedJid };
    }
  }

  if (!message) {
    logger.error({ sessionId, normalizedJid, messageId }, "❌ Mesaj bulunamadı (deleteMessageForMe)");
    throw new Error("Mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
    
    // Key'in tam olması gerekiyor
    if (!key || !key.id) {
      key = {
        remoteJid: normalizedJid,
        id: message.id || messageId,
        fromMe: key?.fromMe || false,
      };
    }
    
    // Key'in remoteJid'i eksikse ekle
    if (!key.remoteJid) {
      key.remoteJid = normalizedJid;
    }
  } catch {
    // Key parse edilemezse, mesaj ID'sini kullan
    key = {
      remoteJid: normalizedJid,
      id: message.id || messageId,
      fromMe: false,
    };
  }

  // README'ye göre: chatModify clear kullanılır
  // id: key.id kullanılmalı (WhatsApp mesaj ID'si - string)
  // fromMe: mesajın kimden geldiğini belirtir (benim gönderdiğim mesaj ise true, karşı tarafın gönderdiği ise false)
  // timestamp: string (Unix timestamp saniye cinsinden)
  // ÖNEMLİ: Bu işlem sadece BENİM cihazımdan siler, karşı tarafa müdahale etmez
  const actualFromMe = fromMe !== undefined ? fromMe : (key.fromMe !== undefined ? key.fromMe : false);
  const actualMessageId = String(key.id || messageId); // README'ye göre string olmalı
  
  // Timestamp'i saniye cinsine çevir (README'de saniye cinsinden string)
  let messageTimestamp = message.messageTimestamp || Date.now();
  // Eğer milisaniye cinsindeyse saniyeye çevir
  if (messageTimestamp > 1000000000000) {
    messageTimestamp = Math.floor(messageTimestamp / 1000);
  }
  const timestampStr = String(messageTimestamp);

  logger.debug({ 
    sessionId, 
    normalizedJid, 
    messageId, 
    actualMessageId, 
    actualFromMe, 
    timestampStr,
    originalTimestamp: message.messageTimestamp
  }, "chatModify clear çağrılıyor (README formatına göre)...");

  await sock.chatModify(
    {
      clear: {
        messages: [
          {
            id: actualMessageId,
            fromMe: actualFromMe,
            timestamp: timestampStr,
          },
        ],
      },
    },
    normalizedJid
  );

  logger.info({ sessionId, normalizedJid, messageId, actualMessageId, actualFromMe, timestampStr }, "✅ Mesaj başarıyla silindi (deleteMessageForMe)");

  // KVKK uyumlu: Veritabanından veri silinmez, sadece isDeleted=true ve deleteType="delete_for_me" yapılır
  if (phoneMapId) {
    await prisma.message.updateMany({
      where: {
        phoneMapId: phoneMapId,
        remoteJid: normalizedJid,
        id: messageId,
      },
      data: {
        isDeleted: true,
        deleteType: "delete_for_me", // Sadece benden sil
      },
    });
    logger.info({ sessionId, normalizedJid, messageId }, "Mesaj veritabanında işaretlendi (isDeleted=true, deleteType=delete_for_me) - KVKK uyumlu");
  }

  return { status: "deleted_for_me", messageId, jid: normalizedJid };
};

/**
 * Sohbet mesajlarını herkesten sil (Clear Chat Messages for Everyone)
 * README'ye göre: chatModify clear kullanılır, tüm mesajları temizler
 */
export const clearChat = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Tüm mesajları al
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      remoteJid: normalizedJid,
    },
    orderBy: { messageTimestamp: 'asc' },
  });

  if (messages.length === 0) {
    return { status: "no_messages", jid: normalizedJid };
  }

  // Mesajları clear formatına çevir (README'ye göre: id, fromMe, timestamp)
  const clearMessages = messages.map((msg) => {
    let key;
    try {
      key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
    } catch {
      key = { remoteJid: normalizedJid, id: msg.id || '', fromMe: false };
    }

    // Mesaj ID'sini key'den veya msg.id'den al
    const messageId = key?.id || msg.id || '';
    
    // Eğer messageId boşsa bu mesajı atla
    if (!messageId) {
      return null;
    }

    return {
      id: messageId,
      fromMe: key?.fromMe || false,
      timestamp: String(msg.messageTimestamp || Date.now()),
    };
  }).filter(msg => msg !== null); // null olanları filtrele

  // Eğer temizlenecek mesaj yoksa
  if (clearMessages.length === 0) {
    return { status: "no_messages", jid: normalizedJid };
  }

  // README'ye göre: chatModify clear kullanılır
  await sock.chatModify(
    {
      clear: {
        messages: clearMessages,
      },
    },
    normalizedJid
  );

  // KVKK uyumlu: Veritabanından veri silinmez, sadece WhatsApp'tan silinir
  logger.info({ 
    sessionId, 
    jid: normalizedJid, 
    messageCount: messages.length 
  }, "Chat temizlendi (WhatsApp'tan) - KVKK uyumlu (veri silinmedi)");

  return { status: "cleared", jid: normalizedJid, messageCount: messages.length };
};

/**
 * Sohbeti sil (Delete a Chat)
 * README'ye göre: chatModify delete kullanılır, lastMessage gereklidir
 */
export const deleteChat = async (accountId, jid, lastMessage = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Eğer lastMessage verilmemişse, en son mesajı bul
  if (!lastMessage) {
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        remoteJid: normalizedJid,
      },
      orderBy: { messageTimestamp: 'desc' },
      take: 1,
    });

    if (messages.length > 0) {
      const msg = messages[0];
      try {
        let key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        
        // Key'in tam olması gerekiyor: remoteJid, id, fromMe
        if (!key || !key.id) {
          // Eğer key'de id yoksa, mesajın id'sini kullan
          key = {
            remoteJid: normalizedJid,
            id: msg.id || '',
            fromMe: key?.fromMe || false,
          };
        }
        
        // Key'in remoteJid'i eksikse ekle
        if (!key.remoteJid) {
          key.remoteJid = normalizedJid;
        }
        
        lastMessage = {
          key: key,
          messageTimestamp: Number(msg.messageTimestamp),
        };
      } catch (error) {
        logger.error({ error, accountId, jid }, "Son mesaj parse edilemedi");
        // Hata durumunda mesaj ID'sini kullan
        lastMessage = {
          key: {
            remoteJid: normalizedJid,
            id: msg.id || '',
            fromMe: false,
          },
          messageTimestamp: Number(msg.messageTimestamp || Date.now()),
        };
      }
    } else {
      // Mesaj yoksa boş key ile dene
      lastMessage = {
        key: { 
          remoteJid: normalizedJid, 
          id: '', 
          fromMe: false 
        },
        messageTimestamp: Date.now(),
      };
    }
  }

  // README'ye göre: chatModify delete kullanılır
  await sock.chatModify(
    {
      delete: true,
      lastMessages: [lastMessage],
    },
    normalizedJid
  );

  // KVKK uyumlu: Veritabanından veri silinmez, sadece WhatsApp'tan silinir
  logger.info({ 
    sessionId, 
    jid: normalizedJid 
  }, "Chat silindi (WhatsApp'tan) - KVKK uyumlu (veri silinmedi)");

  return { status: "deleted", jid: normalizedJid };
};

/**
 * Disappearing Messages ayarla (Geçici Mesajlar)
 * README'ye göre: sendMessage ile disappearingMessagesInChat kullanılır
 * duration: seconds cinsinden (0 = kapalı, 86400 = 24h, 604800 = 7d, 7776000 = 90d)
 */
export const setDisappearingMessages = async (accountId, jid, duration = 0) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  // README'ye göre: duration 0 ise kapalı, değilse seconds cinsinden
  // false = kapalı, number = seconds cinsinden süre
  const disappearingValue = duration === 0 ? false : duration;

  await sock.sendMessage(normalizedJid, {
    disappearingMessagesInChat: disappearingValue,
  });

  return {
    status: disappearingValue === false ? "disabled" : "enabled",
    jid: normalizedJid,
    duration: disappearingValue === false ? 0 : duration,
  };
};



