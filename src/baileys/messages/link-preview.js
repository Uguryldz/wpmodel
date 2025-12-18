// Link preview functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { getUrlInfo, generateLinkPreviewIfRequired, extractUrlFromText } from "baileys";
import { logger } from "../../shared.js";

/**
 * Link preview al
 */
export const getLinkPreview = async (url) => {
  if (!url || typeof url !== "string") {
    throw new Error("URL zorunludur");
  }

  try {
    const urlInfo = await getUrlInfo(url);
    return { status: "success", data: urlInfo };
  } catch (error) {
    logger.error({ error, url }, "Link preview çekilemedi");
    throw new Error(`Link preview çekilemedi: ${error.message}`);
  }
};

/**
 * Mesaj gönderirken link preview ekleme
 */
export const sendMessageWithPreview = async (accountId, jid, text) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  if (!text || typeof text !== "string") {
    throw new Error("Mesaj metni zorunludur");
  }

  try {
    // URL'yi metinden çıkar
    const url = extractUrlFromText(text);
    
    if (!url) {
      // URL yoksa normal mesaj gönder
      await sock.sendMessage(normalizedJid, { text });
      return { status: "sent", message: "Mesaj gönderildi (link preview yok)" };
    }

    // URL varsa link preview ile gönder
    const messageContent = await generateLinkPreviewIfRequired(
      sock,
      { text },
      { url }
    );

    await sock.sendMessage(normalizedJid, messageContent);
    return { status: "sent", message: "Mesaj link preview ile gönderildi", url };
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Mesaj link preview ile gönderilemedi");
    throw new Error(`Mesaj link preview ile gönderilemedi: ${error.message}`);
  }
};



