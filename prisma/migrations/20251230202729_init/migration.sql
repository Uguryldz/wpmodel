-- CreateTable
CREATE TABLE "chats" (
    "pkId" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "conversationTimestamp" BIGINT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BIGINT,
    "name" TEXT,
    "displayName" TEXT,
    "subject" TEXT,
    "participant" JSONB,
    "creation" BIGINT,
    "desc" TEXT,
    "descOwner" TEXT,
    "descId" TEXT,
    "restrict" BOOLEAN,
    "announce" BOOLEAN,
    "size" INTEGER,
    "ephemeralDuration" INTEGER,
    "inviteCode" TEXT,
    "lastMsgTimestamp" BIGINT,
    "messages" JSONB,
    "imgUrl" TEXT,
    "lidJid" TEXT,
    "newJid" TEXT,
    "oldJid" TEXT,
    "muteEndTime" BIGINT,
    "disappearingMode" TEXT,
    "readOnly" BOOLEAN,
    "endOfHistoryTransfer" BOOLEAN,
    "endOfHistoryTransferType" INTEGER,
    "markedAsUnread" BOOLEAN,
    "unreadMentionCount" INTEGER,
    "createdAt" BIGINT,
    "createdBy" TEXT,
    "contactPrimaryIdentityKey" BYTEA,
    "tcToken" BYTEA,
    "tcTokenTimestamp" BIGINT,
    "tcTokenSenderTimestamp" BIGINT,
    "pHash" TEXT,
    "pnJid" TEXT,
    "parentGroupId" TEXT,
    "isParentGroup" BOOLEAN,
    "isDefaultSubgroup" BOOLEAN,
    "shareOwnPn" BOOLEAN,
    "pnhDuplicateLidThread" BOOLEAN,
    "support" BOOLEAN,
    "suspended" BOOLEAN,
    "terminated" BOOLEAN,
    "notSpam" BOOLEAN,
    "mediaVisibility" INTEGER,
    "wallpaper" JSONB,
    "lastMessageRecvTimestamp" BIGINT,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("pkId")
);

-- CreateTable
CREATE TABLE "contacts" (
    "pkId" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT,
    "notify" TEXT,
    "verifiedName" TEXT,
    "imgUrl" TEXT,
    "status" TEXT,
    "vcard" JSONB,
    "businessProfile" JSONB,
    "labels" JSONB,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("pkId")
);

-- CreateTable
CREATE TABLE "messages" (
    "pkId" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "key" JSONB NOT NULL,
    "message" JSONB,
    "messageTimestamp" BIGINT,
    "messageC2STimestamp" BIGINT,
    "pushName" TEXT,
    "participant" TEXT,
    "broadcast" BOOLEAN DEFAULT false,
    "multicast" BOOLEAN DEFAULT false,
    "status" INTEGER,
    "starred" BOOLEAN DEFAULT false,
    "reactions" JSONB,
    "messageStubType" INTEGER,
    "messageStubParameters" JSONB,
    "mediaData" JSONB,
    "mediaCiphertextSha256" BYTEA,
    "duration" INTEGER,
    "fileLength" BIGINT,
    "ephemeralDuration" INTEGER,
    "ephemeralOffToOn" BOOLEAN,
    "ephemeralOutOfSync" BOOLEAN,
    "ephemeralStartTimestamp" BIGINT,
    "agentId" TEXT,
    "bizPrivacyStatus" INTEGER,
    "clearMedia" BOOLEAN,
    "futureproofData" BYTEA,
    "ignore" BOOLEAN,
    "keepInChat" JSONB,
    "labels" JSONB,
    "messageSecret" BYTEA,
    "originalSelfAuthorUserJidString" TEXT,
    "paymentInfo" JSONB,
    "photoChange" JSONB,
    "pollAdditionalMetadata" JSONB,
    "pollUpdates" JSONB,
    "quotedPaymentInfo" JSONB,
    "quotedStickerData" JSONB,
    "revokeMessageTimestamp" BIGINT,
    "statusAlreadyViewed" BOOLEAN,
    "statusPsa" JSONB,
    "urlNumber" BOOLEAN,
    "urlText" BOOLEAN,
    "userReceipt" JSONB,
    "verifiedBizName" TEXT,
    "finalLiveLocation" JSONB,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("pkId")
);

-- CreateTable
CREATE TABLE "group_metadata" (
    "pkId" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "owner" TEXT,
    "subject" TEXT NOT NULL,
    "subjectOwner" TEXT,
    "subjectTime" BIGINT,
    "creation" BIGINT,
    "desc" TEXT,
    "descOwner" TEXT,
    "descId" TEXT,
    "restrict" BOOLEAN,
    "announce" BOOLEAN,
    "size" INTEGER,
    "participants" JSONB NOT NULL,
    "ephemeralDuration" INTEGER,
    "inviteCode" TEXT,

    CONSTRAINT "group_metadata_pkey" PRIMARY KEY ("pkId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "pkId" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("pkId")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "pkId" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("pkId")
);

-- CreateIndex
CREATE INDEX "chats_sessionId_idx" ON "chats"("sessionId");

-- CreateIndex
CREATE INDEX "chats_conversationTimestamp_idx" ON "chats"("conversationTimestamp");

-- CreateIndex
CREATE INDEX "chats_archived_idx" ON "chats"("archived");

-- CreateIndex
CREATE INDEX "chats_pinned_idx" ON "chats"("pinned");

-- CreateIndex
CREATE INDEX "chats_sessionId_conversationTimestamp_idx" ON "chats"("sessionId", "conversationTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "chats_sessionId_id_key" ON "chats"("sessionId", "id");

-- CreateIndex
CREATE INDEX "contacts_sessionId_idx" ON "contacts"("sessionId");

-- CreateIndex
CREATE INDEX "contacts_verifiedName_idx" ON "contacts"("verifiedName");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_sessionId_id_key" ON "contacts"("sessionId", "id");

-- CreateIndex
CREATE INDEX "messages_sessionId_idx" ON "messages"("sessionId");

-- CreateIndex
CREATE INDEX "messages_remoteJid_idx" ON "messages"("remoteJid");

-- CreateIndex
CREATE INDEX "messages_sessionId_remoteJid_idx" ON "messages"("sessionId", "remoteJid");

-- CreateIndex
CREATE INDEX "messages_messageTimestamp_idx" ON "messages"("messageTimestamp");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- CreateIndex
CREATE INDEX "messages_starred_idx" ON "messages"("starred");

-- CreateIndex
CREATE INDEX "messages_participant_idx" ON "messages"("participant");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sessionId_remoteJid_id_key" ON "messages"("sessionId", "remoteJid", "id");

-- CreateIndex
CREATE INDEX "group_metadata_sessionId_idx" ON "group_metadata"("sessionId");

-- CreateIndex
CREATE INDEX "group_metadata_subject_idx" ON "group_metadata"("subject");

-- CreateIndex
CREATE UNIQUE INDEX "group_metadata_sessionId_id_key" ON "group_metadata"("sessionId", "id");

-- CreateIndex
CREATE INDEX "sessions_sessionId_idx" ON "sessions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionId_id_key" ON "sessions"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_id_key" ON "message_templates"("id");

-- CreateIndex
CREATE INDEX "message_templates_sessionId_idx" ON "message_templates"("sessionId");

-- CreateIndex
CREATE INDEX "message_templates_type_idx" ON "message_templates"("type");
