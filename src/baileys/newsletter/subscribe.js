// Newsletter subscription functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Newsletter'a abone ol
 */
export const subscribeToNewsletter = async (accountId, newsletterJid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(newsletterJid);

  try {
    await sock.subscribeToNewsletter(normalizedJid);
    return { status: "subscribed", newsletterJid: normalizedJid };
  } catch (error) {
    logger.error({ error, accountId, newsletterJid: normalizedJid }, "Newsletter'a abone olunamadı");
    throw new Error(`Newsletter'a abone olunamadı: ${error.message}`);
  }
};

/**
 * Newsletter aboneliğini iptal et
 */
export const unsubscribeFromNewsletter = async (accountId, newsletterJid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(newsletterJid);

  try {
    await sock.unsubscribeFromNewsletter(normalizedJid);
    return { status: "unsubscribed", newsletterJid: normalizedJid };
  } catch (error) {
    logger.error({ error, accountId, newsletterJid: normalizedJid }, "Newsletter aboneliği iptal edilemedi");
    throw new Error(`Newsletter aboneliği iptal edilemedi: ${error.message}`);
  }
};

/**
 * Newsletter aboneliklerini listele
 */
export const getNewsletterSubscriptions = async (accountId) => {
  const sock = ensureSocket(accountId);

  try {
    const subscriptions = await sock.getNewsletterSubscriptions();
    return { status: "success", data: subscriptions };
  } catch (error) {
    logger.error({ error, accountId }, "Newsletter abonelikleri alınamadı");
    throw new Error(`Newsletter abonelikleri alınamadı: ${error.message}`);
  }
};







