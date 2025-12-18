// Chat management functions (archive, pin, mute)
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { prisma, logger } from "../../shared.js";

/**
 * Sohbeti arşivle/kaldır
 */
export const archiveChat = async (accountId, jid, archive = true) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.chatModify({ archive: archive }, normalizedJid);

  // Veritabanını güncelle
  try {
    await prisma.chat.updateMany({
      where: {
        sessionId: getAccountId(accountId),
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
 */
export const muteChat = async (accountId, jid, muteDuration = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  if (muteDuration === null) {
    // Sessizliği kaldır
    await sock.chatModify({ mute: null }, normalizedJid);
  } else {
    // Sessize al (muteDuration saniye cinsinden)
    const muteUntil = new Date(Date.now() + muteDuration * 1000);
    await sock.chatModify({ mute: muteUntil }, normalizedJid);
  }

  return { 
    status: muteDuration === null ? "unmuted" : "muted", 
    jid: normalizedJid,
    muteDuration 
  };
};



