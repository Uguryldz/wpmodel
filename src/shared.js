import { PrismaClient } from "@prisma/client";
import pino from "pino";
import { resolve } from "path";

// Prisma'nın DATABASE_URL'i ayarlı değilse varsayılan sqlite dosyasına yönlendir
if (!process.env.DATABASE_URL) {
  const dbPath = resolve("./prisma/dev.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
  console.log(`[prisma] DATABASE_URL set to sqlite default: ${process.env.DATABASE_URL}`);
}

export const prisma = new PrismaClient();
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

