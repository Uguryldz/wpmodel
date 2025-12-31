// Message management functions (read, delete, star)
import { ensureSocket, normalizeJid, getAccountId, getOrCreateInstance } from "../shared.js";
import { prisma, logger } from "../../shared.js";

/**
 * Mesajları okundu olarak işaretle
 */
export const markMessagesAsRead = async (accountId, jid, messageIds = []) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  if (messageIds.length === 0) {
    // Tüm mesajları okundu işaretle
    const messages = await prisma.message.findMany({
      where: {
        sessionId: getAccountId(accountId),
        remoteJid: normalizedJid,
        key: { not: null },
      },
      take: 100,
    });

    const keys = messages
      .map((m) => {
        try {
          const key = typeof m.key === "string" ? JSON.parse(m.key) : m.key;
          return key;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (keys.length > 0) {
      await sock.readMessages(keys);
    }
  } else {
    // Belirli mesajları okundu işaretle
    const messages = await prisma.message.findMany({
      where: {
        sessionId: getAccountId(accountId),
        remoteJid: normalizedJid,
        id: { in: messageIds },
      },
    });

    const keys = messages
      .map((m) => {
        try {
          const key = typeof m.key === "string" ? JSON.parse(m.key) : m.key;
          return key;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (keys.length > 0) {
      await sock.readMessages(keys);
    }
  }

  return { status: "read", count: messageIds.length || "all" };
};

/**
 * Mesaj sil
 */
export const deleteMessage = async (accountId, jid, messageId, deleteForEveryone = false) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  logger.debug({ sessionId, normalizedJid, messageId, messageIdType: typeof messageId }, "Mesaj silme işlemi başlatılıyor...");

  // Önce id ile ara
  let message = await prisma.message.findFirst({
    where: {
      sessionId,
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  logger.debug({ sessionId, normalizedJid, messageId, foundById: !!message }, "Prisma'da id ile arama sonucu");

  // Bulamazsa, key içinde id ile ara
  if (!message) {
    logger.debug({ sessionId, normalizedJid, messageId }, "Key içinde id ile arama yapılıyor...");
    const allMessages = await prisma.message.findMany({
      where: {
        sessionId,
        remoteJid: normalizedJid,
      },
      take: 1000, // Limit ekle performans için
    });

    logger.debug({ sessionId, normalizedJid, messageId, totalMessages: allMessages.length }, "Tüm mesajlar alındı, key içinde aranıyor...");

    // Key içinde messageId'yi ara
    for (const msg of allMessages) {
      try {
        const key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        const keyId = key?.id;
        const msgId = msg.id;
        
        // Hem key.id hem de msg.id ile karşılaştır
        if (keyId === messageId || msgId === messageId || keyId?.toString() === messageId?.toString() || msgId?.toString() === messageId?.toString()) {
          message = msg;
          logger.debug({ sessionId, normalizedJid, messageId, foundByKey: true, keyId, msgId }, "Mesaj key içinde bulundu!");
          break;
        }
      } catch (error) {
        // Key parse edilemezse devam et
        logger.debug({ sessionId, error: error.message }, "Key parse hatası, devam ediliyor...");
        continue;
      }
    }
  }

  // Hala bulamazsa, memory store'dan ara
  if (!message) {
    logger.debug({ sessionId, normalizedJid, messageId }, "Memory store'da arama yapılıyor...");
    const instance = getOrCreateInstance(accountId);
    const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
    
    logger.debug({ sessionId, normalizedJid, messageId, memoryStoreCount: memoryMessages.length }, "Memory store mesaj sayısı");
    
    const foundMessage = memoryMessages.find(m => {
      const msgId = m.key?.id || m.id;
      return msgId === messageId || msgId?.toString() === messageId?.toString();
    });

    if (foundMessage) {
      logger.debug({ sessionId, normalizedJid, messageId, foundInMemory: true }, "Mesaj memory store'da bulundu!");
      
      // Memory store'dan bulunan mesajı kullan
      // Key'i oluştur
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

      logger.debug({ sessionId, normalizedJid, messageId, key }, "Memory store'dan alınan key");

      // Baileys kaynak koduna göre: content.delete kullanılır
      await sock.sendMessage(normalizedJid, {
        delete: {
          remoteJid: key.remoteJid || normalizedJid,
          id: key.id || messageId,
          fromMe: key.fromMe || false,
        },
      });

      if (deleteForEveryone) {
        // Herkes için sil - fromMe: true ile tekrar gönder
        await sock.sendMessage(normalizedJid, {
          delete: {
            remoteJid: key.remoteJid || normalizedJid,
            id: key.id || messageId,
            fromMe: true,
          },
        });
      }

      logger.info({ sessionId, normalizedJid, messageId, deleteForEveryone }, "✅ Mesaj başarıyla silindi (memory store)");
      return { status: "deleted", messageId, deleteForEveryone };
    }
  }

  if (!message) {
    logger.error({ sessionId, normalizedJid, messageId }, "❌ Mesaj bulunamadı - ne Prisma'da ne de memory store'da");
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

  // Baileys kaynak koduna göre: content.delete kullanılır
  await sock.sendMessage(normalizedJid, {
    delete: {
      remoteJid: key.remoteJid,
      id: key.id,
      fromMe: key.fromMe || false,
    },
  });

  if (deleteForEveryone) {
    // Herkes için sil - fromMe: true ile tekrar gönder
    await sock.sendMessage(normalizedJid, {
      delete: {
        remoteJid: key.remoteJid,
        id: key.id,
        fromMe: true,
      },
    });
  }

  // KVKK uyumlu: Veritabanından veri silinmez, sadece WhatsApp'tan silinir
  logger.info({ 
    sessionId, 
    jid: normalizedJid, 
    messageId: key.id || messageId,
    deleteForEveryone 
  }, "Mesaj silindi (WhatsApp'tan) - KVKK uyumlu (veri silinmedi)");

  return { status: "deleted", messageId: key.id || messageId, deleteForEveryone };
};

/**
 * Mesaj yıldızla/yıldızı kaldır (Star/Unstar a Message)
 * README'ye göre: chatModify star kullanılır
 */
export const starMessage = async (accountId, jid, messageId, star = true, fromMeParam = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Frontend'den gelen fromMe parametresini kullan (öncelikli)
  let fromMe = fromMeParam !== null && fromMeParam !== undefined ? Boolean(fromMeParam) : null;

  // Eğer frontend'den fromMe gelmediyse, memory store'dan ara
  if (fromMe === null) {
    const instance = getOrCreateInstance(accountId);
    const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
    
    logger.debug({ 
      sessionId, 
      messageId, 
      normalizedJid, 
      memoryStoreMessageCount: memoryMessages.length,
      memoryStoreIds: memoryMessages.slice(0, 5).map(m => m.key?.id || m.id)
    }, "Memory store'da mesaj aranıyor (fromMe parametresi yok)...");
    
    const foundMessage = memoryMessages.find(m => {
      const msgId = m.key?.id || m.id;
      return msgId === messageId;
    });
    
    if (foundMessage) {
      if (foundMessage.key) {
        // Memory store'dan gelen mesaj key'ini kullan
        fromMe = foundMessage.key.fromMe !== undefined ? Boolean(foundMessage.key.fromMe) : false;
        logger.debug({ 
          sessionId, 
          messageId, 
          fromMe, 
          normalizedJid,
          key: foundMessage.key
        }, "✅ Mesaj memory store'da bulundu, fromMe değeri alındı");
      } else if (foundMessage.fromMe !== undefined) {
        // Eğer key yoksa ama formatMessage'dan gelen fromMe varsa kullan
        fromMe = Boolean(foundMessage.fromMe);
        logger.debug({ 
          sessionId, 
          messageId, 
          fromMe, 
          normalizedJid 
        }, "✅ Mesaj memory store'da bulundu (key yok ama fromMe var)");
      } else {
        fromMe = false;
        logger.warn({ 
          sessionId, 
          messageId, 
          normalizedJid,
          foundMessage 
        }, "⚠️ Mesaj memory store'da bulundu ama key ve fromMe yok, fromMe: false kullanılıyor");
      }
    } else {
      // Memory store'da yoksa, varsayılan olarak fromMe: false
      fromMe = false;
      logger.warn({ 
        sessionId, 
        messageId, 
        normalizedJid,
        totalMessagesInStore: memoryMessages.length,
        sampleIds: memoryMessages.slice(0, 10).map(m => ({
          id: m.key?.id || m.id,
          fromMe: m.key?.fromMe ?? m.fromMe
        }))
      }, "❌ Mesaj memory store'da bulunamadı! fromMe: false kullanılıyor (bu işlem başarısız olabilir)");
    }
  } else {
    logger.debug({ 
      sessionId, 
      messageId, 
      fromMe, 
      normalizedJid 
    }, "✅ Frontend'den fromMe parametresi alındı");
  }

  // Baileys API'ye göre: chatModify star kullanılır
  // messages dizisi içinde id ve fromMe gerekli
  logger.info({ 
    sessionId, 
    messageId, 
    fromMe, 
    star, 
    normalizedJid 
  }, "Mesaj yıldızlanıyor/yıldızı kaldırılıyor...");

  try {
    await sock.chatModify(
      {
        star: {
          messages: [
            {
              id: messageId,
              fromMe: fromMe,
            },
          ],
          star: star, // true: Star Message; false: Unstar Message
        },
      },
      normalizedJid
    );

    logger.info({ sessionId, messageId, star, normalizedJid }, "✅ Mesaj başarıyla yıldızlandı/yıldızı kaldırıldı");
  } catch (error) {
    logger.error({ error, sessionId, messageId, fromMe, star, normalizedJid }, "❌ Mesaj yıldızlanamadı/yıldızı kaldırılamadı");
    throw error;
  }

  return { status: star ? "starred" : "unstarred", messageId, jid: normalizedJid };
};



