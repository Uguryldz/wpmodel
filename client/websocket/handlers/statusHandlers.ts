// Status update event handlers (status.update)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleStatusUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    action,
    statusContent,
  } = data;

  console.log('[WebSocket] 📸 Status güncellemesi alındı:', {
    sessionId,
    action,
    hasStatusContent: !!statusContent,
  });

  // Status update'leri logla (şimdilik sadece log, ileride UI'a eklenebilir)
  if (action === 'sent') {
    console.log('[WebSocket] ✅ Status gönderildi');
    // TODO: UI'da status listesini güncelle veya yeni status'u göster
  }
  
  // TODO: Status içeriği varsa UI'da göster
  if (statusContent) {
    console.log('[WebSocket] Status içeriği:', statusContent);
  }
};

