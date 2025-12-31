-- ============================================
-- Migration: sessionId -> phoneMapId
-- Tüm tablolarda sessionId kolonunu kaldırıp phoneMapId ile değiştir
-- ============================================

-- Step 1: Her tabloya phoneMapId kolonu ekle (nullable, geçici)
ALTER TABLE "chats" ADD COLUMN "phoneMapId" INTEGER;
ALTER TABLE "contacts" ADD COLUMN "phoneMapId" INTEGER;
ALTER TABLE "messages" ADD COLUMN "phoneMapId" INTEGER;
ALTER TABLE "group_metadata" ADD COLUMN "phoneMapId" INTEGER;
ALTER TABLE "message_templates" ADD COLUMN "phoneMapId" INTEGER;

-- Step 2: Session tablosundan phoneNum çıkar ve SessionPhoneMap'te bul/oluştur
-- Önce tüm sessionId'ler için SessionPhoneMap kayıtlarını oluştur
-- Session.id zaten telefon numarası olarak saklanıyor
DO $$
DECLARE
    session_record RECORD;
    phone_map_id INTEGER;
BEGIN
    -- Tüm session kayıtlarını döngüye al
    FOR session_record IN 
        SELECT DISTINCT s."id" as phone_num, s."sessionId"
        FROM "sessions" s
        WHERE s."id" IS NOT NULL AND s."id" != ''
        AND s."id" ~ '^[0-9]+$' -- Sadece sayısal telefon numaraları
    LOOP
        -- SessionPhoneMap'te kayıt var mı kontrol et, yoksa oluştur
        INSERT INTO "session_phone_map" ("phoneNum", "createdDate", "isDeleted")
        VALUES (session_record.phone_num, CURRENT_TIMESTAMP, 0)
        ON CONFLICT ("phoneNum") DO UPDATE SET "isDeleted" = 0, "deletionDate" = NULL;
        
        -- SessionPhoneMap'ten phoneMapId'yi al
        SELECT "pkId" INTO phone_map_id
        FROM "session_phone_map"
        WHERE "phoneNum" = session_record.phone_num;
        
        -- Session tablosundaki phoneMapId'yi güncelle
        UPDATE "sessions"
        SET "phoneMapId" = phone_map_id
        WHERE "id" = session_record.phone_num;
    END LOOP;
END $$;

-- Step 3: Tüm tablolarda sessionId'den phoneMapId'yi doldur
-- Session tablosundan sessionId -> phoneNum -> phoneMapId eşleştirmesi

-- Chats tablosu için
UPDATE "chats" c
SET "phoneMapId" = s."phoneMapId"
FROM "sessions" s
WHERE c."sessionId" = s."sessionId" AND s."phoneMapId" IS NOT NULL;

-- Contacts tablosu için
UPDATE "contacts" c
SET "phoneMapId" = s."phoneMapId"
FROM "sessions" s
WHERE c."sessionId" = s."sessionId" AND s."phoneMapId" IS NOT NULL;

-- Messages tablosu için
UPDATE "messages" m
SET "phoneMapId" = s."phoneMapId"
FROM "sessions" s
WHERE m."sessionId" = s."sessionId" AND s."phoneMapId" IS NOT NULL;

-- Group_metadata tablosu için
UPDATE "group_metadata" g
SET "phoneMapId" = s."phoneMapId"
FROM "sessions" s
WHERE g."sessionId" = s."sessionId" AND s."phoneMapId" IS NOT NULL;

-- Message_templates tablosu için (nullable olduğu için WHERE eklemedik)
UPDATE "message_templates" mt
SET "phoneMapId" = s."phoneMapId"
FROM "sessions" s
WHERE mt."sessionId" = s."sessionId" AND s."phoneMapId" IS NOT NULL;

-- Step 4: phoneMapId NULL olan kayıtları kontrol et ve sil (veri tutarsızlığı varsa)
-- Bu kayıtlar Session tablosunda olmayan sessionId'lere ait olabilir
DELETE FROM "chats" WHERE "phoneMapId" IS NULL;
DELETE FROM "contacts" WHERE "phoneMapId" IS NULL;
DELETE FROM "messages" WHERE "phoneMapId" IS NULL;
DELETE FROM "group_metadata" WHERE "phoneMapId" IS NULL;
DELETE FROM "message_templates" WHERE "phoneMapId" IS NULL;

-- Step 5: Eski unique constraint'leri ve index'leri kaldır

-- Chats
DROP INDEX IF EXISTS "chats_sessionId_id_key";
DROP INDEX IF EXISTS "chats_sessionId_idx";
DROP INDEX IF EXISTS "chats_sessionId_conversationTimestamp_idx";

-- Contacts
DROP INDEX IF EXISTS "contacts_sessionId_id_key";
DROP INDEX IF EXISTS "contacts_sessionId_idx";

-- Messages
DROP INDEX IF EXISTS "messages_sessionId_remoteJid_id_key";
DROP INDEX IF EXISTS "messages_sessionId_idx";
DROP INDEX IF EXISTS "messages_sessionId_remoteJid_idx";

-- Group_metadata
DROP INDEX IF EXISTS "group_metadata_sessionId_id_key";
DROP INDEX IF EXISTS "group_metadata_sessionId_idx";

-- Message_templates
DROP INDEX IF EXISTS "message_templates_sessionId_idx";

-- Step 6: sessionId kolonlarını kaldır
ALTER TABLE "chats" DROP COLUMN "sessionId";
ALTER TABLE "contacts" DROP COLUMN "sessionId";
ALTER TABLE "messages" DROP COLUMN "sessionId";
ALTER TABLE "group_metadata" DROP COLUMN "sessionId";
ALTER TABLE "message_templates" DROP COLUMN "sessionId";

-- Step 7: phoneMapId'yi NOT NULL yap (sadece required olanlar için)
ALTER TABLE "chats" ALTER COLUMN "phoneMapId" SET NOT NULL;
ALTER TABLE "contacts" ALTER COLUMN "phoneMapId" SET NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "phoneMapId" SET NOT NULL;
ALTER TABLE "group_metadata" ALTER COLUMN "phoneMapId" SET NOT NULL;
-- message_templates phoneMapId nullable kalacak

-- Step 8: Foreign key constraint'lerini ekle
ALTER TABLE "chats" ADD CONSTRAINT "chats_phoneMapId_fkey" FOREIGN KEY ("phoneMapId") REFERENCES "session_phone_map"("pkId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_phoneMapId_fkey" FOREIGN KEY ("phoneMapId") REFERENCES "session_phone_map"("pkId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_phoneMapId_fkey" FOREIGN KEY ("phoneMapId") REFERENCES "session_phone_map"("pkId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_metadata" ADD CONSTRAINT "group_metadata_phoneMapId_fkey" FOREIGN KEY ("phoneMapId") REFERENCES "session_phone_map"("pkId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_phoneMapId_fkey" FOREIGN KEY ("phoneMapId") REFERENCES "session_phone_map"("pkId") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 9: Yeni unique constraint'leri ekle
CREATE UNIQUE INDEX "chats_phoneMapId_id_key" ON "chats"("phoneMapId", "id");
CREATE UNIQUE INDEX "contacts_phoneMapId_id_key" ON "contacts"("phoneMapId", "id");
CREATE UNIQUE INDEX "messages_phoneMapId_remoteJid_id_key" ON "messages"("phoneMapId", "remoteJid", "id");
CREATE UNIQUE INDEX "group_metadata_phoneMapId_id_key" ON "group_metadata"("phoneMapId", "id");

-- Step 10: Yeni index'leri ekle
CREATE INDEX "chats_phoneMapId_idx" ON "chats"("phoneMapId");
CREATE INDEX "chats_phoneMapId_conversationTimestamp_idx" ON "chats"("phoneMapId", "conversationTimestamp");

CREATE INDEX "contacts_phoneMapId_idx" ON "contacts"("phoneMapId");

CREATE INDEX "messages_phoneMapId_idx" ON "messages"("phoneMapId");
CREATE INDEX "messages_phoneMapId_remoteJid_idx" ON "messages"("phoneMapId", "remoteJid");

CREATE INDEX "group_metadata_phoneMapId_idx" ON "group_metadata"("phoneMapId");

CREATE INDEX "message_templates_phoneMapId_idx" ON "message_templates"("phoneMapId");

