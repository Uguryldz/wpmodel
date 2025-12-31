// Chat synchronization functions
import { getAccountId, getOrCreateInstance, formatChat, getWebSocketBroadcast } from "../shared.js";
import { prisma, logger, getPhoneMapIdFromSessionId } from "../../shared.js";

/**
 * Cihazdaki tüm chat'leri eşitle (sync)
 */
export const syncChats = async (accountId) => {
  const sessionId = getAccountId(accountId);
  const instance = getOrCreateInstance(accountId);

  // Bağlantı kontrolü
  if (instance.connectionState.status !== "open") {
    throw new Error(`WhatsApp bağlantısı açık değil. Mevcut durum: ${instance.connectionState.status}`);
  }

  console.log(`[syncChats] Cihazdaki tüm chat'ler eşitleniyor (sessionId: ${sessionId})...`);
  
  const initialChatCount = instance.chatsStore.size;
  console.log(`[syncChats] Başlangıç: ${initialChatCount} chat memory store'da`);
  
  return new Promise((resolve, reject) => {
    let lastChatCount = initialChatCount;
    let stableCount = 0;
    
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
        if (stableCount >= 5) {
          clearInterval(checkInterval);
          instance.syncChatsInterval = null;
          
          const totalChats = instance.chatsStore.size;
          console.log(`[syncChats] ✅ Toplam ${totalChats} chat eşitlendi (başlangıç: ${initialChatCount}, yeni: ${totalChats - initialChatCount})`);
          
          const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
          if (!phoneMapId) {
            logger.warn({ sessionId }, "syncChats: phoneMapId bulunamadı");
            resolve({ status: "error", error: "phoneMapId bulunamadı" });
            return;
          }
          
          let savedCount = 0;
          for (const chat of instance.chatsStore.values()) {
            try {
              await prisma.chat.upsert({
                where: {
                  phoneMapId_id: {
                    phoneMapId: phoneMapId,
                    id: chat.id,
                  },
                },
                create: {
                  phoneMapId: phoneMapId,
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
          
          const wsBroadcastFn = getWebSocketBroadcast();
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
        stableCount = 0;
        lastChatCount = currentChatCount;
        console.log(`[syncChats] Chat sayısı güncellendi: ${currentChatCount} (yeni chat'ler geliyor...)`);
      }
    }, 2000);
    instance.syncChatsInterval = checkInterval;
    
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
    }, 60000);
    instance.syncChatsTimeout = timeoutTimer;
  });
};







