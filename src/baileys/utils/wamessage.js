// WAMessage utility functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { 
  generateWAMessage, 
  generateWAMessageContent, 
  generateWAMessageFromContent 
} from "baileys";
import { logger } from "../../shared.js";

/**
 * WA Mesaj oluştur
 */
export const generateWAMessageUtil = async (accountId, jid, content, options = {}) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  try {
    const message = await generateWAMessage(normalizedJid, content, options);
    return { status: "success", data: message };
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "WA mesaj oluşturulamadı");
    throw new Error(`WA mesaj oluşturulamadı: ${error.message}`);
  }
};

/**
 * WA Mesaj içeriği oluştur
 */
export const generateWAMessageContentUtil = async (message, options = {}) => {
  try {
    const content = await generateWAMessageContent(message, options);
    return { status: "success", data: content };
  } catch (error) {
    logger.error({ error }, "WA mesaj içeriği oluşturulamadı");
    throw new Error(`WA mesaj içeriği oluşturulamadı: ${error.message}`);
  }
};

/**
 * İçerikten WA Mesaj oluştur
 */
export const generateWAMessageFromContentUtil = (jid, message, options = {}) => {
  try {
    const normalizedJid = normalizeJid(jid);
    const waMessage = generateWAMessageFromContent(normalizedJid, message, options);
    return { status: "success", data: waMessage };
  } catch (error) {
    logger.error({ error, jid }, "İçerikten WA mesaj oluşturulamadı");
    throw new Error(`İçerikten WA mesaj oluşturulamadı: ${error.message}`);
  }
};





