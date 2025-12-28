// Connection event handlers (connection.update)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleConnectionUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    connection,
    qr,
    statusCode,
    shouldReconnect,
    error,
  } = data;

  const {
    activeAccountRef,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] 🔌 Bağlantı güncellemesi alındı:', {
    connection,
    hasQr: !!qr,
    statusCode,
    shouldReconnect,
    error,
  });

  // Bağlantı durumu güncellemeleri şu an için sadece log'lanıyor
  // İleride UI'da bağlantı durumu göstergesi için kullanılabilir
  // Örneğin: "Bağlanıyor...", "Bağlandı ✅", "Bağlantı kesildi ⚠️"
  
  if (qr) {
    console.log('[WebSocket] 📱 QR kod alındı, uzunluk:', qr.length);
  }
  
  if (connection === 'open') {
    console.log('[WebSocket] ✅ Bağlantı açıldı');
  } else if (connection === 'close') {
    console.warn('[WebSocket] ⚠️ Bağlantı kapandı:', {
      statusCode,
      shouldReconnect,
      error,
    });
  } else if (connection === 'connecting') {
    console.log('[WebSocket] 🔄 Bağlanılıyor...');
  }
};

