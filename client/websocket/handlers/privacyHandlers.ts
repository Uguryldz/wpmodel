// Privacy update event handlers (privacy.update)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handlePrivacyUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    settingType,
    value,
    ephemeral,
    settings,
  } = data;

  console.log('[WebSocket] 🔒 Gizlilik ayarı güncellemesi alındı:', {
    sessionId,
    settingType,
    value,
    ephemeral,
    settings,
  });

  // Privacy update'leri logla (şimdilik sadece log, ileride UI'a eklenebilir)
  if (settings) {
    // Genel settings objesi geldiyse
    console.log('[WebSocket] ✅ Gizlilik ayarları güncellendi:', settings);
    // TODO: UI'da gizlilik ayarlarını güncelle
  } else if (settingType) {
    // Spesifik bir setting güncellendiyse
    switch (settingType) {
      case 'lastSeen':
        console.log('[WebSocket] ✅ LastSeen gizlilik ayarı güncellendi:', value);
        break;
      case 'online':
        console.log('[WebSocket] ✅ Online gizlilik ayarı güncellendi:', value);
        break;
      case 'profilePicture':
        console.log('[WebSocket] ✅ Profile Picture gizlilik ayarı güncellendi:', value);
        break;
      case 'status':
        console.log('[WebSocket] ✅ Status gizlilik ayarı güncellendi:', value);
        break;
      case 'readReceipts':
        console.log('[WebSocket] ✅ Read Receipts gizlilik ayarı güncellendi:', value);
        break;
      case 'groupsAdd':
        console.log('[WebSocket] ✅ Groups Add gizlilik ayarı güncellendi:', value);
        break;
      case 'defaultDisappearingMode':
        console.log('[WebSocket] ✅ Default Disappearing Mode gizlilik ayarı güncellendi:', ephemeral);
        break;
      default:
        console.warn('[WebSocket] ⚠️ Bilinmeyen gizlilik ayarı tipi:', settingType);
    }
    // TODO: UI'da ilgili gizlilik ayarını güncelle
  }
};

