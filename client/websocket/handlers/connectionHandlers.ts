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
    setAccounts,
  } = context;

  console.log('[WebSocket] 🔌 Bağlantı güncellemesi alındı:', {
    sessionId,
    connection,
    hasQr: !!qr,
    statusCode,
    shouldReconnect,
    error,
  });

  // UI'da account status'unu güncelle
  if (setAccounts) {
    setAccounts((prevAccounts: any[]) => {
      const accountIndex = prevAccounts.findIndex((acc: any) => acc.id === sessionId);
      if (accountIndex >= 0) {
        const updatedAccounts = [...prevAccounts];
        let newStatus = connection || prevAccounts[accountIndex].status;
        
        // Connection durumunu status'a çevir
        if (connection === 'open') {
          newStatus = 'open';
        } else if (connection === 'close') {
          newStatus = 'close';
        } else if (connection === 'connecting') {
          newStatus = 'connecting';
        }
        
        updatedAccounts[accountIndex] = {
          ...updatedAccounts[accountIndex],
          status: newStatus,
        };
        return updatedAccounts;
      }
      return prevAccounts;
    });
  }
  
  if (qr) {
    console.log('[WebSocket] 📱 QR kod alındı, uzunluk:', qr.length);
  }
  
  if (connection === 'open') {
    console.log('[WebSocket] ✅ Bağlantı açıldı:', sessionId);
  } else if (connection === 'close') {
    console.warn('[WebSocket] ⚠️ Bağlantı kapandı:', sessionId, {
      statusCode,
      shouldReconnect,
      error,
    });
  } else if (connection === 'connecting') {
    console.log('[WebSocket] 🔄 Bağlanılıyor...', sessionId);
  }
};

