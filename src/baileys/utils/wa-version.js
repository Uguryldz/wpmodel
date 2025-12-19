// WA Web version utility functions
import { 
  fetchLatestWaWebVersion,
  generateMessageID,
  generateMessageIDV2,
  chatModificationToAppPatch,
} from "baileys";
import { logger } from "../../shared.js";

/**
 * En son WA Web versiyonunu al
 */
export const fetchLatestWaWebVersionUtil = async () => {
  try {
    const version = await fetchLatestWaWebVersion();
    return { status: "success", data: version };
  } catch (error) {
    logger.error({ error }, "WA Web versiyonu alınamadı");
    throw new Error(`WA Web versiyonu alınamadı: ${error.message}`);
  }
};

/**
 * Mesaj ID oluştur
 */
export const generateMessageIDUtil = () => {
  try {
    const messageId = generateMessageID();
    return { status: "success", data: messageId };
  } catch (error) {
    logger.error({ error }, "Mesaj ID oluşturulamadı");
    throw new Error(`Mesaj ID oluşturulamadı: ${error.message}`);
  }
};

/**
 * Mesaj ID V2 oluştur
 */
export const generateMessageIDV2Util = (userId) => {
  if (!userId) {
    throw new Error("userId gereklidir");
  }

  try {
    const messageId = generateMessageIDV2(userId);
    return { status: "success", data: messageId };
  } catch (error) {
    logger.error({ error }, "Mesaj ID V2 oluşturulamadı");
    throw new Error(`Mesaj ID V2 oluşturulamadı: ${error.message}`);
  }
};

/**
 * Chat modification'ı app patch'e çevir
 */
export const chatModificationToAppPatchUtil = (modification) => {
  if (!modification) {
    throw new Error("modification gereklidir");
  }

  try {
    const patch = chatModificationToAppPatch(modification);
    return { status: "success", data: patch };
  } catch (error) {
    logger.error({ error }, "Chat modification app patch'e çevrilemedi");
    throw new Error(`Chat modification app patch'e çevrilemedi: ${error.message}`);
  }
};




