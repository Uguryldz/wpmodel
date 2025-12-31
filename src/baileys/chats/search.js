// Message search functions
import { getAccountId, normalizeJid } from "../shared.js";
import { prisma, logger, getPhoneMapIdFromSessionId } from "../../shared.js";
import { serializePrisma } from "../../utils.js";

/**
 * Mesaj ara
 */
export const searchMessages = async (
  accountId,
  query,
  jid = null,
  limit = 50,
  cursor = null
) => {
  if (!query) {
    throw new Error("Arama sorgusu gereklidir.");
  }

  const sessionId = getAccountId(accountId);
  const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
  if (!phoneMapId) {
    logger.warn({ sessionId }, "searchMessages: phoneMapId bulunamadı");
    return { data: [], cursor: null, query };
  }
  
  const where = {
    phoneMapId: phoneMapId,
    isDeleted: false, // Silinen mesajları filtrele
    message: {
      contains: query,
      mode: "insensitive",
    },
  };

  if (jid) {
    where.remoteJid = normalizeJid(jid);
  }

  try {
    const messages = await prisma.message.findMany({
      where,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { phoneMapId_remoteJid_id: { phoneMapId: phoneMapId, remoteJid: jid || "", id: cursor } } : undefined,
      orderBy: { messageTimestamp: "desc" },
    });

    const serialized = messages.map((m) => serializePrisma(m));
    const formatted = serialized.map(m => {
      try {
        const key = m.key ? (typeof m.key === "string" ? JSON.parse(m.key) : m.key) : {
          remoteJid: m.remoteJid,
          id: m.id,
          fromMe: false,
        };
        const message = m.message ? (typeof m.message === "string" ? JSON.parse(m.message) : m.message) : undefined;
        
        return {
          id: m.id,
          from: m.remoteJid,
          fromMe: key.fromMe || false,
          timestamp: Number(m.messageTimestamp || 0),
          text: message?.conversation || message?.extendedTextMessage?.text || null,
          message: message,
          key: key,
        };
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
      query,
    };
  } catch (error) {
    logger.error({ error, sessionId, query }, "Mesaj arama hatası");
    return { data: [], cursor: null, query };
  }
};







