-- CreateTable
CREATE TABLE "Chat" (
    "pkId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "archived" BOOLEAN,
    "contactPrimaryIdentityKey" BLOB,
    "conversationTimestamp" BIGINT,
    "createdAt" BIGINT,
    "createdBy" TEXT,
    "description" TEXT,
    "disappearingMode" TEXT,
    "displayName" TEXT,
    "endOfHistoryTransfer" BOOLEAN,
    "endOfHistoryTransferType" INTEGER,
    "ephemeralExpiration" INTEGER,
    "ephemeralSettingTimestamp" BIGINT,
    "id" TEXT NOT NULL,
    "isDefaultSubgroup" BOOLEAN,
    "isParentGroup" BOOLEAN,
    "lastMsgTimestamp" BIGINT,
    "lidJid" TEXT,
    "markedAsUnread" BOOLEAN,
    "mediaVisibility" INTEGER,
    "messages" TEXT,
    "muteEndTime" BIGINT,
    "name" TEXT,
    "newJid" TEXT,
    "notSpam" BOOLEAN,
    "oldJid" TEXT,
    "pHash" TEXT,
    "parentGroupId" TEXT,
    "participant" TEXT,
    "pinned" INTEGER,
    "pnJid" TEXT,
    "pnhDuplicateLidThread" BOOLEAN,
    "readOnly" BOOLEAN,
    "shareOwnPn" BOOLEAN,
    "support" BOOLEAN,
    "suspended" BOOLEAN,
    "tcToken" BLOB,
    "tcTokenSenderTimestamp" BIGINT,
    "tcTokenTimestamp" BIGINT,
    "terminated" BOOLEAN,
    "unreadCount" INTEGER,
    "unreadMentionCount" INTEGER,
    "wallpaper" TEXT,
    "lastMessageRecvTimestamp" INTEGER
);

-- CreateTable
CREATE TABLE "Contact" (
    "pkId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT,
    "notify" TEXT,
    "verifiedName" TEXT,
    "imgUrl" TEXT,
    "status" TEXT
);

-- CreateTable
CREATE TABLE "GroupMetadata" (
    "pkId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "owner" TEXT,
    "subject" TEXT NOT NULL,
    "subjectOwner" TEXT,
    "subjectTime" INTEGER,
    "creation" INTEGER,
    "desc" TEXT,
    "descOwner" TEXT,
    "descId" TEXT,
    "restrict" BOOLEAN,
    "announce" BOOLEAN,
    "size" INTEGER,
    "participants" TEXT NOT NULL,
    "ephemeralDuration" INTEGER,
    "inviteCode" TEXT
);

-- CreateTable
CREATE TABLE "Message" (
    "pkId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "bizPrivacyStatus" INTEGER,
    "broadcast" BOOLEAN,
    "clearMedia" BOOLEAN,
    "duration" INTEGER,
    "ephemeralDuration" INTEGER,
    "ephemeralOffToOn" BOOLEAN,
    "ephemeralOutOfSync" BOOLEAN,
    "ephemeralStartTimestamp" BIGINT,
    "finalLiveLocation" TEXT,
    "futureproofData" BLOB,
    "ignore" BOOLEAN,
    "keepInChat" TEXT,
    "key" TEXT NOT NULL,
    "labels" TEXT,
    "mediaCiphertextSha256" BLOB,
    "mediaData" TEXT,
    "message" TEXT,
    "messageC2STimestamp" BIGINT,
    "messageSecret" BLOB,
    "messageStubParameters" TEXT,
    "messageStubType" INTEGER,
    "messageTimestamp" BIGINT,
    "multicast" BOOLEAN,
    "originalSelfAuthorUserJidString" TEXT,
    "participant" TEXT,
    "paymentInfo" TEXT,
    "photoChange" TEXT,
    "pollAdditionalMetadata" TEXT,
    "pollUpdates" TEXT,
    "pushName" TEXT,
    "quotedPaymentInfo" TEXT,
    "quotedStickerData" TEXT,
    "reactions" TEXT,
    "revokeMessageTimestamp" BIGINT,
    "starred" BOOLEAN,
    "status" INTEGER,
    "statusAlreadyViewed" BOOLEAN,
    "statusPsa" TEXT,
    "urlNumber" BOOLEAN,
    "urlText" BOOLEAN,
    "userReceipt" TEXT,
    "verifiedBizName" TEXT
);

-- CreateTable
CREATE TABLE "Session" (
    "pkId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Chat_sessionId_idx" ON "Chat"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_sessionId_id_key" ON "Chat"("sessionId", "id");

-- CreateIndex
CREATE INDEX "Contact_sessionId_idx" ON "Contact"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_sessionId_id_key" ON "Contact"("sessionId", "id");

-- CreateIndex
CREATE INDEX "GroupMetadata_sessionId_idx" ON "GroupMetadata"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMetadata_sessionId_id_key" ON "GroupMetadata"("sessionId", "id");

-- CreateIndex
CREATE INDEX "Message_sessionId_idx" ON "Message"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_sessionId_remoteJid_id_key" ON "Message"("sessionId", "remoteJid", "id");

-- CreateIndex
CREATE INDEX "Session_sessionId_idx" ON "Session"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionId_id_key" ON "Session"("sessionId", "id");
