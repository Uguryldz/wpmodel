// Message editing functions (reply, forward, edit)
import { ensureSocket, normalizeJid, getAccountId, getOrCreateInstance } from "../shared.js";
import { generateForwardMessageContent } from "baileys";
import { prisma, logger } from "../../shared.js";

/**
 * Mesaj yanıtla (reply)
 */
export const replyToMessage = async (accountId, jid, messageId, replyMessage) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Önce memory store'dan kontrol et
  const instance = getOrCreateInstance(accountId);
  let key = null;

  // Memory store'dan mesajı bul
  const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
  const memoryMsg = memoryMessages.find(m => (m.id || m.key?.id) === messageId);
  
  if (memoryMsg) {
    if (memoryMsg.key) {
      key = memoryMsg.key;
    } else if (memoryMsg.id) {
      key = {
        remoteJid: normalizedJid,
        id: memoryMsg.id,
        fromMe: memoryMsg.fromMe || false,
      };
    }
  }

  // Memory store'da yoksa DB'den kontrol et
  if (!key) {
    const dbMessage = await prisma.message.findFirst({
      where: {
        sessionId,
        remoteJid: normalizedJid,
        id: messageId,
      },
    });

    if (!dbMessage) {
      throw new Error("Yanıtlanacak mesaj bulunamadı");
    }

    try {
      key = typeof dbMessage.key === "string" ? JSON.parse(dbMessage.key) : dbMessage.key;
    } catch (error) {
      logger.error({ error, messageId }, "Mesaj anahtarı parse edilemedi");
      key = {
        remoteJid: normalizedJid,
        id: messageId,
        fromMe: false,
      };
    }
  }

  // Key'i garanti et - undefined kontrolü
  if (!key) {
    key = {
      remoteJid: normalizedJid,
      id: messageId,
      fromMe: false,
    };
  }

  if (!key.remoteJid) {
    key.remoteJid = normalizedJid;
  }

  if (!key.id) {
    key.id = messageId;
  }

  // fromMe kontrolü - undefined ise false yap
  if (key.fromMe === undefined) {
    key.fromMe = false;
  }

  let messageContent;
  if (typeof replyMessage === "string") {
    messageContent = { text: replyMessage };
  } else {
    messageContent = replyMessage;
  }

  try {
    await sock.sendMessage(normalizedJid, messageContent, {
      quoted: key,
    });
  } catch (error) {
    logger.error({ error, jid: normalizedJid, messageId, key }, "Mesaj yanıtlanamadı");
    throw new Error(`Mesaj yanıtlanamadı: ${error.message}`);
  }

  return { status: "replied", messageId, jid: normalizedJid };
};

/**
 * Mesaj ilet (forward)
 */
export const forwardMessage = async (accountId, fromJid, toJid, messageId) => {
  const sock = ensureSocket(accountId);
  const normalizedFromJid = normalizeJid(fromJid);
  const normalizedToJid = normalizeJid(toJid);

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedFromJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("İletilecek mesaj bulunamadı");
  }

  let msgData;
  try {
    msgData = typeof message.message === "string" ? JSON.parse(message.message) : message.message;
  } catch {
    throw new Error("Mesaj verisi geçersiz");
  }

  if (!msgData) {
    throw new Error("Mesaj içeriği bulunamadı");
  }

  // Baileys kaynak koduna göre: generateForwardMessageContent kullanılır
  const forwardContent = generateForwardMessageContent(msgData, false);
  await sock.sendMessage(normalizedToJid, forwardContent);

  return { status: "forwarded", messageId, from: normalizedFromJid, to: normalizedToJid };
};

/**
 * Mesaj düzenle (edit)
 */
export const editMessage = async (accountId, jid, messageId, newMessage) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Önce memory store'dan kontrol et
  const instance = getOrCreateInstance(accountId);
  let key = null;

  // Memory store'dan mesajı bul (esnek ID karşılaştırması)
  const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
  logger.info({ 
    messageId, 
    normalizedJid, 
    memoryMessagesCount: memoryMessages.length,
    firstFewIds: memoryMessages.slice(0, 5).map(m => ({ 
      id: m.id, 
      keyId: m.key?.id,
      fromMe: m.fromMe 
    }))
  }, "Memory store'dan mesaj aranıyor...");
  
  const memoryMsg = memoryMessages.find(m => {
    const msgId = String(m.id || m.key?.id || '');
    const searchId = String(messageId || '');
    // Hem tam eşleşme hem de string/number karşılaştırması
    return msgId === searchId || msgId === String(searchId) || String(msgId) === searchId;
  });
  
  if (memoryMsg) {
    logger.info({ 
      memoryMsg: { 
        id: memoryMsg.id, 
        keyId: memoryMsg.key?.id, 
        fromMe: memoryMsg.fromMe,
        key: memoryMsg.key 
      } 
    }, "✅ Mesaj memory store'da bulundu");
    
    // Baileys dokümantasyonuna göre: edit için orijinal key'i direkt kullanmalıyız
    // Key'i mümkün olduğunca değiştirmeden kullan
    if (memoryMsg.key) {
      // Orijinal key'i direkt kullan, sadece gerekli alanları garanti et
      key = {
        ...memoryMsg.key, // Tüm özellikleri koru
        remoteJid: memoryMsg.key.remoteJid || normalizedJid,
        // id'yi değiştirme, orijinal formatını koru
        id: memoryMsg.key.id || memoryMsg.id,
        fromMe: memoryMsg.key.fromMe !== undefined ? Boolean(memoryMsg.key.fromMe) : (memoryMsg.fromMe !== undefined ? Boolean(memoryMsg.fromMe) : true),
      };
    } else if (memoryMsg.id) {
      // Key yoksa, id'den oluştur ama orijinal formatını koru
      key = {
        remoteJid: normalizedJid,
        id: memoryMsg.id, // String'e çevirme, orijinal formatını koru
        fromMe: memoryMsg.fromMe !== undefined ? Boolean(memoryMsg.fromMe) : true,
      };
    }
    
    const msgFromMe = memoryMsg.fromMe !== undefined ? Boolean(memoryMsg.fromMe) : (key?.fromMe || false);
    if (!msgFromMe && !key.fromMe) {
      throw new Error("Sadece kendi mesajlarını düzenleyebilirsin");
    }
    
    // fromMe'yi garanti et ama key'in diğer özelliklerini koru
    if (key) {
      key.fromMe = true; // Düzenleme için mutlaka true olmalı
    }
  }

  // Memory store'da yoksa DB'den kontrol et (esnek ID araması)
  if (!key) {
    logger.info({ messageId, sessionId, normalizedJid }, "Memory store'da bulunamadı, DB'den aranıyor...");
    
    // Önce tam eşleşme dene
    let message = await prisma.message.findFirst({
      where: {
        sessionId,
        remoteJid: normalizedJid,
        id: messageId,
      },
    });

    // Tam eşleşme yoksa, string/number karşılaştırması yap
    if (!message && !isNaN(messageId)) {
      message = await prisma.message.findFirst({
        where: {
          sessionId,
          remoteJid: normalizedJid,
          OR: [
            { id: messageId },
            { id: String(messageId) },
            { id: Number(messageId).toString() },
          ],
        },
      });
    }

    // Hala bulunamadıysa, key içinde ara
    if (!message) {
      const allMessages = await prisma.message.findMany({
        where: {
          sessionId,
          remoteJid: normalizedJid,
        },
        take: 100, // Son 100 mesajı kontrol et
        orderBy: { messageTimestamp: 'desc' },
      });

      for (const msg of allMessages) {
        try {
          const msgKey = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
          if (msgKey && (String(msgKey.id) === String(messageId) || String(msg.id) === String(messageId))) {
            message = msg;
            break;
          }
        } catch (e) {
          // Parse hatası, devam et
        }
      }
    }

    if (!message) {
      logger.error({ 
        messageId, 
        sessionId, 
        normalizedJid,
        memoryMessagesCount: memoryMessages.length,
        dbMessageCount: await prisma.message.count({ where: { sessionId, remoteJid: normalizedJid } })
      }, "❌ Düzenlenecek mesaj bulunamadı");
      throw new Error(`Düzenlenecek mesaj bulunamadı (ID: ${messageId})`);
    }

    logger.info({ messageId: message.id, key: message.key }, "✅ Mesaj DB'de bulundu");

    try {
      key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
      if (!key) {
        // Key yoksa message.id'den oluştur
        key = {
          remoteJid: normalizedJid,
          id: message.id, // Orijinal formatını koru (String'e çevirme)
          fromMe: true,
        };
      } else {
        // Key varsa, orijinal formatını koru
        key = {
          ...key, // Tüm özellikleri koru
          remoteJid: key.remoteJid || normalizedJid,
          id: key.id || message.id, // Orijinal id formatını koru
          fromMe: true, // Düzenleme için mutlaka true olmalı
        };
      }
    } catch (error) {
      logger.error({ error, messageId }, "Mesaj anahtarı parse edilemedi, yeni key oluşturuluyor");
      key = {
        remoteJid: normalizedJid,
        id: message.id, // Orijinal formatını koru
        fromMe: true,
      };
    }

    if (!key.fromMe) {
      throw new Error("Sadece kendi mesajlarını düzenleyebilirsin");
    }
  }

  // Key'i garanti et
  if (!key || !key.remoteJid) {
    key = {
      ...key,
      remoteJid: normalizedJid,
      id: messageId,
      fromMe: true,
    };
  }

  // Key'in id'sini garanti et
  if (!key.id) {
    key.id = messageId;
  }

  // Key'in fromMe'sini garanti et (düzenleme için mutlaka true olmalı)
  if (key.fromMe !== true) {
    key.fromMe = true;
  }

  let messageContent;
  if (typeof newMessage === "string") {
    messageContent = { text: newMessage };
  } else {
    messageContent = newMessage;
  }

  try {
    // Baileys dokümantasyonuna göre: edit option'ına mesajın key'ini göndermek gerekiyor
    if (!key || !key.id || !key.remoteJid) {
      throw new Error(`Mesaj key'i eksik: ${JSON.stringify(key)}`);
    }
    
    // Baileys dokümantasyonuna göre: edit option'ına response.key gönderilmeli
    // Dokümantasyonda: await sock.sendMessage(jid, { text: 'updated text goes here' }, { edit: response.key })
    // 
    // ÖNEMLİ: Key'deki ekstra alanlar (remoteJidAlt, participant, addressingMode) edit işlemini bozuyor olabilir
    // Sadece temel alanları kullan: remoteJid, id, fromMe
    // Participant sadece grup mesajları için gerekli ve o zaman da doğru formatta olmalı
    
    // Temel key formatını oluştur - sadece gerekli alanlar
    const editKey = {
      remoteJid: key.remoteJid || normalizedJid,
      id: key.id,
      fromMe: true, // Düzenleme için mutlaka true olmalı
    };
    
    // Participant sadece grup mesajları için ve boş değilse ekle
    // Ama boş string değilse ekle
    if (key.participant && key.participant.trim() !== '') {
      editKey.participant = key.participant;
    }
    
    logger.info({ 
      editKey, 
      originalKey: key, 
      jid: normalizedJid, 
      messageId, 
      messageContent,
      keyType: typeof key.id,
      keyIdValue: key.id,
      keyStructure: JSON.stringify(key),
      editKeyStructure: JSON.stringify(editKey)
    }, "Mesaj düzenleniyor...");
    
    // Baileys dokümantasyonuna göre: edit option'ı message content içinde kullanılmalı
    // Dokümantasyonda: await sock.sendMessage(jid, { text: 'updated text goes here', edit: response.key })
    // 
    // ÖNEMLİ: Dokümantasyonda edit message content içinde gösterilmiş, options içinde değil!
    // Bu yüzden messageContent içine edit ekleyelim
    
    // Message content'e edit ekle
    const messageWithEdit = {
      ...messageContent,
      edit: editKey, // Edit key'ini message content içine ekle
    };
    
    let result;
    try {
      // Dokümantasyonda gösterildiği gibi: edit message content içinde
      result = await sock.sendMessage(normalizedJid, messageWithEdit);
      
      // Eğer result içinde yeni bir key.id varsa (editKey.id'den farklı), edit çalışmadı demektir
      if (result && result.key && result.key.id && result.key.id !== editKey.id) {
        logger.warn({ 
          editKeyId: editKey.id, 
          resultKeyId: result.key.id,
          originalKeyId: key.id,
          message: "Edit işlemi yeni mesaj gönderdi, edit çalışmadı"
        }, "⚠️ Edit işlemi başarısız, yeni mesaj gönderildi");
        
        // Baileys'in edit API'si çalışmıyor, hata fırlat
        throw new Error(`Baileys edit API'si çalışmıyor - mesaj düzenlenemedi. Edit key ID: ${editKey.id}, Yeni mesaj ID: ${result.key.id}`);
      }
      
      // Edit başarılı - result.key.id === editKey.id
      logger.info({ 
        result, 
        jid: normalizedJid, 
        messageId,
        editKey,
        editSuccess: result && result.key && result.key.id === editKey.id
      }, "✅ Mesaj başarıyla düzenlendi");
    } catch (error) {
      // Edit işlemi başarısız oldu
      logger.error({ 
        error: error.message,
        editKey,
        originalKey: key,
        stack: error.stack
      }, "❌ Edit işlemi başarısız");
      throw error;
    }
    
    return { status: "edited", messageId, jid: normalizedJid, result };
  } catch (error) {
    logger.error({ 
      error: error.message, 
      stack: error.stack,
      jid: normalizedJid, 
      messageId, 
      key,
      normalizedJid 
    }, "❌ Mesaj düzenlenemedi");
    throw new Error(`Mesaj düzenlenemedi: ${error.message}`);
  }

  return { status: "edited", messageId, jid: normalizedJid };
};



