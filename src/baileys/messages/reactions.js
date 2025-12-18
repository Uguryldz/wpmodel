// Message reaction functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { prisma } from "../../shared.js";
import { getAccountId } from "../shared.js";

/**
 * Mesaja reaksiyon gönder
 */
export const sendReaction = async (accountId, jid, messageId, emoji) => {
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

  await sock.sendMessage(normalizedJid, {
    react: {
      text: emoji,
      key: key,
    },
  });

  return { status: "reacted", messageId, emoji };
};

/**
 * Reaksiyonu kaldır
 */
export const removeReaction = async (accountId, jid, messageId) => {
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

  await sock.sendMessage(normalizedJid, {
    react: {
      text: "",
      key: key,
    },
  });

  return { status: "reaction_removed", messageId };
};



