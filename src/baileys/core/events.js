// Socket event bindings and socket creation
import makeWASocket, { Browsers } from "baileys";
import { DisconnectReason, isJidBroadcast, jidNormalizedUser } from "baileys";
import Boom from "@hapi/boom";
import NodeCache from "node-cache";
import { prisma, logger } from "../../shared.js";
import { serializePrisma } from "../../utils.js";
import { findSessionByWhatsAppJid, migrateSessionData } from "../../sessionMapper.js";
import {
  getWebSocketBroadcast,
  instances,
  contactsCache,
  formatChat,
  formatMessage,
  formatContactName,
  saveMessages,
  saveMessagesToPrisma,
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
        `[${instance.id}] QR kodu üretildi (frontend'e gönderiliyor)`
      );
      // QR kod terminale yazdırılmıyor, sadece frontend'e gönderiliyor
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
      }
    } catch (error) {
      const update = Array.isArray(event) ? event[0] : event;
      logger.error({ error, groupId: update?.id }, "Grup metadata cache'lenemedi");
    }
  });

  bindSocketEvents(instance);
};

