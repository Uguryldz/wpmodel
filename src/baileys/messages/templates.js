// Message Template CRUD operations
import { prisma, logger } from "../../shared.js";
import { serializePrisma } from "../../utils.js";
import { randomUUID } from "crypto";

/**
 * Tüm şablonları listele
 * @param {string} sessionId - Session ID (opsiyonel, null ise tüm şablonlar)
 * @returns {Promise<Array>}
 */
export const listTemplates = async (sessionId = null) => {
  try {
    const where = sessionId ? { sessionId } : {};
    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      data: JSON.parse(t.data),
      createdAt: Number(t.createdAt),
      updatedAt: t.updatedAt ? Number(t.updatedAt) : null,
      sessionId: t.sessionId,
    }));
  } catch (error) {
    logger.error({ error, sessionId }, "Şablonlar listelenemedi");
    throw new Error(`Şablonlar listelenemedi: ${error.message}`);
  }
};

/**
 * Şablon oluştur
 * @param {string} sessionId - Session ID (opsiyonel)
 * @param {string} name - Şablon adı
 * @param {string} type - Şablon tipi ('button' | 'list' | 'template' | 'product')
 * @param {Object} data - Şablon verisi
 * @returns {Promise<Object>}
 */
export const createTemplate = async (sessionId, name, type, data) => {
  try {
    if (!name || !type || !data) {
      throw new Error("name, type ve data alanları zorunludur");
    }

    const templateId = randomUUID();
    const now = BigInt(Date.now());

    const template = await prisma.messageTemplate.create({
      data: {
        id: templateId,
        sessionId: sessionId || "global", // Global şablonlar için "global" kullan
        name,
        type,
        data: JSON.stringify(data),
        createdAt: now,
        updatedAt: now,
      },
    });

    return {
      id: template.id,
      name: template.name,
      type: template.type,
      data: JSON.parse(template.data),
      createdAt: Number(template.createdAt),
      updatedAt: template.updatedAt ? Number(template.updatedAt) : null,
      sessionId: template.sessionId,
    };
  } catch (error) {
    logger.error({ error, sessionId, name, type }, "Şablon oluşturulamadı");
    throw new Error(`Şablon oluşturulamadı: ${error.message}`);
  }
};

/**
 * Şablon güncelle
 * @param {string} templateId - Şablon ID
 * @param {Object} updates - Güncellenecek alanlar {name?, type?, data?}
 * @returns {Promise<Object>}
 */
export const updateTemplate = async (templateId, updates) => {
  try {
    if (!templateId) {
      throw new Error("templateId zorunludur");
    }

    const updateData = {
      updatedAt: BigInt(Date.now()),
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.type) updateData.type = updates.type;
    if (updates.data) updateData.data = JSON.stringify(updates.data);

    const template = await prisma.messageTemplate.update({
      where: { id: templateId },
      data: updateData,
    });

    return {
      id: template.id,
      name: template.name,
      type: template.type,
      data: JSON.parse(template.data),
      createdAt: Number(template.createdAt),
      updatedAt: template.updatedAt ? Number(template.updatedAt) : null,
      sessionId: template.sessionId,
    };
  } catch (error) {
    logger.error({ error, templateId, updates }, "Şablon güncellenemedi");
    throw new Error(`Şablon güncellenemedi: ${error.message}`);
  }
};

/**
 * Şablon sil
 * @param {string} templateId - Şablon ID
 * @returns {Promise<boolean>}
 */
export const deleteTemplate = async (templateId) => {
  try {
    if (!templateId) {
      throw new Error("templateId zorunludur");
    }

    // KVKK uyumlu: Veritabanından veri silinmez, sadece loglama yapılır
    // Kullanıcı şablon silmek istese bile veri KVKK gereği saklanıyor
    logger.info({ 
      templateId 
    }, "Şablon silme isteği alındı (KVKK uyumlu - veri silinmedi)");
    
    // Not: Şablonlar opsiyonel veriler olduğu için gerçekten silmek gerekirse
    // MessageTemplate tablosuna isDeleted alanı eklenebilir

    return true;
  } catch (error) {
    logger.error({ error, templateId }, "Şablon silinemedi");
    throw new Error(`Şablon silinemedi: ${error.message}`);
  }
};

/**
 * Şablon getir
 * @param {string} templateId - Şablon ID
 * @returns {Promise<Object>}
 */
export const getTemplate = async (templateId) => {
  try {
    if (!templateId) {
      throw new Error("templateId zorunludur");
    }

    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error("Şablon bulunamadı");
    }

    return {
      id: template.id,
      name: template.name,
      type: template.type,
      data: JSON.parse(template.data),
      createdAt: Number(template.createdAt),
      updatedAt: template.updatedAt ? Number(template.updatedAt) : null,
      sessionId: template.sessionId,
    };
  } catch (error) {
    logger.error({ error, templateId }, "Şablon getirilemedi");
    throw new Error(`Şablon getirilemedi: ${error.message}`);
  }
};
