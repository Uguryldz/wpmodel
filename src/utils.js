export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// BigInt serialization için replacer fonksiyonu
export function bigIntReplacer(key, value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

// BigInt'leri handle eden JSON stringify wrapper
export function safeStringify(obj, space = null) {
  return JSON.stringify(obj, bigIntReplacer, space);
}

// Prisma'dan gelen JSON string'leri parse et
export function serializePrisma(obj) {
  if (!obj) return obj;
  
  const result = { ...obj };
  const jsonFields = [
    "disappearingMode",
    "messages",
    "participant",
    "wallpaper",
    "finalLiveLocation",
    "keepInChat",
    "key",
    "labels",
    "mediaData",
    "message",
    "messageStubParameters",
    "paymentInfo",
    "photoChange",
    "pollAdditionalMetadata",
    "pollUpdates",
    "quotedPaymentInfo",
    "quotedStickerData",
    "reactions",
    "statusPsa",
    "userReceipt",
    "participants",
  ];

  for (const field of jsonFields) {
    if (result[field] && typeof result[field] === "string") {
      try {
        result[field] = JSON.parse(result[field]);
      } catch (e) {
        // Parse edilemezse string olarak bırak
      }
    }
  }

  // BigInt alanlarını number'a çevir
  const bigIntFields = ["createdAt", "updatedAt", "messageTimestamp", "conversationTimestamp", "lastMsgTimestamp"];
  for (const field of bigIntFields) {
    if (result[field] && typeof result[field] === "bigint") {
      result[field] = Number(result[field]);
    }
  }

  return result;
}

