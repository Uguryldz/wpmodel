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
      syncChatsInterval: null, // syncChats için checkInterval
      syncChatsTimeout: null, // syncChats için setTimeout
      connectionTimers: [], // connection.update içindeki timer'ları sakla
      eventListeners: new Map(), // Event listener'ları sakla (cleanup için)
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

  // Tüm timer'ları temizle
  if (instance.reconnectTimer) {
    clearTimeout(instance.reconnectTimer);
  }
  
  if (instance.chatsUpsertTimer) {
    clearTimeout(instance.chatsUpsertTimer);
  }
  
  if (instance.syncChatsInterval) {
    clearInterval(instance.syncChatsInterval);
  }
  
  if (instance.syncChatsTimeout) {
    clearTimeout(instance.syncChatsTimeout);
  }
  
  // connection.update içindeki tüm timer'ları temizle
  if (instance.connectionTimers) {
    instance.connectionTimers.forEach(timer => clearTimeout(timer));
    instance.connectionTimers = [];
  }

  // Event listener'ları temizle
  if (instance.sock && instance.sock.ev) {
    if (instance.eventListeners) {
      instance.eventListeners.forEach((listener, eventName) => {
        try {
          instance.sock.ev.off(eventName, listener);
        } catch (error) {
          // ignore
        }
      });
      instance.eventListeners.clear();
    }
    // Tüm event listener'ları kaldır
    try {
      instance.sock.ev.removeAllListeners();
    } catch (error) {
      // ignore
    }
  }

  // Socket'i kapat
  if (instance.sock) {
    try {
      instance.sock.end();
    } catch (error) {
      // ignore
    }
  }

  instances.delete(id);
};

export const listSessions = () => {
  const sessions = Array.from(instances.values()).map((instance) => ({
    id: instance.id,
    status: instance.connectionState.status,
    whatsappJid: instance.whatsappJid || null, // WhatsApp numarası (duplicate kontrolü için)
  }));
  
  // Duplicate kontrolü: Aynı WhatsApp numarasına sahip session'ları filtrele
  // Sadece en yüksek öncelikli (open > connecting > initializing > close) session'ı göster
  const sessionsByWhatsAppJid = new Map();
  const sessionsWithoutJid = [];
  
  const statusPriority = {
    'open': 4,
    'connecting': 3,
    'initializing': 2,
    'close': 1,
  };
  
  for (const session of sessions) {
    if (session.whatsappJid) {
      // WhatsApp numarasına sahip session
      const existing = sessionsByWhatsAppJid.get(session.whatsappJid);
      if (!existing) {
        sessionsByWhatsAppJid.set(session.whatsappJid, session);
      } else {
        // Duplicate - öncelik kontrolü yap
        const existingPriority = statusPriority[existing.status] || 0;
        const currentPriority = statusPriority[session.status] || 0;
        
        if (currentPriority > existingPriority) {
          // Mevcut session daha yüksek öncelikli
          sessionsByWhatsAppJid.set(session.whatsappJid, session);
        } else if (currentPriority === existingPriority && session.status === 'open') {
          // Aynı öncelik ve ikisi de open ise, daha yeni olanı al (id'ye göre)
          if (session.id > existing.id) {
            sessionsByWhatsAppJid.set(session.whatsappJid, session);
          }
        }
      }
    } else {
      // WhatsApp numarası yoksa (henüz bağlanmamış), direkt ekle
      sessionsWithoutJid.push(session);
    }
  }
  
  // Sonuçları birleştir
  const result = [
    ...Array.from(sessionsByWhatsAppJid.values()),
    ...sessionsWithoutJid,
  ];
  
  return result;
};

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
  let chatName = chat.name || chat.displayName || chat.subject || chat.id;
  let verifiedName = null;
  
  if (sessionId) {
    const instance = instances.get(sessionId);
    if (instance) {
      if (chat.id.includes('@g.us')) {
        // Grup için: chat objesinde imgUrl varsa kullan, yoksa null (lazy load yapılacak)
        // Grup resimleri async olarak yüklenecek (frontend'de veya başka bir yerde)
        imgUrl = chat.imgUrl || null;
      } else {
        // Bireysel sohbet için contact'tan bilgileri al
        const contact = instance.contactsStore.get(chat.id);
        if (contact) {
          // Contact'tan imgUrl al
          if (contact.imgUrl) {
            imgUrl = contact.imgUrl;
          }
          // Contact'tan ad al: verifiedName > name > notify
          verifiedName = contact.verifiedName || null;
          chatName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || chat.id;
        }
      }
    }
  }
  
  return {
    id: chat.id,
    name: chatName,
    verifiedName: verifiedName,
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

const formatMessage = (msg) => {
  // Yanıtlanan mesaj bilgisini çıkar
  let quotedMessage = null;
  if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    const quoted = msg.message.extendedTextMessage.contextInfo;
    quotedMessage = {
      id: quoted.stanzaId,
      from: quoted.participant || quoted.remoteJid,
      text: extractText(quoted.quotedMessage),
    };
  } else if (msg.message?.imageMessage?.contextInfo?.quotedMessage) {
    const quoted = msg.message.imageMessage.contextInfo;
    quotedMessage = {
      id: quoted.stanzaId,
      from: quoted.participant || quoted.remoteJid,
      text: extractText(quoted.quotedMessage) || '📷 Fotoğraf',
    };
  } else if (msg.message?.videoMessage?.contextInfo?.quotedMessage) {
    const quoted = msg.message.videoMessage.contextInfo;
    quotedMessage = {
      id: quoted.stanzaId,
      from: quoted.participant || quoted.remoteJid,
      text: extractText(quoted.quotedMessage) || '📹 Video',
    };
  }

  return {
    id: msg.key?.id,
    from: msg.key?.remoteJid,
    fromMe: Boolean(msg.key?.fromMe),
    participant: msg.key?.participant || null,
    timestamp: Number(
      msg.messageTimestamp || msg.messageStubParameters?.timestamp || Date.now()
    ),
    type: msg.message?.messageStubType || Object.keys(msg.message || {})[0],
    text: extractText(msg.message),
    quotedMessage: quotedMessage, // Yanıtlanan mesaj bilgisi
  };
};

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
  
  // Mevcut mesaj ID'lerini al (duplicate kontrolü için)
  const existingIds = new Set(
    existing.map(m => m.key?.id || m.id || `${m.timestamp || m.messageTimestamp || 0}-${m.from || ''}`)
  );
  
  // Yeni mesajları formatla ve duplicate olmayanları filtrele
  const formatted = messages.map(formatMessage);
  const newMessages = formatted.filter(msg => {
    const msgId = msg.key?.id || msg.id || `${msg.timestamp || msg.messageTimestamp || 0}-${msg.from || ''}`;
    return !existingIds.has(msgId);
  });
  
  // Yeni mesajları ekle ve son 200 mesajı tut
  const updated = [...existing, ...newMessages].slice(-200);
  instance.messagesStore.set(normalized, updated);
};

const bindSocketEvents = (instance) => {
  const { sock, connectionState } = instance;
  const sessionId = instance.id;

  // Önceki event listener'ları temizle (yeniden bağlantı durumunda)
  if (instance.eventListeners && instance.eventListeners.size > 0) {
    instance.eventListeners.forEach((listener, eventName) => {
      try {
        sock.ev.off(eventName, listener);
      } catch (error) {
        // ignore
      }
    });
    instance.eventListeners.clear();
  }

  // Event listener'ları sakla (cleanup için)
  if (!instance.eventListeners) {
    instance.eventListeners = new Map();
  }

  const credsUpdateListener = instance.saveCredsFn;
  sock.ev.on("creds.update", credsUpdateListener);
  instance.eventListeners.set("creds.update", credsUpdateListener);

  // Chats - Prisma'ya kaydet
  const chatsSetListener = async ({ chats }) => {
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
    // Eğer sadece 1 chat geldiyse, daha fazla chat beklemek için süreyi uzat
    if (!instance.chatsSetReceived) {
      instance.chatsSetReceived = true;
      const initialChatCount = chats.length;
      const waitTime = initialChatCount <= 1 ? 60000 : 30000; // 1 chat varsa 60 saniye, yoksa 30 saniye bekle
      console.log(`[${sessionId}] chats.set alındı (${initialChatCount} chat), chats.upsert event'leri bekleniyor (${waitTime/1000} saniye)...`);
      
      // Önceki timer'ı temizle
      if (instance.chatsUpsertTimer) {
        clearTimeout(instance.chatsUpsertTimer);
      }
      
      // chats.upsert event'lerini dinle
      instance.chatsUpsertTimer = setTimeout(async () => {
        const totalChats = instance.chatsStore.size;
        console.log(`[${sessionId}] Toplam ${totalChats} chat toplandı (chats.set: ${initialChatCount} + chats.upsert: ${totalChats - initialChatCount})`);
        
        // Eğer hala az sohbet varsa (özellikle sadece 1 chat varsa), daha fazla bekle
        if (totalChats <= 1 && initialChatCount <= 1) {
          console.log(`[${sessionId}] ⚠️ Sadece ${totalChats} chat var, daha fazla chat bekleniyor (30 saniye daha)...`);
          
                  // 30 saniye daha bekle
          const nestedTimer = setTimeout(async () => {
            const finalChatCount = instance.chatsStore.size;
            console.log(`[${sessionId}] Uzun bekleme sonrası: ${finalChatCount} chat`);
            
            // Eğer hala az sohbet varsa, DB'den kontrol et ve eksikleri yükle
            const dbChatCount = await prisma.chat.count({ where: { sessionId } });
            if (dbChatCount > finalChatCount) {
              console.log(`[${sessionId}] ⚠️ Veritabanında ${dbChatCount} chat var ama memory store'da ${finalChatCount} chat var. Eksik sohbetler yükleniyor...`);
              
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
              }
            }
            
            // TÜM chat'leri (memory store'daki) WebSocket'e bildir
            if (wsBroadcastFn) {
              const allChats = Array.from(instance.chatsStore.values())
                .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
              wsBroadcastFn({
                type: "chats.set",
                sessionId,
                chats: allChats.map(chat => formatChat(chat, sessionId)),
              });
              console.log(`[${sessionId}] ✅ Tüm chat'ler (${allChats.length}) WebSocket'e bildirildi`);
            }
            
            instance.chatsSetReceived = false;
            instance.chatsUpsertTimer = null;
          }, 30000); // 30 saniye daha bekle
          // Nested timer'ı instance'a kaydet
          if (!instance.connectionTimers) {
            instance.connectionTimers = [];
          }
          instance.connectionTimers.push(nestedTimer);
        } else {
          // Normal durum: yeterli chat var
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
            }
          }
          
          // TÜM chat'leri (memory store'daki) WebSocket'e bildir
          if (wsBroadcastFn) {
            const allChats = Array.from(instance.chatsStore.values())
              .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
            wsBroadcastFn({
              type: "chats.set",
              sessionId,
              chats: allChats.map(chat => formatChat(chat, sessionId)),
            });
            console.log(`[${sessionId}] ✅ Tüm chat'ler (${allChats.length}) WebSocket'e bildirildi`);
          }
          
          instance.chatsSetReceived = false; // Reset for next time
          instance.chatsUpsertTimer = null;
        }
      }, waitTime);
    }
    
    // WebSocket'e bildir - TÜM chat'leri gönder (sadece yeni gelenleri değil)
    // Bu sayede proje yeniden başlatıldığında tüm chat'ler görünür
    if (wsBroadcastFn) {
      const allChats = Array.from(instance.chatsStore.values())
        .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
      wsBroadcastFn({
        type: "chats.set",
        sessionId,
        chats: allChats.map(chat => formatChat(chat, sessionId)),
      });
      console.log(`[${sessionId}] ✅ chats.set event sonrası tüm chat'ler (${allChats.length}) WebSocket'e bildirildi`);
    }
  };
  sock.ev.on("chats.set", chatsSetListener);
  instance.eventListeners.set("chats.set", chatsSetListener);

  // messaging-history.set event'i: WhatsApp Web'in varsayılan sohbet geçmişini sağlar
  // Bu event syncFullHistory: true ile tetiklenir ve tüm chat'leri içerir
  const messagingHistorySetListener = async (history) => {
    console.log(`[${sessionId}] messaging-history.set event geldi`);
    
    if (history && history.chats && Array.isArray(history.chats)) {
      console.log(`[${sessionId}] messaging-history.set: ${history.chats.length} chat alındı (WhatsApp Web'in varsayılan sohbet geçmişi)`);
      
      // Tüm chat'leri memory store'a ekle
      for (const chat of history.chats) {
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
          logger.error({ error, sessionId, chatId: chat.id }, "Chat kaydedilemedi (messaging-history.set)");
        }
      }
      
      console.log(`[${sessionId}] ✅ messaging-history.set: ${history.chats.length} chat kaydedildi`);
      
      // WebSocket'e bildir - WhatsApp Web'in varsayılan sohbet geçmişi
      if (wsBroadcastFn) {
        const allChats = Array.from(instance.chatsStore.values())
          .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
        wsBroadcastFn({
          type: "chats.set",
          sessionId,
          chats: allChats.map(chat => formatChat(chat, sessionId)),
        });
        console.log(`[${sessionId}] ✅ messaging-history.set sonrası tüm chat'ler (${allChats.length}) WebSocket'e bildirildi`);
      }
    }
    
    // Contacts de gelebilir
    if (history && history.contacts && Array.isArray(history.contacts)) {
      console.log(`[${sessionId}] messaging-history.set: ${history.contacts.length} contact alındı`);
      for (const contact of history.contacts) {
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
          logger.error({ error, sessionId, contactId: contact.id }, "Contact kaydedilemedi (messaging-history.set)");
        }
      }
    }
    
    // MESAJLAR DA GELEBİLİR - CİHAZDAKİ TÜM MESAJLAR ÖNEMLİ!
    if (history && history.messages && Array.isArray(history.messages)) {
      console.log(`[${sessionId}] messaging-history.set: ${history.messages.length} mesaj alındı (cihazdaki mesaj geçmişi)`);
      
      // Mesajları kaydet
      for (const msg of history.messages) {
        if (!msg.key?.remoteJid || !msg.key?.id) continue;
        if (isJidBroadcast(msg.key.remoteJid)) continue;
        
        // Memory store'a ekle
        saveMessages(instance, msg.key.remoteJid, [msg]);
      }
      
      // Prisma'ya kaydet
      await saveMessagesToPrisma(sessionId, history.messages);
      
      console.log(`[${sessionId}] ✅ messaging-history.set: ${history.messages.length} mesaj kaydedildi (cihazdaki mesaj geçmişi)`);
      
      // WebSocket'e bildir
      if (wsBroadcastFn) {
        const formattedMessages = history.messages.map(formatMessage);
        wsBroadcastFn({
          type: "messages.set",
          sessionId,
          messages: formattedMessages,
          source: "messaging-history.set",
        });
      }
    }
    
    // Eğer history.messages yoksa ama history içinde başka bir format varsa kontrol et
    if (history && !history.messages && typeof history === 'object') {
      // Bazı durumlarda mesajlar farklı bir formatta gelebilir
      const allMessages = [];
      
      // history içinde mesajları ara
      for (const key in history) {
        if (key === 'messages' || key === 'chats' || key === 'contacts') continue;
        
        const value = history[key];
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && item.key && item.key.remoteJid && item.key.id) {
              allMessages.push(item);
            }
          }
        }
      }
      
      if (allMessages.length > 0) {
        console.log(`[${sessionId}] messaging-history.set: ${allMessages.length} mesaj alternatif formattan alındı`);
        for (const msg of allMessages) {
          saveMessages(instance, msg.key.remoteJid, [msg]);
        }
        await saveMessagesToPrisma(sessionId, allMessages);
      }
    }
  };
  
  // messaging-history.set event'ini dinle (syncFullHistory: true ile tetiklenir)
  try {
    sock.ev.on("messaging-history.set", messagingHistorySetListener);
    instance.eventListeners.set("messaging-history.set", messagingHistorySetListener);
  } catch (error) {
    // Eğer event mevcut değilse, ignore et (eski Baileys versiyonlarında olmayabilir)
    console.log(`[${sessionId}] messaging-history.set event'i mevcut değil, chats.set kullanılacak`);
  }

  const chatsUpsertListener = async (chats) => {
    // chats.upsert event'i tek bir chat veya chat array'i olabilir
    if (!Array.isArray(chats)) {
      chats = [chats];
    }
    console.log(`[${sessionId}] chats.upsert event: ${chats.length} chat alındı`);
    
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
  };
  sock.ev.on("chats.upsert", chatsUpsertListener);
  instance.eventListeners.set("chats.upsert", chatsUpsertListener);

  const chatsUpdateListener = async (updates) => {
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
  };
  sock.ev.on("chats.update", chatsUpdateListener);
  instance.eventListeners.set("chats.update", chatsUpdateListener);

  // Contacts - Prisma'ya kaydet
  // contacts.set: Tüm contact'lar bir kerede gelir (bağlantı açıldığında)
  const contactsSetListener = async ({ contacts }) => {
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
      const contactCheckTimer = setTimeout(async () => {
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
      // Timer'ı instance'a kaydet (cleanup için)
      if (!instance.connectionTimers) {
        instance.connectionTimers = [];
      }
      instance.connectionTimers.push(contactCheckTimer);
      
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
  };
  sock.ev.on("contacts.set", contactsSetListener);
  instance.eventListeners.set("contacts.set", contactsSetListener);

  // contacts.upsert: Yeni veya güncellenmiş contact'lar
  const contactsUpsertListener = async (contacts) => {
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
  };
  sock.ev.on("contacts.upsert", contactsUpsertListener);
  instance.eventListeners.set("contacts.upsert", contactsUpsertListener);

  // Messages - Prisma'ya kaydet
  // messages.set event'i: WhatsApp cihazındaki TÜM mesaj geçmişini sağlar (syncFullHistory: true ile)
  const messagesSetListener = async ({ messages }) => {
    if (!messages || !Array.isArray(messages)) {
      console.log(`[${sessionId}] messages.set event: messages array değil veya boş`);
      return;
    }
    
    console.log(`[${sessionId}] messages.set event: ${messages.length} mesaj alındı (cihazdaki mesaj geçmişi)`);
    
    // Mesajları memory store'a ekle
    for (const msg of messages) {
      if (msg.key?.remoteJid) {
        saveMessages(instance, msg.key.remoteJid, [msg]);
      }
    }
    
    // Prisma'ya kaydet
    await saveMessagesToPrisma(sessionId, messages);
    
    console.log(`[${sessionId}] ✅ messages.set: ${messages.length} mesaj kaydedildi (cihazdaki mesaj geçmişi)`);
    
    // WebSocket'e bildir
    if (wsBroadcastFn) {
      const formattedMessages = messages.map(formatMessage);
      wsBroadcastFn({
        type: "messages.set",
        sessionId,
        messages: formattedMessages,
        source: "messages.set",
      });
    }
  };
  sock.ev.on("messages.set", messagesSetListener);
  instance.eventListeners.set("messages.set", messagesSetListener);

  const messagesUpsertListener = async (event) => {
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
  };
  sock.ev.on("messages.upsert", messagesUpsertListener);
  instance.eventListeners.set("messages.upsert", messagesUpsertListener);

  // Groups metadata - Prisma'ya kaydet
  const groupsUpdateListener = async (updates) => {
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
  };
  sock.ev.on("groups.update", groupsUpdateListener);
  instance.eventListeners.set("groups.update", groupsUpdateListener);

  const connectionUpdateListener = (update) => {
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
      // Bağlantı açıldığında chats.set event'ini beklemek için flag'i reset et
      instance.chatsSetReceived = false;
      instance.chatsUpsertTimer = null;
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

            // Bağlantı açıldığında cihazdan contact'ları çek (Baileys API)
            // contacts.set event'i WhatsApp'taki TÜM rehberi getirir (sohbet geçmişi olmasa bile)
            (async () => {
              try {
                // Önce veritabanından mevcut contact'ları yükle
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
                }

                // contacts.set event'ini bekle (WhatsApp'taki TÜM rehberi getirir)
                // Bu event bazen geç gelebilir, bu yüzden bir süre bekleyelim
                let contactsSetReceived = false;
                const contactsSetListener = ({ contacts }) => {
                  if (contacts && Array.isArray(contacts) && contacts.length > 0) {
                    contactsSetReceived = true;
                    console.log(`[${sessionId}] ✅ contacts.set event geldi: ${contacts.length} contact (TÜM REHBER)`);
                  }
                };
                
                // contacts.set event'ini dinle
                sock.ev.on("contacts.set", contactsSetListener);
                
                // 20 saniye boyunca contacts.set event'ini bekle
                setTimeout(async () => {
                  try {
                    // Event listener'ı kaldır
                    sock.ev.off("contacts.set", contactsSetListener);
                    
                    // Eğer contacts.set event'i gelmediyse, fetchContacts metodunu dene
                    if (!contactsSetReceived) {
                      console.log(`[${sessionId}] ⚠️ contacts.set event gelmedi, fetchContacts deneniyor...`);
                      
                      try {
                        // Baileys'in fetchContacts metodunu kontrol et
                        if (typeof sock.fetchContacts === "function") {
                          const deviceContacts = await sock.fetchContacts();
                          
                          // Baileys'te fetchContacts Map veya Array dönebilir
                          let contactsArray = [];
                          if (Array.isArray(deviceContacts)) {
                            contactsArray = deviceContacts;
                          } else if (deviceContacts instanceof Map) {
                            contactsArray = Array.from(deviceContacts.values());
                          } else if (deviceContacts && typeof deviceContacts === "object") {
                            contactsArray = Object.values(deviceContacts);
                          }
                          
                          console.log(`[${sessionId}] fetchContacts sonucu: ${contactsArray.length} contact`);
                          
                          if (contactsArray.length > 0) {
                            let savedCount = 0;
                            
                            for (const contact of contactsArray) {
                              // Grup ve broadcast'leri filtrele
                              if (contact && contact.id && !contact.id.includes('@g.us') && !isJidBroadcast(contact.id)) {
                                // Memory store'a ekle
                                instance.contactsStore.set(contact.id, contact);
                                
                                // Veritabanına kaydet
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
                                  savedCount++;
                                } catch (error) {
                                  logger.error({ error, sessionId, contactId: contact.id }, "Contact kaydedilemedi");
                                }
                              }
                            }
                            
                            console.log(`[${sessionId}] ✅ ${savedCount} contact fetchContacts ile çekildi ve veritabanına kaydedildi`);
                            
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
                          } else {
                            console.log(`[${sessionId}] ⚠️ fetchContacts boş döndü, contacts.set event'i bekleniyor...`);
                          }
                        } else {
                          console.log(`[${sessionId}] ⚠️ sock.fetchContacts metodu mevcut değil, contacts.set event'i bekleniyor...`);
                        }
                      } catch (error) {
                        logger.error({ error, sessionId }, "fetchContacts hatası");
                        console.log(`[${sessionId}] ⚠️ fetchContacts hatası:`, error.message);
                      }
                    } else {
                      console.log(`[${sessionId}] ✅ contacts.set event geldi, tüm rehber yüklendi`);
                    }
                  } catch (error) {
                    logger.error({ error, sessionId }, "Contact yükleme kontrolü başarısız oldu");
                  }
                }, 20000); // 20 saniye bekle (contacts.set event'inin gelmesi için)
              } catch (error) {
                logger.error({ error, sessionId }, "Contact yükleme işlemi başarısız oldu");
              }
            })();

            // Bağlantı açıldığında WhatsApp'tan varsayılan sohbet geçmişini bekle
            // WhatsApp Web normalde bağlantı açıldığında bir miktar sohbet geçmişi gösterir (örneğin son 50-100 sohbet)
            // Bu sohbetler chats.set veya messaging-history.set event'leri ile gelir
            (async () => {
              try {
                console.log(`[${sessionId}] WhatsApp'tan varsayılan sohbet geçmişi bekleniyor...`);
                
                // Önce DB'den mevcut sohbetleri yükle (hızlı erişim için)
                const dbChats = await prisma.chat.findMany({
                  where: { sessionId },
                  orderBy: { conversationTimestamp: "desc" },
                });
                
                if (dbChats.length > 0) {
                  console.log(`[${sessionId}] Veritabanında ${dbChats.length} chat bulundu, memory store'a yükleniyor...`);
                  for (const dbChat of dbChats) {
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
                  }
                  console.log(`[${sessionId}] ✅ ${dbChats.length} chat veritabanından memory store'a yüklendi`);
                  
                  // WebSocket'e bildir (frontend'e sohbetlerin yüklendiğini bildir)
                  if (wsBroadcastFn) {
                    const allChats = Array.from(instance.chatsStore.values())
                      .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
                    wsBroadcastFn({
                      type: "chats.set",
                      sessionId,
                      chats: allChats.map(chat => formatChat(chat, sessionId)),
                    });
                    console.log(`[${sessionId}] ✅ ${allChats.length} chat WebSocket'e bildirildi (DB'den yüklendi)`);
                  }
                }
                
                // WhatsApp'tan gelen chats.set veya messaging-history.set event'lerini bekle
                // Bu event'ler WhatsApp Web'in varsayılan sohbet geçmişini içerir
                const waitForWhatsAppChats = setTimeout(async () => {
                  const whatsappChatCount = instance.chatsStore.size;
                  console.log(`[${sessionId}] WhatsApp'tan ${whatsappChatCount} chat alındı (chats.set/messaging-history.set event'leri ile)`);
                  
                  // Eğer WhatsApp'tan az sohbet geldiyse (örneğin sadece 1-2 sohbet), 
                  // bu normal değil - WhatsApp Web normalde daha fazla sohbet gösterir
                  if (whatsappChatCount <= 5 && dbChats.length === 0) {
                    console.log(`[${sessionId}] ⚠️ UYARI: WhatsApp'tan sadece ${whatsappChatCount} chat geldi! WhatsApp Web normalde daha fazla sohbet gösterir.`);
                    console.log(`[${sessionId}] 💡 Çözüm: POST /${sessionId}/chats/sync endpoint'ini çağırarak chat'leri manuel olarak eşitleyebilirsiniz.`);
                  } else if (whatsappChatCount > dbChats.length) {
                    console.log(`[${sessionId}] ✅ WhatsApp'tan ${whatsappChatCount - dbChats.length} yeni chat geldi (toplam: ${whatsappChatCount})`);
                  }
                }, 10000); // 10 saniye bekle (chats.set ve messaging-history.set event'lerinin gelmesi için)
                
                // Timer'ı instance'a kaydet (cleanup için)
                if (!instance.connectionTimers) {
                  instance.connectionTimers = [];
                }
                instance.connectionTimers.push(waitForWhatsAppChats);
                
                // Mesaj geçmişini de yükle (whatsappJid set edildikten sonra)
                // whatsappJid set edilmesi için kısa bir süre bekle
                if (dbChats.length > 0) {
                  setTimeout(async () => {
                    console.log(`[${sessionId}] Veritabanından mesaj geçmişi yükleniyor...`);
                    try {
                      // Tüm chat ID'lerini al
                      const chatIds = dbChats.map(c => c.id);
                      
                      // Her chat için son 200 mesajı çek (performans için batch işlem)
                      const allMessages = await prisma.message.findMany({
                        where: {
                          sessionId,
                          remoteJid: { in: chatIds },
                        },
                        orderBy: { messageTimestamp: "desc" },
                      });
                      
                      // Mesajları chat ID'lerine göre grupla
                      const messagesByChat = new Map();
                      for (const msg of allMessages) {
                        const normalizedJid = jidNormalizedUser(msg.remoteJid);
                        if (!messagesByChat.has(normalizedJid)) {
                          messagesByChat.set(normalizedJid, []);
                        }
                        messagesByChat.get(normalizedJid).push(msg);
                      }
                      
                      // Her chat için son 200 mesajı memory store'a yükle
                      let totalMessagesLoaded = 0;
                      for (const [jid, messages] of messagesByChat.entries()) {
                        // Son 200 mesajı al (en yeni mesajlar)
                        const recentMessages = messages
                          .sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0))
                          .slice(0, 200);
                        
                        // Formatla ve memory store'a kaydet
                        const formatted = recentMessages.map(m => {
                          const serialized = serializePrisma(m);
                          // fromMe kontrolü: participant varsa grup mesajı
                          // Grup mesajlarında: participant === whatsappJid ise fromMe = true
                          // Bireysel mesajlarda: participant yok, bu durumda fromMe bilgisini veritabanından alamıyoruz
                          // Şimdilik participant kontrolü yapıyoruz
                          const isFromMe = instance.whatsappJid && serialized.participant
                            ? serialized.participant.includes(instance.whatsappJid.split('@')[0])
                            : false;
                          
                          return formatMessage({
                            key: {
                              remoteJid: serialized.remoteJid,
                              id: serialized.id,
                              fromMe: isFromMe,
                              participant: serialized.participant || null,
                            },
                            message: serialized.message ? JSON.parse(serialized.message) : undefined,
                            messageTimestamp: Number(serialized.messageTimestamp || 0),
                            pushName: serialized.pushName || null,
                            status: serialized.status || null,
                          });
                        });
                        
                        instance.messagesStore.set(jid, formatted);
                        totalMessagesLoaded += formatted.length;
                      }
                      
                      console.log(`[${sessionId}] ✅ ${totalMessagesLoaded} mesaj geçmişi veritabanından memory store'a yüklendi (${messagesByChat.size} chat için)`);
                    } catch (msgError) {
                      logger.error({ error: msgError, sessionId }, "Mesaj geçmişi yüklenemedi");
                      console.log(`[${sessionId}] ⚠️ Mesaj geçmişi yüklenirken hata:`, msgError.message);
                    }
                  }, 2000);       // 2 saniye bekle (whatsappJid set edilmesi için)
                } else {
                  console.log(`[${sessionId}] Veritabanında chat yok, chats.set event'i bekleniyor...`);
                  
                  // Veritabanında chat yoksa, chats.set ve chats.upsert event'lerinin gelmesi için bekle
                  // Eğer 30 saniye sonra hala az chat varsa, uyarı ver ve sync öner
                  const chatWarningTimer = setTimeout(async () => {
                    const currentChatCount = instance.chatsStore.size;
                    if (currentChatCount <= 1) {
                      console.log(`[${sessionId}] ⚠️ UYARI: Sadece ${currentChatCount} chat var! WhatsApp'tan chat'ler gelmiyor olabilir.`);
                      console.log(`[${sessionId}] 💡 Çözüm: POST /${sessionId}/chats/sync endpoint'ini çağırarak chat'leri manuel olarak eşitleyebilirsiniz.`);
                    }
                  }, 30000); // 30 saniye sonra kontrol et
                  // Timer'ı instance'a kaydet
                  if (!instance.connectionTimers) {
                    instance.connectionTimers = [];
                  }
                  instance.connectionTimers.push(chatWarningTimer);
                }
              } catch (dbError) {
                logger.error({ error: dbError, sessionId }, "Veritabanından chat yüklenemedi");
              }
            })();

            // Bağlantı açıldığında grupları senkronize et
            const groupSyncTimer = setTimeout(async () => {
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
            // Timer'ı instance'a kaydet
            if (!instance.connectionTimers) {
              instance.connectionTimers = [];
            }
            instance.connectionTimers.push(groupSyncTimer);
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
  };
  sock.ev.on("connection.update", connectionUpdateListener);
  instance.eventListeners.set("connection.update", connectionUpdateListener);
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
    // Tüm chat'lerin sync edilmesi için shouldSyncHistory callback'i
    shouldSyncHistory: (msg) => {
      // Tüm chat'leri sync et
      return true;
    },
    // Tüm chat'lerin yüklenmesi için
    shouldIgnoreJid: (jid) => {
      // Hiçbir chat'i ignore etme
      return false;
    },
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

        // Database'den chat'ler çekildiğinde, contact bilgilerini de çek
        // Grup olmayan chat'ler için contact bilgilerini al
        const nonGroupChats = serialized.filter(c => !c.id.includes('@g.us'));
        if (nonGroupChats.length > 0) {
          const contactIds = nonGroupChats.map(c => c.id);
          const contacts = await prisma.contact.findMany({
            where: {
              sessionId,
              id: { in: contactIds },
            },
          });
          
          // Contact bilgilerini memory store'a ekle (formatChat fonksiyonu bunları kullanacak)
          const instance = getOrCreateInstance(accountId);
          contacts.forEach(contact => {
            const serializedContact = serializePrisma(contact);
            instance.contactsStore.set(serializedContact.id, {
              id: serializedContact.id,
              name: serializedContact.name,
              notify: serializedContact.notify,
              verifiedName: serializedContact.verifiedName,
              imgUrl: serializedContact.imgUrl,
              status: serializedContact.status,
            });
          });
        }

        return {
          data: serialized.map(c => formatChat(c, sessionId)),
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

      // Database'den chat'ler çekildiğinde, contact bilgilerini de çek
      // Grup olmayan chat'ler için contact bilgilerini al
      const nonGroupChats = serialized.filter(c => !c.id.includes('@g.us'));
      if (nonGroupChats.length > 0) {
        const contactIds = nonGroupChats.map(c => c.id);
        const contacts = await prisma.contact.findMany({
          where: {
            sessionId,
            id: { in: contactIds },
          },
        });
        
        // Contact bilgilerini memory store'a ekle (formatChat fonksiyonu bunları kullanacak)
        const instance = getOrCreateInstance(accountId);
        contacts.forEach(contact => {
          const serializedContact = serializePrisma(contact);
          instance.contactsStore.set(serializedContact.id, {
            id: serializedContact.id,
            name: serializedContact.name,
            notify: serializedContact.notify,
            verifiedName: serializedContact.verifiedName,
            imgUrl: serializedContact.imgUrl,
            status: serializedContact.status,
          });
        });
      }

      return {
        data: serialized.map(c => formatChat(c, sessionId)),
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
  // Not: Chat'lerden contact çıkarma mantığı kaldırıldı
  // Çünkü sadece sohbet geçmişi olan kişileri getirir
  // Tüm rehberi almak için contacts.set event'ini beklemek gerekiyor
  if (instance) {
    const memoryContacts = Array.from(instance.contactsStore.values()).filter(
      (c) => c.id && !c.id.endsWith("@g.us") && !isJidBroadcast(c.id)
    );

    const source = memoryContacts;

    if (source.length > 0) {
      const formatted = source
        .sort((a, b) => (a.name || a.notify || a.id).localeCompare(b.name || b.notify || b.id))
        .slice(0, limit === undefined || limit === null ? source.length : limit)
        .map((c) => ({
          id: c.id,
          name: c.name || null, // Formatlamadan gönder, frontend'de zaten verifiedName || name || notify || phoneNumber kontrolü var
          notify: c.notify || null,
          verifiedName: c.verifiedName || null,
          imgUrl: c.imgUrl || null,
          status: c.status || null,
        }));
      
      // Eğer cursor yoksa (ilk sayfa), database'den de veri çekip birleştir
      // Bu sayede memory store'da olmayan contact'lar da gelir
      if (!cursor) {
        // Database'den de veri çek
        try {
          // Database'den tüm contact'ları çek (limit uygulamadan)
          // Çünkü memory store'dan gelen contact'ları da dahil edeceğiz
          // ve birleştirilmiş veriden limit uygulayacağız
          const dbContacts = await prisma.contact.findMany({
            where: { sessionId },
            orderBy: { pkId: "desc" },
          });

          const dbFormatted = dbContacts.map((c) => {
            const serialized = serializePrisma(c);
            return {
              id: serialized.id,
              name: serialized.name || null, // Formatlamadan gönder, frontend'de zaten verifiedName || name || notify || phoneNumber kontrolü var
              notify: serialized.notify || null,
              verifiedName: serialized.verifiedName || null,
              imgUrl: serialized.imgUrl || null,
              status: serialized.status || null,
            };
          });

          // Memory store ve database'den gelen contact'ları birleştir (duplicate'leri temizle)
          const contactMap = new Map();
          
          // Önce memory store'dan gelenleri ekle (öncelikli)
          formatted.forEach((c) => {
            contactMap.set(c.id, c);
          });
          
          // Sonra database'den gelenleri ekle (memory store'da yoksa)
          dbFormatted.forEach((c) => {
            if (!contactMap.has(c.id)) {
              contactMap.set(c.id, c);
            }
          });

          const merged = Array.from(contactMap.values())
            .sort((a, b) => (a.name || a.notify || a.id).localeCompare(b.name || b.notify || b.id));
          
          // Limit belirtilmişse ve çok yüksek değilse, limit uygula
          const takeLimit = limit && limit < 100000 ? Number(limit) : undefined;
          
          // Limit uygula (eğer belirtilmişse)
          // ÖNEMLİ: Limit uygulanırken, memory store'dan gelen contact'ları da dahil et
          // Yani birleştirilmiş veriden limit kadarını döndür
          const finalData = takeLimit ? merged.slice(0, takeLimit) : merged;
          
          // Cursor hesapla: Eğer limit uygulandıysa ve birleştirilmiş veri limit'ten fazlaysa cursor döndür
          // Cursor için database'den gelen son contact'ın pkId'sini kullan
          // Ama önce birleştirilmiş verinin limit'ten fazla olup olmadığını kontrol et
          const hasMore = takeLimit && merged.length > takeLimit;
          const nextCursor = hasMore && dbContacts.length > 0
            ? dbContacts[dbContacts.length - 1].pkId
            : null;
          
          const payload = { data: finalData, cursor: nextCursor };
          if (!cursor && finalData.length > 0) {
            contactsCache.set(sessionId, { ts: Date.now(), payload });
          }
          return payload;
        } catch (error) {
          logger.error({ error, sessionId }, "Database'den contact'lar alınamadı, sadece memory store verisi döndürülüyor");
          // Hata durumunda sadece memory store verisini döndür
          const payload = { data: formatted, cursor: null };
          if (!cursor && formatted.length > 0) {
            contactsCache.set(sessionId, { ts: Date.now(), payload });
          }
          return payload;
        }
      } else {
        // Cursor varsa (sayfalama), memory store'dan cursor ile sayfalama yapamayız
        // Bu durumda database fallback'e düş (aşağıdaki kod devam edecek)
        // Memory store'dan veri geldiğinde cursor ile sayfalama yapılamaz, database'den çekilmeli
        // Bu yüzden burada return etmeyip database fallback'e düşüyoruz
      }
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

    // Not: Chat'lerden contact çıkarma mantığı kaldırıldı
    // Çünkü sadece sohbet geçmişi olan kişileri getirir
    // Tüm rehberi almak için contacts.set event'ini beklemek gerekiyor

    const serialized = contacts.map((c) => serializePrisma(c));
    // Limit belirtilmemişse veya çok yüksekse cursor döndürme (tüm contact'lar zaten geldi)
    const nextCursor =
      takeLimit && serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].pkId
        : null;

    const payload = {
      data: serialized.map((c) => ({
        id: c.id,
        name: c.name || null, // Formatlamadan gönder, frontend'de zaten verifiedName || name || notify || phoneNumber kontrolü var
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
  const sessionId = getAccountId(accountId);
  
  // ÖNCE DB'den kontrol et
  try {
    if (isGroup) {
      // Grup için groupMetadata kontrol et (eğer imgUrl field'ı varsa)
      // Şimdilik null döndür, çünkü schema'da imgUrl yok
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
      if (contact?.imgUrl) {
        console.log(`[getProfilePicture] Profil fotoğrafı DB'den bulundu: ${normalized}`);
        return contact.imgUrl;
      }
    }
  } catch (dbError) {
    logger.debug({ error: dbError, accountId, jid }, "DB'den profil fotoğrafı kontrol edilemedi");
  }
  
  // DB'de yoksa, bağlantı açıksa API'den dene
  try {
    const instance = getOrCreateInstance(accountId);
    if (instance.connectionState.status !== "open") {
      console.log(`[getProfilePicture] Bağlantı açık değil (${instance.connectionState.status}), DB'de de yok, null döndürülüyor...`);
      return null;
    }
    
    // Baileys API'den profil resmini al (hem bireysel hem grup için çalışır)
    const url = await sock.profilePictureUrl(normalized, "image");
    if (url) {
      // API'den alınan profil resmini DB'ye kaydet (bireysel sohbet için)
      if (!isGroup) {
        try {
          await prisma.contact.upsert({
            where: {
              sessionId_id: {
                sessionId,
                id: normalized,
              },
            },
            create: {
              sessionId,
              id: normalized,
              imgUrl: url,
            },
            update: {
              imgUrl: url,
            },
          });
          console.log(`[getProfilePicture] Profil fotoğrafı API'den alındı ve DB'ye kaydedildi: ${normalized}`);
        } catch (updateError) {
          logger.debug({ error: updateError, accountId, jid }, "Profil fotoğrafı DB'ye kaydedilemedi");
        }
      }
      return url;
    }
    return null;
  } catch (error) {
    // Baileys item-not-found -> 404, not-authorized -> 401
    if (error?.data === 404 || error?.output?.statusCode === 404 || 
        error?.data === 401 || error?.output?.statusCode === 401 ||
        error?.message?.includes('not-authorized') ||
        error?.message?.includes('item-not-found')) {
      console.log(`[getProfilePicture] Profil fotoğrafı API'den alınamadı (${error?.data || error?.output?.statusCode || 'not-found'}), DB'de de yok, null döndürülüyor...`);
      return null;
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

// Cihazdaki tüm chat'leri eşitle (sync)
// chats.set ve chats.upsert event'leri zaten bindSocketEvents içinde dinleniyor
// Bu fonksiyon sadece mevcut chat'leri kontrol edip eksikleri tespit eder
export const syncChats = async (accountId) => {
  const sessionId = getAccountId(accountId);
  const instance = getOrCreateInstance(accountId);

  // Bağlantı kontrolü
  if (instance.connectionState.status !== "open") {
    throw new Error(`WhatsApp bağlantısı açık değil. Mevcut durum: ${instance.connectionState.status}`);
  }

  console.log(`[syncChats] Cihazdaki tüm chat'ler eşitleniyor (sessionId: ${sessionId})...`);
  
  // Mevcut chat sayısını al
  const initialChatCount = instance.chatsStore.size;
  console.log(`[syncChats] Başlangıç: ${initialChatCount} chat memory store'da`);
  
  // chats.set ve chats.upsert event'lerinin gelmesi için bekle
  // Bu event'ler zaten bindSocketEvents içinde dinleniyor ve chat'leri kaydediyor
  return new Promise((resolve, reject) => {
    let lastChatCount = initialChatCount;
    let stableCount = 0; // Aynı chat sayısı kaç kez tekrarlandı
    
    // Önceki timer'ları temizle
    if (instance.syncChatsInterval) {
      clearInterval(instance.syncChatsInterval);
    }
    if (instance.syncChatsTimeout) {
      clearTimeout(instance.syncChatsTimeout);
    }
    
    const checkInterval = setInterval(async () => {
      const currentChatCount = instance.chatsStore.size;
      
      if (currentChatCount === lastChatCount) {
        stableCount++;
        // 5 kez üst üste aynı sayı gelirse, sync tamamlandı kabul et
        if (stableCount >= 5) {
          clearInterval(checkInterval);
          instance.syncChatsInterval = null;
          
          const totalChats = instance.chatsStore.size;
          console.log(`[syncChats] ✅ Toplam ${totalChats} chat eşitlendi (başlangıç: ${initialChatCount}, yeni: ${totalChats - initialChatCount})`);
          
          // Tüm chat'leri veritabanına kaydet (zaten chats.set ve chats.upsert event'leri kaydediyor ama emin olmak için)
          let savedCount = 0;
          for (const chat of instance.chatsStore.values()) {
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
              savedCount++;
            } catch (error) {
              logger.error({ error, sessionId, chatId: chat.id }, "Chat kaydedilemedi");
            }
          }
          
          console.log(`[syncChats] ✅ ${savedCount} chat veritabanına kaydedildi`);
          
          // WebSocket'e bildir
          if (wsBroadcastFn) {
            const allChats = Array.from(instance.chatsStore.values())
              .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));
            wsBroadcastFn({
              type: "chats.set",
              sessionId,
              chats: allChats.map(chat => formatChat(chat, sessionId)),
            });
          }
          
          resolve({
            status: "completed",
            totalChats,
            newChats: totalChats - initialChatCount,
            savedChats: savedCount,
          });
        }
      } else {
        // Chat sayısı değişti, reset
        stableCount = 0;
        lastChatCount = currentChatCount;
        console.log(`[syncChats] Chat sayısı güncellendi: ${currentChatCount} (yeni chat'ler geliyor...)`);
      }
    }, 2000); // Her 2 saniyede bir kontrol et
    instance.syncChatsInterval = checkInterval;
    
    // Maksimum 60 saniye bekle
    const timeoutTimer = setTimeout(() => {
      clearInterval(checkInterval);
      instance.syncChatsInterval = null;
      const totalChats = instance.chatsStore.size;
      console.log(`[syncChats] ⏱️ Zaman aşımı - Toplam ${totalChats} chat eşitlendi`);
      
      resolve({
        status: "completed",
        totalChats,
        newChats: totalChats - initialChatCount,
        savedChats: totalChats,
        warning: "Zaman aşımı - bazı chat'ler eksik olabilir",
      });
    }, 60000); // 60 saniye maksimum bekleme
    instance.syncChatsTimeout = timeoutTimer;
  });
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
  const sessionId = getAccountId(accountId);

  // Önce memory store'dan kontrol et
  const instance = getOrCreateInstance(accountId);
  let message = null;
  let key = null;

  // Memory store'dan mesajı bul
  const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
  const memoryMsg = memoryMessages.find(m => (m.id || m.key?.id) === messageId);
  
  if (memoryMsg) {
    // Memory store'dan bulundu
    if (memoryMsg.key) {
      key = memoryMsg.key;
    } else if (memoryMsg.id) {
      // Key yoksa oluştur
      key = {
        remoteJid: normalizedJid,
        id: memoryMsg.id,
        fromMe: memoryMsg.fromMe || false,
      };
    }
  }

  // Memory store'da yoksa DB'den kontrol et
  if (!key) {
    const dbMessage = await prisma.message.findFirst({
      where: {
        sessionId,
        remoteJid: normalizedJid,
        id: messageId,
      },
    });

    if (!dbMessage) {
      throw new Error("Yanıtlanacak mesaj bulunamadı");
    }

    try {
      key = typeof dbMessage.key === "string" ? JSON.parse(dbMessage.key) : dbMessage.key;
    } catch (error) {
      logger.error({ error, messageId }, "Mesaj anahtarı parse edilemedi");
      // Key parse edilemezse basit bir key oluştur
      key = {
        remoteJid: normalizedJid,
        id: messageId,
        fromMe: false,
      };
    }
  }

  // Key'in doğru formatta olduğundan emin ol
  if (!key || !key.remoteJid) {
    key = {
      ...key,
      remoteJid: normalizedJid,
      id: messageId,
    };
  }

  let messageContent;
  if (typeof replyMessage === "string") {
    messageContent = { text: replyMessage };
  } else {
    messageContent = replyMessage;
  }

  try {
    await sock.sendMessage(normalizedJid, messageContent, {
      quoted: key,
    });
  } catch (error) {
    logger.error({ error, jid: normalizedJid, messageId }, "Mesaj yanıtlanamadı");
    throw new Error(`Mesaj yanıtlanamadı: ${error.message}`);
  }

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
  const sessionId = getAccountId(accountId);

  // Önce memory store'dan kontrol et
  const instance = getOrCreateInstance(accountId);
  let key = null;

  // Memory store'dan mesajı bul
  const memoryMessages = instance.messagesStore.get(normalizedJid) || [];
  const memoryMsg = memoryMessages.find(m => {
    const msgId = m.id || m.key?.id;
    return msgId === messageId;
  });
  
  if (memoryMsg) {
    // Memory store'dan bulundu
    // formatMessage ile formatlanmış mesajlarda key direkt olarak olabilir
    if (memoryMsg.key) {
      key = memoryMsg.key;
      // Key'in id'si eksikse ekle
      if (!key.id && memoryMsg.id) {
        key.id = memoryMsg.id;
      }
    } else if (memoryMsg.id) {
      // Key yoksa oluştur - formatMessage'dan gelen mesajlarda key olmayabilir
      key = {
        remoteJid: normalizedJid,
        id: memoryMsg.id,
        fromMe: memoryMsg.fromMe !== undefined ? Boolean(memoryMsg.fromMe) : false,
      };
    }
    
    // fromMe kontrolü
    const msgFromMe = memoryMsg.fromMe !== undefined ? Boolean(memoryMsg.fromMe) : (key?.fromMe || false);
    if (!msgFromMe && !key.fromMe) {
      throw new Error("Sadece kendi mesajlarını düzenleyebilirsin");
    }
    
    // Key'in fromMe'sini set et
    if (key) {
      key.fromMe = msgFromMe || key.fromMe || true;
    }
  }

  // Memory store'da yoksa DB'den kontrol et
  if (!key) {
    const message = await prisma.message.findFirst({
      where: {
        sessionId,
        remoteJid: normalizedJid,
        id: messageId,
      },
    });

    if (!message) {
      throw new Error("Düzenlenecek mesaj bulunamadı");
    }

    try {
      key = typeof message.key === "string" ? JSON.parse(message.key) : message.key;
    } catch (error) {
      logger.error({ error, messageId }, "Mesaj anahtarı parse edilemedi");
      throw new Error("Mesaj anahtarı geçersiz");
    }

    if (!key.fromMe) {
      throw new Error("Sadece kendi mesajlarını düzenleyebilirsin");
    }
  }

  // Key'in doğru formatta olduğundan emin ol
  if (!key || !key.remoteJid) {
    key = {
      ...key,
      remoteJid: normalizedJid,
      id: messageId,
      fromMe: true,
    };
  }

  let messageContent;
  if (typeof newMessage === "string") {
    messageContent = { text: newMessage };
  } else {
    messageContent = newMessage;
  }

  try {
    // Baileys'de mesaj düzenleme için doğru format
    // edit parametresi ile eski mesajın key'i gönderilir
    // Key'in doğru formatta olduğundan emin ol (proto.MessageKey formatı)
    // Baileys'in en son versiyonunda edit parametresi key.id string'i veya tam key objesi olabilir
    // Key'in id'si mutlaka string olmalı
    const keyId = key.id || messageId;
    if (!keyId) {
      throw new Error("Mesaj ID'si bulunamadı");
    }
    
    const editKey = {
      remoteJid: key.remoteJid || normalizedJid,
      id: String(keyId), // Baileys id'yi string olarak bekliyor
      fromMe: true, // Düzenleme için mutlaka true olmalı
    };
    
    // Grup mesajları için participant ekle
    if (key.participant) {
      editKey.participant = key.participant;
    }
    
    logger.info({ editKey, jid: normalizedJid, messageId, originalKey: key, keyId: String(keyId) }, "Mesaj düzenleniyor");
    
    // Baileys 7.0.0-rc.9'da mesaj düzenleme için edit parametresi
    // Baileys'in kaynak koduna göre, edit parametresi proto.MessageKey tipinde bir obje bekliyor
    // Ama bazı durumlarda sadece key.id string'i de çalışabilir
    // Önce key objesi ile deneyelim, çalışmazsa key.id string'i ile deneyelim
    
    let result;
    try {
      // İlk deneme: tam key objesi ile
      result = await sock.sendMessage(normalizedJid, messageContent, {
        edit: editKey,
      });
      logger.info({ result, method: 'editKeyObject' }, "Mesaj düzenlendi (key objesi ile)");
    } catch (firstError) {
      logger.warn({ firstError, editKey }, "Key objesi ile düzenleme başarısız, key.id string'i ile deneniyor");
      
      // İkinci deneme: sadece key.id string'i ile
      try {
        result = await sock.sendMessage(normalizedJid, messageContent, {
          edit: editKey.id,
        });
        logger.info({ result, method: 'editKeyId' }, "Mesaj düzenlendi (key.id string'i ile)");
      } catch (secondError) {
        logger.error({ firstError, secondError, editKey }, "Her iki yöntem de başarısız");
        throw secondError; // Son hatayı fırlat
      }
    }
    
    logger.info({ result, jid: normalizedJid, messageId }, "Mesaj düzenlendi");
  } catch (error) {
    logger.error({ error, jid: normalizedJid, messageId, key, errorMessage: error.message, errorStack: error.stack }, "Mesaj düzenlenemedi");
    throw new Error(`Mesaj düzenlenemedi: ${error.message}`);
  }

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

