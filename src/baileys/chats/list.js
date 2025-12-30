// Chat listing functions
import { getAccountId, getOrCreateInstance, formatChat, instances } from "../shared.js";
import { prisma, logger } from "../../shared.js";
import { serializePrisma } from "../../utils.js";

/**
 * Chat listesi
 */
export const listChats = async (accountId, cursor, limit = 25) => {
  const sessionId = getAccountId(accountId);
  
  try {
    const instance = getOrCreateInstance(accountId);
    
    if (instance.connectionState.status !== "open") {
      // Bağlantı açık değilse veritabanından çek (fallback)
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

        // Database'den chat'ler çekildiğinde, contact bilgilerini de çek
        const nonGroupChats = serialized.filter(c => !c.id.includes('@g.us'));
        if (nonGroupChats.length > 0) {
          const contactIds = nonGroupChats.map(c => c.id);
          const contacts = await prisma.contact.findMany({
            where: {
              sessionId,
              id: { in: contactIds },
            },
          });
          
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
          data: serialized.map((c) => formatChat(c, sessionId)),
          cursor: nextCursor,
        };
      } catch (dbError) {
        logger.error({ error: dbError, sessionId }, "Veritabanından chat listesi alınamadı");
        return { data: [], cursor: null };
      }
    }

    // Bağlantı açıksa memory store'dan çek
    const allChats = Array.from(instance.chatsStore.values())
      .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));

    // Cursor ile sayfalama
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = allChats.findIndex(c => {
        // Cursor'ü chat ID veya timestamp ile eşleştir
        return c.id === cursor || c.conversationTimestamp === Number(cursor);
      });
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginatedChats = allChats.slice(startIndex, startIndex + Number(limit));
    const nextCursor = 
      allChats.length > startIndex + Number(limit)
        ? (paginatedChats[paginatedChats.length - 1]?.id || paginatedChats[paginatedChats.length - 1]?.conversationTimestamp || null)
        : null;

    return {
      data: paginatedChats.map((chat) => formatChat(chat, sessionId)),
      cursor: nextCursor,
    };
  } catch (error) {
    logger.error({ error, sessionId }, "Chat listesi alınamadı");
    return { data: [], cursor: null };
  }
};





