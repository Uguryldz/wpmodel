// Presence event handlers (presence.update)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handlePresenceUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    presences: rawPresences,
  } = data;

  const {
    activeAccountRef,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] 👤 Presence güncellemeleri alındı:', rawPresences?.length || 0);
  
  // Presence bilgileri frontend'de şu an için sadece log'lanıyor
  // İleride UI'da "yazıyor..." göstergesi veya online durumu için kullanılabilir
  if (rawPresences && Array.isArray(rawPresences)) {
    for (const presence of rawPresences) {
      if (presence.isComposing) {
        console.log(`[WebSocket] ${presence.participant || presence.jid} yazıyor...`);
      }
      if (presence.isAvailable) {
        console.log(`[WebSocket] ${presence.participant || presence.jid} çevrimiçi`);
      }
      if (presence.lastSeen) {
        console.log(`[WebSocket] ${presence.participant || presence.jid} son görülme: ${new Date(presence.lastSeen * 1000).toLocaleString()}`);
      }
    }
  }
};

