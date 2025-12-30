// Privacy settings functions
import { ensureSocket, getAccountId } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Gizlilik ayarlarını al (README'ye göre fetchPrivacySettings)
 */
export const getPrivacySettings = async (accountId) => {
  const sock = ensureSocket(accountId);

  try {
    // README'de fetchPrivacySettings(true) olarak geçiyor
    const settings = await sock.fetchPrivacySettings(true);
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
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");

  if (!settings || typeof settings !== "object") {
    throw new Error("Settings objesi zorunludur");
  }

  try {
    await sock.updatePrivacySettings(settings);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settings,
      });
    }
    
    return { status: "updated", message: "Gizlilik ayarları güncellendi", settings };
  } catch (error) {
    logger.error({ error, accountId }, "Privacy settings güncellenemedi");
    throw new Error(`Privacy settings güncellenemedi: ${error.message}`);
  }
};

/**
 * LastSeen gizlilik ayarını güncelle (README'ye göre)
 */
export const updateLastSeenPrivacy = async (accountId, value) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateLastSeenPrivacy(value);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settingType: "lastSeen",
        value,
      });
    }
    
    return { status: "success", message: "LastSeen gizlilik ayarı güncellendi", data: { lastSeen: value } };
  } catch (error) {
    logger.error({ error, accountId, value }, "LastSeen gizlilik ayarı güncellenemedi");
    throw error;
  }
};

/**
 * Online gizlilik ayarını güncelle (README'ye göre)
 */
export const updateOnlinePrivacy = async (accountId, value) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateOnlinePrivacy(value);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settingType: "online",
        value,
      });
    }
    
    return { status: "success", message: "Online gizlilik ayarı güncellendi", data: { online: value } };
  } catch (error) {
    logger.error({ error, accountId, value }, "Online gizlilik ayarı güncellenemedi");
    throw error;
  }
};

/**
 * Profile Picture gizlilik ayarını güncelle (README'ye göre)
 */
export const updateProfilePicturePrivacy = async (accountId, value) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateProfilePicturePrivacy(value);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settingType: "profilePicture",
        value,
      });
    }
    
    return { status: "success", message: "Profile Picture gizlilik ayarı güncellendi", data: { profilePicture: value } };
  } catch (error) {
    logger.error({ error, accountId, value }, "Profile Picture gizlilik ayarı güncellenemedi");
    throw error;
  }
};

/**
 * Status gizlilik ayarını güncelle (README'ye göre)
 */
export const updateStatusPrivacy = async (accountId, value) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateStatusPrivacy(value);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settingType: "status",
        value,
      });
    }
    
    return { status: "success", message: "Status gizlilik ayarı güncellendi", data: { status: value } };
  } catch (error) {
    logger.error({ error, accountId, value }, "Status gizlilik ayarı güncellenemedi");
    throw error;
  }
};

/**
 * Read Receipts gizlilik ayarını güncelle (README'ye göre)
 */
export const updateReadReceiptsPrivacy = async (accountId, value) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateReadReceiptsPrivacy(value);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settingType: "readReceipts",
        value,
      });
    }
    
    return { status: "success", message: "Read Receipts gizlilik ayarı güncellendi", data: { readReceipts: value } };
  } catch (error) {
    logger.error({ error, accountId, value }, "Read Receipts gizlilik ayarı güncellenemedi");
    throw error;
  }
};

/**
 * Groups Add gizlilik ayarını güncelle (README'ye göre)
 */
export const updateGroupsAddPrivacy = async (accountId, value) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateGroupsAddPrivacy(value);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settingType: "groupsAdd",
        value,
      });
    }
    
    return { status: "success", message: "Groups Add gizlilik ayarı güncellendi", data: { groupsAdd: value } };
  } catch (error) {
    logger.error({ error, accountId, value }, "Groups Add gizlilik ayarı güncellenemedi");
    throw error;
  }
};

/**
 * Default Disappearing Mode gizlilik ayarını güncelle (README'ye göre)
 */
export const updateDefaultDisappearingMode = async (accountId, ephemeral) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateDefaultDisappearingMode(ephemeral);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "privacy.update",
        sessionId,
        settingType: "defaultDisappearingMode",
        ephemeral,
      });
    }
    
    return { status: "success", message: "Default Disappearing Mode gizlilik ayarı güncellendi", data: { ephemeral } };
  } catch (error) {
    logger.error({ error, accountId, ephemeral }, "Default Disappearing Mode gizlilik ayarı güncellenemedi");
    throw error;
  }
};







