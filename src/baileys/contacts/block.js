// Contact blocking functions
import { ensureSocket, normalizeJid } from "../shared.js";

/**
 * Kişiyi engelle/engeli kaldır
 */
export const blockContact = async (accountId, jid, block = true) => {
  if (!jid) {
    throw new Error("Kişi engellemek için jid zorunludur.");
  }

  const normalized = normalizeJid(jid);
  return ensureSocket(accountId).updateBlockStatus(
    normalized,
    block ? "block" : "unblock"
  );
};

/**
 * Engellenen numaraları listele
 */
export const listBlockedNumbers = async (accountId) => {
  const sock = ensureSocket(accountId);
  if (typeof sock.fetchBlocklist !== "function") {
    return [];
  }

  const list = await sock.fetchBlocklist();
  return list || [];
};





