// JID utility functions
import { 
  jidDecode, 
  jidEncode, 
  isJidNewsletter, 
  isJidStatusBroadcast, 
  isJidBot,
  getChatId,
  areJidsSameUser,
  isJidMetaAI,
  isLidUser,
  isPnUser,
  isHostedLidUser,
  isHostedPnUser,
  isWABusinessPlatform,
} from "baileys";

/**
 * JID decode
 */
export const decodeJid = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return jidDecode(jid);
};

/**
 * JID encode
 */
export const encodeJid = (user, server, device) => {
  if (!user || !server) {
    throw new Error("user ve server gereklidir");
  }
  return jidEncode(user, server, device);
};

/**
 * Newsletter kontrolü
 */
export const checkIsNewsletter = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isJidNewsletter(jid);
};

/**
 * Status broadcast kontrolü
 */
export const checkIsStatusBroadcast = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isJidStatusBroadcast(jid);
};

/**
 * Bot kontrolü
 */
export const checkIsBot = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isJidBot(jid);
};

/**
 * Chat ID çıkar
 */
export const extractChatId = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return getChatId(jid);
};

/**
 * Aynı kullanıcı kontrolü
 */
export const checkAreJidsSameUser = (jid1, jid2) => {
  if (!jid1 || !jid2) {
    throw new Error("Her iki JID de gereklidir");
  }
  return areJidsSameUser(jid1, jid2);
};

/**
 * Meta AI kontrolü
 */
export const checkIsMetaAI = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isJidMetaAI(jid);
};

/**
 * LID user kontrolü
 */
export const checkIsLidUser = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isLidUser(jid);
};

/**
 * Pn user kontrolü
 */
export const checkIsPnUser = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isPnUser(jid);
};

/**
 * Hosted LID user kontrolü
 */
export const checkIsHostedLidUser = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isHostedLidUser(jid);
};

/**
 * Hosted Pn user kontrolü
 */
export const checkIsHostedPnUser = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isHostedPnUser(jid);
};

/**
 * WA Business Platform kontrolü
 */
export const checkIsWABusinessPlatform = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isWABusinessPlatform(jid);
};




