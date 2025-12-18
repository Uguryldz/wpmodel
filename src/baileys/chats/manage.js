// Chat management functions (archive, pin, mute)
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { prisma, logger } from "../../shared.js";

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
        const key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        lastMessage = {
          key: key,
          messageTimestamp: Number(msg.messageTimestamp),
        };
      } catch (error) {
        logger.error({ error, accountId, jid }, "Son mesaj parse edilemedi");
        // Son mesaj bulunamazsa boş key ile dene
        lastMessage = {
          key: { remoteJid: normalizedJid, id: '', fromMe: false },
          messageTimestamp: Date.now(),
        };
      }
    } else {
      // Mesaj yoksa boş key ile dene
      lastMessage = {
        key: { remoteJid: normalizedJid, id: '', fromMe: false },
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
        const key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        lastMessage = {
          key: key,
          messageTimestamp: Number(msg.messageTimestamp),
        };
      } catch (error) {
        logger.error({ error, accountId, jid }, "Son mesaj parse edilemedi");
        throw new Error("Son mesaj bulunamadı");
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

  // Mesajı bul
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

  // README'ye göre: chatModify clear kullanılır
  await sock.chatModify(
    {
      clear: {
        messages: [
          {
            id: messageId,
            fromMe: fromMe !== undefined ? fromMe : (key.fromMe || false),
            timestamp: String(message.messageTimestamp || Date.now()),
          },
        ],
      },
    },
    normalizedJid
  );

  // Prisma'dan sil
  await prisma.message.deleteMany({
    where: {
      sessionId,
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  return { status: "deleted_for_me", messageId, jid: normalizedJid };
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
        const key = typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key;
        lastMessage = {
          key: key,
          messageTimestamp: Number(msg.messageTimestamp),
        };
      } catch (error) {
        logger.error({ error, accountId, jid }, "Son mesaj parse edilemedi");
        throw new Error("Son mesaj bulunamadı");
      }
    } else {
      // Mesaj yoksa boş key ile dene
      lastMessage = {
        key: { remoteJid: normalizedJid, id: '', fromMe: false },
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

  // Prisma'dan chat ve mesajları sil
  await Promise.all([
    prisma.chat.deleteMany({
      where: {
        sessionId,
        id: normalizedJid,
      },
    }),
    prisma.message.deleteMany({
      where: {
        sessionId,
        remoteJid: normalizedJid,
      },
    }),
  ]);

  return { status: "deleted", jid: normalizedJid };
};



