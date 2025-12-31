-- CreateTable
CREATE TABLE "session_phone_map" (
    "pkId" SERIAL NOT NULL,
    "phoneNum" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" INTEGER NOT NULL DEFAULT 0,
    "deletionDate" TIMESTAMP(3),

    CONSTRAINT "session_phone_map_pkey" PRIMARY KEY ("pkId")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_phone_map_phoneNum_key" ON "session_phone_map"("phoneNum");

-- CreateIndex
CREATE INDEX "session_phone_map_phoneNum_idx" ON "session_phone_map"("phoneNum");

-- CreateIndex
CREATE INDEX "session_phone_map_isDeleted_idx" ON "session_phone_map"("isDeleted");

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "phoneMapId" INTEGER;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_phoneMapId_fkey" FOREIGN KEY ("phoneMapId") REFERENCES "session_phone_map"("pkId") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "sessions_phoneMapId_idx" ON "sessions"("phoneMapId");

