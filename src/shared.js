import { PrismaClient } from "@prisma/client";
import pino from "pino";

// DATABASE_URL kontrolü - PostgreSQL için gerekli
if (!process.env.DATABASE_URL) {
  console.error("[prisma] ❌ HATA: DATABASE_URL environment variable tanımlı değil!");
  console.error("[prisma] Lütfen .env dosyasına PostgreSQL bağlantı bilgilerini ekleyin:");
  console.error("[prisma] DATABASE_URL=\"postgresql://user:password@host:port/database\"");
  console.error("[prisma] Veya 'npm run setup:db' komutunu çalıştırarak database'i oluşturun.");
  process.exit(1);
}

// PostgreSQL bağlantı kontrolü
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
  console.warn("[prisma] ⚠️  UYARI: DATABASE_URL PostgreSQL formatında görünmüyor.");
  console.warn("[prisma] Beklenen format: postgresql://user:password@host:port/database");
}

// Prisma Client oluştur - connection error handling ile
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  errorFormat: 'pretty',
});

// Prisma query error'ları için global handler - Backend'in çökmesini önle
process.on("unhandledRejection", (reason, promise) => {
  // Prisma bağlantı hatalarını özel olarak handle et
  if (reason && typeof reason === 'object' && 'code' in reason) {
    const error = reason;
    // Prisma connection error kodları: P1001 (Can't reach database), P1002 (Connection timeout), P1008 (Operations timed out)
    if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008') {
      // Prisma connection error'ları - backend'i çökertme
      console.error('[Prisma] ⚠️ Database bağlantı hatası (backend çalışmaya devam edecek):', {
        code: error.code,
        message: error.message || 'Database connection error',
      });
      return; // Process'i kapatma, sadece log'la
    }
  }
  
  // Diğer unhandled rejection'lar için normal handler
  console.error("[shutdown] Unhandled rejection - graceful shutdown:", {
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
    } : reason,
  });
  // Process'i hemen kapatma, log'la ve devam et
});

export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

/**
 * SessionId'den phoneMapId'yi bulur
 * @param {string} sessionId - Session ID
 * @returns {Promise<number|null>} phoneMapId veya null
 */
export async function getPhoneMapIdFromSessionId(sessionId) {
  if (!sessionId) return null;
  
  try {
    // Session tablosundan phoneMapId'yi bul
    const session = await prisma.session.findFirst({
      where: { sessionId },
      select: { phoneMapId: true },
    });
    
    return session?.phoneMapId || null;
  } catch (error) {
    logger.error({ error, sessionId }, "getPhoneMapIdFromSessionId hatası");
    return null;
  }
}

// Graceful shutdown
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  // Çift shutdown'ı önle
  if (isShuttingDown) {
    console.log("[shutdown] Zaten kapanıyor, tekrar çağrı yok sayılıyor");
    return;
  }
  
  isShuttingDown = true;
  console.log(`[shutdown] ${signal || 'Graceful'} shutdown başlatılıyor...`);
  
  try {
    // Prisma bağlantısını kapat
    console.log("[shutdown] Prisma bağlantısı kapatılıyor...");
    await prisma.$disconnect();
    console.log("[shutdown] Prisma bağlantısı kapatıldı");
  } catch (error) {
    console.error("[shutdown] Prisma disconnect hatası:", error);
  }
  
  // Process'i kapat
  console.log("[shutdown] Process kapatılıyor...");
  process.exit(0);
};

// NOT: beforeExit event'i event loop boşaldığında tetiklenir
// Bu, backend'in beklenmedik şekilde kapanmasına neden olabilir
// Bu yüzden beforeExit'i kaldırdık, sadece SIGINT ve SIGTERM kullanıyoruz
// process.on("beforeExit", gracefulShutdown); // KALDIRILDI - Backend'in çökmesine neden oluyordu

// Sadece signal'lar için graceful shutdown
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Uncaught exception ve unhandled rejection'lar için de graceful shutdown
// (Ama process'i hemen kapatma, sadece log'la - process manager yeniden başlatacak)
process.on("uncaughtException", (error) => {
  console.error("[shutdown] Uncaught exception - graceful shutdown:", {
    message: error.message,
    stack: error.stack,
  });
  // Process'i hemen kapatma, log'la ve devam et
  // Production'da process manager (PM2, systemd) yeniden başlatacak
});

process.on("unhandledRejection", (reason, promise) => {
  // Prisma bağlantı hatalarını özel olarak handle et - Backend'in çökmesini önle
  if (reason && typeof reason === 'object' && 'code' in reason) {
    const error = reason;
    // Prisma connection error kodları: P1001 (Can't reach database), P1002 (Connection timeout), P1008 (Operations timed out)
    if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008') {
      console.error('[Prisma] ⚠️ Database bağlantı hatası (backend çalışmaya devam edecek):', {
        code: error.code,
        message: error.message || 'Database connection error',
      });
      return; // Process'i kapatma, sadece log'la
    }
  }
  
  // Diğer unhandled rejection'lar için normal handler
  console.error("[shutdown] Unhandled rejection - graceful shutdown:", {
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
    } : reason,
  });
  // Process'i hemen kapatma, log'la ve devam et
});

