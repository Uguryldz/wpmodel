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
 */
export const createPoll = async (accountId, jid, question, options) => {
  if (!jid || !question || !options || options.length < 2) {
    throw new Error("Anket oluşturmak için jid, question ve en az 2 seçenek gereklidir.");
  }

  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  await sock.sendMessage(normalizedJid, {
    poll: {
      name: question,
      values: options,
    },
  });

  return { status: "sent", jid: normalizedJid, question, options };
};



