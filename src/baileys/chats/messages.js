// Message listing functions
import { getAccountId, getOrCreateInstance, normalizeJid, formatMessage } from "../shared.js";
import { jidNormalizedUser } from "baileys";
import { prisma, logger } from "../../shared.js";
import { serializePrisma } from "../../utils.js";

/**
 * Mesaj listesi
 */
export const listMessages = async (accountId, jid, cursor, limit = 25) => {
  const sessionId = getAccountId(accountId);
  const normalizedJid = normalizeJid(jid);
  const normalized = jidNormalizedUser(normalizedJid);

  try {
    // Önce memory store'dan kontrol et
    const instance = getOrCreateInstance(accountId);
    let memoryMessages = instance.messagesStore.get(normalized) || [];

    // Memory store'daki mesajları timestamp'e göre sırala (en yeni önce)
    if (memoryMessages.length > 0) {
      memoryMessages = [...memoryMessages].sort((a, b) => {
        const aTime = a.timestamp || a.messageTimestamp || 0;
        const bTime = b.timestamp || b.messageTimestamp || 0;
        return bTime - aTime; // En yeni önce (descending)
      });
    }

    if (memoryMessages.length > 0) {
      // Cursor ile sayfalama
      let startIndex = 0;
      if (cursor) {
        const cursorIndex = memoryMessages.findIndex(m => {
          const msgId = m.id || m.key?.id;
          return msgId === cursor || m.timestamp === Number(cursor);
        });
        if (cursorIndex >= 0) {
          startIndex = cursorIndex + 1;
        }
      }

      const paginatedMessages = memoryMessages
        .slice(startIndex, startIndex + Number(limit));

      // Debug: Reaction'ların korunduğunu kontrol et
      const messagesWithReactions = paginatedMessages.filter(m => m.reactions || m.message?.reactions);
      if (messagesWithReactions.length > 0) {
        logger.debug({ 
          totalMessages: paginatedMessages.length,
          messagesWithReactions: messagesWithReactions.length,
          sampleReactions: messagesWithReactions.slice(0, 3).map(m => ({
            messageId: m.id || m.key?.id,
            reactions: m.reactions || m.message?.reactions
          }))
        }, "Memory store'dan mesajlar döndürülüyor (reaction'lar ile)");
      }

      const nextCursor = 
        memoryMessages.length > startIndex + Number(limit)
          ? (paginatedMessages[paginatedMessages.length - 1]?.id || paginatedMessages[paginatedMessages.length - 1]?.timestamp || null)
          : null;

      return {
        data: paginatedMessages,
        cursor: nextCursor,
      };
    }

    // Memory store'da yoksa veritabanından çek
    // Bugünün başlangıç timestamp'ini hesapla (UTC gece yarısı)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStartTimestamp = Math.floor(today.getTime() / 1000);
    
    // Limit yüksekse (tüm mesajlar isteniyorsa) bugünün mesajlarını da dahil et
    // Limit düşükse (sayfalama varsa) sadece en yeni mesajları çek
    const whereClause = {
      sessionId,
      remoteJid: normalizedJid,
      // Eğer cursor yoksa (ilk sayfa), bugünün mesajlarını da dahil et
      ...(cursor ? {} : {
        OR: [
          { messageTimestamp: { gte: BigInt(todayStartTimestamp) } }, // Bugünün mesajları
          { messageTimestamp: { lt: BigInt(todayStartTimestamp) } },   // Eski mesajlar
        ],
      }),
    };
    
    const messages = await prisma.message.findMany({
      cursor: cursor ? { sessionId_remoteJid_id: { sessionId, remoteJid: normalizedJid, id: cursor } } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: whereClause,
      orderBy: { messageTimestamp: "desc" },
    });

    const serialized = messages.map((m) => serializePrisma(m));
    const formatted = serialized.map(m => {
      try {
        const parsedMessage = m.message ? (typeof m.message === "string" ? JSON.parse(m.message) : m.message) : undefined;
        
        const formattedMsg = formatMessage({
          key: m.key ? (typeof m.key === "string" ? JSON.parse(m.key) : m.key) : {
            remoteJid: m.remoteJid,
            id: m.id,
            fromMe: false,
          },
          message: parsedMessage,
          messageTimestamp: Number(m.messageTimestamp || 0),
        });
        
        // Reaction'ları ekle - önce ayrı reactions field'ını kontrol et, sonra message.reactions'ı
        let reactions = null;
        
        // 1. Prisma'dan gelen ayrı reactions field'ını kontrol et
        if (m.reactions) {
          try {
            reactions = typeof m.reactions === "string" ? JSON.parse(m.reactions) : m.reactions;
          } catch (reactionError) {
            logger.warn({ error: reactionError, messageId: m.id }, "Reaction parse edilemedi (reactions field)");
          }
        }
        
        // 2. Eğer ayrı reactions field'ı yoksa, message.reactions'ı kontrol et
        if (!reactions && parsedMessage?.reactions) {
          reactions = parsedMessage.reactions;
        }
        
        // 3. Reaction'ları ekle
        if (reactions) {
          formattedMsg.reactions = reactions;
          // message.reactions'ı da güncelle (tutarlılık için)
          if (formattedMsg.message) {
            formattedMsg.message.reactions = reactions;
          }
        }
        
        return formattedMsg;
      } catch (error) {
        logger.error({ error, messageId: m.id }, "Mesaj formatlanamadı");
        return null;
      }
    }).filter(Boolean);

    // Formatlanmış mesajları timestamp'e göre sırala (en yeni önce)
    formatted.sort((a, b) => {
      const aTime = a.timestamp || a.messageTimestamp || 0;
      const bTime = b.timestamp || b.messageTimestamp || 0;
      return bTime - aTime; // En yeni önce (descending)
    });

    const nextCursor =
      serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].id
        : null;

    return {
      data: formatted,
      cursor: nextCursor,
    };
  } catch (error) {
    logger.error({ error, sessionId, jid: normalizedJid }, "Mesaj listesi alınamadı");
    return { data: [], cursor: null };
  }
};

/**
 * Mesaj listesi (cursor ile)
 */
export const listMessagesWithCursor = async (accountId, jid, cursor, limit = 20) => {
  return listMessages(accountId, jid, cursor, limit);
};








