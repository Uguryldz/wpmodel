// Contact profile functions
import { ensureSocket, normalizeJid, getAccountId, getOrCreateInstance } from "../shared.js";
import { prisma, logger, getPhoneMapIdFromSessionId } from "../../shared.js";

/**
 * Numara kontrolü (WhatsApp'ta var mı)
 */
export const checkNumber = async (accountId, jidOrNumber) => {
  const sock = ensureSocket(accountId);
  const jid = normalizeJid(jidOrNumber);
  const [info] = await sock.onWhatsApp(jid);
  return info || null;
};

/**
 * Profil resmi al
 */
export const getProfilePicture = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(jid);
  const isGroup = normalized.includes('@g.us');
  const sessionId = getAccountId(accountId);
  
  // ÖNCE DB'den kontrol et
  try {
    if (!isGroup) {
      const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
      if (phoneMapId) {
        const contact = await prisma.contact.findUnique({
          where: {
            phoneMapId_id: {
              phoneMapId: phoneMapId,
              id: normalized,
            },
          },
        });
        if (contact?.imgUrl) {
          return contact.imgUrl;
        }
      }
    }
  } catch (dbError) {
    logger.debug({ error: dbError, accountId, jid }, "DB'den profil fotoğrafı kontrol edilemedi");
  }
  
  // DB'de yoksa, bağlantı açıksa API'den dene
  try {
    const instance = getOrCreateInstance(accountId);
    if (instance.connectionState.status !== "open") {
      return null;
    }
    
    const url = await sock.profilePictureUrl(normalized, "image");
    if (url) {
      // API'den alınan profil resmini DB'ye kaydet (bireysel sohbet için)
      if (!isGroup) {
        try {
          const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
          if (phoneMapId) {
            await prisma.contact.upsert({
              where: {
                phoneMapId_id: {
                  phoneMapId: phoneMapId,
                  id: normalized,
                },
              },
              create: {
                phoneMapId: phoneMapId,
                id: normalized,
                imgUrl: url,
              },
              update: {
                imgUrl: url,
              },
            });
          }
        } catch (updateError) {
          logger.debug({ error: updateError, accountId, jid }, "Profil fotoğrafı DB'ye kaydedilemedi");
        }
      }
      return url;
    }
    return null;
  } catch (error) {
    if (error?.data === 404 || error?.output?.statusCode === 404 || 
        error?.data === 401 || error?.output?.statusCode === 401 ||
        error?.message?.includes('not-authorized') ||
        error?.message?.includes('item-not-found')) {
      return null;
    }
    logger.error({ error, accountId, jid }, "Profil fotoğrafı alınamadı");
    return null;
  }
};

/**
 * Contact'ları yenile
 */
export const refreshContacts = async (accountId, { clearDb = true } = {}) => {
  const sessionId = getAccountId(accountId);
  const instance = getOrCreateInstance(accountId);

  // Cache ve memory store temizle
  contactsCache.delete(sessionId);
  instance.contactsStore.clear();

  // İstenirse DB de temizle
  if (clearDb) {
    try {
      const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
      if (phoneMapId) {
        await prisma.contact.deleteMany({ where: { phoneMapId: phoneMapId } });
      }
    } catch (error) {
      logger.error({ error, sessionId }, "Contact tablosu temizlenemedi");
    }
  }

  // Soketi yeniden senkrona zorla
  if (instance.sock) {
    try {
      instance.sock.ws.close();
    } catch (error) {
      logger.error({ error, sessionId }, "Socket kapatılamadı (contacts refresh)");
    }
  } else {
    const { initBaileys } = await import("../core/session.js");
    await initBaileys(sessionId);
  }

  return { status: "refreshing" };
};

/**
 * Profil durumu güncelle (README'ye göre)
 */
export const updateProfileStatus = async (accountId, status) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateProfileStatus(status);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "profile.update",
        sessionId,
        updateType: "status",
        status,
      });
    }
    
    return { status: "success", message: "Profil durumu güncellendi", data: { status } };
  } catch (error) {
    logger.error({ error, accountId, status }, "Profil durumu güncellenemedi");
    throw error;
  }
};

/**
 * Profil adı güncelle (README'ye göre)
 */
export const updateProfileName = async (accountId, name) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.updateProfileName(name);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "profile.update",
        sessionId,
        updateType: "name",
        name,
      });
    }
    
    return { status: "success", message: "Profil adı güncellendi", data: { name } };
  } catch (error) {
    logger.error({ error, accountId, name }, "Profil adı güncellenemedi");
    throw error;
  }
};

/**
 * Profil resmi güncelle (README'ye göre - gruplar için de çalışır)
 */
export const updateProfilePicture = async (accountId, jid, picture) => {
  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(jid);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    // Picture buffer, url veya stream olabilir
    await sock.updateProfilePicture(normalized, picture);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "profile.update",
        sessionId,
        updateType: "picture",
        jid: normalized,
      });
    }
    
    return { status: "success", message: "Profil resmi güncellendi", data: { jid: normalized } };
  } catch (error) {
    logger.error({ error, accountId, jid }, "Profil resmi güncellenemedi");
    throw error;
  }
};

/**
 * Profil resmini kaldır (README'ye göre - gruplar için de çalışır)
 */
export const removeProfilePicture = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(jid);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    await sock.removeProfilePicture(normalized);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "profile.update",
        sessionId,
        updateType: "picture_removed",
        jid: normalized,
      });
    }
    
    return { status: "success", message: "Profil resmi kaldırıldı", data: { jid: normalized } };
  } catch (error) {
    logger.error({ error, accountId, jid }, "Profil resmi kaldırılamadı");
    throw error;
  }
};



