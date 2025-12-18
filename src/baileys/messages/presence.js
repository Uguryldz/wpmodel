// Typing and presence functions
import { ensureSocket, normalizeJid } from "../shared.js";

/**
 * Yazıyor göstergesi gönder
 */
export const sendTyping = async (accountId, jid, duration = 5000) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendPresenceUpdate("composing", normalizedJid);

  // Belirtilen süre sonra otomatik olarak durdur
  if (duration > 0) {
    setTimeout(async () => {
      try {
        await sock.sendPresenceUpdate("available", normalizedJid);
      } catch (error) {
        // ignore
      }
    }, duration);
  }

  return { status: "typing", jid: normalizedJid };
};

/**
 * Yazmayı durdur
 */
export const stopTyping = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendPresenceUpdate("available", normalizedJid);

  return { status: "stopped_typing", jid: normalizedJid };
};

/**
 * Durum güncelle (available, unavailable, composing, recording)
 */
export const updatePresence = async (accountId, jid, presence) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  const validPresences = ["available", "unavailable", "composing", "recording"];
  if (!validPresences.includes(presence)) {
    throw new Error(`Geçersiz presence değeri: ${presence}. Geçerli değerler: ${validPresences.join(", ")}`);
  }

  await sock.sendPresenceUpdate(presence, normalizedJid);

  return { status: "presence_updated", jid: normalizedJid, presence };
};

/**
 * Birinin presence'ını dinle (Fetch Someone's Presence) - README'ye göre
 * The presence update is fetched and called in presence.update event
 */
export const subscribeToPresence = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  // README'ye göre: presenceSubscribe kullanılır
  await sock.presenceSubscribe(normalizedJid);

  return { 
    status: "subscribed", 
    jid: normalizedJid,
    message: "Presence güncellemeleri presence.update event'inde gelecek"
  };
};



