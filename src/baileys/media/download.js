// Media download functions
import { downloadContentFromMessage, downloadMediaMessage } from "baileys";
import { ensureSocket } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Mesaj medyasını indir
 */
export const downloadMessageMedia = async (accountId, message, mediaType) => {
  if (!message || !mediaType) {
    throw new Error("Medya indirmek için message ve mediaType alanları zorunludur.");
  }

  // mediaType: 'image' | 'video' | 'audio' | 'document' vb.
  const stream = await downloadContentFromMessage(message, mediaType);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  return buffer.toString("base64");
};

/**
 * Gelişmiş medya mesajı indirme
 */
export const downloadMediaMessageAdvanced = async (accountId, message) => {
  if (!message) {
    throw new Error("message objesi gereklidir");
  }

  const sock = ensureSocket(accountId);

  try {
    const result = await downloadMediaMessage(
      message,
      'stream',
      {},
      { 
        logger: logger, 
        reuploadRequest: sock.updateMediaMessage 
      }
    );

    const chunks = [];
    for await (const chunk of result) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    return { 
      status: "success", 
      data: buffer.toString("base64"),
      buffer: buffer
    };
  } catch (error) {
    logger.error({ error, accountId }, "Gelişmiş medya indirme başarısız");
    throw new Error(`Gelişmiş medya indirme başarısız: ${error.message}`);
  }
};



