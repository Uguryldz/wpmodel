// Device utility functions
import { 
  addTransactionCapability,
  extractDeviceJids,
  getDevice,
  getPlatformId,
} from "baileys";
import { logger } from "../../shared.js";
import { ensureSocket } from "../shared.js";

/**
 * Transaction capability ekle
 */
export const addTransactionCapabilityUtil = async (accountId, options = {}) => {
  const sock = ensureSocket(accountId);

  try {
    await addTransactionCapability(sock, options);
    return { status: "success", message: "Transaction capability eklendi" };
  } catch (error) {
    logger.error({ error, accountId }, "Transaction capability eklenemedi");
    throw new Error(`Transaction capability eklenemedi: ${error.message}`);
  }
};

/**
 * Device JID'lerini çıkar
 */
export const extractDeviceJidsUtil = (jid, includeSelf = false) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }

  try {
    const deviceJids = extractDeviceJids(jid, includeSelf);
    return { status: "success", data: deviceJids };
  } catch (error) {
    logger.error({ error, jid }, "Device JID'leri çıkarılamadı");
    throw new Error(`Device JID'leri çıkarılamadı: ${error.message}`);
  }
};

/**
 * Device bilgisi al
 */
export const getDeviceUtil = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }

  try {
    const device = getDevice(jid);
    return { status: "success", data: device };
  } catch (error) {
    logger.error({ error, jid }, "Device bilgisi alınamadı");
    throw new Error(`Device bilgisi alınamadı: ${error.message}`);
  }
};

/**
 * Platform ID al
 */
export const getPlatformIdUtil = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }

  try {
    const platformId = getPlatformId(jid);
    return { status: "success", data: platformId };
  } catch (error) {
    logger.error({ error, jid }, "Platform ID alınamadı");
    throw new Error(`Platform ID alınamadı: ${error.message}`);
  }
};







