// Contact listing functions
import { getAccountId, getOrCreateInstance, formatContactName, instances, contactsCache, CONTACT_CACHE_TTL_MS } from "../shared.js";
import { isJidBroadcast } from "baileys";
import { prisma, logger } from "../../shared.js";
import { serializePrisma } from "../../utils.js";

/**
 * Contact listesi
 */
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

    const source = memoryContacts;

    if (source.length > 0) {
      const formatted = source
        .sort((a, b) => (a.name || a.notify || a.id).localeCompare(b.name || b.notify || b.id))
        .slice(0, limit === undefined || limit === null ? source.length : limit)
        .map((c) => ({
          id: c.id,
          name: c.name || null,
          notify: c.notify || null,
          verifiedName: c.verifiedName || null,
          imgUrl: c.imgUrl || null,
          status: c.status || null,
        }));
      
      // Eğer cursor yoksa (ilk sayfa), database'den de veri çekip birleştir
      if (!cursor) {
        try {
          const dbContacts = await prisma.contact.findMany({
            where: { sessionId },
            orderBy: { pkId: "desc" },
          });

          const dbFormatted = dbContacts.map((c) => {
            const serialized = serializePrisma(c);
            return {
              id: serialized.id,
              name: serialized.name || null,
              notify: serialized.notify || null,
              verifiedName: serialized.verifiedName || null,
              imgUrl: serialized.imgUrl || null,
              status: serialized.status || null,
            };
          });

          // Memory store ve database'den gelen contact'ları birleştir
          const contactMap = new Map();
          
          formatted.forEach((c) => {
            contactMap.set(c.id, c);
          });
          
          dbFormatted.forEach((c) => {
            if (!contactMap.has(c.id)) {
              contactMap.set(c.id, c);
            }
          });

          const merged = Array.from(contactMap.values())
            .sort((a, b) => (a.name || a.notify || a.id).localeCompare(b.name || b.notify || b.id));
          
          const takeLimit = limit && limit < 100000 ? Number(limit) : undefined;
          const finalData = takeLimit ? merged.slice(0, takeLimit) : merged;
          
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
          const payload = { data: formatted, cursor: null };
          if (!cursor && formatted.length > 0) {
            contactsCache.set(sessionId, { ts: Date.now(), payload });
          }
          return payload;
        }
      }
    }
  }

  // Database fallback (oturum kapalı olsa da)
  try {
    const takeLimit = limit && limit < 100000 ? Number(limit) : undefined;
    const contacts = await prisma.contact.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: takeLimit,
      skip: cursor ? 1 : 0,
      where: { sessionId },
      orderBy: { pkId: "desc" },
    });

    const serialized = contacts.map((c) => serializePrisma(c));
    const nextCursor =
      takeLimit && serialized.length !== 0 && serialized.length === Number(limit)
        ? serialized[serialized.length - 1].pkId
        : null;

    const payload = {
      data: serialized.map((c) => ({
        id: c.id,
        name: c.name || null,
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



