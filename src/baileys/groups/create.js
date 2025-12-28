// Group creation functions
import { ensureSocket, normalizeJid } from "../shared.js";

/**
 * Grup oluştur
 */
export const createGroup = async (accountId, subject, participants = []) => {
  if (!subject) {
    throw new Error("Grup oluşturmak için subject zorunludur.");
  }

  const normalized = participants.map(normalizeJid);
  return ensureSocket(accountId).groupCreate(subject, normalized);
};





