// Group event handlers (groups.update, group-participants.update)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleGroupsUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    groups: rawGroups,
  } = data;

  const {
    activeAccountRef,
    setChats,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] 👥 Grup güncellemeleri alındı:', rawGroups?.length || 0);

  if (!rawGroups || !Array.isArray(rawGroups) || rawGroups.length === 0) return;

  // Grup chat'lerini güncelle
  setChats(prevChats => {
    let hasChanges = false;
    const updatedChats = [...prevChats];

    for (const group of rawGroups) {
      if (!group.id || !group.id.includes('@g.us')) continue;

      const index = updatedChats.findIndex(c => c.id === group.id);
      
      if (index >= 0) {
        // Mevcut grup chat'ini güncelle
        updatedChats[index] = {
          ...updatedChats[index],
          name: group.subject || updatedChats[index].name,
          verifiedName: group.subject || updatedChats[index].verifiedName,
        };
        hasChanges = true;
      }
    }

    return hasChanges ? updatedChats : prevChats;
  });
};

export const handleGroupParticipantsUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    groupId,
    participants,
    action,
  } = data;

  const {
    activeAccountRef,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] 👥 Grup katılımcı güncellemesi alındı:', {
    groupId,
    action,
    participantsCount: participants?.length || 0,
  });

  // Grup katılımcı güncellemeleri şu an için sadece log'lanıyor
  // İleride grup detay sayfasında kullanılabilir
};

