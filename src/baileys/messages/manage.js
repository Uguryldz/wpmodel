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

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("Mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
  } catch {
    throw new Error("Mesaj anahtarı geçersiz");
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

  // Prisma'dan sil
  await prisma.message.deleteMany({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  return { status: "deleted", messageId, deleteForEveryone };
};

/**
 * Mesaj yıldızla/yıldızı kaldır (Star/Unstar a Message)
 * README'ye göre: chatModify star kullanılır
 */
export const starMessage = async (accountId, jid, messageId, star = true) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  const message = await prisma.message.findFirst({
    where: {
      sessionId,
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("Mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
  } catch {
    throw new Error("Mesaj anahtarı geçersiz");
  }

  // README'ye göre: chatModify star kullanılır
  await sock.chatModify(
    {
      star: {
        messages: [
          {
            id: messageId,
            fromMe: key.fromMe || false,
          },
        ],
        star: star, // true: Star Message; false: Unstar Message
      },
    },
    normalizedJid
  );

  return { status: star ? "starred" : "unstarred", messageId, jid: normalizedJid };
};



