// Message sending functions
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { buildMediaContent } from "../utils/media.js";

/**
 * Text mesaj gönder
 */
export const sendTextMessage = async ({ accountId, to, message, options }) => {
  if (!to || !message) {
    throw new Error("Mesaj göndermek için to ve message alanları zorunludur.");
  }

  const jid = normalizeJid(to);
  await ensureSocket(accountId).sendMessage(jid, { text: message }, options);

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

/**
 * Medya mesaj gönder
 */
export const sendMediaMessage = async ({ accountId, to, media, mimetype, caption }) => {
  if (!media || !mimetype) {
    throw new Error("Medya göndermek için media (base64) ve mimetype alanları zorunludur.");
  }

  const jid = normalizeJid(to);
  const buffer = Buffer.from(media, "base64");
  const content = buildMediaContent({ buffer, mimetype, caption });
  await ensureSocket(accountId).sendMessage(jid, content);

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

/**
 * Raw mesaj gönder
 */
export const sendRawMessage = async (accountId, jid, message, options) => {
  if (!jid || !message) {
    throw new Error("Mesaj göndermek için jid ve message alanları zorunludur.");
  }

  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(jid);
  await sock.sendMessage(normalized, message, options);

  return { accountId: getAccountId(accountId), jid: normalized, status: "queued" };
};

/**
 * Toplu mesaj gönder
 */
export const sendBulkMessages = async (accountId, items = []) => {
  const results = [];
  for (const item of items) {
    const { jid, message, options, type } = item || {};
    if (!jid || !message) continue;

    if (type === "text") {
      results.push(await sendTextMessage({ accountId, to: jid, message, options }));
    } else {
      results.push(await sendRawMessage(accountId, jid, message, options));
    }
  }

  return results;
};



