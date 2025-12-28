// Media utility functions
import { 
  prepareWAMessageMedia,
  getMediaKeys,
  mediaMessageSHA256B64,
  extensionForMediaMessage,
  decryptPollVote,
} from "baileys";
import { logger } from "../../shared.js";
import { ensureSocket } from "../shared.js";

/**
 * Medya mesajı hazırla
 */
export const prepareMediaMessage = async (accountId, media, mediaType, options = {}) => {
  const sock = ensureSocket(accountId);

  if (!media || !mediaType) {
    throw new Error("media ve mediaType gereklidir");
  }

  try {
    const buffer = Buffer.isBuffer(media) ? media : Buffer.from(media, "base64");
    const prepared = await prepareWAMessageMedia({ [mediaType]: buffer }, { upload: sock }, options);
    return { status: "success", data: prepared };
  } catch (error) {
    logger.error({ error, accountId }, "Medya mesajı hazırlanamadı");
    throw new Error(`Medya mesajı hazırlanamadı: ${error.message}`);
  }
};

/**
 * Medya şifreleme anahtarlarını al
 */
export const getMediaDecryptionKeys = async (buffer, mediaType) => {
  if (!buffer || !mediaType) {
    throw new Error("buffer ve mediaType gereklidir");
  }

  try {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, "base64");
    const keys = await getMediaKeys(buf, mediaType);
    return { status: "success", data: keys };
  } catch (error) {
    logger.error({ error }, "Medya şifreleme anahtarları alınamadı");
    throw new Error(`Medya şifreleme anahtarları alınamadı: ${error.message}`);
  }
};

/**
 * Medya hash hesapla
 */
export const calculateMediaHash = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const hash = mediaMessageSHA256B64(message);
    return { status: "success", data: hash };
  } catch (error) {
    logger.error({ error }, "Medya hash hesaplanamadı");
    throw new Error(`Medya hash hesaplanamadı: ${error.message}`);
  }
};

/**
 * Medya uzantısını al
 */
export const getMediaExtension = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const ext = extensionForMediaMessage(message);
    return { status: "success", data: ext };
  } catch (error) {
    logger.error({ error }, "Medya uzantısı alınamadı");
    throw new Error(`Medya uzantısı alınamadı: ${error.message}`);
  }
};

/**
 * Anket oyu şifresini çöz
 */
export const decryptPollVoteUtil = (vote, ctx) => {
  if (!vote || !ctx) {
    throw new Error("vote ve ctx gereklidir");
  }

  try {
    const decrypted = decryptPollVote(vote, ctx);
    return { status: "success", data: decrypted };
  } catch (error) {
    logger.error({ error }, "Anket oyu şifresi çözülemedi");
    throw new Error(`Anket oyu şifresi çözülemedi: ${error.message}`);
  }
};





