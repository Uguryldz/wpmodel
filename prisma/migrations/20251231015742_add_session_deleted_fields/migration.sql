-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "createdDate" TIMESTAMP(3),
ADD COLUMN     "isDeleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletedDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sessions_isDeleted_idx" ON "sessions"("isDeleted");

-- Mevcut kayıtlar için createdDate'i şu anki zaman ile doldur
UPDATE "sessions" SET "createdDate" = CURRENT_TIMESTAMP WHERE "createdDate" IS NULL;

