// Group listing functions
import { getAccountId, getOrCreateInstance, ensureSocket, normalizeJid } from "../shared.js";
import { prisma, logger } from "../../shared.js";

/**
 * Grup listesi
 */
export const listGroups = async (accountId, cursor, limit = 50) => {
  const sessionId = getAccountId(accountId);

  try {
    console.log(`[listGroups] WhatsApp cihazından grup listesi çekiliyor (sessionId: ${sessionId})...`);
    
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
    logger.error({ error, sessionId }, "Grup listesi alınamadı");
    return { data: [], cursor: null };
  }
};

/**
 * Belirli bir grubun metadata'sını getir
 */
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
      const { serializePrisma } = await import("../../utils.js");
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







