// Device transfer functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Cihaz transfer et
 */
export const transferDevice = async (accountId, targetJid, options = {}) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(targetJid);

  try {
    await sock.transferDevice(normalizedJid, options);
    return { status: "success", message: "Cihaz transfer edildi", targetJid: normalizedJid };
  } catch (error) {
    logger.error({ error, accountId, targetJid: normalizedJid }, "Cihaz transfer edilemedi");
    throw new Error(`Cihaz transfer edilemedi: ${error.message}`);
  }
};





