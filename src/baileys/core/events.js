// Socket event bindings and socket creation
import makeWASocket, { Browsers } from "baileys";
import { DisconnectReason, isJidBroadcast, jidNormalizedUser } from "baileys";
import Boom from "@hapi/boom";
import NodeCache from "node-cache";
import { prisma, logger } from "../../shared.js";
import { serializePrisma } from "../../utils.js";
import { findSessionByWhatsAppJid, migrateSessionData, findActiveSessionByWhatsAppJid } from "../../sessionMapper.js";
import {
  getWebSocketBroadcast,
  instances,
  contactsCache,
  formatChat,
  formatMessage,
  formatContactName,
  saveMessages,
  saveMessagesToPrisma,
  extractText,
} from "../shared.js";

/**
 * Socket event'lerini bağla
 * Bu fonksiyon tüm socket event listener'larını kurar
 */
export const bindSocketEvents = (instance) => {
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

  const wsBroadcastFn = getWebSocketBroadcast();

  const credsUpdateListener = instance.saveCredsFn;
  sock.ev.on("creds.update", credsUpdateListener);
  instance.eventListeners.set("creds.update", credsUpdateListener);

  // Chats - Prisma'ya kaydet
  const chatsSetListener = async ({ chats }) => {
    console.log(`[${sessionId}] chats.set event geldi: ${chats.length} chat`);
    
    for (const chat of chats) {
      // JID'i normalize et (aynı numara farklı formatlarda kaydedilmesin)
      const normalizedChatId = jidNormalizedUser(chat.id);
      instance.chatsStore.set(normalizedChatId, { ...chat, id: normalizedChatId });
      try {
        await prisma.chat.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: normalizedChatId,
            },
          },
          create: {
            sessionId,
            id: normalizedChatId,
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
        // JID'i normalize et (aynı numara farklı formatlarda kaydedilmesin)
        const normalizedChatId = jidNormalizedUser(chat.id);
        instance.chatsStore.set(normalizedChatId, { ...chat, id: normalizedChatId });
        try {
          
          await prisma.chat.upsert({
            where: {
              sessionId_id: {
                sessionId,
                id: normalizedChatId,
              },
            },
            create: {
              sessionId,
              id: normalizedChatId,
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
  // README'de hem "messaging.history-set" hem "messaging-history.set" olarak geçiyor
  // Her iki event'i de dinleyelim (version uyumluluğu için)
  try {
    // Baileys v6+ event naming (tire ile)
    sock.ev.on("messaging-history.set", messagingHistorySetListener);
    instance.eventListeners.set("messaging-history.set", messagingHistorySetListener);
    
    // Alternatif event naming (nokta ile) - backwards compatibility
    sock.ev.on("messaging.history-set", messagingHistorySetListener);
    instance.eventListeners.set("messaging.history-set", messagingHistorySetListener);
    
    logger.debug({ sessionId }, "messaging-history.set event listener'ları kuruldu");
  } catch (error) {
    // Eğer event mevcut değilse, ignore et (eski Baileys versiyonlarında olmayabilir)
    logger.warn({ error, sessionId }, "messaging-history.set event'i mevcut değil, chats.set kullanılacak");
  }

  const chatsUpsertListener = async (chats) => {
    // chats.upsert event'i tek bir chat veya chat array'i olabilir
    if (!Array.isArray(chats)) {
      chats = [chats];
    }
    console.log(`[${sessionId}] chats.upsert event: ${chats.length} chat alındı`);
    
    for (const chat of chats) {
      // JID'i normalize et (aynı numara farklı formatlarda kaydedilmesin)
      const normalizedChatId = jidNormalizedUser(chat.id);
      instance.chatsStore.set(normalizedChatId, { ...chat, id: normalizedChatId });
      try {
        
        await prisma.chat.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: normalizedChatId,
            },
          },
          create: {
            sessionId,
            id: normalizedChatId,
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
      // JID'i normalize et (aynı numara farklı formatlarda kaydedilmesin)
      const normalizedUpdateId = jidNormalizedUser(update.id);
      const existing = instance.chatsStore.get(normalizedUpdateId) || {};
      const merged = { ...existing, ...update, id: normalizedUpdateId };
      instance.chatsStore.set(normalizedUpdateId, merged);

      try {
        await prisma.chat.updateMany({
          where: {
            sessionId,
            id: normalizedUpdateId,
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
                    name: c.name || null, // Ham name alanı (cihaz rehberindeki isim)
                    notify: c.notify || null, // WhatsApp'ta kayıtlı isim
                    verifiedName: c.verifiedName || null, // Doğrulanmış isim
                    displayName: formatContactName(c), // Formatlanmış isim (fallback ile)
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
            name: c.name || null, // Ham name alanı (cihaz rehberindeki isim)
            notify: c.notify || null, // WhatsApp'ta kayıtlı isim
            verifiedName: c.verifiedName || null, // Doğrulanmış isim
            displayName: formatContactName(c), // Formatlanmış isim (fallback ile)
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
          name: c.name || null, // Ham name alanı (cihaz rehberindeki isim)
          notify: c.notify || null, // WhatsApp'ta kayıtlı isim
          verifiedName: c.verifiedName || null, // Doğrulanmış isim
          displayName: formatContactName(c), // Formatlanmış isim (fallback ile)
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
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return;
    }
    
    // Reaction mesajlarını tespit et ve orijinal mesaja ekle
    const reactionMessages = [];
    const nonReactionMessages = [];
    
    for (const msg of messages) {
      // Debug: Tüm mesajları logla (reaction tespiti için)
      if (msg.message?.reactionMessage || msg.text?.includes('👍') || msg.text?.includes('😮')) {
        logger.info({ 
          sessionId, 
          messageId: msg.key?.id,
          hasReactionMessage: !!msg.message?.reactionMessage,
          reactionMessage: msg.message?.reactionMessage,
          text: msg.text,
          messageKeys: msg.message ? Object.keys(msg.message) : [],
          keyRemoteJid: msg.key?.remoteJid,
          fullMessage: JSON.stringify(msg).substring(0, 500)
        }, "Mesaj kontrol ediliyor (reaction tespiti için)");
      }
      
      // Reaction mesajı mı kontrol et
      if (msg.message?.reactionMessage) {
        reactionMessages.push(msg);
        logger.info({ 
          sessionId, 
          reactionMessageId: msg.key?.id,
          originalMessageId: msg.message.reactionMessage.key?.id,
          reactionText: msg.message.reactionMessage.text,
          from: msg.key?.remoteJid,
          originalMessageJid: msg.message.reactionMessage.key?.remoteJid
        }, "Reaction mesajı tespit edildi (messages.upsert)");
        
        // Orijinal mesajı bul ve reaction'ı ekle
        try {
          const originalMessageId = msg.message.reactionMessage.key?.id;
          const originalMessageJid = msg.message.reactionMessage.key?.remoteJid || msg.key?.remoteJid;
          
          if (originalMessageId && originalMessageJid) {
            const normalizedJid = jidNormalizedUser(originalMessageJid);
            
            // Prisma'da orijinal mesajı bul
            const existingMessage = await prisma.message.findFirst({
              where: {
                sessionId,
                remoteJid: normalizedJid,
                id: originalMessageId,
              },
            });
            
            if (existingMessage) {
              // Mesajın message JSON'unu parse et
              const messageData = existingMessage.message ? (typeof existingMessage.message === "string" ? JSON.parse(existingMessage.message) : existingMessage.message) : {};
              
              // Reaction'ı ekle
              if (!messageData.reactions) {
                messageData.reactions = [];
              }
              
              // Reaction'ın zaten var olup olmadığını kontrol et
              const reactionExists = messageData.reactions.some((r) => 
                r.key?.id === msg.key?.id || 
                (r.text === msg.message.reactionMessage.text && r.key?.participant === msg.key?.participant)
              );
              
              if (!reactionExists) {
                messageData.reactions.push({
                  key: msg.key,
                  text: msg.message.reactionMessage.text,
                  emoji: msg.message.reactionMessage.text || '👍'
                });
                
                // Prisma'da güncelle
                await prisma.message.updateMany({
                  where: {
                    sessionId,
                    remoteJid: normalizedJid,
                    id: originalMessageId,
                  },
                  data: {
                    message: JSON.stringify(messageData),
                  },
                });
                
                logger.info({ 
                  sessionId, 
                  originalMessageId,
                  reactionText: msg.message.reactionMessage.text,
                  jid: normalizedJid
                }, "Orijinal mesaja reaction eklendi (Prisma)");
                
                // Memory store'da da güncelle
                const messages = instance.messagesStore.get(normalizedJid) || [];
                const messageIndex = messages.findIndex((m) => 
                  (m.key?.id === originalMessageId) || (m.id === originalMessageId)
                );
                
                if (messageIndex !== -1) {
                  const existingMsg = messages[messageIndex];
                  const existingMsgData = existingMsg.message || {};
                  if (!existingMsgData.reactions) {
                    existingMsgData.reactions = [];
                  }
                  existingMsgData.reactions.push({
                    key: msg.key,
                    text: msg.message.reactionMessage.text,
                    emoji: msg.message.reactionMessage.text || '👍'
                  });
                  messages[messageIndex] = {
                    ...existingMsg,
                    message: existingMsgData,
                    reactions: existingMsgData.reactions
                  };
                  instance.messagesStore.set(normalizedJid, messages);
                  
                  logger.info({ 
                    sessionId, 
                    originalMessageId,
                    jid: normalizedJid
                  }, "Orijinal mesaja reaction eklendi (Memory store)");
                }
                
                // WebSocket'e reaction update gönder
                if (wsBroadcastFn) {
                  // JID'i normalize et (msg.key?.remoteJid @lid formatında olabilir)
                  // Orijinal mesajın JID'ini kullan, ama eğer @lid formatındaysa normalize et
                  let webSocketJid = normalizedJid;
                  if (originalMessageJid && originalMessageJid.includes('@lid')) {
                    // @lid formatındaki JID'i normalize et
                    webSocketJid = jidNormalizedUser(originalMessageJid);
                    // Eğer hala @lid formatındaysa, msg.key?.remoteJid'den telefon numarasını çıkar
                    if (webSocketJid.includes('@lid')) {
                      // msg.key?.remoteJid'den telefon numarasını çıkar (eğer varsa)
                      // Şimdilik normalizedJid'i kullan (Prisma'da kayıtlı olan)
                      webSocketJid = normalizedJid;
                    }
                  }
                  
                  wsBroadcastFn({
                    type: "messages.update",
                    sessionId,
                    updates: [{
                      key: {
                        id: originalMessageId,
                        remoteJid: webSocketJid,
                      },
                      updateType: "reaction",
                      updateData: {
                        reactions: messageData.reactions,
                      },
                      jid: webSocketJid,
                    }],
                  });
                  
                  logger.info({ 
                    sessionId, 
                    originalMessageId,
                    originalMessageJid,
                    normalizedJid,
                    webSocketJid,
                    jid: webSocketJid
                  }, "Reaction update WebSocket'e gönderildi");
                }
              }
            }
          }
        } catch (error) {
          logger.error({ error, sessionId, messageId: msg.key?.id }, "Reaction mesajı işlenemedi");
        }
      } else {
        nonReactionMessages.push(msg);
      }
      
      if (msg.key?.remoteJid) {
        saveMessages(instance, msg.key.remoteJid, [msg]);
      }
    }
    
    // Sadece non-reaction mesajlarını Prisma'ya kaydet (reaction mesajları ayrı mesaj olarak gösterilmemeli)
    await saveMessagesToPrisma(sessionId, nonReactionMessages);

    // WebSocket'e bildir - TÜM mesajlar için (sadece notify değil)
    // type === "notify" yeni mesajlar için, type === "append" geçmiş mesajlar için
    if (wsBroadcastFn) {
      // Reaction mesajlarını filtrele (ayrı mesaj olarak gösterilmemeli)
      const formattedMessages = nonReactionMessages.map(formatMessage);
      logger.info({ 
        sessionId, 
        totalCount: messages.length, 
        reactionCount: reactionMessages.length,
        nonReactionCount: nonReactionMessages.length,
        type 
      }, "Mesajlar WebSocket'e gönderiliyor");
      
      wsBroadcastFn({
        type: "messages.upsert",
        sessionId,
        messages: formattedMessages,
        eventType: type,
      });
    }
    
    if (type === "notify") {
      logger.info({ sessionId, count: nonReactionMessages.length }, "Yeni mesajlar alındı");
    }
  };
  sock.ev.on("messages.upsert", messagesUpsertListener);
  instance.eventListeners.set("messages.upsert", messagesUpsertListener);

  // messages.update: Mesaj güncellemeleri (okundu, düzenlendi, silindi, reaksiyon, poll votes)
  // Baileys README'ye göre poll votes decrypt için kritik
  const messagesUpdateListener = async (updates) => {
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return;
    }

    // Debug: Tüm messages.update event'lerini logla
    logger.info({ 
      sessionId, 
      updateCount: updates.length,
      firstUpdateKeys: updates[0] ? Object.keys(updates[0]) : [],
      firstUpdateStructure: updates[0] ? JSON.stringify(updates[0]).substring(0, 500) : 'null'
    }, "messages.update event alındı (tüm update'ler)");

    const formattedUpdates = [];

    for (const update of updates) {
      const { key, update: msgUpdate } = update;
      if (!key || !key.remoteJid) {
        continue;
      }
      
      // Debug: Tüm update yapısını logla
      logger.info({ 
        sessionId, 
        messageId: key.id, 
        updateKeys: Object.keys(update),
        hasUpdateField: !!update.update,
        updateType: typeof update.update,
        updateStructure: JSON.stringify(update).substring(0, 2000)
      }, "messages.update event yapısı (tüm update'ler için)");

      const normalizedJid = jidNormalizedUser(key.remoteJid);
      let updateType = "unknown";
      let updateData = null;
      
      // Debug: TÜM msgUpdate içeriğini logla (reaction tespiti için)
      logger.info({ 
        sessionId, 
        messageId: key.id, 
        jid: normalizedJid,
        msgUpdateKeys: msgUpdate ? Object.keys(msgUpdate) : [],
        hasReactions: !!(msgUpdate?.reactions),
        hasReactionMessage: !!(msgUpdate?.reactionMessage),
        msgUpdateType: typeof msgUpdate,
        msgUpdate: msgUpdate ? JSON.stringify(msgUpdate).substring(0, 1000) : 'null'
      }, "msgUpdate içeriği (tüm update'ler için)");

      // Poll votes decrypt (Baileys README'ye göre önemli)
      if (msgUpdate.pollUpdates) {
        try {
          const { getMessageFromStore } = await import("../shared.js");
          const pollCreation = await getMessageFromStore(key, sessionId);
          
          if (pollCreation) {
            const { getAggregateVotesInPollMessage } = await import("baileys");
            const aggregatedVotes = getAggregateVotesInPollMessage({
              message: pollCreation,
              pollUpdates: msgUpdate.pollUpdates,
            });
            
            updateType = "poll_vote";
            updateData = {
              pollVotes: aggregatedVotes,
              pollUpdates: msgUpdate.pollUpdates,
            };
            
            logger.info({ sessionId, messageId: key.id }, "Poll vote güncellemesi alındı");
          }
        } catch (error) {
          logger.error({ error, sessionId, messageId: key.id }, "Poll vote decrypt edilemedi");
        }
      }

      // Mesaj okundu bilgisi (read receipt)
      if (msgUpdate.receipt) {
        updateType = "read_receipt";
        updateData = {
          receipt: msgUpdate.receipt,
          receiptTimestamp: msgUpdate.receiptTimestamp,
        };
        
        // Prisma'da mesajı güncelle (okundu olarak işaretle)
        try {
          await prisma.message.updateMany({
            where: {
              sessionId,
              remoteJid: normalizedJid,
              id: key.id,
            },
            data: {
              read: true,
              readTimestamp: msgUpdate.receiptTimestamp ? BigInt(msgUpdate.receiptTimestamp) : undefined,
            },
          });
        } catch (error) {
          logger.error({ error, sessionId, messageId: key.id }, "Mesaj okundu bilgisi güncellenemedi");
        }
      }

      // Mesaj düzenleme
      if (msgUpdate.message) {
        updateType = "message_edit";
        updateData = {
          message: msgUpdate.message,
        };
        
        // Mesaj text'ini çıkar (veritabanına kaydetmek için)
        let messageText = '';
        if (msgUpdate.message.conversation) {
          messageText = msgUpdate.message.conversation;
        } else if (msgUpdate.message.extendedTextMessage?.text) {
          messageText = msgUpdate.message.extendedTextMessage.text;
        } else if (msgUpdate.message.text) {
          messageText = msgUpdate.message.text;
        }
        
        logger.info({ 
          sessionId, 
          messageId: key.id, 
          jid: normalizedJid,
          messageText: messageText.substring(0, 50),
          messageStructure: Object.keys(msgUpdate.message || {})
        }, "Mesaj düzenleme güncellemesi alındı");
        
        // Prisma'da mesajı güncelle (message JSON'unu güncelle)
        try {
          await prisma.message.updateMany({
            where: {
              sessionId,
              remoteJid: normalizedJid,
              id: key.id,
            },
            data: {
              message: JSON.stringify(msgUpdate.message),
            },
          });
          
          logger.info({ 
            sessionId, 
            messageId: key.id, 
            jid: normalizedJid,
            messageText: messageText.substring(0, 50)
          }, "Mesaj düzenleme veritabanına kaydedildi");
        } catch (error) {
          logger.error({ error, sessionId, messageId: key.id }, "Mesaj düzenleme kaydedilemedi");
        }
      }

      // Mesaj silme
      if (msgUpdate.messageStubType === 0 || msgUpdate.messageStubParameters) {
        updateType = "message_delete";
        updateData = {
          messageStubType: msgUpdate.messageStubType,
          messageStubParameters: msgUpdate.messageStubParameters,
        };
        
        // Prisma'dan mesajı sil
        try {
          await prisma.message.deleteMany({
            where: {
              sessionId,
              remoteJid: normalizedJid,
              id: key.id,
            },
          });
        } catch (error) {
          logger.error({ error, sessionId, messageId: key.id }, "Mesaj silme işlemi başarısız");
        }
      }

      // Reaksiyonlar - tüm olası formatları kontrol et
      // Baileys'de reaction'lar farklı formatta gelebilir:
      // 1. msgUpdate.reactions (array)
      // 2. msgUpdate.reactionMessage (object)
      // 3. msgUpdate.message?.reactionMessage (nested)
      // 4. update.message?.reactionMessage (parent level)
      let reactionsData = null;
      let hasReaction = false;
      
      if (msgUpdate.reactions) {
        reactionsData = msgUpdate.reactions;
        hasReaction = true;
      } else if (msgUpdate.reactionMessage) {
        // reactionMessage formatından reactions array'i oluştur
        reactionsData = [{
          key: key,
          text: msgUpdate.reactionMessage.text || '',
          emoji: msgUpdate.reactionMessage.text || '👍'
        }];
        hasReaction = true;
      } else if (msgUpdate.message?.reactionMessage) {
        reactionsData = [{
          key: key,
          text: msgUpdate.message.reactionMessage.text || '',
          emoji: msgUpdate.message.reactionMessage.text || '👍'
        }];
        hasReaction = true;
      } else if (update.message?.reactionMessage) {
        reactionsData = [{
          key: key,
          text: update.message.reactionMessage.text || '',
          emoji: update.message.reactionMessage.text || '👍'
        }];
        hasReaction = true;
      }
      
      // Debug: Reaction field'larını kontrol et
      const hasReactionsField = !!(msgUpdate.reactions || msgUpdate.reactionMessage || msgUpdate.message?.reactionMessage || update.message?.reactionMessage);
      if (hasReactionsField || JSON.stringify(msgUpdate).toLowerCase().includes('reaction')) {
        logger.info({ 
          sessionId, 
          messageId: key.id, 
          jid: normalizedJid,
          msgUpdateKeys: Object.keys(msgUpdate || {}),
          hasReactions: !!msgUpdate.reactions,
          hasReactionMessage: !!msgUpdate.reactionMessage,
          hasMessageReactionMessage: !!msgUpdate.message?.reactionMessage,
          hasUpdateMessageReactionMessage: !!update.message?.reactionMessage,
          msgUpdateString: JSON.stringify(msgUpdate).substring(0, 500),
          updateString: JSON.stringify(update).substring(0, 500)
        }, "Reaction field'ları tespit edildi (detaylı kontrol)");
      }
      
      if (hasReaction && reactionsData) {
        updateType = "reaction";
        updateData = {
          reactions: reactionsData,
        };
        
        logger.info({ 
          sessionId, 
          messageId: key.id, 
          jid: normalizedJid,
          reactions: reactionsData,
          reactionsType: typeof reactionsData,
          reactionsIsArray: Array.isArray(reactionsData),
          hasReactionMessage: !!msgUpdate.reactionMessage,
          reactionMessageText: msgUpdate.reactionMessage?.text || msgUpdate.message?.reactionMessage?.text,
          msgUpdateKeys: Object.keys(msgUpdate || {})
        }, "Reaction update tespit edildi");
        
        // Prisma'da mesajı güncelle (reaksiyonları ekle)
        try {
          const existingMessage = await prisma.message.findFirst({
            where: {
              sessionId,
              remoteJid: normalizedJid,
              id: key.id,
            },
          });
          
          if (existingMessage) {
            const message = existingMessage.message ? (typeof existingMessage.message === "string" ? JSON.parse(existingMessage.message) : existingMessage.message) : {};
            message.reactions = msgUpdate.reactions;
            
            await prisma.message.updateMany({
              where: {
                sessionId,
                remoteJid: normalizedJid,
                id: key.id,
              },
              data: {
                message: JSON.stringify(message),
              },
            });
          }
        } catch (error) {
          logger.error({ error, sessionId, messageId: key.id }, "Mesaj reaksiyonu kaydedilemedi");
        }
      }

      // Memory store'dan mesajı güncelle
      try {
        const messages = instance.messagesStore.get(normalizedJid) || [];
        const messageIndex = messages.findIndex(m => {
          const msgId = m.key?.id || m.id;
          return msgId === key.id;
        });
        
        if (messageIndex !== -1) {
          const existingMessage = messages[messageIndex];
          
          // Mesaj güncellemelerini uygula
          if (msgUpdate.receipt) {
            existingMessage.read = true;
            existingMessage.readTimestamp = msgUpdate.receiptTimestamp;
          }
          if (msgUpdate.message) {
            // Mesaj düzenleme: message JSON'unu güncelle
            existingMessage.message = msgUpdate.message;
            // Text'i de güncelle (formatMessage için)
            const updatedText = extractText(msgUpdate.message);
            if (updatedText) {
              existingMessage.text = updatedText;
            }
          }
          if (msgUpdate.reactions) {
            if (!existingMessage.message) existingMessage.message = {};
            existingMessage.message.reactions = msgUpdate.reactions;
          }
          
          messages[messageIndex] = existingMessage;
          instance.messagesStore.set(normalizedJid, messages);
          
          logger.info({ 
            sessionId, 
            messageId: key.id, 
            jid: normalizedJid,
            memoryStoreUpdated: true
          }, "Memory store'da mesaj güncellendi");
        }
      } catch (error) {
        logger.error({ error, sessionId, messageId: key.id }, "Memory store'da mesaj güncellenemedi");
      }

      formattedUpdates.push({
        key: {
          ...key,
          id: key.id, // ID'yi garanti et
        },
        updateType,
        updateData,
        jid: normalizedJid,
        // Timestamp ekle (mesaj eşleştirmesi için)
        timestamp: key.timestamp || update.update?.messageTimestamp || undefined,
      });
    }

    // WebSocket'e bildir
    if (wsBroadcastFn && formattedUpdates.length > 0) {
      wsBroadcastFn({
        type: "messages.update",
        sessionId,
        updates: formattedUpdates,
      });
      
      logger.info({ sessionId, count: formattedUpdates.length }, "Mesaj güncellemeleri WebSocket'e gönderildi");
    }
  };
  sock.ev.on("messages.update", messagesUpdateListener);
  instance.eventListeners.set("messages.update", messagesUpdateListener);

  // presence.update: Kullanıcı online durumu, typing, last seen
  // Baileys README'ye göre presence güncellemeleri için
  const presenceUpdateListener = async (updates) => {
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return;
    }

    const formattedPresences = [];

    for (const update of updates) {
      const { id, presences } = update;
      if (!id) {
        continue;
      }

      const normalizedJid = jidNormalizedUser(id);
      
      // Presence bilgilerini formatla
      const presenceData = {
        jid: normalizedJid,
        presences: presences || {},
      };

      // Her bir presence tipini işle
      for (const [participantJid, presence] of Object.entries(presences || {})) {
        const normalizedParticipant = jidNormalizedUser(participantJid);
        
        // Presence tipleri: available, unavailable, composing, recording, last seen
        const presenceInfo = {
          jid: normalizedJid,
          participant: normalizedParticipant,
          presence: presence?.lastKnownPresence || presence?.presence || "unknown",
          lastSeen: presence?.lastSeen || null,
          isComposing: presence?.lastKnownPresence === "composing" || presence?.presence === "composing",
          isRecording: presence?.lastKnownPresence === "recording" || presence?.presence === "recording",
          isAvailable: presence?.lastKnownPresence === "available" || presence?.presence === "available",
          isUnavailable: presence?.lastKnownPresence === "unavailable" || presence?.presence === "unavailable",
        };

        formattedPresences.push(presenceInfo);
        
        logger.debug({ 
          sessionId, 
          jid: normalizedJid, 
          participant: normalizedParticipant,
          presence: presenceInfo.presence,
          lastSeen: presenceInfo.lastSeen 
        }, "Presence güncellemesi alındı");
      }

      // Eğer presences boşsa, sadece JID'yi ekle
      if (!presences || Object.keys(presences).length === 0) {
        formattedPresences.push({
          jid: normalizedJid,
          participant: null,
          presence: "unknown",
          lastSeen: null,
          isComposing: false,
          isRecording: false,
          isAvailable: false,
          isUnavailable: false,
        });
      }
    }

    // WebSocket'e bildir
    if (wsBroadcastFn && formattedPresences.length > 0) {
      wsBroadcastFn({
        type: "presence.update",
        sessionId,
        presences: formattedPresences,
      });
      
      logger.info({ sessionId, count: formattedPresences.length }, "Presence güncellemeleri WebSocket'e gönderildi");
    }
  };
  sock.ev.on("presence.update", presenceUpdateListener);
  instance.eventListeners.set("presence.update", presenceUpdateListener);

  // Groups metadata - Prisma'ya kaydet
  const groupsUpdateListener = async (updates) => {
    const formattedGroups = [];
    
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
        
        // WebSocket'e bildir
        formattedGroups.push({
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
          participants: metadata.participants || [],
          ephemeralDuration: metadata.ephemeralDuration || null,
          inviteCode: metadata.inviteCode || null,
        });
      } catch (error) {
        logger.error({ error, sessionId, groupId: update.id }, "Grup metadata kaydedilemedi");
      }
    }
    
    // WebSocket'e bildir
    if (wsBroadcastFn && formattedGroups.length > 0) {
      wsBroadcastFn({
        type: "groups.update",
        sessionId,
        groups: formattedGroups,
      });
      logger.info({ sessionId, count: formattedGroups.length }, "Grup güncellemeleri WebSocket'e gönderildi");
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
        `[${instance.id}] QR kodu üretildi (frontend'e gönderiliyor)`
      );
      // QR kod terminale yazdırılmıyor, sadece frontend'e gönderiliyor
      
      // WebSocket'e bildir
      if (wsBroadcastFn) {
        wsBroadcastFn({
          type: "connection.update",
          sessionId,
          connection: "connecting",
          qr: qr,
        });
      }
    }

    if (connection === "connecting") {
      connectionState.status = "connecting";
      connectionState.lastError = null;
      
      // WebSocket'e bildir
      if (wsBroadcastFn) {
        wsBroadcastFn({
          type: "connection.update",
          sessionId,
          connection: "connecting",
        });
      }
    }

    if (connection === "open") {
      connectionState.status = "open";
      connectionState.lastQr = null;
      connectionState.lastError = null;
      connectionState.disconnectReason = null;
      // Bağlantı başarılı olduğunda reconnect counter'ı sıfırla (Baileys.wiki best practice)
      instance.reconnectAttempts = 0;
      // Bağlantı açıldığında chats.set event'ini beklemek için flag'i reset et
      instance.chatsSetReceived = false;
      instance.chatsUpsertTimer = null;
      console.log(`[${instance.id}] WhatsApp bağlantısı hazır ✅`);
      
      // WebSocket'e bildir
      if (wsBroadcastFn) {
        wsBroadcastFn({
          type: "connection.update",
          sessionId,
          connection: "open",
        });
      }
      
      // WhatsApp numarasını al ve sessionId ile eşleştir
      (async () => {
        try {
          const whatsappJid = sock.user?.id;
          instance.whatsappJid = whatsappJid;
          
          if (whatsappJid) {
            // Aynı WhatsApp numarası için aktif session'ları bul (memory'den)
            const activeOldSessionId = findActiveSessionByWhatsAppJid(whatsappJid);
            
            // Eğer bu numara için başka bir aktif session varsa, eski session'ı kapat
            if (activeOldSessionId && activeOldSessionId !== sessionId) {
              logger.warn(
                { oldSessionId: activeOldSessionId, newSessionId: sessionId, whatsappJid },
                "Aynı WhatsApp hesabı için aktif session tespit edildi, eski session kapatılıyor"
              );
              
              try {
                const oldInstance = instances.get(activeOldSessionId);
                if (oldInstance && oldInstance.sock) {
                  // Eski session'ı logout yap
                  await oldInstance.sock.logout();
                  logger.info({ oldSessionId: activeOldSessionId }, "Eski session logout yapıldı");
                }
              } catch (error) {
                logger.error({ error, oldSessionId: activeOldSessionId }, "Eski session kapatılamadı");
              }
            }
            
            // Aynı WhatsApp numarası için eski sessionId'yi bul (veritabanından)
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
                                      name: contact.name !== undefined ? contact.name : undefined,
                                      notify: contact.notify !== undefined ? contact.notify : undefined,
                                      verifiedName: contact.verifiedName !== undefined ? contact.verifiedName : undefined,
                                      imgUrl: contact.imgUrl !== undefined ? contact.imgUrl : undefined,
                                      status: contact.status !== undefined ? contact.status : undefined,
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
      
      // Baileys.wiki'ye göre disconnection sebeplerini handle et
      let shouldReconnect = false;
      let disconnectReason = "unknown";
      
      switch (statusCode) {
        case DisconnectReason.badSession:
          disconnectReason = "bad_session";
          shouldReconnect = false; // Session bozuk, auth dosyalarını temizle
          logger.error({ sessionId }, "Kötü session, auth dosyaları temizlenmeli");
          break;
          
        case DisconnectReason.connectionClosed:
          disconnectReason = "connection_closed";
          shouldReconnect = true; // Bağlantı kapandı, yeniden bağlan
          break;
          
        case DisconnectReason.connectionLost:
          disconnectReason = "connection_lost";
          shouldReconnect = true; // Bağlantı kayboldu, yeniden bağlan
          break;
          
        case DisconnectReason.connectionReplaced:
          disconnectReason = "connection_replaced";
          shouldReconnect = false; // Başka cihazdan giriş yapıldı, yeniden bağlanma
          logger.warn({ sessionId }, "Bağlantı başka cihazdan değiştirildi");
          break;
          
        case DisconnectReason.forbidden:
          disconnectReason = "forbidden";
          shouldReconnect = false; // Yasaklandı, yeniden bağlanma
          logger.error({ sessionId }, "Bağlantı yasaklandı (403)");
          break;
          
        case DisconnectReason.loggedOut:
          disconnectReason = "logged_out";
          shouldReconnect = false; // Logout yapıldı, yeniden bağlanma
          logger.info({ sessionId }, "Kullanıcı logout yaptı");
          break;
          
        case DisconnectReason.restartRequired:
          disconnectReason = "restart_required";
          shouldReconnect = true; // Restart gerekli, yeniden başlat
          logger.info({ sessionId }, "WhatsApp restart gerektiriyor");
          break;
          
        case DisconnectReason.timedOut:
          disconnectReason = "timed_out";
          shouldReconnect = true; // Timeout oldu, yeniden bağlan
          break;
          
        case DisconnectReason.unavailableService:
          disconnectReason = "unavailable_service";
          shouldReconnect = true; // Servis kullanılamaz, yeniden bağlan
          break;
          
        default:
          disconnectReason = "unknown";
          // Bilinmeyen durumlarda, statusCode 500+ ise yeniden bağlan
          shouldReconnect = !statusCode || statusCode >= 500;
          logger.warn({ sessionId, statusCode }, "Bilinmeyen disconnection sebep kodu");
          break;
      }

      connectionState.lastError = error?.message || boomError?.message || "Bilinmeyen hata";
      connectionState.disconnectReason = disconnectReason;

      console.warn(`[${instance.id}] Bağlantı kapandı`, {
        statusCode,
        disconnectReason,
        shouldReconnect,
        error: connectionState.lastError,
      });
      
      // WebSocket'e bildir
      if (wsBroadcastFn) {
        wsBroadcastFn({
          type: "connection.update",
          sessionId,
          connection: "close",
          statusCode: statusCode,
          disconnectReason: disconnectReason,
          shouldReconnect: shouldReconnect,
          error: connectionState.lastError,
        });
      }

      if (shouldReconnect) {
        clearTimeout(instance.reconnectTimer);
        // Exponential backoff: 2 saniye base, her başarısız bağlantıda 2 katına çık (max 30 saniye)
        const retryDelay = Math.min(2000 * Math.pow(2, instance.reconnectAttempts || 0), 30000);
        instance.reconnectAttempts = (instance.reconnectAttempts || 0) + 1;
        
        logger.info({ sessionId, retryDelay, attempt: instance.reconnectAttempts }, 
          "Yeniden bağlanma planlanıyor");
        
        instance.reconnectTimer = setTimeout(() => {
          console.log(`[${instance.id}] Yeniden bağlanma deneniyor (deneme: ${instance.reconnectAttempts})...`);
          startSocket(instance);
        }, retryDelay);
      } else {
        // Yeniden bağlanma yapılmayacaksa, reconnect sayacını sıfırla
        instance.reconnectAttempts = 0;
        
        console.log(
          `[${instance.id}] Oturum kapandı (sebep: ${disconnectReason}). ` +
          `Tekrar bağlanmak için auth klasörünü temizleyin veya yeni QR kod alın.`
        );
        
        // BadSession veya loggedOut durumlarında session'ı sil
        if (statusCode === DisconnectReason.badSession || statusCode === DisconnectReason.loggedOut) {
          logger.info({ sessionId }, "Session otomatik olarak temizleniyor");
          
          // WebSocket'e session silindiğini bildir
          if (wsBroadcastFn) {
            wsBroadcastFn({
              type: "session.deleted",
              sessionId,
              reason: disconnectReason,
            });
          }
        }
      }
    }
  };
  sock.ev.on("connection.update", connectionUpdateListener);
  instance.eventListeners.set("connection.update", connectionUpdateListener);

  // call-update: Arama güncellemeleri (Baileys dokümantasyonuna göre)
  const callUpdateListener = async (updates) => {
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return;
    }

    logger.info({ sessionId, count: updates.length }, "Arama güncellemeleri alındı");

    // WebSocket'e bildir
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "call.update",
        sessionId,
        updates,
      });
    }
  };
  sock.ev.on("call.update", callUpdateListener);
  instance.eventListeners.set("call.update", callUpdateListener);

  // blocklist.update: Engellenenler listesi güncellemeleri (Baileys dokümantasyonuna göre)
  const blocklistUpdateListener = async (updates) => {
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return;
    }

    logger.info({ sessionId, count: updates.length }, "Engellenenler listesi güncellemesi alındı");

    // WebSocket'e bildir
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "blocklist.update",
        sessionId,
        updates,
      });
    }
  };
  sock.ev.on("blocklist.update", blocklistUpdateListener);
  instance.eventListeners.set("blocklist.update", blocklistUpdateListener);

  // labels.edit: Etiket düzenlemeleri (Baileys dokümantasyonuna göre)
  const labelsEditListener = async (updates) => {
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return;
    }

    logger.info({ sessionId, count: updates.length }, "Etiket düzenlemeleri alındı");

    // WebSocket'e bildir
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "labels.edit",
        sessionId,
        updates,
      });
    }
  };
  sock.ev.on("labels.edit", labelsEditListener);
  instance.eventListeners.set("labels.edit", labelsEditListener);

  // labels.association: Etiket ilişkilendirmeleri (Baileys dokümantasyonuna göre)
  const labelsAssociationListener = async (updates) => {
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return;
    }

    logger.info({ sessionId, count: updates.length }, "Etiket ilişkilendirmeleri alındı");

    // WebSocket'e bildir
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "labels.association",
        sessionId,
        updates,
      });
    }
  };
  sock.ev.on("labels.association", labelsAssociationListener);
  instance.eventListeners.set("labels.association", labelsAssociationListener);
};

/**
 * Socket oluştur ve event'leri bağla
 * Baileys README'ye göre optimize edilmiş config
 */
export const startSocket = (instance) => {
  const { authState, waVersion } = instance;
  if (!authState || !waVersion) {
    throw new Error("Kimlik doğrulama durumu yüklenemedi.");
  }

  const sessionId = instance.id;

  // Grup metadata cache (README'ye göre öneriliyor - NodeCache ile TTL desteği)
  // stdTTL: 5 dakika (300 saniye) - README'deki örnekle aynı
  const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

  instance.sock = makeWASocket({
    auth: authState,
    version: waVersion,
    // Browser config (README'ye göre öneriliyor - desktop connection için)
    browser: Browsers.macOS('Desktop'),
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
    // getMessage config (README'ye göre öneriliyor - poll votes decrypt için)
    getMessage: async (key) => {
      const { getMessageFromStore } = await import("../shared.js");
      return await getMessageFromStore(key, sessionId);
    },
    // cachedGroupMetadata (README'ye göre öneriliyor - grup metadata cache için)
    cachedGroupMetadata: async (jid) => {
      return groupCache.get(jid) || null;
    },
    // markOnlineOnConnect: false (README'ye göre - notifications için)
    markOnlineOnConnect: false,
    // YÜKSEK ÖNCELİK - Eksik özellikler
    // 1. logger - Custom Pino logger (daha iyi log yönetimi için)
    logger: logger.child({ sessionId }),
    // 2. retryRequestDelay - İstek tekrar deneme gecikmesi (ms)
    retryRequestDelay: 250,
    // 3. connectTimeoutMs - Bağlantı timeout süresi (60 saniye)
    connectTimeoutMs: 60000,
    // 4. maxMsgRetryCount - Mesaj gönderme retry sayısı
    maxMsgRetryCount: 5,
    // ORTA ÖNCELİK - Eksik özellikler
    // 5. generateHighQualityLinkPreview - Link preview'ler için yüksek kaliteli görsel
    generateHighQualityLinkPreview: true,
    // 6. defaultQueryTimeoutMs - Varsayılan query timeout süresi (60 saniye)
    defaultQueryTimeoutMs: 60000,
    // 7. keepAliveIntervalMs - Keep-alive ping interval (10 saniye)
    keepAliveIntervalMs: 10000,
    // 8. qrTimeout - QR kod timeout süresi (60 saniye)
    qrTimeout: 60000,
    // DÜŞÜK ÖNCELİK - Eksik özellikler
    // 9. fireInitQueries - İlk bağlantıda query'leri çalıştır
    fireInitQueries: true,
    // EK ÖZELLİKLER - Baileys dokümantasyonuna göre
    // 10. txnWaitTimeout - Transaction wait timeout (30 saniye)
    txnWaitTimeout: 30000,
    // 11. mobile - Mobile connection (false = web connection)
    mobile: false,
    // 12. syncType - Sync type (FULL_SYNC = 1)
    syncType: 1,
  });

  // Grup metadata cache'i güncelle (README'ye göre best practice)
  instance.sock.ev.on('groups.update', async ([event]) => {
    try {
      const metadata = await instance.sock.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    } catch (error) {
      logger.error({ error, groupId: event.id }, "Grup metadata cache'lenemedi");
    }
  });

  // Grup metadata cache'i güncelle (README'ye göre best practice)
  instance.sock.ev.on('group-participants.update', async (event) => {
    try {
      // event bir array olabilir veya direkt obje olabilir
      const update = Array.isArray(event) ? event[0] : event;
      if (update && update.id) {
        const metadata = await instance.sock.groupMetadata(update.id);
        groupCache.set(update.id, metadata);
        
        // WebSocket'e bildir
        const wsBroadcastFn = getWebSocketBroadcast();
        if (wsBroadcastFn) {
          wsBroadcastFn({
            type: "group-participants.update",
            sessionId: instance.id,
            groupId: update.id,
            participants: update.participants || [],
            action: update.action || null,
          });
        }
      }
    } catch (error) {
      const update = Array.isArray(event) ? event[0] : event;
      logger.error({ error, groupId: update?.id }, "Grup metadata cache'lenemedi");
    }
  });

  bindSocketEvents(instance);
};

