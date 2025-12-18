// Disappearing messages functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Geçici mesaj modu ayarla
 */
export const setDisappearingMode = async (accountId, jid, duration) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  if (duration === undefined) {
    throw new Error("duration gereklidir (0 = kapalı, 86400 = 24 saat, vb.)");
  }

  try {
    await sock.setDisappearingMode(normalizedJid, duration);
    return { status: "updated", jid: normalizedJid, duration };
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Disappearing mode ayarlanamadı");
    throw new Error(`Disappearing mode ayarlanamadı: ${error.message}`);
  }
};

/**
 * Geçici mesaj modunu al
 */
export const getDisappearingMode = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  try {
    const mode = await sock.getDisappearingMode(normalizedJid);
    return { status: "success", data: mode };
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Disappearing mode alınamadı");
    throw new Error(`Disappearing mode alınamadı: ${error.message}`);
  }
};



