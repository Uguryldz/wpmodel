// Mesaj durumu yardımcı fonksiyonları

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

/**
 * Mesaj durumunu belirler
 * @param message Mesaj objesi
 * @returns Mesaj durumu
 */
export const getMessageStatus = (message: any): MessageStatus => {
  // Optimistic mesaj (henüz gönderilmemiş)
  if (message.id?.startsWith('temp-') || message.status === 'sending') {
    return 'sending';
  }
  
  // Hata durumu
  if (message.error || message.status === 'error') {
    return 'error';
  }
  
  // Backend'den gelen durum bilgisi
  if (message.status) {
    return message.status as MessageStatus;
  }
  
  // Mesaj okundu mu? (çift tik - mavi)
  if (message.readReceipt || message.readTimestamp) {
    return 'read';
  }
  
  // Mesaj teslim edildi mi? (çift tik - gri)
  if (message.deliveredReceipt || message.deliveredTimestamp) {
    return 'delivered';
  }
  
  // Mesaj gönderildi (tek tik)
  if (message.fromMe) {
    return 'sent';
  }
  
  // Varsayılan: gönderiliyor
  return 'sending';
};

/**
 * Mesaj durumu ikonunu döndürür
 * @param status Mesaj durumu
 * @returns İkon component'i için props
 */
export const getMessageStatusIcon = (status: MessageStatus) => {
  switch (status) {
    case 'sending':
      return { icon: '⏳', color: 'text-gray-400' };
    case 'sent':
      return { icon: '✓', color: 'text-gray-500' };
    case 'delivered':
      return { icon: '✓✓', color: 'text-gray-500' };
    case 'read':
      return { icon: '✓✓', color: 'text-blue-500' };
    case 'error':
      return { icon: '⚠', color: 'text-red-500' };
    default:
      return { icon: '⏳', color: 'text-gray-400' };
  }
};
