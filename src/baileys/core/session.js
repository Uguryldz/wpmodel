// Session management functions
import { readdir } from "fs/promises";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import { 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore // Baileys README: make auth store more fast
} from "baileys";
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
 * Baileys.wiki best practice: Auth state ve version yükleme ayrı fonksiyon
 */
export const initBaileys = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  
  try {
    if (instance.sock) {
      logger.debug({ accountId }, "Socket zaten mevcut, initBaileys atlanıyor");
      return instance.sock;
    }

    // Eğer auth state ve version zaten yüklenmişse, socket'i başlatma
    if (instance.authState && instance.waVersion) {
      logger.debug({ accountId }, "Auth state ve version zaten yüklü");
      return null; // Socket başlatılmadı, manuel başlatılmalı
    }

    const authDir = `${AUTH_FOLDER}/${instance.id}`;
    logger.info({ accountId, authDir }, "Auth state yükleniyor...");
    
    try {
      const auth = await useMultiFileAuthState(authDir);
      
      // Baileys README: makeCacheableSignalKeyStore makes auth store faster
      // This caches signal keys in memory for better performance
      instance.authState = {
        creds: auth.state.creds,
        keys: makeCacheableSignalKeyStore(auth.state.keys, logger)
      };
      instance.saveCredsFn = auth.saveCreds;
      
      logger.info({ accountId }, "Auth state başarıyla yüklendi (cacheable signal key store ile)");
    } catch (authError) {
      logger.error({ error: authError, accountId, authDir }, "Auth state yüklenemedi");
      throw new Error(`Auth state yüklenemedi: ${authError.message}`);
    }

    logger.info({ accountId }, "Baileys version bilgisi alınıyor...");
    
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      instance.waVersion = versionInfo.version;
      instance.connectionState.version = instance.waVersion.join(".");
      instance.connectionState.isLatest = versionInfo.isLatest;
      logger.info({ 
        accountId, 
        version: instance.connectionState.version, 
        isLatest: versionInfo.isLatest 
      }, "WhatsApp version bilgisi alındı");
    } catch (versionError) {
      // Version fetch hatası kritik değil, varsayılan version kullan
      logger.warn({ error: versionError, accountId }, 
        "Version bilgisi alınamadı, varsayılan version kullanılacak");
      
      // Fallback version (Baileys'in varsayılan versiyonu)
      instance.waVersion = [2, 3000, 1015901307];
      instance.connectionState.version = instance.waVersion.join(".");
      instance.connectionState.isLatest = false;
    }

    instance.connectionState.startedAt = new Date().toISOString();
    logger.info({ accountId, version: instance.connectionState.version }, "initBaileys tamamlandı");

    return null; // Socket başlatılmadı
  } catch (error) {
    // Critical error: Instance'ı temizle
    instance.authState = null;
    instance.waVersion = null;
    instance.connectionState.status = "error";
    instance.connectionState.lastError = error.message;
    
    logger.error({ 
      error, 
      accountId, 
      errorType: error.name,
      errorStack: error.stack 
    }, "initBaileys kritik hatası");
    
    throw error;
  }
};

/**
 * Bağlantıyı başlat (QR üretimi için socket'i başlat)
 * Baileys.wiki best practice: Socket başlatmadan önce state kontrolü
 */
export const startConnection = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  
  try {
    // Eğer socket zaten varsa, mevcut socket'i döndür
    if (instance.sock) {
      logger.debug({ accountId, status: instance.connectionState?.status }, 
        "Socket zaten mevcut");
      return instance.sock;
    }

    // Auth state ve version yüklenmemişse, önce initBaileys çağır
    if (!instance.authState || !instance.waVersion) {
      logger.info({ accountId }, "Auth state/version yüklenmemiş, initBaileys çağrılıyor");
      
      try {
        await initBaileys(accountId);
      } catch (initError) {
        logger.error({ error: initError, accountId }, "initBaileys başarısız");
        throw new Error(`Session başlatılamadı: ${initError.message}`);
      }
    }

    // Auth state ve version kontrolü
    if (!instance.authState) {
      throw new Error(`Auth state yüklenemedi: ${accountId}`);
    }
    
    if (!instance.waVersion) {
      throw new Error(`WhatsApp version bilgisi alınamadı: ${accountId}`);
    }

    logger.info({ 
      accountId, 
      version: instance.waVersion.join("."),
      hasAuthState: !!instance.authState 
    }, "Socket başlatılıyor");

    // Socket'i başlat (QR üretimi burada tetiklenecek)
    try {
      startSocket(instance);
    } catch (socketError) {
      logger.error({ error: socketError, accountId }, "Socket başlatma hatası");
      throw new Error(`Socket başlatılamadı: ${socketError.message}`);
    }

    if (!instance.sock) {
      throw new Error(`Socket oluşturulamadı (null): ${accountId}`);
    }

    logger.info({ accountId }, "Socket başarıyla oluşturuldu");
    return instance.sock;
    
  } catch (error) {
    // Critical error: Connection state'i güncelle
    instance.connectionState.status = "error";
    instance.connectionState.lastError = error.message;
    
    logger.error({ 
      error, 
      accountId,
      errorType: error.name,
      hasAuthState: !!instance.authState,
      hasVersion: !!instance.waVersion,
      hasSock: !!instance.sock
    }, "startConnection kritik hatası");
    
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

    // Temp- ile başlayan session'ları işaretle (KVKK uyumlu - veri silmez)
    const tempSessionsToCleanup = sessionIds.filter(sessionId => 
      sessionId.startsWith('temp-')
    );

    // Temp session'ları işaretle (isDeleted=1) - KVKK uyumlu
    for (const tempSessionId of tempSessionsToCleanup) {
      try {
        console.log(`[restoreSessions] 🗑️ Temp session işaretleniyor (isDeleted=1): ${tempSessionId}`);
        await deleteSession(tempSessionId);
        console.log(`[restoreSessions] ✅ Temp session işaretlendi: ${tempSessionId}`);
      } catch (error) {
        console.error(`[restoreSessions] ❌ Temp session işaretlenemedi (${tempSessionId}):`, error);
        logger.error({ error, sessionId: tempSessionId }, "Temp session işaretlenemedi");
      }
    }

    // Account- ile başlayan session'ları kontrol et ve bağlantı kurulmamış olanları temizle
    const accountSessions = sessionIds.filter(sessionId => 
      sessionId.startsWith('account-')
    );

    const accountSessionsToCleanup = [];
    for (const accountSessionId of accountSessions) {
      try {
        const instance = getOrCreateInstance(accountSessionId);
        await initBaileys(accountSessionId);
        
        // Kısa bir süre bekle ve bağlantı durumunu kontrol et
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Eğer WhatsApp JID yoksa (bağlantı kurulmamışsa), işaretle
        if (!instance.whatsappJid && instance.connectionState?.status !== 'open') {
          accountSessionsToCleanup.push(accountSessionId);
          console.log(`[restoreSessions] 🗑️ Account session bağlantı kurulmamış, işaretlenecek: ${accountSessionId}`);
        } else {
          console.log(`[restoreSessions] ✅ Account session bağlantı kurulmuş, restore edilecek: ${accountSessionId}`);
        }
      } catch (error) {
        // Hata varsa da işaretle (muhtemelen geçersiz session) - KVKK uyumlu
        accountSessionsToCleanup.push(accountSessionId);
        console.log(`[restoreSessions] 🗑️ Account session hata nedeniyle işaretlenecek: ${accountSessionId}`);
      }
    }

    // Account session'ları işaretle (isDeleted=1) - KVKK uyumlu
    for (const accountSessionId of accountSessionsToCleanup) {
      try {
        await deleteSession(accountSessionId);
        console.log(`[restoreSessions] ✅ Account session işaretlendi: ${accountSessionId}`);
      } catch (error) {
        console.error(`[restoreSessions] ❌ Account session işaretlenemedi (${accountSessionId}):`, error);
        logger.error({ error, sessionId: accountSessionId }, "Account session işaretlenemedi");
      }
    }

    // Tüm geçerli session'ları restore et (temp ve bağlantı kurulmamış account session'lar hariç)
    // Not: isDeleted=1 olan session'lar da filtrelenmeli
    const validSessionIds = sessionIds.filter(sessionId => 
      !tempSessionsToCleanup.includes(sessionId) && !accountSessionsToCleanup.includes(sessionId)
    );

    console.log(`[restoreSessions] ${validSessionIds.length} geçerli session restore edilecek (${tempSessionsToCleanup.length} temp + ${accountSessionsToCleanup.length} account session işaretlendi - KVKK uyumlu)`);

    // Session'ları restore et ve WhatsApp JID'lerini topla
    const sessionsByJid = new Map(); // whatsappJid -> [sessionIds]
    
    for (const sessionId of validSessionIds) {
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
 * Session'ı sil (KVKK uyumlu - veri silmez, sadece isDeleted=1 yapar)
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

  // KVKK uyumlu: Veritabanından veri silme, sadece session tablosunda isDeleted=1 yap
  try {
    await prisma.session.updateMany({
      where: { sessionId },
      data: {
        isDeleted: 1,
        deletedDate: new Date(),
      },
    });
    logger.info({ sessionId }, "Session tablosu güncellendi (isDeleted=1, deletedDate) - KVKK uyumlu");
  } catch (error) {
    logger.error({ error, sessionId }, "Session tablosu güncellenemedi");
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
    id: instance?.id || null,
    status: instance?.connectionState?.status || 'close',
    whatsappJid: instance?.whatsappJid || null,
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
          if (session.id && existing.id && session.id > existing.id) {
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
 * Logout yap (session'ı kapat, auth klasörünü temizle ama veritabanından veri silme)
 */
export const performLogout = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  const sessionId = instance.id;

  // Socket varsa logout yap
  if (instance.sock) {
    try {
      await instance.sock.logout();
    } catch (error) {
      logger.error({ error, sessionId }, "Logout sırasında socket hatası");
      // Hata olsa bile devam et
    }
  }

  // Session tablosunda isDeleted=1 ve deletedDate'i güncelle (veritabanından veri silmeden)
  try {
    await prisma.session.updateMany({
      where: { sessionId },
      data: {
        isDeleted: 1,
        deletedDate: new Date(),
      },
    });
    logger.info({ sessionId }, "Session tablosu güncellendi (isDeleted=1, deletedDate)");
  } catch (error) {
    logger.error({ error, sessionId }, "Session tablosu güncellenemedi (logout)");
  }

  // Auth klasörünü temizle (veritabanından veri silmeden)
  try {
    const authDir = `${AUTH_FOLDER}/${sessionId}`;
    if (existsSync(authDir)) {
      await rm(authDir, { recursive: true, force: true });
      logger.info({ sessionId, authDir }, "Auth klasörü temizlendi (logout)");
    }
  } catch (error) {
    logger.error({ error, sessionId }, "Auth klasörü temizlenemedi (logout)");
  }

  // Connection state'i güncelle
  instance.connectionState.status = "logged_out";
  instance.connectionState.lastQr = null;
  
  // Instance'ı memory'den kaldır
  removeInstance(accountId);
};



