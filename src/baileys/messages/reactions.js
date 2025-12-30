// Message reaction functions
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Mesaja reaksiyon gönder
 */
export const sendReaction = async (accountId, jid, messageId, emoji) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const sessionId = getAccountId(accountId);

  // Memory store'dan mesajı ara
  const { getMessageFromStore } = await import("../shared.js");
  const msgFromStore = await getMessageFromStore({ remoteJid: normalizedJid, id: messageId }, sessionId);
  
  let key = null;

  if (msgFromStore && msgFromStore.key) {
    // Memory store'dan gelen mesaj key'ini kullan
    key = msgFromStore.key;
  } else {
    // Memory store'da yoksa, messageId'den key oluştur
    // Baileys için minimal key yeterli
    key = {
      remoteJid: normalizedJid,
      id: messageId,
      fromMe: false,
    };
    logger.warn({ sessionId, messageId, normalizedJid }, "Mesaj memory store'da bulunamadı, key oluşturuldu");
  }

  // Key'i garanti et
  if (!key.remoteJid) {
    key.remoteJid = normalizedJid;
  }
  if (!key.id) {
    key.id = messageId;
  }
  if (key.fromMe === undefined) {
    key.fromMe = false;
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
  const sessionId = getAccountId(accountId);

  // Memory store'dan mesajı ara
  const { getMessageFromStore } = await import("../shared.js");
  const msgFromStore = await getMessageFromStore({ remoteJid: normalizedJid, id: messageId }, sessionId);
  
  let key = null;

  if (msgFromStore && msgFromStore.key) {
    // Memory store'dan gelen mesaj key'ini kullan
    key = msgFromStore.key;
  } else {
    // Memory store'da yoksa, messageId'den key oluştur
    key = {
      remoteJid: normalizedJid,
      id: messageId,
      fromMe: false,
    };
    logger.warn({ sessionId, messageId, normalizedJid }, "Mesaj memory store'da bulunamadı, key oluşturuldu");
  }

  // Key'i garanti et
  if (!key.remoteJid) {
    key.remoteJid = normalizedJid;
  }
  if (!key.id) {
    key.id = messageId;
  }
  if (key.fromMe === undefined) {
    key.fromMe = false;
  }

  await sock.sendMessage(normalizedJid, {
    react: {
      text: "",
      key: key,
    },
  });

  return { status: "reaction_removed", messageId };
};







