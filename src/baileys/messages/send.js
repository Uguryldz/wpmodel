// Message sending functions
import { Readable } from "stream";
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
 * README'ye göre Stream veya URL kullanılması öneriliyor (memory optimization)
 * - media: base64 string, URL string, veya Stream
 * - mimetype: medya tipi
 * - caption: opsiyonel başlık
 * - viewOnce: true ise view once mesajı gönder (README'ye göre)
 * - gifPlayback: true ise gif olarak gönder (README'ye göre - video olarak gönderilir)
 * - ptv: true ise video note olarak gönder (README'ye göre)
 * - ptt: true ise push to talk (sesli mesaj) olarak gönder (README'ye göre)
 */
export const sendMediaMessage = async ({ accountId, to, media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt }) => {
  if (!media || !mimetype) {
    throw new Error("Medya göndermek için media (base64/URL) ve mimetype alanları zorunludur.");
  }

  const jid = normalizeJid(to);
  const sock = ensureSocket(accountId);
  
  // Eğer media bir URL ise direkt kullan (README'ye göre best practice - memory optimization)
  if (typeof media === "string" && (media.startsWith("http://") || media.startsWith("https://"))) {
    const content = buildMediaContent({ url: media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    await sock.sendMessage(jid, content);
  } 
  // Eğer media bir Stream ise direkt kullan
  else if (media instanceof Readable) {
    const content = buildMediaContent({ stream: media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    await sock.sendMessage(jid, content);
  }
  // Base64 string ise Stream'e çevir (memory optimization için)
  else if (typeof media === "string") {
    const buffer = Buffer.from(media, "base64");
    // Buffer'ı Stream'e çevir (README'ye göre Stream kullanımı öneriliyor)
    const stream = Readable.from(buffer);
    const content = buildMediaContent({ stream, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    await sock.sendMessage(jid, content);
  }
  // Buffer ise Stream'e çevir
  else if (Buffer.isBuffer(media)) {
    const stream = Readable.from(media);
    const content = buildMediaContent({ stream, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    await sock.sendMessage(jid, content);
  }
  else {
    throw new Error("Media tipi desteklenmiyor. Base64 string, URL, Stream veya Buffer bekleniyor.");
  }

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



