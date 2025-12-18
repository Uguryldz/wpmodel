// Special message types (location, contact, poll)
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";

/**
 * Konum gönder
 */
export const sendLocation = async (accountId, jid, latitude, longitude, name) => {
  if (!jid || latitude === undefined || longitude === undefined) {
    throw new Error("Konum göndermek için jid, latitude ve longitude gereklidir.");
  }

  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendMessage(normalizedJid, {
    location: {
      degreesLatitude: latitude,
      degreesLongitude: longitude,
      name: name || "Konum",
    },
  });

  return { status: "sent", jid: normalizedJid, location: { latitude, longitude, name } };
};

/**
 * Kişi kartı gönder (contact card)
 */
export const sendContactCard = async (accountId, jid, contact) => {
  if (!jid || !contact) {
    throw new Error("Kişi kartı göndermek için jid ve contact gereklidir.");
  }

  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);
  const contactJid = normalizeJid(contact.jid || contact.id);

  await sock.sendMessage(normalizedJid, {
    contacts: {
      displayName: contact.name || contact.displayName || "",
      contacts: [
        {
          displayName: contact.name || contact.displayName || "",
          vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.name || contact.displayName || ""}\nTEL;type=CELL:${contactJid.split("@")[0]}\nEND:VCARD`,
        },
      ],
    },
  });

  return { status: "sent", jid: normalizedJid };
};

/**
 * Anket oluştur (poll)
 * README'ye göre: selectableCount ve toAnnouncementGroup parametreleri destekleniyor
 */
export const createPoll = async (accountId, jid, question, options, selectableCount = 1, toAnnouncementGroup = false) => {
  if (!jid || !question || !options || options.length < 2) {
    throw new Error("Anket oluşturmak için jid, question ve en az 2 seçenek gereklidir.");
  }

  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendMessage(normalizedJid, {
    poll: {
      name: question,
      values: options,
      selectableCount: selectableCount || 1,
      toAnnouncementGroup: toAnnouncementGroup || false,
    },
  });

  return { status: "sent", jid: normalizedJid, question, options, selectableCount, toAnnouncementGroup };
};

/**
 * Mesaj pin/unpin (Pin Message)
 * README'ye göre: Time can be 24h (86400), 7d (604800), 30d (2592000)
 * type: 1 to pin, 0 to remove
 */
export const pinMessage = async (accountId, jid, messageKey, type = 1, time = 86400) => {
  if (!jid || !messageKey) {
    throw new Error("Mesaj pin'lemek için jid ve messageKey gereklidir.");
  }

  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendMessage(normalizedJid, {
    pin: {
      type: type, // 1 to pin, 0 to remove
      time: time, // seconds (86400 = 24h, 604800 = 7d, 2592000 = 30d)
      key: messageKey,
    },
  });

  return { status: type === 1 ? "pinned" : "unpinned", jid: normalizedJid };
};

/**
 * Mention User ile mesaj gönder
 * README'ye göre: @number is to mention in text, it's optional
 */
export const sendMessageWithMention = async (accountId, jid, text, mentions) => {
  if (!jid || !text) {
    throw new Error("Mention ile mesaj göndermek için jid ve text gereklidir.");
  }

  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  // Mentions array'i normalize et
  const normalizedMentions = (mentions || []).map(mention => {
    if (typeof mention === "string") {
      return mention.includes("@") ? mention : `${mention}@s.whatsapp.net`;
    }
    return mention;
  });

  await sock.sendMessage(normalizedJid, {
    text: text,
    mentions: normalizedMentions,
  });

  return { status: "sent", jid: normalizedJid, mentions: normalizedMentions };
};



