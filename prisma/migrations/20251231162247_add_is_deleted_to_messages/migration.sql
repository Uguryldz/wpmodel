-- AlterTable
ALTER TABLE "messages" ADD COLUMN "isDeleted" BOOLEAN DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "deleteType" TEXT;

-- CreateIndex
CREATE INDEX "messages_isDeleted_idx" ON "messages"("isDeleted");
CREATE INDEX "messages_deleteType_idx" ON "messages"("deleteType");

