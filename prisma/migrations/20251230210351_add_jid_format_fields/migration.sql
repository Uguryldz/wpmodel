-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "jidNormalized" TEXT,
ADD COLUMN     "jidStandardized" TEXT,
ADD COLUMN     "jidType" TEXT,
ADD COLUMN     "phoneFormat" TEXT,
ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "phoneRaw" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "jidNormalized" TEXT,
ADD COLUMN     "jidStandardized" TEXT,
ADD COLUMN     "jidType" TEXT,
ADD COLUMN     "phoneFormat" TEXT,
ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "phoneRaw" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "participantNormalized" TEXT,
ADD COLUMN     "participantPhoneFormat" TEXT,
ADD COLUMN     "participantPhoneNormalized" TEXT,
ADD COLUMN     "participantPhoneRaw" TEXT,
ADD COLUMN     "remoteJidNormalized" TEXT,
ADD COLUMN     "remoteJidPhoneFormat" TEXT,
ADD COLUMN     "remoteJidPhoneNormalized" TEXT,
ADD COLUMN     "remoteJidPhoneRaw" TEXT,
ADD COLUMN     "remoteJidStandardized" TEXT,
ADD COLUMN     "remoteJidType" TEXT;

-- CreateIndex
CREATE INDEX "chats_jidNormalized_idx" ON "chats"("jidNormalized");

-- CreateIndex
CREATE INDEX "chats_jidStandardized_idx" ON "chats"("jidStandardized");

-- CreateIndex
CREATE INDEX "chats_phoneRaw_idx" ON "chats"("phoneRaw");

-- CreateIndex
CREATE INDEX "chats_phoneNormalized_idx" ON "chats"("phoneNormalized");

-- CreateIndex
CREATE INDEX "contacts_jidNormalized_idx" ON "contacts"("jidNormalized");

-- CreateIndex
CREATE INDEX "contacts_jidStandardized_idx" ON "contacts"("jidStandardized");

-- CreateIndex
CREATE INDEX "contacts_phoneRaw_idx" ON "contacts"("phoneRaw");

-- CreateIndex
CREATE INDEX "contacts_phoneNormalized_idx" ON "contacts"("phoneNormalized");

-- CreateIndex
CREATE INDEX "messages_remoteJidNormalized_idx" ON "messages"("remoteJidNormalized");

-- CreateIndex
CREATE INDEX "messages_remoteJidPhoneRaw_idx" ON "messages"("remoteJidPhoneRaw");

-- CreateIndex
CREATE INDEX "messages_remoteJidPhoneNormalized_idx" ON "messages"("remoteJidPhoneNormalized");

-- CreateIndex
CREATE INDEX "messages_participantNormalized_idx" ON "messages"("participantNormalized");
