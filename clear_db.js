import { PrismaClient } from "@prisma/client";
import { resolve } from "path";

// Prisma'nın DATABASE_URL'i ayarlı değilse varsayılan sqlite dosyasına yönlendir
if (!process.env.DATABASE_URL) {
  const dbPath = resolve("./prisma/dev.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
  console.log(`[prisma] DATABASE_URL set to sqlite default: ${process.env.DATABASE_URL}`);
}

const prisma = new PrismaClient();

async function clearDatabase() {
  try {
    console.log("Veritabanı temizleniyor...");

    // Tüm tabloları sırayla temizle
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`✓ ${deletedMessages.count} mesaj silindi`);

    const deletedChats = await prisma.chat.deleteMany({});
    console.log(`✓ ${deletedChats.count} chat silindi`);

    const deletedContacts = await prisma.contact.deleteMany({});
    console.log(`✓ ${deletedContacts.count} kişi silindi`);

    const deletedGroups = await prisma.groupMetadata.deleteMany({});
    console.log(`✓ ${deletedGroups.count} grup silindi`);

    const deletedSessions = await prisma.session.deleteMany({});
    console.log(`✓ ${deletedSessions.count} session silindi`);

    const deletedTemplates = await prisma.messageTemplate.deleteMany({});
    console.log(`✓ ${deletedTemplates.count} şablon silindi`);

    console.log("\n✅ Veritabanı başarıyla temizlendi!");
  } catch (error) {
    console.error("❌ Hata oluştu:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();

