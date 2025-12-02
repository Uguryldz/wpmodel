import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  useMultiFileAuthState,
  downloadContentFromMessage,
  isJidBroadcast,
  generateForwardMessageContent,
} from "baileys";
import Boom from "@hapi/boom";
import qrcode from "qrcode-terminal";
import { prisma, logger } from "./shared.js";
import { serializePrisma } from "./utils.js";
import { findSessionByWhatsAppJid, migrateSessionData } from "./sessionMapper.js";

const AUTH_FOLDER = "./auth_info";
const DEFAULT_ACCOUNT_ID = "default";

/**
 * Her hesap için ayrı soket, store ve durum bilgisi tutuyoruz
 */
const instances = new Map();

const getAccountId = (accountId) => accountId || DEFAULT_ACCOUNT_ID;

const getOrCreateInstance = (accountId) => {
  const id = getAccountId(accountId);
  if (!instances.has(id)) {
    instances.set(id, {
      id,
      sock: null,
      authState: null,
      saveCredsFn: null,
      waVersion: null,
      reconnectTimer: null,
      chatsStore: new Map(),
      messagesStore: new Map(),
      connectionState: {
        status: "initializing",
        version: null,
        isLatest: null,
        lastError: null,
        lastQr: null,
        qrGeneratedAt: null,
        startedAt: null,
      },
    });
  }

  return instances.get(id);
};

const removeInstance = (accountId) => {
  const id = getAccountId(accountId);
  const instance = instances.get(id);
  if (!instance) return;

  if (instance.reconnectTimer) {
    clearTimeout(instance.reconnectTimer);
  }

  instances.delete(id);
};

export const listSessions = () =>
  Array.from(instances.values()).map((instance) => ({
    id: instance.id,
    status: instance.connectionState.status,
  }));

export const sessionExists = (accountId) => {
  const id = getAccountId(accountId);
  return instances.has(id);
};

const ensureSocket = (accountId) => {
  const instance = getOrCreateInstance(accountId);
  if (!instance.sock) {
    throw new Error(
      `WhatsApp soketi (${instance.id}) henüz hazır değil. Lütfen birkaç saniye sonra tekrar deneyin.`
    );
  }

  return instance.sock;
};

const normalizeJid = (value) => {
  if (!value || typeof value !== "string") {
    throw new Error("Alıcı (jid) değeri zorunludur.");
  }

  if (value.includes("@")) {
    return value;
  }

  const suffix = value.includes("-") ? "@g.us" : "@s.whatsapp.net";
  return `${value}${suffix}`;
};

const formatChat = (chat) => ({
  id: chat.id,
  name: chat.name || chat.subject || chat.id,
  unreadCount: chat.unreadCount ?? 0,
  conversationTimestamp: chat.conversationTimestamp ?? null,
  isMuted: Boolean(chat.isMuted),
});

const extractText = (message) =>
  message?.conversation ||
  message?.extendedTextMessage?.text ||
  message?.imageMessage?.caption ||
  message?.videoMessage?.caption ||
  null;

const formatMessage = (msg) => ({
  id: msg.key?.id,
  from: msg.key?.remoteJid,
  fromMe: Boolean(msg.key?.fromMe),
  participant: msg.key?.participant || null,
  timestamp: Number(
    msg.messageTimestamp || msg.messageStubParameters?.timestamp || Date.now()
  ),
  type: msg.message?.messageStubType || Object.keys(msg.message || {})[0],
  text: extractText(msg.message),
});

// Prisma'ya mesaj kaydet
const saveMessagesToPrisma = async (sessionId, messages = []) => {
  if (!messages.length) return;

  for (const msg of messages) {
    if (!msg.key?.remoteJid || !msg.key?.id) continue;
    if (isJidBroadcast(msg.key.remoteJid)) continue;

    try {
      await prisma.message.upsert({
        where: {
          sessionId_remoteJid_id: {
            sessionId,
            remoteJid: msg.key.remoteJid,
            id: msg.key.id,
          },
        },
        create: {
          sessionId,
          remoteJid: msg.key.remoteJid,
          id: msg.key.id,
          key: JSON.stringify(msg.key),
          message: msg.message ? JSON.stringify(msg.message) : null,
          messageTimestamp: msg.messageTimestamp ? BigInt(msg.messageTimestamp) : null,
          participant: msg.key.participant || null,
          messageStubType: msg.messageStubType || null,
          messageStubParameters: msg.messageStubParameters
            ? JSON.stringify(msg.messageStubParameters)
            : null,
        },
        update: {
          message: msg.message ? JSON.stringify(msg.message) : undefined,
          messageTimestamp: msg.messageTimestamp ? BigInt(msg.messageTimestamp) : undefined,
        },
      });
    } catch (error) {
      logger.error({ error, sessionId, msgId: msg.key.id }, "Mesaj kaydedilemedi");
    }
  }
};

// Memory store'a da kaydet (geriye dönük uyumluluk için)
const saveMessages = (instance, jid, messages = []) => {
  if (!jid) return;
  const normalized = jidNormalizedUser(jid);
  const existing = instance.messagesStore.get(normalized) || [];
  const updated = [...existing, ...messages.map(formatMessage)].slice(-200);
  instance.messagesStore.set(normalized, updated);
};

const bindSocketEvents = (instance) => {
  const { sock, connectionState } = instance;
  const sessionId = instance.id;

  sock.ev.on("creds.update", instance.saveCredsFn);

  // Chats - Prisma'ya kaydet
  sock.ev.on("chats.set", async ({ chats }) => {
    for (const chat of chats) {
      instance.chatsStore.set(chat.id, chat);
      try {
        await prisma.chat.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: chat.id,
            },
          },
          create: {
            sessionId,
            id: chat.id,
            name: chat.name || null,
            displayName: chat.displayName || null,
            unreadCount: chat.unreadCount || 0,
            conversationTimestamp: chat.conversationTimestamp
              ? BigInt(chat.conversationTimestamp)
              : null,
            lastMsgTimestamp: chat.lastMsgTimestamp ? BigInt(chat.lastMsgTimestamp) : null,
            archived: chat.archived || false,
            pinned: chat.pinned || null,
            participant: chat.participants ? JSON.stringify(chat.participants) : null,
            messages: chat.messages ? JSON.stringify(chat.messages) : null,
          },
          update: {
            name: chat.name || undefined,
            displayName: chat.displayName || undefined,
            unreadCount: chat.unreadCount !== undefined ? chat.unreadCount : undefined,
            conversationTimestamp: chat.conversationTimestamp
              ? BigInt(chat.conversationTimestamp)
              : undefined,
            lastMsgTimestamp: chat.lastMsgTimestamp ? BigInt(chat.lastMsgTimestamp) : undefined,
            archived: chat.archived !== undefined ? chat.archived : undefined,
            pinned: chat.pinned !== undefined ? chat.pinned : undefined,
            participant: chat.participants ? JSON.stringify(chat.participants) : undefined,
          },
        });
      } catch (error) {
        logger.error({ error, sessionId, chatId: chat.id }, "Chat kaydedilemedi");
      }
    }
  });

  sock.ev.on("chats.upsert", async (chats) => {
    for (const chat of chats) {
      instance.chatsStore.set(chat.id, chat);
      try {
        await prisma.chat.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: chat.id,
            },
          },
          create: {
            sessionId,
            id: chat.id,
            name: chat.name || null,
            displayName: chat.displayName || null,
            unreadCount: chat.unreadCount || 0,
            conversationTimestamp: chat.conversationTimestamp
              ? BigInt(chat.conversationTimestamp)
              : null,
            lastMsgTimestamp: chat.lastMsgTimestamp ? BigInt(chat.lastMsgTimestamp) : null,
            archived: chat.archived || false,
            pinned: chat.pinned || null,
            participant: chat.participants ? JSON.stringify(chat.participants) : null,
          },
          update: {
            name: chat.name || undefined,
            displayName: chat.displayName || undefined,
            unreadCount: chat.unreadCount !== undefined ? chat.unreadCount : undefined,
            conversationTimestamp: chat.conversationTimestamp
              ? BigInt(chat.conversationTimestamp)
              : undefined,
            lastMsgTimestamp: chat.lastMsgTimestamp ? BigInt(chat.lastMsgTimestamp) : undefined,
            archived: chat.archived !== undefined ? chat.archived : undefined,
            pinned: chat.pinned !== undefined ? chat.pinned : undefined,
          },
        });
      } catch (error) {
        logger.error({ error, sessionId, chatId: chat.id }, "Chat kaydedilemedi");
      }
    }
  });

  sock.ev.on("chats.update", async (updates) => {
    for (const update of updates) {
      const existing = instance.chatsStore.get(update.id) || {};
      const merged = { ...existing, ...update };
      instance.chatsStore.set(update.id, merged);

      try {
        await prisma.chat.updateMany({
          where: {
            sessionId,
            id: update.id,
          },
          data: {
            name: update.name !== undefined ? update.name : undefined,
            displayName: update.displayName !== undefined ? update.displayName : undefined,
            unreadCount: update.unreadCount !== undefined ? update.unreadCount : undefined,
            conversationTimestamp: update.conversationTimestamp
              ? BigInt(update.conversationTimestamp)
              : undefined,
            lastMsgTimestamp: update.lastMsgTimestamp ? BigInt(update.lastMsgTimestamp) : undefined,
            archived: update.archived !== undefined ? update.archived : undefined,
            pinned: update.pinned !== undefined ? update.pinned : undefined,
          },
        });
      } catch (error) {
        logger.error({ error, sessionId, chatId: update.id }, "Chat güncellenemedi");
      }
    }
  });

  // Contacts - Prisma'ya kaydet
  sock.ev.on("contacts.upsert", async (contacts) => {
    for (const contact of contacts) {
      const existing = instance.chatsStore.get(contact.id);
      if (existing) {
        instance.chatsStore.set(contact.id, { ...existing, ...contact });
      } else {
        instance.chatsStore.set(contact.id, contact);
      }

      try {
        await prisma.contact.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: contact.id,
            },
          },
          create: {
            sessionId,
            id: contact.id,
            name: contact.name || null,
            notify: contact.notify || null,
            verifiedName: contact.verifiedName || null,
            imgUrl: contact.imgUrl || null,
            status: contact.status || null,
          },
          update: {
            name: contact.name || undefined,
            notify: contact.notify || undefined,
            verifiedName: contact.verifiedName || undefined,
            imgUrl: contact.imgUrl || undefined,
            status: contact.status || undefined,
          },
        });
      } catch (error) {
        logger.error({ error, sessionId, contactId: contact.id }, "Contact kaydedilemedi");
      }
    }
  });

  // Messages - Prisma'ya kaydet
  sock.ev.on("messages.set", async ({ messages }) => {
    for (const msg of messages) {
      saveMessages(instance, msg.key?.remoteJid, [msg]);
    }
    await saveMessagesToPrisma(sessionId, messages);
  });

  sock.ev.on("messages.upsert", async (event) => {
    const { type, messages } = event;
    for (const msg of messages) {
      saveMessages(instance, msg.key?.remoteJid, [msg]);
    }
    await saveMessagesToPrisma(sessionId, messages);

    if (type === "notify") {
      logger.info({ sessionId, count: messages.length }, "Yeni mesajlar alındı");
    }
  });

  // Groups metadata - Prisma'ya kaydet
  sock.ev.on("groups.update", async (updates) => {
    for (const update of updates) {
      try {
        const metadata = await sock.groupMetadata(update.id);
        await prisma.groupMetadata.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: metadata.id,
            },
          },
          create: {
            sessionId,
            id: metadata.id,
            subject: metadata.subject || "",
            owner: metadata.owner || null,
            subjectOwner: metadata.subjectOwner || null,
            subjectTime: metadata.subjectTime || null,
            creation: metadata.creation || null,
            desc: metadata.desc || null,
            descOwner: metadata.descOwner || null,
            descId: metadata.descId || null,
            restrict: metadata.restrict || false,
            announce: metadata.announce || false,
            size: metadata.participants?.length || 0,
            participants: JSON.stringify(metadata.participants || []),
            ephemeralDuration: metadata.ephemeralDuration || null,
            inviteCode: metadata.inviteCode || null,
          },
          update: {
            subject: metadata.subject || undefined,
            owner: metadata.owner || undefined,
            subjectOwner: metadata.subjectOwner || undefined,
            subjectTime: metadata.subjectTime || undefined,
            desc: metadata.desc || undefined,
            descOwner: metadata.descOwner || undefined,
            descId: metadata.descId || undefined,
            restrict: metadata.restrict !== undefined ? metadata.restrict : undefined,
            announce: metadata.announce !== undefined ? metadata.announce : undefined,
            size: metadata.participants?.length || undefined,
            participants: JSON.stringify(metadata.participants || []),
            ephemeralDuration: metadata.ephemeralDuration || undefined,
            inviteCode: metadata.inviteCode || undefined,
          },
        });
      } catch (error) {
        logger.error({ error, sessionId, groupId: update.id }, "Grup metadata kaydedilemedi");
      }
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionState.lastQr = qr;
      connectionState.qrGeneratedAt = new Date().toISOString();
      console.log(
        `\n[${instance.id}] Yeni QR kodu üretildi. WhatsApp uygulamasından taratın:`
      );
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      connectionState.status = "connecting";
      connectionState.lastError = null;
    }

    if (connection === "open") {
      connectionState.status = "open";
      connectionState.lastQr = null;
      connectionState.lastError = null;
      console.log(`[${instance.id}] WhatsApp bağlantısı hazır ✅`);
      
      // WhatsApp numarasını al ve sessionId ile eşleştir
      (async () => {
        try {
          const whatsappJid = sock.user?.id;
          instance.whatsappJid = whatsappJid;
          
          if (whatsappJid) {
            // Aynı WhatsApp numarası için eski sessionId'yi bul
            const oldSessionId = await findSessionByWhatsAppJid(whatsappJid);

            // Eğer bu numara için başka bir sessionId varsa, verileri taşı
            if (oldSessionId && oldSessionId !== sessionId) {
              logger.info(
                { oldSessionId, newSessionId: sessionId, whatsappJid },
                "Aynı WhatsApp hesabı için farklı sessionId tespit edildi, veriler taşınıyor"
              );

              // Verileri yeni sessionId'ye taşı
              await migrateSessionData(oldSessionId, sessionId);

              // Eski sessionId mapping'ini sil
              await prisma.session.deleteMany({
                where: {
                  id: { startsWith: `whatsapp-${whatsappJid}-` },
                  sessionId: oldSessionId,
                },
              });
            }

            // WhatsApp numarasını sessionId ile eşleştir
            await prisma.session.upsert({
              where: {
                sessionId_id: {
                  sessionId,
                  id: `whatsapp-${whatsappJid}-${sessionId}`,
                },
              },
              create: {
                sessionId,
                id: `whatsapp-${whatsappJid}-${sessionId}`,
                data: JSON.stringify({ whatsappJid, mappedAt: new Date().toISOString() }),
              },
              update: {
                data: JSON.stringify({ whatsappJid, mappedAt: new Date().toISOString() }),
              },
            });
          }
        } catch (error) {
          logger.error({ error, sessionId }, "WhatsApp numarası eşleştirilemedi");
        }
      })();
      
      return;
    }

    if (connection === "close") {
      connectionState.status = "close";
      const error = lastDisconnect?.error;
      const boomError = Boom.isBoom(error) ? error : null;
      const statusCode = boomError?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      connectionState.lastError = error?.message || boomError?.message || "Bilinmeyen hata";

      console.warn(`[${instance.id}] Bağlantı kapandı`, {
        statusCode,
        shouldReconnect,
      });

      if (shouldReconnect) {
        clearTimeout(instance.reconnectTimer);
        instance.reconnectTimer = setTimeout(() => {
          console.log(`[${instance.id}] Yeniden bağlanma deneniyor...`);
          startSocket(instance);
        }, 2_000);
      } else {
        console.log(
          `[${instance.id}] Oturum kapandı. Tekrar bağlanmak için ilgili auth klasörünü temizleyin.`
        );
      }
    }
  });
};

const startSocket = (instance) => {
  const { authState, waVersion } = instance;
  if (!authState || !waVersion) {
    throw new Error("Kimlik doğrulama durumu yüklenemedi.");
  }

  instance.sock = makeWASocket({
    auth: authState,
    version: waVersion,
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  bindSocketEvents(instance);
};

export const initBaileys = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  if (instance.sock) {
    return instance.sock;
  }

  const authDir = `${AUTH_FOLDER}/${instance.id}`;
  const auth = await useMultiFileAuthState(authDir);
  instance.authState = auth.state;
  instance.saveCredsFn = auth.saveCreds;

  const versionInfo = await fetchLatestBaileysVersion();
  instance.waVersion = versionInfo.version;

  instance.connectionState.version = instance.waVersion.join(".");
  instance.connectionState.isLatest = versionInfo.isLatest;
  instance.connectionState.startedAt = new Date().toISOString();

  startSocket(instance);

  return instance.sock;
};

export const getConnectionState = (accountId) => {
  const instance = getOrCreateInstance(accountId);
  return {
    accountId: instance.id,
    ...instance.connectionState,
    socketReady: Boolean(instance.sock),
  };
};

export const getLastQr = (accountId) => {
  const instance = getOrCreateInstance(accountId);
  return instance.connectionState.lastQr;
};

export const listChats = async (accountId, cursor, limit = 25) => {
  const sessionId = getAccountId(accountId);
  
  try {
    const chats = await prisma.chat.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: { sessionId },
      orderBy: { conversationTimestamp: "desc" },
    });

    const serialized = chats.map((c) => serializePrisma(c));
    const nextCursor =
      serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].pkId
        : null;

    return {
      data: serialized.map(formatChat),
      cursor: nextCursor,
    };
  } catch (error) {
    logger.error({ error, sessionId }, "Chat listesi alınamadı");
    // Fallback to memory store
    const instance = getOrCreateInstance(accountId);
    return {
      data: Array.from(instance.chatsStore.values()).map(formatChat),
      cursor: null,
    };
  }
};

export const listMessages = async (accountId, jid, cursor, limit = 25) => {
  const sessionId = getAccountId(accountId);
  const normalizedJid = jidNormalizedUser(normalizeJid(jid));

  try {
    const messages = await prisma.message.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: {
        sessionId,
        remoteJid: normalizedJid,
      },
      orderBy: { messageTimestamp: "desc" },
    });

    const serialized = messages.map((m) => serializePrisma(m));
    const nextCursor =
      serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].pkId
        : null;

    return {
      data: serialized.map((m) => ({
        id: m.id,
        from: m.remoteJid,
        fromMe: m.key?.fromMe || false,
        participant: m.participant || null,
        timestamp: Number(m.messageTimestamp || 0),
        type: m.messageStubType || Object.keys(m.message || {})[0] || "unknown",
        text: extractText(m.message),
      })),
      cursor: nextCursor,
    };
  } catch (error) {
    logger.error({ error, sessionId, jid: normalizedJid }, "Mesaj listesi alınamadı");
    // Fallback to memory store
    const instance = getOrCreateInstance(accountId);
    const messages = instance.messagesStore.get(normalizedJid) || [];
    const safeLimit = Math.min(Number(limit) || 20, 100);
    return {
      data: messages.slice(-safeLimit),
      cursor: null,
    };
  }
};

export const listMessagesWithCursor = async (accountId, jid, cursor, limit = 20) => {
  return await listMessages(accountId, jid, cursor, limit);
};

const buildMediaContent = ({ buffer, mimetype, caption }) => {
  if (!mimetype) {
    throw new Error("mimetype alanı zorunludur.");
  }

  if (mimetype.startsWith("image/")) {
    return { image: buffer, mimetype, caption };
  }

  if (mimetype.startsWith("video/")) {
    return { video: buffer, mimetype, caption };
  }

  if (mimetype.startsWith("audio/")) {
    return { audio: buffer, mimetype, ptt: false };
  }

  return { document: buffer, mimetype, fileName: caption || "dosya" };
};

export const sendTextMessage = async ({ accountId, to, message, options }) => {
  if (!to || !message) {
    throw new Error("Mesaj göndermek için to ve message alanları zorunludur.");
  }

  const jid = normalizeJid(to);
  await ensureSocket(accountId).sendMessage(jid, { text: message }, options);

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

export const sendMediaMessage = async ({ accountId, to, media, mimetype, caption }) => {
  if (!media || !mimetype) {
    throw new Error("Medya göndermek için media (base64) ve mimetype alanları zorunludur.");
  }

  const jid = normalizeJid(to);
  const buffer = Buffer.from(media, "base64");
  const content = buildMediaContent({ buffer, mimetype, caption });
  await ensureSocket(accountId).sendMessage(jid, content);

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

export const createGroup = async (accountId, subject, participants = []) => {
  if (!subject) {
    throw new Error("Grup oluşturmak için subject zorunludur.");
  }

  const normalized = participants.map(normalizeJid);
  return ensureSocket(accountId).groupCreate(subject, normalized);
};

export const updateGroupParticipants = async (
  accountId,
  groupJid,
  participants = [],
  action = "add"
) => {
  if (!groupJid || participants.length === 0) {
    throw new Error("Grup katılımcı değişiklikleri için grup ve en az bir katılımcı gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const normalizedParticipants = participants.map(normalizeJid);
  return ensureSocket(accountId).groupParticipantsUpdate(
    normalizedGroup,
    normalizedParticipants,
    action
  );
};

export const blockContact = async (accountId, jid, block = true) => {
  if (!jid) {
    throw new Error("Kişi engellemek için jid zorunludur.");
  }

  const normalized = normalizeJid(jid);
  return ensureSocket(accountId).updateBlockStatus(
    normalized,
    block ? "block" : "unblock"
  );
};

export const performLogout = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  if (!instance.sock) {
    return;
  }

  await instance.sock.logout();
  instance.connectionState.status = "logged_out";
  instance.connectionState.lastQr = null;
};

export const deleteSession = async (accountId) => {
  const instance = getOrCreateInstance(accountId);
  const sessionId = instance.id;

  if (instance.sock) {
    try {
      await instance.sock.logout();
    } catch {
      // ignore
    }
  }

  // Prisma'dan verileri sil
  try {
    await Promise.all([
      prisma.chat.deleteMany({ where: { sessionId } }),
      prisma.contact.deleteMany({ where: { sessionId } }),
      prisma.message.deleteMany({ where: { sessionId } }),
      prisma.groupMetadata.deleteMany({ where: { sessionId } }),
      prisma.session.deleteMany({ where: { sessionId } }),
    ]);
  } catch (error) {
    logger.error({ error, sessionId }, "Session verileri silinemedi");
  }

  removeInstance(accountId);
};

export const listContacts = async (accountId, cursor, limit = 50) => {
  const sessionId = getAccountId(accountId);

  try {
    const contacts = await prisma.contact.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: { sessionId },
      orderBy: { pkId: "desc" },
    });

    const serialized = contacts.map((c) => serializePrisma(c));
    const nextCursor =
      serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].pkId
        : null;

    return {
      data: serialized.map((c) => ({
        id: c.id,
        name: c.name || c.notify || c.id,
        notify: c.notify || null,
        verifiedName: c.verifiedName || null,
        imgUrl: c.imgUrl || null,
        status: c.status || null,
      })),
      cursor: nextCursor,
    };
  } catch (error) {
    logger.error({ error, sessionId }, "Contact listesi alınamadı");
    return { data: [], cursor: null };
  }
};

export const listGroups = async (accountId, cursor, limit = 50) => {
  const sessionId = getAccountId(accountId);

  try {
    const groups = await prisma.groupMetadata.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: { sessionId },
      orderBy: { creation: "desc" },
    });

    const serialized = groups.map((g) => serializePrisma(g));
    const nextCursor =
      serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].pkId
        : null;

    return {
      data: serialized.map((g) => ({
        id: g.id,
        subject: g.subject,
        owner: g.owner || null,
        size: g.size || 0,
        creation: g.creation || null,
        desc: g.desc || null,
        restrict: g.restrict || false,
        announce: g.announce || false,
        participants: g.participants || [],
      })),
      cursor: nextCursor,
    };
  } catch (error) {
    logger.error({ error, sessionId }, "Grup listesi alınamadı");
    // Fallback to API call
    try {
      const sock = ensureSocket(accountId);
      const groups = await sock.groupFetchAllParticipating();
      const all = Object.values(groups || {});
      all.sort((a, b) => (b.creation || 0) - (a.creation || 0));
      const slice = all.slice(0, limit);
      return {
        data: slice.map((g) => ({
          id: g.id,
          subject: g.subject,
          size: g.size,
          creation: g.creation,
        })),
        cursor: null,
      };
    } catch (fallbackError) {
      logger.error({ error: fallbackError, sessionId }, "Grup listesi fallback başarısız");
      return { data: [], cursor: null };
    }
  }
};

export const checkNumber = async (accountId, jidOrNumber) => {
  const sock = ensureSocket(accountId);
  const jid = normalizeJid(jidOrNumber);
  const [info] = await sock.onWhatsApp(jid);
  return info || null;
};

export const getProfilePicture = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(jid);
  const url = await sock.profilePictureUrl(normalized, "image");
  return url || null;
};

export const listBlockedNumbers = async (accountId) => {
  const sock = ensureSocket(accountId);
  if (typeof sock.fetchBlocklist !== "function") {
    return [];
  }

  const list = await sock.fetchBlocklist();
  return list || [];
};

export const sendRawMessage = async (accountId, jid, message, options) => {
  if (!jid || !message) {
    throw new Error("Mesaj göndermek için jid ve message alanları zorunludur.");
  }

  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(jid);
  await sock.sendMessage(normalized, message, options);

  return { accountId: getAccountId(accountId), jid: normalized, status: "queued" };
};

export const sendBulkMessages = async (accountId, items = []) => {
  const results = [];
  for (const item of items) {
    const { jid, message, options, type } = item || {};
    if (!jid || !message) continue;

    if (type === "text") {
      results.push(await sendTextMessage({ accountId, to: jid, message, options }));
    } else {
      results.push(await sendRawMessage(accountId, jid, message, options));
    }
  }

  return results;
};

export const downloadMessageMedia = async (accountId, message, mediaType) => {
  if (!message || !mediaType) {
    throw new Error("Medya indirmek için message ve mediaType alanları zorunludur.");
  }

  // mediaType: 'image' | 'video' | 'audio' | 'document' vb.
  const stream = await downloadContentFromMessage(message, mediaType);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  return buffer.toString("base64");
};

// ========== MESAJ YÖNETİMİ ==========

// Mesajları okundu olarak işaretle
export const markMessagesAsRead = async (accountId, jid, messageIds = []) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  if (messageIds.length === 0) {
    // Tüm mesajları okundu işaretle
    const messages = await prisma.message.findMany({
      where: {
        sessionId: getAccountId(accountId),
        remoteJid: normalizedJid,
        key: { not: null },
      },
      take: 100,
    });

    const keys = messages
      .map((m) => {
        try {
          const key = typeof m.key === "string" ? JSON.parse(m.key) : m.key;
          return key;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (keys.length > 0) {
      await sock.readMessages(keys);
    }
  } else {
    // Belirli mesajları okundu işaretle
    const messages = await prisma.message.findMany({
      where: {
        sessionId: getAccountId(accountId),
        remoteJid: normalizedJid,
        id: { in: messageIds },
      },
    });

    const keys = messages
      .map((m) => {
        try {
          const key = typeof m.key === "string" ? JSON.parse(m.key) : m.key;
          return key;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (keys.length > 0) {
      await sock.readMessages(keys);
    }
  }

  return { status: "read", count: messageIds.length || "all" };
};

// Mesaj sil
export const deleteMessage = async (accountId, jid, messageId, deleteForEveryone = false) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("Mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
  } catch {
    throw new Error("Mesaj anahtarı geçersiz");
  }

  // Baileys kaynak koduna göre: content.delete kullanılır
  await sock.sendMessage(normalizedJid, {
    delete: {
      remoteJid: key.remoteJid,
      id: key.id,
      fromMe: key.fromMe || false,
    },
  });

  if (deleteForEveryone) {
    // Herkes için sil - fromMe: true ile tekrar gönder
    await sock.sendMessage(normalizedJid, {
      delete: {
        remoteJid: key.remoteJid,
        id: key.id,
        fromMe: true,
      },
    });
  }

  // Prisma'dan sil
  await prisma.message.deleteMany({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  return { status: "deleted", messageId, deleteForEveryone };
};

// Mesaj yanıtla (reply)
export const replyToMessage = async (accountId, jid, messageId, replyMessage) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("Yanıtlanacak mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
  } catch {
    throw new Error("Mesaj anahtarı geçersiz");
  }

  let messageContent;
  if (typeof replyMessage === "string") {
    messageContent = { text: replyMessage };
  } else {
    messageContent = replyMessage;
  }

  await sock.sendMessage(normalizedJid, messageContent, {
    quoted: key,
  });

  return { status: "replied", messageId, jid: normalizedJid };
};

// Mesaj ilet (forward)
export const forwardMessage = async (accountId, fromJid, toJid, messageId) => {
  const sock = ensureSocket(accountId);
  const normalizedFromJid = normalizeJid(fromJid);
  const normalizedToJid = normalizeJid(toJid);

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedFromJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("İletilecek mesaj bulunamadı");
  }

  let msgData;
  try {
    msgData = typeof message.message === "string" ? JSON.parse(message.message) : message.message;
  } catch {
    throw new Error("Mesaj verisi geçersiz");
  }

  if (!msgData) {
    throw new Error("Mesaj içeriği bulunamadı");
  }

  // Baileys kaynak koduna göre: generateForwardMessageContent kullanılır
  const forwardContent = generateForwardMessageContent(msgData, false);
  await sock.sendMessage(normalizedToJid, forwardContent);

  return { status: "forwarded", messageId, from: normalizedFromJid, to: normalizedToJid };
};

// Mesaj düzenle (edit)
export const editMessage = async (accountId, jid, messageId, newMessage) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("Düzenlenecek mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
  } catch {
    throw new Error("Mesaj anahtarı geçersiz");
  }

  if (!key.fromMe) {
    throw new Error("Sadece kendi mesajlarını düzenleyebilirsin");
  }

  let messageContent;
  if (typeof newMessage === "string") {
    messageContent = { text: newMessage };
  } else {
    messageContent = newMessage;
  }

  // Baileys kaynak koduna göre: content.edit kullanılır
  await sock.sendMessage(normalizedJid, {
    ...messageContent,
    edit: key,
  });

  return { status: "edited", messageId, jid: normalizedJid };
};

// Mesaj yıldızla/yıldızı kaldır
export const starMessage = async (accountId, jid, messageId, star = true) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("Mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
  } catch {
    throw new Error("Mesaj anahtarı geçersiz");
  }

  await sock.sendMessage(normalizedJid, {
    react: {
      text: star ? "⭐" : "",
      key: key,
    },
  });

  // Prisma'da güncelle
  await prisma.message.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
    data: {
      starred: star,
    },
  });

  return { status: star ? "starred" : "unstarred", messageId };
};

// ========== REAKSİYONLAR ==========

// Mesaja reaksiyon gönder
export const sendReaction = async (accountId, jid, messageId, emoji) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  const message = await prisma.message.findFirst({
    where: {
      sessionId: getAccountId(accountId),
      remoteJid: normalizedJid,
      id: messageId,
    },
  });

  if (!message) {
    throw new Error("Mesaj bulunamadı");
  }

  let key;
  try {
    key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
  } catch {
    throw new Error("Mesaj anahtarı geçersiz");
  }

  await sock.sendMessage(normalizedJid, {
    react: {
      text: emoji || "👍",
      key: key,
    },
  });

  return { status: "reaction_sent", messageId, emoji: emoji || "👍" };
};

// Reaksiyonu kaldır
export const removeReaction = async (accountId, jid, messageId) => {
  return await sendReaction(accountId, jid, messageId, "");
};

// ========== DURUM GÖSTERGELERİ ==========

// Yazıyor göstergesi gönder
export const sendTyping = async (accountId, jid, duration = 5000) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendPresenceUpdate("composing", normalizedJid);

  if (duration > 0) {
    setTimeout(async () => {
      await sock.sendPresenceUpdate("available", normalizedJid);
    }, duration);
  }

  return { status: "typing", jid: normalizedJid, duration };
};

// Yazmayı durdur
export const stopTyping = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendPresenceUpdate("available", normalizedJid);

  return { status: "stopped_typing", jid: normalizedJid };
};

// Durum güncelle (available, unavailable, composing, recording)
export const updatePresence = async (accountId, jid, presence) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = jid ? normalizeJid(jid) : undefined;

  await sock.sendPresenceUpdate(presence || "available", normalizedJid);

  return { status: "presence_updated", presence, jid: normalizedJid };
};

// ========== GRUP YÖNETİMİ ==========

// Grup ayarlarını güncelle
export const updateGroupSettings = async (
  accountId,
  groupJid,
  settings = {}
) => {
  const sock = ensureSocket(accountId);
  const normalizedGroupJid = normalizeJid(groupJid);

  const updates = [];

  if (settings.restrict !== undefined) {
    await sock.groupSettingUpdate(normalizedGroupJid, "restrict", settings.restrict);
    updates.push(`restrict: ${settings.restrict}`);
  }

  if (settings.announce !== undefined) {
    await sock.groupSettingUpdate(normalizedGroupJid, "announce", settings.announce);
    updates.push(`announce: ${settings.announce}`);
  }

  // Prisma'da güncelle
  await prisma.groupMetadata.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      id: normalizedGroupJid,
    },
    data: {
      restrict: settings.restrict !== undefined ? settings.restrict : undefined,
      announce: settings.announce !== undefined ? settings.announce : undefined,
    },
  });

  return { status: "settings_updated", groupJid: normalizedGroupJid, updates };
};

// Grup davet linki al
export const getGroupInviteLink = async (accountId, groupJid, reset = false) => {
  const sock = ensureSocket(accountId);
  const normalizedGroupJid = normalizeJid(groupJid);

  const code = await sock.groupInviteCode(normalizedGroupJid, reset);
  const inviteLink = `https://chat.whatsapp.com/${code}`;

  // Prisma'da güncelle
  await prisma.groupMetadata.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      id: normalizedGroupJid,
    },
    data: {
      inviteCode: code,
    },
  });

  return { inviteLink, code, groupJid: normalizedGroupJid };
};

// Grup davet linkini sıfırla
export const resetGroupInviteLink = async (accountId, groupJid) => {
  return await getGroupInviteLink(accountId, groupJid, true);
};

// Grup açıklamasını güncelle
export const updateGroupDescription = async (accountId, groupJid, description) => {
  const sock = ensureSocket(accountId);
  const normalizedGroupJid = normalizeJid(groupJid);

  await sock.groupUpdateDescription(normalizedGroupJid, description);

  // Prisma'da güncelle
  await prisma.groupMetadata.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      id: normalizedGroupJid,
    },
    data: {
      desc: description,
    },
  });

  return { status: "description_updated", groupJid: normalizedGroupJid, description };
};

// Grup adını güncelle
export const updateGroupSubject = async (accountId, groupJid, subject) => {
  const sock = ensureSocket(accountId);
  const normalizedGroupJid = normalizeJid(groupJid);

  await sock.groupUpdateSubject(normalizedGroupJid, subject);

  // Prisma'da güncelle
  await prisma.groupMetadata.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      id: normalizedGroupJid,
    },
    data: {
      subject: subject,
    },
  });

  return { status: "subject_updated", groupJid: normalizedGroupJid, subject };
};

// Grup fotoğrafını güncelle
export const updateGroupPicture = async (accountId, groupJid, imageBuffer) => {
  const sock = ensureSocket(accountId);
  const normalizedGroupJid = normalizeJid(groupJid);

  const buffer = Buffer.isBuffer(imageBuffer)
    ? imageBuffer
    : Buffer.from(imageBuffer, "base64");

  await sock.updateProfilePicture(normalizedGroupJid, buffer);

  return { status: "picture_updated", groupJid: normalizedGroupJid };
};

// ========== SOHBET YÖNETİMİ ==========

// Sohbeti arşivle/kaldır
export const archiveChat = async (accountId, jid, archive = true) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.chatModify(
    {
      archive: archive,
    },
    normalizedJid
  );

  // Prisma'da güncelle
  await prisma.chat.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      id: normalizedJid,
    },
    data: {
      archived: archive,
    },
  });

  return { status: archive ? "archived" : "unarchived", jid: normalizedJid };
};

// Sohbeti sabitle/kaldır
export const pinChat = async (accountId, jid, pin = true) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.chatModify(
    {
      pin: pin,
    },
    normalizedJid
  );

  // Prisma'da güncelle
  await prisma.chat.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      id: normalizedJid,
    },
    data: {
      pinned: pin ? Date.now() : null,
    },
  });

  return { status: pin ? "pinned" : "unpinned", jid: normalizedJid };
};

// Sohbeti sessize al/kaldır
export const muteChat = async (accountId, jid, muteDuration = null) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  // muteDuration: null = sessizliği kaldır, timestamp = sessize al
  const muteEndTime = muteDuration ? Date.now() + muteDuration * 1000 : null;

  await sock.chatModify(
    {
      mute: muteEndTime ? muteEndTime : null,
    },
    normalizedJid
  );

  // Prisma'da güncelle
  await prisma.chat.updateMany({
    where: {
      sessionId: getAccountId(accountId),
      id: normalizedJid,
    },
    data: {
      muteEndTime: muteEndTime ? BigInt(muteEndTime) : null,
    },
  });

  return {
    status: muteEndTime ? "muted" : "unmuted",
    jid: normalizedJid,
    muteEndTime,
  };
};

// ========== MESAJ ARAMA ==========

// Mesaj ara
export const searchMessages = async (
  accountId,
  query,
  options = {}
) => {
  const sessionId = getAccountId(accountId);
  const { jid, limit = 50, fromDate, toDate } = options;

  const where = {
    sessionId,
  };

  if (jid) {
    where.remoteJid = jidNormalizedUser(normalizeJid(jid));
  }

  if (query) {
    // Mesaj içeriğinde ara (text alanı)
    where.message = {
      contains: query,
    };
  }

  if (fromDate || toDate) {
    where.messageTimestamp = {};
    if (fromDate) {
      where.messageTimestamp.gte = BigInt(new Date(fromDate).getTime());
    }
    if (toDate) {
      where.messageTimestamp.lte = BigInt(new Date(toDate).getTime());
    }
  }

  const messages = await prisma.message.findMany({
    where,
    take: Number(limit),
    orderBy: { messageTimestamp: "desc" },
  });

  const serialized = messages.map((m) => serializePrisma(m));

  return {
    data: serialized.map((m) => ({
      id: m.id,
      from: m.remoteJid,
      fromMe: m.key?.fromMe || false,
      participant: m.participant || null,
      timestamp: Number(m.messageTimestamp || 0),
      type: m.messageStubType || Object.keys(m.message || {})[0] || "unknown",
      text: extractText(m.message),
    })),
    count: serialized.length,
    query,
  };
};

// ========== DİĞER ÖZELLİKLER ==========

// Konum gönder
export const sendLocation = async (accountId, jid, latitude, longitude, name) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendMessage(normalizedJid, {
    location: {
      degreesLatitude: latitude,
      degreesLongitude: longitude,
      name: name || "Konum",
    },
  });

  return { status: "location_sent", jid: normalizedJid, latitude, longitude };
};

// Kişi kartı gönder (vCard)
export const sendContactCard = async (accountId, jid, contact) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  // contact: { displayName, vcard }
  await sock.sendMessage(normalizedJid, {
    contacts: {
      contacts: [
        {
          displayName: contact.displayName || contact.name,
          vcard: contact.vcard || `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.displayName || contact.name}\nTEL:${contact.phone}\nEND:VCARD`,
        },
      ],
    },
  });

  return { status: "contact_sent", jid: normalizedJid };
};

// Anket oluştur
export const createPoll = async (accountId, jid, question, options) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  if (!Array.isArray(options) || options.length < 2) {
    throw new Error("En az 2 seçenek gereklidir");
  }

  await sock.sendMessage(normalizedJid, {
    poll: {
      name: question,
      values: options,
    },
  });

  return { status: "poll_created", jid: normalizedJid, question, options };
};

