// ============================================
// Media Cache Utility
// ============================================

// Global medya cache: mesaj ID -> blob URL
const mediaUrlCache = new Map<string, string>();

/**
 * Cache'den medya URL'i al
 */
export const getCachedMediaUrl = (messageId: string): string | null => {
  return mediaUrlCache.get(messageId) || null;
};

/**
 * Medya URL'ini cache'e kaydet
 */
export const setCachedMediaUrl = (messageId: string, blobUrl: string) => {
  // Eğer bu mesaj için zaten cache'de bir URL varsa, eski blob URL'ini temizle
  const existingUrl = mediaUrlCache.get(messageId);
  if (existingUrl && existingUrl.startsWith('blob:') && existingUrl !== blobUrl) {
    URL.revokeObjectURL(existingUrl);
  }
  mediaUrlCache.set(messageId, blobUrl);
};

/**
 * Cache temizleme: belirli bir mesaj ID'si için
 */
export const clearMediaCache = (messageId: string) => {
  const cachedUrl = mediaUrlCache.get(messageId);
  if (cachedUrl && cachedUrl.startsWith('blob:')) {
    URL.revokeObjectURL(cachedUrl);
  }
  mediaUrlCache.delete(messageId);
};

/**
 * Tüm cache'i temizle (uygulama kapanırken veya session değiştiğinde)
 */
export const clearAllMediaCache = () => {
  for (const [messageId, blobUrl] of mediaUrlCache.entries()) {
    if (blobUrl && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
  }
  mediaUrlCache.clear();
};

/**
 * Mesaj ID'sini oluştur (mesaj objesinden)
 */
export const getMessageId = (message: any): string => {
  return message.id || message.key?.id || `${message.timestamp || Date.now()}-${Math.random()}`;
};
