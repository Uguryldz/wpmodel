import { prisma, logger } from "./shared.js";
import { instances } from "./baileys/shared.js";

/**
 * WhatsApp numarasına göre sessionId bul (veritabanından)
 */
export async function findSessionByWhatsAppJid(whatsappJid) {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        id: { startsWith: `whatsapp-${whatsappJid}-` },
      },
      orderBy: { pkId: "desc" },
      take: 1,
    });

    if (sessions.length > 0) {
      return sessions[0].sessionId;
    }
    return null;
  } catch (error) {
    logger.error({ error, whatsappJid }, "Session bulunamadı");
    return null;
  }
}

/**
 * WhatsApp numarasına göre aktif sessionId bul (memory'den)
 * Aynı hesap için birden fazla session varsa, en iyi durumda olanı döndürür
 */
export function findActiveSessionByWhatsAppJid(whatsappJid) {
  const activeSessions = [];
  
  for (const [sessionId, instance] of instances.entries()) {
    if (instance.whatsappJid === whatsappJid) {
      activeSessions.push({
        sessionId,
        status: instance.connectionState?.status || "close",
        instance,
      });
    }
  }
  
  if (activeSessions.length === 0) {
    return null;
  }
  
  // En iyi durumda olanı seç (open > connecting > initializing > close)
  const statusPriority = {
    'open': 4,
    'connecting': 3,
    'initializing': 2,
    'close': 1,
  };
  
  activeSessions.sort((a, b) => {
    const priorityA = statusPriority[a.status] || 0;
    const priorityB = statusPriority[b.status] || 0;
    if (priorityB !== priorityA) {
      return priorityB - priorityA;
    }
    // Aynı durumdaysa, en yeni sessionId'yi seç
    return b.sessionId.localeCompare(a.sessionId);
  });
  
  return activeSessions[0].sessionId;
}

/**
 * SessionId değiştiğinde verileri taşı
 */
export async function migrateSessionData(oldSessionId, newSessionId) {
  try {
    logger.info({ oldSessionId, newSessionId }, "Session verileri taşınıyor");

    await Promise.all([
      prisma.chat.updateMany({
        where: { sessionId: oldSessionId },
        data: { sessionId: newSessionId },
      }),
      prisma.contact.updateMany({
        where: { sessionId: oldSessionId },
        data: { sessionId: newSessionId },
      }),
      prisma.message.updateMany({
        where: { sessionId: oldSessionId },
        data: { sessionId: newSessionId },
      }),
      prisma.groupMetadata.updateMany({
        where: { sessionId: oldSessionId },
        data: { sessionId: newSessionId },
      }),
    ]);

    logger.info({ oldSessionId, newSessionId }, "Session verileri taşındı");
  } catch (error) {
    logger.error({ error, oldSessionId, newSessionId }, "Session verileri taşınamadı");
    throw error;
  }
}

