// Group utility functions
import { isJidGroup } from "baileys";

/**
 * Grup kontrolü
 */
export const checkIsGroup = (jid) => {
  if (!jid) {
    throw new Error("JID gereklidir");
  }
  return isJidGroup(jid);
};





