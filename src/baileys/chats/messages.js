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
    const memoryMessages = instance.messagesStore.get(normalized) || [];

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
        .slice(startIndex, startIndex + Number(limit))
        .reverse(); // En yeni mesajlar önce

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
    const messages = await prisma.message.findMany({
      cursor: cursor ? { sessionId_remoteJid_id: { sessionId, remoteJid: normalizedJid, id: cursor } } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: { sessionId, remoteJid: normalizedJid },
      orderBy: { messageTimestamp: "desc" },
    });

    const serialized = messages.map((m) => serializePrisma(m));
    const formatted = serialized.map(m => {
      try {
        return formatMessage({
          key: m.key ? (typeof m.key === "string" ? JSON.parse(m.key) : m.key) : {
            remoteJid: m.remoteJid,
            id: m.id,
            fromMe: false,
          },
          message: m.message ? (typeof m.message === "string" ? JSON.parse(m.message) : m.message) : undefined,
          messageTimestamp: Number(m.messageTimestamp || 0),
        });
      } catch (error) {
        logger.error({ error, messageId: m.id }, "Mesaj formatlanamadı");
        return null;
      }
    }).filter(Boolean);

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





