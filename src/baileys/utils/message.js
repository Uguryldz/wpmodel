// Message utility functions
import { 
  extractUrlFromText,
  cleanMessage,
  normalizeMessageContent,
  extractMessageContent,
  getContentType,
  isRealMessage,
} from "baileys";
import { logger } from "../../shared.js";
import { getAccountId, getOrCreateInstance } from "../shared.js";

/**
 * URL'yi metinden çıkar
 */
export const extractUrlFromTextUtil = (text) => {
  if (!text || typeof text !== "string") {
    return null;
  }
  return extractUrlFromText(text);
};

/**
 * Mesajı temizle
 */
export const cleanMessageUtil = (accountId, message, meId, meLid) => {
  if (!message) {
    throw new Error("message gereklidir");
  }
  const sessionId = getAccountId(accountId);
  const instance = getOrCreateInstance(accountId);
  const actualMeId = meId || instance.whatsappJid;
  return cleanMessage(message, actualMeId, meLid);
};

/**
 * Mesaj içeriğini normalize et
 */
export const normalizeMessageContentUtil = (content) => {
  if (!content) {
    throw new Error("content gereklidir");
  }
  return normalizeMessageContent(content);
};

/**
 * Mesaj içeriğini çıkar
 */
export const extractMessageContentUtil = (content) => {
  if (!content) {
    throw new Error("content gereklidir");
  }
  return extractMessageContent(content);
};

/**
 * Mesaj içerik tipini al
 */
export const getMessageContentType = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }
  return getContentType(message);
};

/**
 * Gerçek mesaj kontrolü
 */
export const checkIsRealMessage = (message) => {
  if (!message) {
    return false;
  }
  return isRealMessage(message);
};





