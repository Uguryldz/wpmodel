// Advanced message utility functions
import { 
  getDecryptionJid,
  getHistoryMsg,
  getCallStatusFromNode,
  getAggregateResponsesInEventMessage,
  getAggregateVotesInPollMessage,
  updateMessageWithReaction,
  updateMessageWithReceipt,
  updateMessageWithPollUpdate,
  updateMessageWithEventResponse,
  shouldIncrementChatUnread,
  processHistoryMessage,
  processSyncAction,
  prepareDisappearingMessageSettingContent,
  encodeNewsletterMessage,
} from "baileys";
import { logger } from "../../shared.js";
import { getAccountId, getOrCreateInstance } from "../shared.js";

/**
 * Decryption JID al
 */
export const getDecryptionJidUtil = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const jid = getDecryptionJid(message);
    return { status: "success", data: jid };
  } catch (error) {
    logger.error({ error }, "Decryption JID alınamadı");
    throw new Error(`Decryption JID alınamadı: ${error.message}`);
  }
};

/**
 * History mesaj al
 */
export const getHistoryMessageUtil = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const historyMsg = getHistoryMsg(message);
    return { status: "success", data: historyMsg };
  } catch (error) {
    logger.error({ error }, "History mesaj alınamadı");
    throw new Error(`History mesaj alınamadı: ${error.message}`);
  }
};

/**
 * Call status al
 */
export const getCallStatusUtil = (node) => {
  if (!node) {
    throw new Error("node gereklidir");
  }

  try {
    const status = getCallStatusFromNode(node);
    return { status: "success", data: status };
  } catch (error) {
    logger.error({ error }, "Call status alınamadı");
    throw new Error(`Call status alınamadı: ${error.message}`);
  }
};

/**
 * Aggregate responses al
 */
export const getAggregateResponsesUtil = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const responses = getAggregateResponsesInEventMessage(message);
    return { status: "success", data: responses };
  } catch (error) {
    logger.error({ error }, "Aggregate responses alınamadı");
    throw new Error(`Aggregate responses alınamadı: ${error.message}`);
  }
};

/**
 * Aggregate votes al
 */
export const getAggregateVotesUtil = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const votes = getAggregateVotesInPollMessage(message);
    return { status: "success", data: votes };
  } catch (error) {
    logger.error({ error }, "Aggregate votes alınamadı");
    throw new Error(`Aggregate votes alınamadı: ${error.message}`);
  }
};

/**
 * Mesajı reaksiyon ile güncelle
 */
export const updateMessageWithReactionUtil = (message, reaction) => {
  if (!message || !reaction) {
    throw new Error("message ve reaction gereklidir");
  }

  try {
    const updated = updateMessageWithReaction(message, reaction);
    return { status: "success", data: updated };
  } catch (error) {
    logger.error({ error }, "Mesaj reaksiyon ile güncellenemedi");
    throw new Error(`Mesaj reaksiyon ile güncellenemedi: ${error.message}`);
  }
};

/**
 * Mesajı receipt ile güncelle
 */
export const updateMessageWithReceiptUtil = (message, receipt) => {
  if (!message || !receipt) {
    throw new Error("message ve receipt gereklidir");
  }

  try {
    const updated = updateMessageWithReceipt(message, receipt);
    return { status: "success", data: updated };
  } catch (error) {
    logger.error({ error }, "Mesaj receipt ile güncellenemedi");
    throw new Error(`Mesaj receipt ile güncellenemedi: ${error.message}`);
  }
};

/**
 * Mesajı poll update ile güncelle
 */
export const updateMessageWithPollUpdateUtil = (message, pollUpdate) => {
  if (!message || !pollUpdate) {
    throw new Error("message ve pollUpdate gereklidir");
  }

  try {
    const updated = updateMessageWithPollUpdate(message, pollUpdate);
    return { status: "success", data: updated };
  } catch (error) {
    logger.error({ error }, "Mesaj poll update ile güncellenemedi");
    throw new Error(`Mesaj poll update ile güncellenemedi: ${error.message}`);
  }
};

/**
 * Mesajı event response ile güncelle
 */
export const updateMessageWithEventResponseUtil = (message, eventResponse) => {
  if (!message || !eventResponse) {
    throw new Error("message ve eventResponse gereklidir");
  }

  try {
    const updated = updateMessageWithEventResponse(message, eventResponse);
    return { status: "success", data: updated };
  } catch (error) {
    logger.error({ error }, "Mesaj event response ile güncellenemedi");
    throw new Error(`Mesaj event response ile güncellenemedi: ${error.message}`);
  }
};

/**
 * Chat unread artırılmalı mı kontrolü
 */
export const checkShouldIncrementChatUnread = (message) => {
  if (!message) {
    return false;
  }

  try {
    return shouldIncrementChatUnread(message);
  } catch (error) {
    logger.error({ error }, "Chat unread kontrolü yapılamadı");
    return false;
  }
};

/**
 * History mesaj işle
 */
export const processHistoryMessageUtil = (message, meId) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const sessionId = meId ? meId.split("@")[0] : null;
    const instance = sessionId ? getOrCreateInstance(sessionId) : null;
    const actualMeId = meId || (instance?.whatsappJid);
    
    const processed = processHistoryMessage(message, actualMeId);
    return { status: "success", data: processed };
  } catch (error) {
    logger.error({ error }, "History mesaj işlenemedi");
    throw new Error(`History mesaj işlenemedi: ${error.message}`);
  }
};

/**
 * Sync action işle
 */
export const processSyncActionUtil = (action, meId) => {
  if (!action) {
    throw new Error("action gereklidir");
  }

  try {
    const sessionId = meId ? meId.split("@")[0] : null;
    const instance = sessionId ? getOrCreateInstance(sessionId) : null;
    const actualMeId = meId || (instance?.whatsappJid);
    
    const processed = processSyncAction(action, actualMeId);
    return { status: "success", data: processed };
  } catch (error) {
    logger.error({ error }, "Sync action işlenemedi");
    throw new Error(`Sync action işlenemedi: ${error.message}`);
  }
};

/**
 * Disappearing message setting content hazırla
 */
export const prepareDisappearingMessageSettingContentUtil = (duration) => {
  if (duration === undefined) {
    throw new Error("duration gereklidir");
  }

  try {
    const content = prepareDisappearingMessageSettingContent(duration);
    return { status: "success", data: content };
  } catch (error) {
    logger.error({ error }, "Disappearing message setting content hazırlanamadı");
    throw new Error(`Disappearing message setting content hazırlanamadı: ${error.message}`);
  }
};

/**
 * Newsletter mesaj encode et
 */
export const encodeNewsletterMessageUtil = (message) => {
  if (!message) {
    throw new Error("message gereklidir");
  }

  try {
    const encoded = encodeNewsletterMessage(message);
    return { status: "success", data: encoded };
  } catch (error) {
    logger.error({ error }, "Newsletter mesaj encode edilemedi");
    throw new Error(`Newsletter mesaj encode edilemedi: ${error.message}`);
  }
};




