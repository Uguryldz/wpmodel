// Contact listing functions
import { getAccountId, getOrCreateInstance, formatContactName, instances, contactsCache, CONTACT_CACHE_TTL_MS, ensureSocket } from "../shared.js";
import { isJidBroadcast } from "baileys";
import { prisma, logger, getPhoneMapIdFromSessionId } from "../../shared.js";
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
  // ÖNEMLİ: Instance'ın doğru sessionId'ye ait olduğundan emin ol
  if (instance && instance.id === sessionId) {
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
          const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
          if (!phoneMapId) {
            logger.warn({ sessionId }, "listContacts: phoneMapId bulunamadı");
            return { data: formatted, cursor: null };
          }
          
          // Sadece bu phoneMapId'ye ait contact'ları çek
          const dbContacts = await prisma.contact.findMany({
            where: { phoneMapId: phoneMapId },
            orderBy: { pkId: "desc" },
          });

          const dbFormatted = dbContacts.map((c) => {
            const serialized = serializePrisma(c);
            // Database'den gelen contact'ın sessionId'sini kontrol et
            if (serialized.sessionId && serialized.sessionId !== sessionId) {
              logger.warn({ 
                contactId: serialized.id, 
                contactSessionId: serialized.sessionId, 
                expectedSessionId: sessionId 
              }, "Contact farklı sessionId'ye ait, atlanıyor");
              return null;
            }
            return {
              id: serialized.id,
              name: serialized.name || null,
              notify: serialized.notify || null,
              verifiedName: serialized.verifiedName || null,
              imgUrl: serialized.imgUrl || null,
              status: serialized.status || null,
            };
          }).filter(Boolean); // null değerleri filtrele

          // Memory store ve database'den gelen contact'ları birleştir
          // ÖNEMLİ: Sadece bu sessionId'ye ait contact'ları birleştir
          const contactMap = new Map();
          
          formatted.forEach((c) => {
            contactMap.set(c.id, c);
          });
          
          dbFormatted.forEach((c) => {
            if (c && !contactMap.has(c.id)) {
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
    const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
    if (!phoneMapId) {
      logger.warn({ sessionId }, "listContacts (fallback): phoneMapId bulunamadı");
      return { data: [], cursor: null };
    }
    
    const takeLimit = limit && limit < 100000 ? Number(limit) : undefined;
    const contacts = await prisma.contact.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: takeLimit,
      skip: cursor ? 1 : 0,
      where: { phoneMapId: phoneMapId },
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

/**
 * Cihazdaki kayıtlı kişi listesini ad soyad ile çek
 * Baileys API'nin fetchContacts metodunu kullanarak WhatsApp cihazındaki tüm contact'ları çeker
 */
export const fetchDeviceContacts = async (accountId) => {
  try {
    const sessionId = getAccountId(accountId);
    const sock = ensureSocket(accountId);
    
    // Baileys API'nin fetchContacts metodunu kullan
    if (typeof sock.fetchContacts !== "function") {
      logger.error({ sessionId }, "fetchContacts metodu mevcut değil");
      return { data: [], error: "fetchContacts metodu mevcut değil" };
    }

    const deviceContacts = await sock.fetchContacts();
    
    // Baileys'te fetchContacts Map, Array veya Object dönebilir
    let contactsArray = [];
    if (Array.isArray(deviceContacts)) {
      contactsArray = deviceContacts;
    } else if (deviceContacts instanceof Map) {
      contactsArray = Array.from(deviceContacts.values());
    } else if (deviceContacts && typeof deviceContacts === "object") {
      contactsArray = Object.values(deviceContacts);
    }

    logger.info({ sessionId, count: contactsArray.length }, "Cihazdan contact'lar çekildi");

    // Contact'ları formatla - cihaz rehberindeki ad soyad bilgilerini önceliklendir
    // Baileys'te fetchContacts() telefon rehberindeki kişileri çeker
    // name: Telefon rehberindeki isim (cihaz rehberi)
    // notify: WhatsApp'ta kayıtlı isim
    const formatted = contactsArray
      .filter((c) => c && c.id && !c.id.endsWith("@g.us") && !isJidBroadcast(c.id))
      .map((c) => {
        // Cihaz rehberindeki ismi önceliklendir (name alanı)
        const deviceName = c.name || null; // Cihaz rehberindeki isim
        const whatsappName = c.notify || null; // WhatsApp'ta kayıtlı isim
        
        return {
          id: c.id || null,
          name: deviceName || whatsappName || null, // Cihaz rehberindeki isim öncelikli
          notify: whatsappName || null, // WhatsApp'ta kayıtlı isim
          verifiedName: c.verifiedName || null, // Doğrulanmış isim
          imgUrl: c.imgUrl || null,
          status: c.status || null,
          // Cihaz rehberindeki ismin varlığını kontrol etmek için
          hasDeviceName: !!deviceName,
        };
      })
      .sort((a, b) => {
        // Cihaz rehberindeki isme göre sırala (name öncelikli)
        const nameA = a.name || a.notify || a.verifiedName || a.id || "";
        const nameB = b.name || b.notify || b.verifiedName || b.id || "";
        return nameA.localeCompare(nameB, "tr", { sensitivity: "base" });
      });

    return { data: formatted };
  } catch (error) {
    const sessionId = getAccountId(accountId);
    logger.error({ error, sessionId }, "Cihazdan contact'lar çekilemedi");
    return { data: [], error: error.message || "Cihazdan contact'lar çekilemedi" };
  }
};



