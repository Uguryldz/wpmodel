// Chat history functions
import { ensureSocket, normalizeJid, getAccountId, getOrCreateInstance } from "../shared.js";
import { downloadHistory } from "baileys";
import { prisma, logger } from "../../shared.js";

/**
 * Chat geçmişi indir
 */
export const downloadChatHistory = async (accountId, historySyncNotification, options = {}) => {
  const sock = ensureSocket(accountId);

  if (!historySyncNotification) {
    throw new Error("historySyncNotification gereklidir");
  }

  try {
    const history = await downloadHistory(historySyncNotification, options);
    return { status: "success", data: history };
  } catch (error) {
    logger.error({ error, accountId }, "Chat geçmişi indirilemedi");
    throw new Error(`Chat geçmişi indirilemedi: ${error.message}`);
  }
};

/**
 * Query Chat History (groups too) - README'ye göre
 * You need to have oldest message in chat
 * Messages will be received in messaging.history-set event
 */
export const queryChatHistory = async (accountId, jid, quantity = 50, oldestMessage = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Eğer oldestMessage verilmemişse, en eski mesajı bul
  if (!oldestMessage) {
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        remoteJid: normalizedJid,
      },
      orderBy: { messageTimestamp: 'asc' },
      take: 1,
    });

    if (messages.length > 0) {
      const msg = messages[0];
      try {
        const key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        oldestMessage = {
          key: key,
          messageTimestamp: Number(msg.messageTimestamp),
        };
      } catch (error) {
        logger.error({ error, accountId, jid }, "En eski mesaj parse edilemedi");
        throw new Error("En eski mesaj bulunamadı");
      }
    } else {
      throw new Error("Chat'te mesaj bulunamadı");
    }
  }

  // README'ye göre: fetchMessageHistory kullanılır
  // quantity: max 50 per query
  const maxQuantity = Math.min(quantity, 50);
  
  await sock.fetchMessageHistory(
    maxQuantity,
    oldestMessage.key,
    oldestMessage.messageTimestamp
  );

  // Mesajlar messaging.history-set event'inde gelecek
  // Bu fonksiyon sadece isteği gönderir, sonuçlar event'ten gelecek
  return { 
    status: "requested", 
    jid: normalizedJid,
    quantity: maxQuantity,
    message: "Mesajlar messaging.history-set event'inde gelecek"
  };
};



