// Mesaj metnini çıkar (desteklenen tüm mesaj tipleri için)
export const extractMessageText = (msg: any): string => {
  if (!msg) return '';

  // Bazı adapter'lar direkt text döndürebilir
  if (typeof msg === 'string') return msg;
  if (msg.text) return msg.text;
  if (msg.body) return msg.body;

  // Message objesi içinde farklı tipler olabilir
  if (msg.message) {
    const message = msg.message;
    
    // Conversation (normal metin mesajı)
    if (message.conversation) return message.conversation;
    
    // ExtendedTextMessage (uzun metin mesajı)
    if (message.extendedTextMessage) {
      return message.extendedTextMessage.text || '';
    }
    
    // ImageMessage
    if (message.imageMessage) {
      return message.imageMessage.caption || '[Resim]';
    }
    
    // VideoMessage
    if (message.videoMessage) {
      return message.videoMessage.caption || '[Video]';
    }
    
    // AudioMessage
    if (message.audioMessage) {
      return '[Ses]';
    }
    
    // DocumentMessage
    if (message.documentMessage) {
      return message.documentMessage.caption || '[Belge]';
    }
    
    // StickerMessage
    if (message.stickerMessage) {
      return '[Sticker]';
    }
    
    // LocationMessage
    if (message.locationMessage) {
      return '[Konum]';
    }
    
    // ContactMessage
    if (message.contactMessage) {
      return '[Kişi]';
    }
    
    // Diğer tipler için ilk key'i dene
    const keys = Object.keys(message);
    if (keys.length > 0) {
      const firstKey = keys[0];
      const firstValue = message[firstKey];
      if (typeof firstValue === 'string') {
        return firstValue;
      }
      if (firstValue && typeof firstValue === 'object' && firstValue.text) {
        return firstValue.text;
      }
    }
  }

  return '';
};
