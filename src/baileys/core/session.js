// Session management functions
import { readdir } from "fs/promises";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import { useMultiFileAuthState, fetchLatestBaileysVersion } from "baileys";
import { prisma, logger } from "../../shared.js";
import {
  AUTH_FOLDER,
  getAccountId,
  getOrCreateInstance,
  removeInstance,
} from "../shared.js";
import { startSocket } from "./socket.js";
import { instances } from "../shared.js";

/**
 * Baileys'i başlat (socket'i başlatmadan, sadece hazırlık yap)
 */
export const initBaileys = async (accountId) => {
  try {
    const instance = getOrCreateInstance(accountId);
    if (instance.sock) {
      return instance.sock;
    }

    // Eğer auth state ve version zaten yüklenmişse, socket'i başlatma
    if (instance.authState && instance.waVersion) {
      return null; // Socket başlatılmadı, manuel başlatılmalı
    }

    const authDir = `${AUTH_FOLDER}/${instance.id}`;
    logger.info({ accountId, authDir }, "Auth state yükleniyor...");
    
    const auth = await useMultiFileAuthState(authDir);
    instance.authState = auth.state;
    instance.saveCredsFn = auth.saveCreds;

    logger.info({ accountId }, "Baileys version bilgisi alınıyor...");
    const versionInfo = await fetchLatestBaileysVersion();
    instance.waVersion = versionInfo.version;

    instance.connectionState.version = instance.waVersion.join(".");
    instance.connectionState.isLatest = versionInfo.isLatest;
    instance.connectionState.startedAt = new Date().toISOString();

    logger.info({ accountId, version: instance.connectionState.version }, "initBaileys tamamlandı");

    // Socket'i otomatik başlatma - kullanıcı manuel olarak başlatmalı
    // startSocket(instance);

    return null; // Socket başlatılmadı
  } catch (error) {
    logger.error({ error, accountId }, "initBaileys hatası");
    throw error;
  }
};

/**
 * Bağlantıyı başlat (QR üretimi için socket'i başlat)
 */
export const startConnection = async (accountId) => {
  try {
    const instance = getOrCreateInstance(accountId);
    
    // Eğer socket zaten varsa, mevcut socket'i döndür
    if (instance.sock) {
      return instance.sock;
    }

    // Auth state ve version yüklenmemişse, önce initBaileys çağır
    if (!instance.authState || !instance.waVersion) {
      await initBaileys(accountId);
    }

    // Auth state ve version kontrolü
    if (!instance.authState || !instance.waVersion) {
      throw new Error(`Auth state veya version yüklenemedi: ${accountId}`);
    }

    // Socket'i başlat (QR üretimi burada tetiklenecek)
    startSocket(instance);

    if (!instance.sock) {
      throw new Error(`Socket oluşturulamadı: ${accountId}`);
    }

    return instance.sock;
  } catch (error) {
    logger.error({ error, accountId }, "startConnection hatası");
    throw error;
  }
};

/**
 * Pairing Code iste (README'ye göre)
 * Pairing Code isn't Mobile API, it's a method to connect Whatsapp Web without QR-CODE
 * The phone number can't have + or () or -, only numbers, you must provide country code
 */
export const requestPairingCode = async (accountId, phoneNumber) => {
  const instance = getOrCreateInstance(accountId);
  
  // Auth state yüklenmemişse, önce initBaileys çağır
  if (!instance.authState || !instance.waVersion) {
    await initBaileys(accountId);
  }

  // Eğer socket yoksa, önce socket oluştur (ama QR gösterme)
  if (!instance.sock) {
    const { startSocket } = await import("./socket.js");
    startSocket(instance);
  }

  // Phone number'ı temizle (+ ve () ve - karakterlerini kaldır)
  const cleanNumber = phoneNumber.replace(/[+\-()\s]/g, "");
  
  if (!instance.sock.authState.creds.registered) {
    const code = await instance.sock.requestPairingCode(cleanNumber);
    logger.info({ accountId, phoneNumber: cleanNumber }, "Pairing code oluşturuldu");
    return { code, phoneNumber: cleanNumber };
  } else {
    throw new Error("Bu session zaten kayıtlı. Pairing code sadece kayıtlı olmayan session'lar için kullanılabilir.");
  }
};

/**
 * Mevcut session'ları restore et (backend restart sonrası)
 * Restore edilen session'lar otomatik olarak bağlantıyı başlatır
 * Aynı WhatsApp hesabı için birden fazla session varsa, sadece en iyi durumda olanı restore eder
 */
export const restoreSessions = async () => {
  try {
    if (!existsSync(AUTH_FOLDER)) {
      console.log("[restoreSessions] auth_info klasörü bulunamadı, restore edilecek session yok");
      return;
    }

    const sessionDirs = await readdir(AUTH_FOLDER, { withFileTypes: true });
    const sessionIds = sessionDirs
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`[restoreSessions] ${sessionIds.length} session klasörü bulundu:`, sessionIds);

    // Session'ları restore et ve WhatsApp JID'lerini topla
    const sessionsByJid = new Map(); // whatsappJid -> [sessionIds]
    
    for (const sessionId of sessionIds) {
      try {
        console.log(`[restoreSessions] Session restore ediliyor: ${sessionId}`);
        await initBaileys(sessionId);
        // Restore edilen session'lar için otomatik olarak bağlantıyı başlat
        await startConnection(sessionId);
        
        // Bağlantının kurulmasını bekle (maksimum 30 saniye)
        const instance = getOrCreateInstance(sessionId);
        let waitCount = 0;
        const maxWait = 60; // 60 * 500ms = 30 saniye
        
        while (instance.connectionState?.status !== "open" && waitCount < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 500));
          waitCount++;
          
          // WhatsApp JID'yi kontrol et (bağlantı açıldığında set edilir)
          if (instance.whatsappJid) {
            if (!sessionsByJid.has(instance.whatsappJid)) {
              sessionsByJid.set(instance.whatsappJid, []);
            }
            sessionsByJid.get(instance.whatsappJid).push({
              sessionId,
              status: instance.connectionState?.status || "close",
              instance,
            });
          }
        }
        
        if (instance.connectionState?.status === "open") {
          console.log(`[restoreSessions] ✅ Session restore edildi ve bağlantı kuruldu: ${sessionId}`);
          
          // WhatsApp JID'yi kontrol et
          if (instance.whatsappJid) {
            if (!sessionsByJid.has(instance.whatsappJid)) {
              sessionsByJid.set(instance.whatsappJid, []);
            }
            sessionsByJid.get(instance.whatsappJid).push({
              sessionId,
              status: instance.connectionState?.status || "open",
              instance,
            });
          }
        } else {
          console.log(`[restoreSessions] ⚠️ Session restore edildi ama bağlantı henüz kurulmadı: ${sessionId} (durum: ${instance.connectionState?.status})`);
        }
      } catch (error) {
        console.error(`[restoreSessions] ❌ Session restore edilemedi (${sessionId}):`, error);
        logger.error({ error, sessionId }, "Session restore edilemedi");
      }
    }

    // Aynı WhatsApp hesabı için birden fazla session varsa, eski session'ları kapat
    for (const [whatsappJid, sessions] of sessionsByJid.entries()) {
      if (sessions.length > 1) {
        // En iyi durumda olanı seç (open > connecting > initializing > close)
        const statusPriority = {
          'open': 4,
          'connecting': 3,
          'initializing': 2,
          'close': 1,
        };
        
        sessions.sort((a, b) => {
          const priorityA = statusPriority[a.status] || 0;
          const priorityB = statusPriority[b.status] || 0;
          if (priorityB !== priorityA) {
            return priorityB - priorityA;
          }
          // Aynı durumdaysa, en yeni sessionId'yi seç
          return b.sessionId.localeCompare(a.sessionId);
        });
        
        const keepSession = sessions[0];
        const closeSessions = sessions.slice(1);
        
        console.log(`[restoreSessions] ⚠️ Aynı WhatsApp hesabı (${whatsappJid}) için ${sessions.length} session bulundu. ${keepSession.sessionId} tutuluyor, ${closeSessions.length} session kapatılıyor.`);
        
        for (const closeSession of closeSessions) {
          try {
            if (closeSession.instance && closeSession.instance.sock) {
              await closeSession.instance.sock.logout();
              console.log(`[restoreSessions] ✅ Eski session kapatıldı: ${closeSession.sessionId}`);
            }
          } catch (error) {
            logger.error({ error, sessionId: closeSession.sessionId }, "Eski session kapatılamadı");
          }
        }
      }
    }

    console.log(`[restoreSessions] Tüm session'lar restore edildi`);
  } catch (error) {
    console.error("[restoreSessions] Restore hatası:", error);
    logger.error({ error }, "Restore hatası");
  }
};

/**
 * Session'ı sil
 */
export const deleteSession = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  const sessionId = instance.id;

  if (instance.sock) {
    try {
      await instance.sock.logout();
    } catch {
      // ignore
    }
  }

  // Prisma'dan verileri sil
  try {
    await Promise.all([
      prisma.chat.deleteMany({ where: { sessionId } }),
      prisma.contact.deleteMany({ where: { sessionId } }),
      prisma.message.deleteMany({ where: { sessionId } }),
      prisma.groupMetadata.deleteMany({ where: { sessionId } }),
      prisma.session.deleteMany({ where: { sessionId } }),
    ]);
  } catch (error) {
    logger.error({ error, sessionId }, "Session verileri silinemedi");
  }

  // auth_info klasöründeki session dosyalarını sil
  try {
    const authDir = `${AUTH_FOLDER}/${sessionId}`;
    if (existsSync(authDir)) {
      await rm(authDir, { recursive: true, force: true });
      console.log(`[deleteSession] Auth klasörü silindi: ${authDir}`);
    }
  } catch (error) {
    logger.error({ error, sessionId }, "Auth klasörü silinemedi");
  }

  removeInstance(accountId);
};

/**
 * Tüm session'ları listele
 */
export const listSessions = () => {
  const sessions = Array.from(instances.values()).map((instance) => ({
    id: instance.id,
    status: instance.connectionState.status,
    whatsappJid: instance.whatsappJid || null,
  }));
  
  const sessionsByWhatsAppJid = new Map();
  const sessionsWithoutJid = [];
  
  const statusPriority = {
    'open': 4,
    'connecting': 3,
    'initializing': 2,
    'close': 1,
  };
  
  for (const session of sessions) {
    if (session.whatsappJid) {
      const existing = sessionsByWhatsAppJid.get(session.whatsappJid);
      if (!existing) {
        sessionsByWhatsAppJid.set(session.whatsappJid, session);
      } else {
        const existingPriority = statusPriority[existing.status] || 0;
        const currentPriority = statusPriority[session.status] || 0;
        
        if (currentPriority > existingPriority) {
          sessionsByWhatsAppJid.set(session.whatsappJid, session);
        } else if (currentPriority === existingPriority && session.status === 'open') {
          if (session.id > existing.id) {
            sessionsByWhatsAppJid.set(session.whatsappJid, session);
          }
        }
      }
    } else {
      sessionsWithoutJid.push(session);
    }
  }
  
  return [
    ...Array.from(sessionsByWhatsAppJid.values()),
    ...sessionsWithoutJid,
  ];
};

/**
 * Session var mı kontrol et
 */
export const sessionExists = (accountId) => {
  const id = getAccountId(accountId);
  return instances.has(id);
};

/**
 * Logout yap (session'ı kapat ama silme)
 */
export const performLogout = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  if (!instance.sock) {
    return;
  }

  await instance.sock.logout();
  instance.connectionState.status = "logged_out";
  instance.connectionState.lastQr = null;
};



