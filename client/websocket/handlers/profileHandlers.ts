// Profile update event handlers (profile.update)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleProfileUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    updateType,
    status,
    name,
    jid,
  } = data;

  console.log('[WebSocket] 👤 Profil güncellemesi alındı:', {
    sessionId,
    updateType,
    status,
    name,
    jid,
  });

  // Profile update'leri logla (şimdilik sadece log, ileride UI'a eklenebilir)
  switch (updateType) {
    case 'status':
      console.log('[WebSocket] ✅ Profil durumu güncellendi:', status);
      // TODO: UI'da profil durumunu güncelle
      break;
    case 'name':
      console.log('[WebSocket] ✅ Profil adı güncellendi:', name);
      // TODO: UI'da profil adını güncelle
      break;
    case 'picture':
      console.log('[WebSocket] ✅ Profil resmi güncellendi:', jid);
      // Profil resmi değiştiyse cache'i temizle
      if (jid && context.setChatProfilePictures) {
        context.chatProfilePictures.delete(jid);
        context.setChatProfilePictures(new Map(context.chatProfilePictures));
        // Profil resmini yeniden yükle
        if (context.queueProfilePicture) {
          context.queueProfilePicture(sessionId, jid);
        }
      }
      break;
    case 'picture_removed':
      console.log('[WebSocket] ✅ Profil resmi kaldırıldı:', jid);
      // Profil resmi kaldırıldıysa cache'den sil
      if (jid && context.setChatProfilePictures) {
        context.chatProfilePictures.delete(jid);
        context.setChatProfilePictures(new Map(context.chatProfilePictures));
      }
      break;
    default:
      console.warn('[WebSocket] ⚠️ Bilinmeyen profil güncelleme tipi:', updateType);
  }
};

