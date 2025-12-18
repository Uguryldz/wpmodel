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
  const instance = getOrCreateInstance(accountId);
  if (instance.sock) {
    return instance.sock;
  }

  // Eğer auth state ve version zaten yüklenmişse, socket'i başlatma
  if (instance.authState && instance.waVersion) {
    return null; // Socket başlatılmadı, manuel başlatılmalı
  }

  const authDir = `${AUTH_FOLDER}/${instance.id}`;
  const auth = await useMultiFileAuthState(authDir);
  instance.authState = auth.state;
  instance.saveCredsFn = auth.saveCreds;

  const versionInfo = await fetchLatestBaileysVersion();
  instance.waVersion = versionInfo.version;

  instance.connectionState.version = instance.waVersion.join(".");
  instance.connectionState.isLatest = versionInfo.isLatest;
  instance.connectionState.startedAt = new Date().toISOString();

  // Socket'i otomatik başlatma - kullanıcı manuel olarak başlatmalı
  // startSocket(instance);

  return null; // Socket başlatılmadı
};

/**
 * Bağlantıyı başlat (QR üretimi için socket'i başlat)
 */
export const startConnection = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  
  // Eğer socket zaten varsa, mevcut socket'i döndür
  if (instance.sock) {
    return instance.sock;
  }

  // Auth state ve version yüklenmemişse, önce initBaileys çağır
  if (!instance.authState || !instance.waVersion) {
    await initBaileys(accountId);
  }

  // Socket'i başlat (QR üretimi burada tetiklenecek)
  startSocket(instance);

  return instance.sock;
};

/**
 * Mevcut session'ları restore et (backend restart sonrası)
 * Restore edilen session'lar otomatik olarak bağlantıyı başlatır
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

    for (const sessionId of sessionIds) {
      try {
        console.log(`[restoreSessions] Session restore ediliyor: ${sessionId}`);
        await initBaileys(sessionId);
        // Restore edilen session'lar için otomatik olarak bağlantıyı başlat
        await startConnection(sessionId);
        console.log(`[restoreSessions] ✅ Session restore edildi: ${sessionId}`);
      } catch (error) {
        console.error(`[restoreSessions] ❌ Session restore edilemedi (${sessionId}):`, error);
      }
    }

    console.log(`[restoreSessions] Tüm session'lar restore edildi`);
  } catch (error) {
    console.error("[restoreSessions] Restore hatası:", error);
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



