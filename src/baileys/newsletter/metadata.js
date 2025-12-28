// Newsletter metadata functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Newsletter metadata al
 */
export const getNewsletterMetadata = async (accountId, newsletterJid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(newsletterJid);

  try {
    const metadata = await sock.getNewsletterMetadata(normalizedJid);
    return { status: "success", data: metadata };
  } catch (error) {
    logger.error({ error, accountId, newsletterJid: normalizedJid }, "Newsletter metadata alınamadı");
    throw new Error(`Newsletter metadata alınamadı: ${error.message}`);
  }
};







