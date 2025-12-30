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

export const prisma = new PrismaClient();
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("[shutdown] Prisma bağlantısı kapatılıyor...");
  try {
    await prisma.$disconnect();
    console.log("[shutdown] Prisma bağlantısı kapatıldı");
  } catch (error) {
    console.error("[shutdown] Prisma disconnect hatası:", error);
  }
  process.exit(0);
};

process.on("beforeExit", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

