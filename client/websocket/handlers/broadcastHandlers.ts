// Broadcast query event handlers (broadcast.query)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleBroadcastQuery = (event: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    broadcastId,
    data: broadcastData,
  } = event;

  console.log('[WebSocket] 📢 Broadcast list sorgusu sonucu alındı:', {
    sessionId,
    broadcastId,
    name: broadcastData?.name,
    recipientsCount: broadcastData?.recipients?.length || 0,
  });

  // Broadcast list bilgilerini logla (şimdilik sadece log, ileride UI'a eklenebilir)
  if (broadcastData) {
    console.log('[WebSocket] ✅ Broadcast list bilgileri:', {
      name: broadcastData.name,
      recipients: broadcastData.recipients,
    });
    // TODO: UI'da broadcast list bilgilerini göster
  }
};

