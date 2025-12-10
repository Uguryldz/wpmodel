import "./webcrypto-polyfill.js";
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
import { readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { prisma, logger } from "./shared.js";
import { serializePrisma } from "./utils.js";
import { findSessionByWhatsAppJid, migrateSessionData } from "./sessionMapper.js";

const AUTH_FOLDER = "./auth_info";
const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_DB_URL = `file:${process.cwd()}/prisma/dev.db`;
const CONTACT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

// WebSocket broadcast fonksiyonu (index.js'den set edilecek)
let wsBroadcastFn = null;

export const setWebSocketBroadcast = (fn) => {
  wsBroadcastFn = fn;
};

/**
 * Her hesap için ayrı soket, store ve durum bilgisi tutuyoruz
 */
const instances = new Map();
// Basit contact cache: sessionId -> { ts, payload }
const contactsCache = new Map();

const getAccountId = (accountId) => accountId || DEFAULT_ACCOUNT_ID;

const formatContactName = (c) => {
  const fallbackFromJid = c.id ? String(c.id).split("@")[0] : "";
  return (
    c.verifiedName ||
    c.name ||
    c.notify ||
    fallbackFromJid ||
    c.id ||
    ""
  );
};

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
      contactsStore: new Map(),
      messagesStore: new Map(),
      chatsSetReceived: false, // chats.set event'i alındı mı?
      chatsUpsertTimer: null, // chats.upsert event'lerini toplamak için timer
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
  
  if (instance.chatsUpsertTimer) {
    clearTimeout(instance.chatsUpsertTimer);
    instance.chatsUpsertTimer = null;
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
  // Prisma varsayılanı yoksa güvence altına al (process-wide)
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DB_URL;
  }
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

const formatChat = (chat, sessionId = null) => {
  // Contact'tan veya grup metadata'sından profil resmini al (eğer varsa)
  let imgUrl = null;
  if (sessionId) {
    const instance = instances.get(sessionId);
    if (instance) {
      if (chat.id.includes('@g.us')) {
        // Grup için: chat objesinde imgUrl varsa kullan, yoksa null (lazy load yapılacak)
        // Grup resimleri async olarak yüklenecek (frontend'de veya başka bir yerde)
        imgUrl = chat.imgUrl || null;
      } else {
        // Bireysel sohbet için contact'tan imgUrl al
        const contact = instance.contactsStore.get(chat.id);
        if (contact && contact.imgUrl) {
          imgUrl = contact.imgUrl;
        }
      }
    }
  }
  
  return {
    id: chat.id,
    name: chat.name || chat.displayName || chat.subject || chat.id,
    unreadCount: chat.unreadCount ?? 0,
    conversationTimestamp: chat.conversationTimestamp ?? null,
    isMuted: Boolean(chat.isMuted),
    archived: chat.archived ?? false,
    imgUrl: imgUrl,
  };
};

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
    console.log(`[${sessionId}] chats.set event geldi: ${chats.length} chat`);
    
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

        // Grup değilse (bireysel sohbet), chat'ten contact oluştur
        if (!chat.id.includes('@g.us')) {
          try {
            await prisma.contact.upsert({
              where: {
                sessionId_id: {
                  sessionId,
                  id: chat.id,
                },
              },
              create: {
                sessionId,
                id: chat.id,
                name: chat.name || chat.displayName || null,
                notify: chat.name || null,
                verifiedName: null,
                imgUrl: null,
                status: null,
              },
              update: {
                name: chat.name || chat.displayName || undefined,
                notify: chat.name || undefined,
              },
            });
          } catch (error) {
            // Contact kaydetme hatası kritik değil, devam et
            logger.debug({ error, sessionId, chatId: chat.id }, "Chat'ten contact oluşturulamadı");
          }
        }
      } catch (error) {
        logger.error({ error, sessionId, chatId: chat.id }, "Chat kaydedilemedi");
      }
    }
    console.log(`[${sessionId}] chats.set: ${chats.length} chat kaydedildi, contact'lar oluşturuldu`);
    
    // chats.set event'i genellikle tüm sohbetleri göndermez (WhatsApp limitasyonu ~50-100 sohbet)
    // chats.upsert event'leri ile eksik sohbetler gelecek
    // Bir süre bekleyip chats.upsert event'lerini toplayalım ve sonra DB'den kontrol edelim
    if (!instance.chatsSetReceived) {
      instance.chatsSetReceived = true;
      const initialChatCount = chats.length;
      console.log(`[${sessionId}] chats.set alındı (${initialChatCount} chat), chats.upsert event'leri bekleniyor (15 saniye)...`);
      
      // Önceki timer'ı temizle
      if (instance.chatsUpsertTimer) {
        clearTimeout(instance.chatsUpsertTimer);
      }
      
      // 15 saniye boyunca chats.upsert event'lerini dinle
      instance.chatsUpsertTimer = setTimeout(async () => {
        const totalChats = instance.chatsStore.size;
        console.log(`[${sessionId}] Toplam ${totalChats} chat toplandı (chats.set: ${initialChatCount} + chats.upsert: ${totalChats - initialChatCount})`);
        
        // Eğer hala az sohbet varsa, DB'den kontrol et ve eksikleri yükle
        const dbChatCount = await prisma.chat.count({ where: { sessionId } });
        if (dbChatCount > totalChats) {
          console.log(`[${sessionId}] ⚠️ Veritabanında ${dbChatCount} chat var ama memory store'da ${totalChats} chat var. Eksik sohbetler yükleniyor...`);
          
          // DB'den tüm sohbetleri yükle
          const dbChats = await prisma.chat.findMany({
            where: { sessionId },
            orderBy: { conversationTimestamp: "desc" },
          });
          
          let addedCount = 0;
          for (const dbChat of dbChats) {
            if (!instance.chatsStore.has(dbChat.id)) {
              const serialized = serializePrisma(dbChat);
              instance.chatsStore.set(serialized.id, {
                id: serialized.id,
                name: serialized.name,
                displayName: serialized.displayName,
                unreadCount: serialized.unreadCount || 0,
                conversationTimestamp: Number(serialized.conversationTimestamp || 0),
                lastMsgTimestamp: Number(serialized.lastMsgTimestamp || 0),
                archived: serialized.archived || false,
                pinned: serialized.pinned || null,
                participants: serialized.participant ? JSON.parse(serialized.participant) : undefined,
              });
              addedCount++;
            }
          }
          
          if (addedCount > 0) {
            console.log(`[${sessionId}] ✅ ${addedCount} eksik sohbet veritabanından memory store'a eklendi`);
            
            // WebSocket'e bildir
            if (wsBroadcastFn) {
              wsBroadcastFn({
                type: "chats.set",
                sessionId,
                chats: Array.from(instance.chatsStore.values()).map(chat => formatChat(chat, sessionId)),
              });
            }
          }
        }
        
        instance.chatsSetReceived = false; // Reset for next time
        instance.chatsUpsertTimer = null;
      }, 15000); // 15 saniye bekle
    }
    
    // WebSocket'e bildir
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "chats.set",
        sessionId,
        chats: chats.map(chat => formatChat(chat, sessionId)),
      });
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

        // Grup değilse (bireysel sohbet), chat'ten contact oluştur
        if (!chat.id.includes('@g.us')) {
          try {
            await prisma.contact.upsert({
              where: {
                sessionId_id: {
                  sessionId,
                  id: chat.id,
                },
              },
              create: {
                sessionId,
                id: chat.id,
                name: chat.name || chat.displayName || null,
                notify: chat.name || null,
                verifiedName: null,
                imgUrl: null,
                status: null,
              },
              update: {
                name: chat.name || chat.displayName || undefined,
                notify: chat.name || undefined,
              },
            });
          } catch (error) {
            // Contact kaydetme hatası kritik değil, devam et
            logger.debug({ error, sessionId, chatId: chat.id }, "Chat'ten contact oluşturulamadı");
          }
        }
      } catch (error) {
        logger.error({ error, sessionId, chatId: chat.id }, "Chat kaydedilemedi");
      }
    }
    // WebSocket'e bildir
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "chats.upsert",
        sessionId,
        chats: chats.map(chat => formatChat(chat, sessionId)),
      });
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
    // WebSocket'e bildir
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "chats.update",
        sessionId,
        updates,
      });
    }
  });

  // Contacts - Prisma'ya kaydet
  // contacts.set: Tüm contact'lar bir kerede gelir (bağlantı açıldığında)
  sock.ev.on("contacts.set", async ({ contacts }) => {
    console.log(`[${sessionId}] contacts.set event: ${contacts?.length || 0} contact alındı`);
    contactsCache.delete(sessionId);
    if (contacts && Array.isArray(contacts)) {
      for (const contact of contacts) {
        instance.contactsStore.set(contact.id, contact);
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
      console.log(`[${sessionId}] ${contacts.length} contact veritabanına kaydedildi`);
      
      // Contact'ların tamamının gelip gelmediğini kontrol et (15 saniye sonra)
      setTimeout(async () => {
        try {
          const memoryContactCount = instance.contactsStore.size;
          const dbContactCount = await prisma.contact.count({ where: { sessionId } });
          console.log(`[${sessionId}] Contact kontrolü: Memory store: ${memoryContactCount}, DB: ${dbContactCount}`);
          
          // Eğer DB'de daha fazla contact varsa, memory store'a yükle
          if (dbContactCount > memoryContactCount) {
            console.log(`[${sessionId}] ⚠️ Veritabanında ${dbContactCount} contact var ama memory store'da ${memoryContactCount} contact var. Eksik contact'lar yükleniyor...`);
            
            const dbContacts = await prisma.contact.findMany({
              where: { sessionId },
            });
            
            let addedCount = 0;
            for (const dbContact of dbContacts) {
              if (!instance.contactsStore.has(dbContact.id)) {
                instance.contactsStore.set(dbContact.id, {
                  id: dbContact.id,
                  name: dbContact.name,
                  notify: dbContact.notify,
                  verifiedName: dbContact.verifiedName,
                  imgUrl: dbContact.imgUrl,
                  status: dbContact.status,
                });
                addedCount++;
              }
            }
            
            if (addedCount > 0) {
              console.log(`[${sessionId}] ✅ ${addedCount} eksik contact veritabanından memory store'a eklendi`);
              
              // WebSocket'e bildir
              if (wsBroadcastFn) {
                const allContacts = Array.from(instance.contactsStore.values());
                wsBroadcastFn({
                  type: "contacts.set",
                  sessionId,
                  contacts: allContacts.map((c) => ({
                    id: c.id,
                    name: formatContactName(c),
                    notify: c.notify || null,
                    verifiedName: c.verifiedName || null,
                    imgUrl: c.imgUrl || null,
                    status: c.status || null,
                  })),
                });
              }
            }
          }
        } catch (error) {
          logger.error({ error, sessionId }, "Contact kontrolü yapılamadı");
        }
      }, 15000); // 15 saniye bekle
      
      // WebSocket'e bildir (contact'lar ve profil resimleri ile)
      if (wsBroadcastFn) {
        wsBroadcastFn({
          type: "contacts.set",
          sessionId,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: formatContactName(c),
            notify: c.notify || null,
            verifiedName: c.verifiedName || null,
            imgUrl: c.imgUrl || null,
            status: c.status || null,
          })),
        });
      }
    }
  });

  // contacts.upsert: Yeni veya güncellenmiş contact'lar
  sock.ev.on("contacts.upsert", async (contacts) => {
    console.log(`[${sessionId}] contacts.upsert event: ${contacts?.length || 0} contact alındı`);
    if (!Array.isArray(contacts)) {
      contacts = [contacts];
    }
    for (const contact of contacts) {
      const existing = instance.contactsStore.get(contact.id);
      instance.contactsStore.set(contact.id, { ...existing, ...contact });

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
    
    // WebSocket'e bildir (contact'lar ve profil resimleri ile)
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "contacts.upsert",
        sessionId,
        contacts: contacts.map((c) => ({
          id: c.id,
          name: formatContactName(c),
          notify: c.notify || null,
          verifiedName: c.verifiedName || null,
          imgUrl: c.imgUrl || null,
          status: c.status || null,
        })),
      });
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
      
      // WebSocket'e bildir - yeni mesajlar geldi
      if (wsBroadcastFn) {
        const formattedMessages = messages.map(formatMessage);
        wsBroadcastFn({
          type: "messages.upsert",
          sessionId,
          messages: formattedMessages,
          eventType: type,
        });
      }
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

            // Bağlantı açıldığında contact'ları DB'den yükle (uygulama yeniden başladığında contact'lar görünsün)
            (async () => {
              try {
                console.log(`[${sessionId}] Veritabanından contact'lar yükleniyor...`);
                const dbContacts = await prisma.contact.findMany({
                  where: { sessionId },
                });
                
                if (dbContacts.length > 0) {
                  console.log(`[${sessionId}] Veritabanında ${dbContacts.length} contact bulundu, memory store'a yükleniyor...`);
                  
                  for (const dbContact of dbContacts) {
                    instance.contactsStore.set(dbContact.id, {
                      id: dbContact.id,
                      name: dbContact.name,
                      notify: dbContact.notify,
                      verifiedName: dbContact.verifiedName,
                      imgUrl: dbContact.imgUrl,
                      status: dbContact.status,
                    });
                  }
                  
                  console.log(`[${sessionId}] ✅ ${dbContacts.length} contact veritabanından memory store'a yüklendi`);
                  
                  // WebSocket'e bildir
                  if (wsBroadcastFn) {
                    wsBroadcastFn({
                      type: "contacts.set",
                      sessionId,
                      contacts: dbContacts.map((c) => ({
                        id: c.id,
                        name: formatContactName(c),
                        notify: c.notify || null,
                        verifiedName: c.verifiedName || null,
                        imgUrl: c.imgUrl || null,
                        status: c.status || null,
                      })),
                    });
                  }
                } else {
                  console.log(`[${sessionId}] Veritabanında contact yok, contacts.set event'i bekleniyor...`);
                }
              } catch (error) {
                logger.error({ error, sessionId }, "Veritabanından contact yüklenemedi");
              }
            })();

            // Bağlantı açıldığında DB'den sohbetleri hemen yükle (uygulama yeniden başladığında sohbetler görünsün)
            // chats.set event'i geldiğinde zaten upsert yapılacak, bu yüzden çakışma olmaz
            (async () => {
              try {
                console.log(`[${sessionId}] Veritabanından sohbetler yükleniyor...`);
                const dbChats = await prisma.chat.findMany({
                  where: { sessionId },
                  orderBy: { conversationTimestamp: "desc" },
                });
                
                if (dbChats.length > 0) {
                  console.log(`[${sessionId}] Veritabanında ${dbChats.length} chat bulundu, memory store'a yükleniyor...`);
                  for (const dbChat of dbChats) {
                    const serialized = serializePrisma(dbChat);
                    // Memory store formatına çevir
                    instance.chatsStore.set(serialized.id, {
                      id: serialized.id,
                      name: serialized.name,
                      displayName: serialized.displayName,
                      unreadCount: serialized.unreadCount || 0,
                      conversationTimestamp: Number(serialized.conversationTimestamp || 0),
                      lastMsgTimestamp: Number(serialized.lastMsgTimestamp || 0),
                      archived: serialized.archived || false,
                      pinned: serialized.pinned || null,
                      participants: serialized.participant ? JSON.parse(serialized.participant) : undefined,
                    });
                  }
                  console.log(`[${sessionId}] ✅ ${dbChats.length} chat veritabanından memory store'a yüklendi`);
                  
                  // WebSocket'e bildir (frontend'e sohbetlerin yüklendiğini bildir)
                  if (wsBroadcastFn) {
                    wsBroadcastFn({
                      type: "chats.set",
                      sessionId,
                      chats: dbChats.map((c) => {
                        const serialized = serializePrisma(c);
                        return formatChat({
                          id: serialized.id,
                          name: serialized.name,
                          displayName: serialized.displayName,
                          unreadCount: serialized.unreadCount || 0,
                          conversationTimestamp: Number(serialized.conversationTimestamp || 0),
                          archived: serialized.archived || false,
                        }, sessionId);
                      }),
                    });
                  }
                } else {
                  console.log(`[${sessionId}] Veritabanında chat yok, chats.set event'i bekleniyor...`);
                }
              } catch (dbError) {
                logger.error({ error: dbError, sessionId }, "Veritabanından chat yüklenemedi");
              }
            })();

            // Bağlantı açıldığında grupları senkronize et
            setTimeout(async () => {
              try {
                const groupCount = await prisma.groupMetadata.count({ where: { sessionId } });
                console.log(`[${sessionId}] Veritabanında ${groupCount} grup var`);
                
                if (groupCount === 0) {
                  console.log(`[${sessionId}] Grup bulunamadı, Baileys API'den çekiliyor...`);
                  try {
                    const groups = await sock.groupFetchAllParticipating();
                    const all = Object.values(groups || {});
                    
                    if (all.length > 0) {
                      for (const group of all) {
                        try {
                          await prisma.groupMetadata.upsert({
                            where: {
                              sessionId_id: {
                                sessionId,
                                id: group.id,
                              },
                            },
                            create: {
                              sessionId,
                              id: group.id,
                              subject: group.subject || "",
                              owner: group.owner || null,
                              subjectOwner: group.subjectOwner || null,
                              subjectTime: group.subjectTime || null,
                              creation: group.creation || null,
                              desc: group.desc || null,
                              descOwner: group.descOwner || null,
                              descId: group.descId || null,
                              restrict: group.restrict || false,
                              announce: group.announce || false,
                              size: group.participants?.length || 0,
                              participants: JSON.stringify(group.participants || []),
                              ephemeralDuration: group.ephemeralDuration || null,
                              inviteCode: group.inviteCode || null,
                            },
                            update: {
                              subject: group.subject || undefined,
                              owner: group.owner || undefined,
                              subjectOwner: group.subjectOwner || undefined,
                              subjectTime: group.subjectTime || undefined,
                              desc: group.desc || undefined,
                              descOwner: group.descOwner || undefined,
                              descId: group.descId || undefined,
                              restrict: group.restrict !== undefined ? group.restrict : undefined,
                              announce: group.announce !== undefined ? group.announce : undefined,
                              size: group.participants?.length || undefined,
                              participants: JSON.stringify(group.participants || []),
                              ephemeralDuration: group.ephemeralDuration || undefined,
                              inviteCode: group.inviteCode || undefined,
                            },
                          });
                        } catch (dbError) {
                          logger.error({ error: dbError, sessionId, groupId: group.id }, "Grup veritabanına kaydedilemedi");
                        }
                      }
                      console.log(`[${sessionId}] ${all.length} grup veritabanına kaydedildi`);
                    }
                  } catch (groupError) {
                    logger.error({ error: groupError, sessionId }, "Gruplar senkronize edilemedi");
                  }
                }
              } catch (error) {
                logger.error({ error, sessionId }, "Grup sayısı kontrol edilemedi");
              }
            }, 3000); // 3 saniye bekle, bağlantı tamamen hazır olsun
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
    // Tüm contact/sohbet senkronu için history sync açık
    syncFullHistory: true,
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

// Mevcut session'ları restore et (backend restart sonrası)
export const restoreSessions = async () => {
  try {
    // auth_info klasörünün varlığını kontrol et
    if (!existsSync(AUTH_FOLDER)) {
      console.log("[restoreSessions] auth_info klasörü bulunamadı, restore edilecek session yok");
      return;
    }

    // auth_info klasöründeki tüm session klasörlerini listele
    const sessionDirs = await readdir(AUTH_FOLDER, { withFileTypes: true });
    const sessionIds = sessionDirs
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`[restoreSessions] ${sessionIds.length} session klasörü bulundu:`, sessionIds);

    // Her session için initBaileys çağır
    for (const sessionId of sessionIds) {
      try {
        console.log(`[restoreSessions] Session restore ediliyor: ${sessionId}`);
        await initBaileys(sessionId);
        console.log(`[restoreSessions] ✅ Session restore edildi: ${sessionId}`);
      } catch (error) {
        console.error(`[restoreSessions] ❌ Session restore edilemedi (${sessionId}):`, error);
        // Hata olsa bile diğer session'ları restore etmeye devam et
      }
    }

    console.log(`[restoreSessions] Tüm session'lar restore edildi`);
  } catch (error) {
    console.error("[restoreSessions] Restore hatası:", error);
  }
};

export const getConnectionState = (accountId) => {
  const id = getAccountId(accountId);
  const instance = instances.get(id);
  if (!instance) return null;

  return {
    accountId: instance.id,
    ...instance.connectionState,
    socketReady: Boolean(instance.sock),
  };
};

export const getLastQr = (accountId) => {
  const id = getAccountId(accountId);
  const instance = instances.get(id);
  if (!instance) return null;
  return instance.connectionState.lastQr;
};

export const listChats = async (accountId, cursor, limit = 25) => {
  const sessionId = getAccountId(accountId);
  
  try {
    // Her zaman WhatsApp cihazından (memory store - chats.set event'i ile gelen veriler)
    console.log(`[listChats] WhatsApp cihazından chat listesi çekiliyor (sessionId: ${sessionId})...`);
    const instance = getOrCreateInstance(accountId);
    
    // Bağlantı durumunu kontrol et
    console.log(`[listChats] Connection state: ${instance.connectionState.status}`);
    
    if (instance.connectionState.status !== "open") {
      console.log(`[listChats] ⚠️ Bağlantı açık değil! Status: ${instance.connectionState.status}`);
      // Bağlantı açık değilse veritabanından çek (fallback)
      console.log(`[listChats] Veritabanından chat listesi çekiliyor (fallback)...`);
      try {
        const chats = await prisma.chat.findMany({
          cursor: cursor ? { pkId: Number(cursor) } : undefined,
          take: Number(limit),
          skip: cursor ? 1 : 0,
          where: { sessionId },
          orderBy: { conversationTimestamp: "desc" },
        });

        console.log(`[listChats] Veritabanından ${chats.length} chat bulundu`);
        const serialized = chats.map((c) => serializePrisma(c));
        const nextCursor =
          serialized.length !== 0 && serialized.length === Number(limit)
            ? serialized[serialized.length - 1].pkId
            : null;

        return {
          data: serialized.map(formatChat),
          cursor: nextCursor,
        };
      } catch (dbError) {
        logger.error({ error: dbError, sessionId }, "Veritabanından chat listesi alınamadı");
        return {
          data: [],
          cursor: null,
        };
      }
    }
    
    // Memory store'dan al (WhatsApp'tan gelen en güncel veriler)
    const memoryChats = Array.from(instance.chatsStore.values());
    console.log(`[listChats] Memory store'da ${memoryChats.length} chat var`);
    
    if (memoryChats.length > 0) {
      console.log(`[listChats] ✅ Memory store'dan ${memoryChats.length} chat bulundu (WhatsApp cihazından)`);
      const sorted = memoryChats.sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
      const slice = sorted.slice(0, limit);
      return {
        data: slice.map(formatChat),
        cursor: null,
      };
    }
    
    // Memory store boşsa, chats.set event'i henüz gelmemiş olabilir
    // Veritabanından tüm chats'i yükle ve memory store'a ekle
    console.log(`[listChats] Memory store boş - veritabanından tüm chats yükleniyor ve memory store'a ekleniyor...`);
    
    try {
      // Veritabanından tüm chats'i çek (limit olmadan)
      const dbChats = await prisma.chat.findMany({
        where: { sessionId },
        orderBy: { conversationTimestamp: "desc" },
      });
      
      if (dbChats.length > 0) {
        console.log(`[listChats] Veritabanından ${dbChats.length} chat bulundu, memory store'a yükleniyor...`);
        
        // Veritabanından chats'i memory store'a yükle
        for (const dbChat of dbChats) {
          const serialized = serializePrisma(dbChat);
          // Memory store formatına çevir (Baileys chat formatı)
          instance.chatsStore.set(serialized.id, {
            id: serialized.id,
            name: serialized.name,
            displayName: serialized.displayName,
            unreadCount: serialized.unreadCount || 0,
            conversationTimestamp: Number(serialized.conversationTimestamp || 0),
            lastMsgTimestamp: Number(serialized.lastMsgTimestamp || 0),
            archived: serialized.archived || false,
            pinned: serialized.pinned || null,
            participants: serialized.participant ? JSON.parse(serialized.participant) : undefined,
          });
        }
        
        console.log(`[listChats] ✅ ${dbChats.length} chat veritabanından memory store'a yüklendi`);
        
        // Şimdi memory store'dan çek ve döndür
        const memoryChatsAfterLoad = Array.from(instance.chatsStore.values());
        const sorted = memoryChatsAfterLoad.sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
        const slice = sorted.slice(0, limit);
        
        return {
          data: slice.map(formatChat),
          cursor: null,
        };
      } else {
        console.log(`[listChats] Veritabanında da chat yok`);
      }
    } catch (dbError) {
      console.error(`[listChats] Veritabanından chat yüklenirken hata:`, dbError);
      logger.error({ error: dbError, sessionId }, "Veritabanından chat yüklenemedi");
    }
    
    // Eğer veritabanında da yoksa, chats.set event'ini bekle
    console.log(`[listChats] chats.set event'ini bekliyoruz (max 2 saniye)...`);
    for (let i = 0; i < 4; i++) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms bekle
      
      const memoryChatsAfterWait = Array.from(instance.chatsStore.values());
      if (memoryChatsAfterWait.length > 0) {
        console.log(`[listChats] ✅ Bekleme sonrası memory store'da ${memoryChatsAfterWait.length} chat bulundu (WhatsApp cihazından)`);
        const sorted = memoryChatsAfterWait.sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
        const slice = sorted.slice(0, limit);
        return {
          data: slice.map(formatChat),
          cursor: null,
        };
      }
    }
    
    console.log(`[listChats] ⚠️ chats.set event'i gelmedi ve veritabanında da chat yok`);
    
    // fetchChats yoksa veya başarısız olduysa, veritabanından çek (fallback)
    console.log(`[listChats] Veritabanından chat listesi çekiliyor (fallback)...`);
    try {
      const chats = await prisma.chat.findMany({
        cursor: cursor ? { pkId: Number(cursor) } : undefined,
        take: Number(limit),
        skip: cursor ? 1 : 0,
        where: { sessionId },
        orderBy: { conversationTimestamp: "desc" },
      });

      console.log(`[listChats] Veritabanından ${chats.length} chat bulundu`);
      const serialized = chats.map((c) => serializePrisma(c));
      const nextCursor =
        serialized.length !== 0 && serialized.length === Number(limit)
          ? serialized[serialized.length - 1].pkId
          : null;

      return {
        data: serialized.map(formatChat),
        cursor: nextCursor,
      };
    } catch (dbError) {
      logger.error({ error: dbError, sessionId }, "Veritabanından chat listesi alınamadı");
      return {
        data: [],
        cursor: null,
      };
    }
  } catch (error) {
    logger.error({ error, sessionId }, "Chat listesi alınamadı");
    console.error(`[listChats] ❌ Hata:`, error.message);
    console.error(`[listChats] Stack:`, error.stack);
    return {
      data: [],
      cursor: null,
    };
  }
};

export const listMessages = async (accountId, jid, cursor, limit = 25) => {
  const sessionId = getAccountId(accountId);
  const normalizedJid = jidNormalizedUser(normalizeJid(jid));

  try {
    // Önce WhatsApp cihazından (memory store - messages.set/messages.upsert event'leri ile gelen veriler)
    console.log(`[listMessages] WhatsApp cihazından mesaj listesi çekiliyor (sessionId: ${sessionId}, jid: ${normalizedJid})...`);
    const instance = getOrCreateInstance(accountId);
    
    // Memory store'dan al (WhatsApp'tan gelen en güncel veriler)
    const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
    
    if (memoryMessages.length > 0) {
      console.log(`[listMessages] Memory store'dan ${memoryMessages.length} mesaj bulundu (WhatsApp cihazından)`);
      // En yeniden eskiye doğru sırala ve limit uygula
      const sorted = memoryMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const slice = sorted.slice(0, limit);
      return {
        data: slice,
        cursor: null,
      };
    }
    
    // Memory store boşsa, WhatsApp'tan fetch et
    console.log(`[listMessages] Memory store boş - WhatsApp'tan mesaj fetch ediliyor...`);
    const sock = ensureSocket(accountId);
    
    // Bağlantı kontrolü
    if (instance.connectionState.status !== "open") {
      console.log(`[listMessages] ⚠️ Bağlantı açık değil! Status: ${instance.connectionState.status}`);
      // Bağlantı açık değilse veritabanından çek (fallback)
      console.log(`[listMessages] Veritabanından mesajlar çekiliyor (fallback)...`);
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
          fromMe: Boolean(m.key?.fromMe),
          participant: m.participant || null,
          timestamp: Number(m.messageTimestamp || 0),
          type: m.messageStubType || Object.keys(m.message || {})[0] || "unknown",
          text: extractText(m.message),
          key: m.key, // key objesini de ekle (frontend'de kullanılabilir)
        })),
        cursor: nextCursor,
      };
    }
    
    // Baileys'te mesajları fetch etmek için loadMessages kullan
    // Eğer loadMessages yoksa, veritabanından çek
    if (typeof sock.loadMessages === 'function') {
      try {
        console.log(`[listMessages] sock.loadMessages çağrılıyor...`);
        const fetchedMessages = await sock.loadMessages(normalizedJid, Number(limit) || 25);
        console.log(`[listMessages] WhatsApp'tan ${fetchedMessages?.length || 0} mesaj fetch edildi`);
        
        if (fetchedMessages && fetchedMessages.length > 0) {
          // Memory store'a kaydet
          for (const msg of fetchedMessages) {
            saveMessages(instance, normalizedJid, [msg]);
          }
          
          // Formatla ve döndür
          const formatted = fetchedMessages.map(formatMessage);
          const sorted = formatted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          const slice = sorted.slice(0, limit);
          
          return {
            data: slice,
            cursor: null,
          };
        }
      } catch (fetchError) {
        console.error(`[listMessages] WhatsApp'tan mesaj fetch edilemedi:`, fetchError);
        logger.error({ error: fetchError, sessionId, jid: normalizedJid }, "Mesaj fetch edilemedi");
      }
    }
    
    // loadMessages yoksa veya başarısız olduysa, veritabanından çek (fallback)
    console.log(`[listMessages] Veritabanından mesajlar çekiliyor (fallback)...`);
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
        fromMe: Boolean(m.key?.fromMe),
        participant: m.participant || null,
        timestamp: Number(m.messageTimestamp || 0),
        type: m.messageStubType || Object.keys(m.message || {})[0] || "unknown",
        text: extractText(m.message),
        key: m.key, // key objesini de ekle (frontend'de kullanılabilir)
      })),
      cursor: nextCursor,
    };
  } catch (error) {
    logger.error({ error, sessionId, jid: normalizedJid }, "Mesaj listesi alınamadı");
    console.error(`[listMessages] Hata:`, error);
    // Son fallback: memory store
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

  // auth_info klasöründeki session dosyalarını sil
  try {
    const authDir = `${AUTH_FOLDER}/${sessionId}`;
    if (existsSync(authDir)) {
      await rm(authDir, { recursive: true, force: true });
      console.log(`[deleteSession] Auth klasörü silindi: ${authDir}`);
    }
  } catch (error) {
    logger.error({ error, sessionId }, "Auth klasörü silinemedi");
  }

  removeInstance(accountId);
};

export const listContacts = async (accountId, cursor, limit = 50) => {
  const sessionId = getAccountId(accountId);
  const instance = instances.get(sessionId);

  // Cache (sadece cursor yokken ve önceden dolu veri varsa)
  if (!cursor) {
    const cached = contactsCache.get(sessionId);
    if (cached && cached.payload?.data?.length && Date.now() - cached.ts < CONTACT_CACHE_TTL_MS) {
      return cached.payload;
    }
  }

  // Önce memory store (oturum açıksa)
  if (instance) {
    const memoryContacts = Array.from(instance.contactsStore.values()).filter(
      (c) => c.id && !c.id.endsWith("@g.us") && !isJidBroadcast(c.id)
    );
    const chatAsContacts =
      memoryContacts.length === 0
        ? Array.from(instance.chatsStore.values()).filter(
            (c) => c.id && !c.id.endsWith("@g.us") && !isJidBroadcast(c.id)
          )
        : [];

    const source = memoryContacts.length > 0 ? memoryContacts : chatAsContacts;

    if (source.length > 0) {
      const formatted = source
        .sort((a, b) => (a.name || a.notify || a.id).localeCompare(b.name || b.notify || b.id))
        .slice(0, limit === undefined || limit === null ? source.length : limit)
        .map((c) => ({
          id: c.id,
          name: formatContactName(c),
          notify: c.notify || null,
          verifiedName: c.verifiedName || null,
          imgUrl: c.imgUrl || null,
          status: c.status || null,
        }));
      const payload = { data: formatted, cursor: null };
      if (!cursor && formatted.length > 0) {
        contactsCache.set(sessionId, { ts: Date.now(), payload });
      }
      return payload;
    }
  }

  // Database fallback (oturum kapalı olsa da)
  try {
    // Limit çok yüksekse (100000 gibi) tüm contact'ları çek
    const takeLimit = limit && limit < 100000 ? Number(limit) : undefined;
    const contacts = await prisma.contact.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: takeLimit,
      skip: cursor ? 1 : 0,
      where: { sessionId },
      orderBy: { pkId: "desc" },
    });

    const serialized = contacts.map((c) => serializePrisma(c));
    // Limit belirtilmemişse veya çok yüksekse cursor döndürme (tüm contact'lar zaten geldi)
    const nextCursor =
      takeLimit && serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].pkId
        : null;

    const payload = {
      data: serialized.map((c) => ({
        id: c.id,
        name: formatContactName(c),
        notify: c.notify || null,
        verifiedName: c.verifiedName || null,
        imgUrl: c.imgUrl || null,
        status: c.status || null,
      })),
      cursor: nextCursor,
    };
    if (!cursor && payload.data.length > 0) {
      contactsCache.set(sessionId, { ts: Date.now(), payload });
    }
    return payload;
  } catch (error) {
    logger.error({ error, sessionId }, "Contact listesi alınamadı");
    return { data: [], cursor: null };
  }
};

export const listGroups = async (accountId, cursor, limit = 50) => {
  const sessionId = getAccountId(accountId);

  try {
    // Her zaman WhatsApp cihazından (Baileys API) çek
    console.log(`[listGroups] WhatsApp cihazından grup listesi çekiliyor (sessionId: ${sessionId})...`);
    
    // Socket bağlantısını kontrol et
    const instance = getOrCreateInstance(accountId);
    console.log(`[listGroups] Connection state: ${instance.connectionState.status}`);
    
    if (instance.connectionState.status !== "open") {
      console.log(`[listGroups] ⚠️ Bağlantı açık değil! Status: ${instance.connectionState.status}`);
      throw new Error(`WhatsApp bağlantısı açık değil. Mevcut durum: ${instance.connectionState.status}`);
    }
    
    const sock = ensureSocket(accountId);
    console.log(`[listGroups] Socket hazır, groupFetchAllParticipating çağrılıyor...`);
    
    const groups = await sock.groupFetchAllParticipating();
    console.log(`[listGroups] groupFetchAllParticipating sonucu:`, groups ? Object.keys(groups).length : 0, "grup");
    
    const all = Object.values(groups || {});
    console.log(`[listGroups] Toplam ${all.length} grup bulundu`);
    
    if (all.length === 0) {
      console.log(`[listGroups] ⚠️ Hiç grup bulunamadı!`);
      return { data: [], cursor: null };
    }

    // Tüm grupları veritabanına kaydet (cache için)
    for (const group of all) {
      try {
        await prisma.groupMetadata.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: group.id,
            },
          },
          create: {
            sessionId,
            id: group.id,
            subject: group.subject || "",
            owner: group.owner || null,
            subjectOwner: group.subjectOwner || null,
            subjectTime: group.subjectTime || null,
            creation: group.creation || null,
            desc: group.desc || null,
            descOwner: group.descOwner || null,
            descId: group.descId || null,
            restrict: group.restrict || false,
            announce: group.announce || false,
            size: group.participants?.length || 0,
            participants: JSON.stringify(group.participants || []),
            ephemeralDuration: group.ephemeralDuration || null,
            inviteCode: group.inviteCode || null,
          },
          update: {
            subject: group.subject || undefined,
            owner: group.owner || undefined,
            subjectOwner: group.subjectOwner || undefined,
            subjectTime: group.subjectTime || undefined,
            desc: group.desc || undefined,
            descOwner: group.descOwner || undefined,
            descId: group.descId || undefined,
            restrict: group.restrict !== undefined ? group.restrict : undefined,
            announce: group.announce !== undefined ? group.announce : undefined,
            size: group.participants?.length || undefined,
            participants: JSON.stringify(group.participants || []),
            ephemeralDuration: group.ephemeralDuration || undefined,
            inviteCode: group.inviteCode || undefined,
          },
        });
      } catch (dbError) {
        logger.error({ error: dbError, sessionId, groupId: group.id }, "Grup veritabanına kaydedilemedi");
      }
    }

    console.log(`[listGroups] ${all.length} grup WhatsApp cihazından çekildi ve veritabanına kaydedildi`);

    // Sırala ve limit uygula
    all.sort((a, b) => (b.creation || 0) - (a.creation || 0));
    const slice = all.slice(0, limit);

    const result = {
      data: slice.map((g) => ({
        id: g.id,
        subject: g.subject,
        size: g.size || g.participants?.length || 0,
        creation: g.creation,
        owner: g.owner || null,
        desc: g.desc || null,
        restrict: g.restrict || false,
        announce: g.announce || false,
        participants: g.participants || [],
      })),
      cursor: null,
    };
    
    console.log(`[listGroups] ✅ Başarılı: ${result.data.length} grup döndürülüyor`);
    return result;
  } catch (error) {
    console.error(`[listGroups] ❌ Hata oluştu:`, error.message);
    console.error(`[listGroups] Stack trace:`, error.stack);
    logger.error({ error, sessionId }, "Grup listesi alınamadı");
    
    // Hata durumunda boş liste döndür ama hata mesajını logla
    return { data: [], cursor: null };
  }
};

// Belirli bir grubun metadata'sını getir
export const getGroupMetadata = async (accountId, groupJid) => {
  const sessionId = getAccountId(accountId);
  const normalizedJid = normalizeJid(groupJid);
  
  try {
    // Önce database'den kontrol et
    const dbGroup = await prisma.groupMetadata.findFirst({
      where: {
        sessionId,
        id: normalizedJid,
      },
    });

    if (dbGroup) {
      const serialized = serializePrisma(dbGroup);
      let participants = [];
      try {
        participants = typeof serialized.participants === "string" 
          ? JSON.parse(serialized.participants) 
          : (serialized.participants || []);
      } catch {
        participants = [];
      }

      return {
        id: serialized.id,
        subject: serialized.subject,
        owner: serialized.owner || null,
        subjectOwner: serialized.subjectOwner || null,
        subjectTime: serialized.subjectTime || null,
        creation: serialized.creation || null,
        desc: serialized.desc || null,
        descOwner: serialized.descOwner || null,
        descId: serialized.descId || null,
        restrict: serialized.restrict || false,
        announce: serialized.announce || false,
        size: serialized.size || 0,
        participants: participants,
        ephemeralDuration: serialized.ephemeralDuration || null,
        inviteCode: serialized.inviteCode || null,
      };
    }

    // Database'de yoksa Baileys API'den çek
    const sock = ensureSocket(accountId);
    const metadata = await sock.groupMetadata(normalizedJid);
    
    // Database'e kaydet
    try {
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
    } catch (dbError) {
      logger.error({ error: dbError, sessionId, groupId: metadata.id }, "Grup metadata kaydedilemedi");
    }

    return {
      id: metadata.id,
      subject: metadata.subject,
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
      participants: metadata.participants || [],
      ephemeralDuration: metadata.ephemeralDuration || null,
      inviteCode: metadata.inviteCode || null,
    };
  } catch (error) {
    logger.error({ error, sessionId, groupJid: normalizedJid }, "Grup metadata alınamadı");
    throw error;
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
  const isGroup = normalized.includes('@g.us');
  
  try {
    // Bağlantı durumunu kontrol et
    const instance = getOrCreateInstance(accountId);
    if (instance.connectionState.status !== "open") {
      console.log(`[getProfilePicture] Bağlantı açık değil (${instance.connectionState.status}), DB'den kontrol ediliyor...`);
      // DB'den kontrol et
      const sessionId = getAccountId(accountId);
      if (isGroup) {
        // Grup için groupMetadata kontrol et (eğer imgUrl field'ı varsa)
        // Şimdilik null döndür, çünkü schema'da imgUrl yok
        return null;
      } else {
        // Bireysel sohbet için contact kontrol et
        const contact = await prisma.contact.findUnique({
          where: {
            sessionId_id: {
              sessionId,
              id: normalized,
            },
          },
        });
        return contact?.imgUrl || null;
      }
    }
    
    // Baileys API'den profil resmini al (hem bireysel hem grup için çalışır)
    const url = await sock.profilePictureUrl(normalized, "image");
    return url || null;
  } catch (error) {
    // Baileys item-not-found -> 404, not-authorized -> 401
    if (error?.data === 404 || error?.output?.statusCode === 404 || 
        error?.data === 401 || error?.output?.statusCode === 401 ||
        error?.message?.includes('not-authorized')) {
      console.log(`[getProfilePicture] Profil fotoğrafı alınamadı (${error?.data || error?.output?.statusCode || 'not-authorized'}), DB'den kontrol ediliyor...`);
      // DB'den kontrol et
      try {
        const sessionId = getAccountId(accountId);
        if (isGroup) {
          // Grup için groupMetadata kontrol et (eğer imgUrl field'ı varsa)
          // Şimdilik null döndür
          return null;
        } else {
          // Bireysel sohbet için contact kontrol et
          const contact = await prisma.contact.findUnique({
            where: {
              sessionId_id: {
                sessionId,
                id: normalized,
              },
            },
          });
          return contact?.imgUrl || null;
        }
      } catch (dbError) {
        logger.debug({ error: dbError, accountId, jid }, "DB'den profil fotoğrafı alınamadı");
        return null;
      }
    }
    logger.error({ error, accountId, jid }, "Profil fotoğrafı alınamadı");
    // Hata fırlatmak yerine null döndür
    return null;
  }
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

export const refreshContacts = async (accountId, { clearDb = true } = {}) => {
  const sessionId = getAccountId(accountId);
  const instance = getOrCreateInstance(accountId);

  // Cache ve memory store temizle
  contactsCache.delete(sessionId);
  instance.contactsStore.clear();

  // İstenirse DB de temizle
  if (clearDb) {
    try {
      await prisma.contact.deleteMany({ where: { sessionId } });
    } catch (error) {
      logger.error({ error, sessionId }, "Contact tablosu temizlenemedi");
    }
  }

  // Soketi yeniden senkrona zorla
  if (instance.sock) {
    try {
      instance.sock.ws.close();
    } catch (error) {
      logger.error({ error, sessionId }, "Socket kapatılamadı (contacts refresh)");
    }
  } else {
    await initBaileys(sessionId);
  }

  return { status: "refreshing" };
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
      fromMe: Boolean(m.key?.fromMe),
      participant: m.participant || null,
      timestamp: Number(m.messageTimestamp || 0),
      type: m.messageStubType || Object.keys(m.message || {})[0] || "unknown",
      text: extractText(m.message),
      key: m.key, // key objesini de ekle (frontend'de kullanılabilir)
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

