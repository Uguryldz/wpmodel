export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  return result;
}

