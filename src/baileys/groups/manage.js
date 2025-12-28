// Group management functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { prisma, logger } from "../../shared.js";
import { getAccountId } from "../shared.js";

/**
 * Grup katılımcılarını güncelle (ekle, çıkar, yönetici yap)
 */
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

/**
 * Grup ayarlarını güncelle (restrict, announce)
 */
export const updateGroupSettings = async (
  accountId,
  groupJid,
  settings
) => {
  if (!groupJid || !settings) {
    throw new Error("Grup ayarları için grup ve settings objesi gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  const updates = {};
  if (settings.restrict !== undefined) {
    updates.restrict = settings.restrict;
  }
  if (settings.announce !== undefined) {
    updates.announce = settings.announce;
  }

  await sock.groupSettingUpdate(normalizedGroup, updates);

  // Veritabanını güncelle
  try {
    await prisma.groupMetadata.updateMany({
      where: {
        sessionId: getAccountId(accountId),
        id: normalizedGroup,
      },
      data: {
        restrict: settings.restrict !== undefined ? settings.restrict : undefined,
        announce: settings.announce !== undefined ? settings.announce : undefined,
      },
    });
  } catch (error) {
    logger.error({ error, accountId, groupJid: normalizedGroup }, "Grup ayarları veritabanında güncellenemedi");
  }

  return { status: "updated", groupJid: normalizedGroup, settings: updates };
};

/**
 * Grup açıklamasını güncelle
 */
export const updateGroupDescription = async (accountId, groupJid, description) => {
  if (!groupJid || !description) {
    throw new Error("Grup açıklaması için grup ve description gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  await sock.groupUpdateDescription(normalizedGroup, description);

  // Veritabanını güncelle
  try {
    await prisma.groupMetadata.updateMany({
      where: {
        sessionId: getAccountId(accountId),
        id: normalizedGroup,
      },
      data: {
        desc: description,
      },
    });
  } catch (error) {
    logger.error({ error, accountId, groupJid: normalizedGroup }, "Grup açıklaması veritabanında güncellenemedi");
  }

  return { status: "updated", groupJid: normalizedGroup, description };
};

/**
 * Grup adını güncelle
 */
export const updateGroupSubject = async (accountId, groupJid, subject) => {
  if (!groupJid || !subject) {
    throw new Error("Grup adı için grup ve subject gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  await sock.groupUpdateSubject(normalizedGroup, subject);

  // Veritabanını güncelle
  try {
    await prisma.groupMetadata.updateMany({
      where: {
        sessionId: getAccountId(accountId),
        id: normalizedGroup,
      },
      data: {
        subject: subject,
      },
    });
  } catch (error) {
    logger.error({ error, accountId, groupJid: normalizedGroup }, "Grup adı veritabanında güncellenemedi");
  }

  return { status: "updated", groupJid: normalizedGroup, subject };
};

/**
 * Grup fotoğrafını güncelle
 */
export const updateGroupPicture = async (accountId, groupJid, imageBuffer) => {
  if (!groupJid || !imageBuffer) {
    throw new Error("Grup fotoğrafı için grup ve imageBuffer gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  const buffer = Buffer.isBuffer(imageBuffer) 
    ? imageBuffer 
    : Buffer.from(imageBuffer, "base64");

  await sock.updateProfilePicture(normalizedGroup, buffer);

  return { status: "updated", groupJid: normalizedGroup };
};

/**
 * Gruptan ayrıl
 */
export const groupLeave = async (accountId, groupJid) => {
  if (!groupJid) {
    throw new Error("Grup JID'i gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  await sock.groupLeave(normalizedGroup);

  return { status: "left", groupJid: normalizedGroup };
};

/**
 * Grup güncelle (genel)
 */
export const groupUpdate = async (accountId, groupJid, updates) => {
  if (!groupJid || !updates) {
    throw new Error("Grup güncellemesi için grup ve updates objesi gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  await sock.groupUpdate(normalizedGroup, updates);

  return { status: "updated", groupJid: normalizedGroup, updates };
};





