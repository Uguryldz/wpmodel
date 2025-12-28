// Business profile functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Business profil bilgilerini al
 */
export const getBusinessProfile = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  try {
    const profile = await sock.getBusinessProfile(normalizedJid);
    return { status: "success", data: profile };
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Business profil alınamadı");
    throw new Error(`Business profil alınamadı: ${error.message}`);
  }
};





