// Contact profile functions
import { ensureSocket, normalizeJid, getAccountId, getOrCreateInstance } from "../shared.js";
import { prisma, logger } from "../../shared.js";

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
      const contact = await prisma.contact.findUnique({
        where: {
          sessionId_id: {
            sessionId,
            id: normalized,
          },
        },
      });
      if (contact?.imgUrl) {
        console.log(`[getProfilePicture] Profil fotoğrafı DB'den bulundu: ${normalized}`);
        return contact.imgUrl;
      }
    }
  } catch (dbError) {
    logger.debug({ error: dbError, accountId, jid }, "DB'den profil fotoğrafı kontrol edilemedi");
  }
  
  // DB'de yoksa, bağlantı açıksa API'den dene
  try {
    const instance = getOrCreateInstance(accountId);
    if (instance.connectionState.status !== "open") {
      console.log(`[getProfilePicture] Bağlantı açık değil (${instance.connectionState.status}), DB'de de yok, null döndürülüyor...`);
      return null;
    }
    
    const url = await sock.profilePictureUrl(normalized, "image");
    if (url) {
      // API'den alınan profil resmini DB'ye kaydet (bireysel sohbet için)
      if (!isGroup) {
        try {
          await prisma.contact.upsert({
            where: {
              sessionId_id: {
                sessionId,
                id: normalized,
              },
            },
            create: {
              sessionId,
              id: normalized,
              imgUrl: url,
            },
            update: {
              imgUrl: url,
            },
          });
          console.log(`[getProfilePicture] Profil fotoğrafı API'den alındı ve DB'ye kaydedildi: ${normalized}`);
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
      console.log(`[getProfilePicture] Profil fotoğrafı API'den alınamadı (${error?.data || error?.output?.statusCode || 'not-found'}), DB'de de yok, null döndürülüyor...`);
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
      await prisma.contact.deleteMany({ where: { sessionId } });
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



