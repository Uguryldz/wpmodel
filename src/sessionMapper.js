import { prisma, logger } from "./shared.js";

/**
 * WhatsApp numarasına göre sessionId bul
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

