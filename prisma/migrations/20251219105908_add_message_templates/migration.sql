-- CreateTable
CREATE TABLE "MessageTemplate" (
    "pkId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_id_key" ON "MessageTemplate"("id");

-- CreateIndex
CREATE INDEX "MessageTemplate_sessionId_idx" ON "MessageTemplate"("sessionId");

-- CreateIndex
CREATE INDEX "MessageTemplate_type_idx" ON "MessageTemplate"("type");
