// Privacy settings functions
import { ensureSocket } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Gizlilik ayarlarını al
 */
export const getPrivacySettings = async (accountId) => {
  const sock = ensureSocket(accountId);

  try {
    const settings = await sock.getPrivacySettings();
    return { status: "success", data: settings };
  } catch (error) {
    logger.error({ error, accountId }, "Privacy settings alınamadı");
    throw new Error(`Privacy settings alınamadı: ${error.message}`);
  }
};

/**
 * Gizlilik ayarlarını güncelle
 */
export const updatePrivacySettings = async (accountId, settings) => {
  const sock = ensureSocket(accountId);

  if (!settings || typeof settings !== "object") {
    throw new Error("Settings objesi zorunludur");
  }

  try {
    await sock.updatePrivacySettings(settings);
    return { status: "updated", message: "Gizlilik ayarları güncellendi", settings };
  } catch (error) {
    logger.error({ error, accountId }, "Privacy settings güncellenemedi");
    throw new Error(`Privacy settings güncellenemedi: ${error.message}`);
  }
};




