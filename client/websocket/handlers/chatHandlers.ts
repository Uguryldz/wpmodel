// Chat event handlers (chats.set, chats.upsert, chats.update)
import { Chat } from '../../types';
import { standardizeChatId, extractPhoneFromJid, normalizePhoneNumber, normalizeJid } from '../../utils/contactUtils';
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleChatsSet = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    chats: rawChats,
  } = data;

  const {
    activeAccountRef,
    contactsCacheRef,
    chatsLoadedRef,
    chatsInitialLoadRef,
    chatProfilePictures,
    chats,
    setChats,
    setChatProfilePictures,
    loadChats,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] chats.set: Tüm sohbetler set ediliyor...', rawChats?.length || 0);

  if (!rawChats || !Array.isArray(rawChats)) return;
  
  // Debug: Backend'den gelen ilk birkaç chat'in contactName ve notify alanlarını kontrol et
  if (rawChats.length > 0) {
    const sampleChats = rawChats.slice(0, 3).filter((c: any) => !c.id?.includes('@g.us'));
    console.log('[WebSocket] Backend\'den gelen chat örnekleri (contactName/notify):', sampleChats.map((c: any) => ({
      id: c.id,
      name: c.name,
      contactName: c.contactName,
      notify: c.notify,
      verifiedName: c.verifiedName
    })));
  }

  // @lid formatındaki chat'ler için gerçek JID'yi lidJid'den al
  const normalizedChats = rawChats.map((chat: any) => {
    let chatId = chat.id;
    
    if (chat.id && chat.id.includes('@lid') && chat.lidJid) {
      chatId = chat.lidJid;
      console.log(`[WebSocket] @lid formatı düzeltildi: ${chat.id} -> ${chatId}`);
    }
    
    return {
      ...chat,
      id: standardizeChatId(chatId),
    };
  });

  // Profil resimlerini cache'e ekle
  normalizedChats.forEach((chat: any) => {
    if (chat.imgUrl) {
      setChatProfilePictures(prev => new Map(prev).set(chat.id, chat.imgUrl));
    }
  });

  const cached = contactsCacheRef.current.get(sessionId);
  let contactsMap = cached ? cached.data : new Map<string, any>();

  // Contact'lar WebSocket'ten contacts.set event'i ile gelecek
  // Eğer contact'lar yüklenmemişse, contacts.set event'ini bekliyoruz
  if (contactsMap.size === 0) {
    console.log('[WebSocket] ⏳ Contact\'lar henüz yüklenmemiş, contacts.set event\'i bekleniyor...');
    // contacts.set event'i geldiğinde contact cache dolacak
  }

  try {
    const formattedChats = normalizedChats.map((chat: any) => {
      const contact = contactsMap.get(chat.id);
      const existingChat = chats.find(c => c.id === chat.id);
    
      let displayName = chat.name || chat.displayName || chat.id;
      let verifiedName = chat.verifiedName;
      
      // Backend'den gelen contactName ve notify alanlarını öncelikli kullan
      let contactName = chat.contactName || null;
      let notify = chat.notify || null;
      
      // Eğer backend'den gelmemişse, contactsMap'ten al
      if (!chat.id.includes('@g.us')) {
        if (contact) {
          // Backend'den gelen veri yoksa contactsMap'ten al
          if (!contactName) contactName = contact.name || null;
          if (!notify) notify = contact.notify || null;
          if (!verifiedName) verifiedName = contact.verifiedName || chat.verifiedName;
          
          // Display name'i belirle: contactName varsa contactName, yoksa notify, o da yoksa telefon numarası
          displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || chat.id;
        } else {
          // Contact yoksa, backend'den gelen contactName veya notify'ı kullan
          if (chat.contactName) {
            displayName = chat.contactName;
          } else if (chat.notify) {
            displayName = chat.notify;
          } else {
            // Hiçbiri yoksa telefon numarasını göster
            const phoneMatch = chat.id.match(/^(\d+)@/);
            if (phoneMatch) {
              displayName = phoneMatch[1];
            }
          }
        }
      }
      
      return {
        id: chat.id,
        name: displayName,
        verifiedName: verifiedName,
        contactName: contactName,
        notify: notify,
        profilePicture: chat.imgUrl || chatProfilePictures.get(chat.id) || existingChat?.profilePicture,
        unreadCount: chat.unreadCount ?? existingChat?.unreadCount ?? 0,
        conversationTimestamp: chat.conversationTimestamp || existingChat?.conversationTimestamp || 0,
        archived: chat.archived ?? existingChat?.archived ?? false,
        pinned: chat.pinned ? new Date(chat.pinned) : existingChat?.pinned || null,
        lastMessage: existingChat?.lastMessage || '',
        time: chat.conversationTimestamp 
          ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
          : existingChat?.time || '',
      };
    });
    
    setChats(formattedChats);
    chatsLoadedRef.current.set(sessionId, true);
    chatsInitialLoadRef.current.set(sessionId, true);
    console.log('[WebSocket] ✅ Sohbet listesi direkt güncellendi:', formattedChats.length);
  } catch (error) {
    console.error('[WebSocket] ❌ setChats hatası:', error);
  }
};

export const handleChatsUpsert = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    chats: rawChats,
  } = data;

  const {
    activeAccountRef,
    contactsCacheRef,
    chatsLoadedRef,
    chatsInitialLoadRef,
    setChats,
    setChatProfilePictures,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  if (sessionId !== currentActiveAccount?.id) return;

  const hasInitialLoad = chatsInitialLoadRef.current.get(sessionId);
  const isLoaded = chatsLoadedRef.current.get(sessionId);

  if (!hasInitialLoad || !isLoaded) {
    console.log('[WebSocket] chats.upsert: İlk yükleme yapılmamış, chats.set bekleniyor...');
    return;
  }

  console.log('[WebSocket] chats.upsert: Chat listesi güncelleniyor...', rawChats?.length || 0);

  if (!rawChats || !Array.isArray(rawChats)) return;

  const normalizedChats = rawChats.map((chat: any) => {
    let chatId = chat.id;
    if (chat.id && chat.id.includes('@lid') && chat.lidJid) {
      chatId = chat.lidJid;
    }
    return {
      ...chat,
      id: standardizeChatId(chatId),
    };
  });

  normalizedChats.forEach((chat: any) => {
    if (chat.imgUrl) {
      setChatProfilePictures(prev => new Map(prev).set(chat.id, chat.imgUrl));
    }
  });

  try {
    setChats(prevChats => {
      let hasChanges = false;
      const updatedChats = [...prevChats];

      normalizedChats.forEach((chat: any) => {
        const normalizedChatId = standardizeChatId(chat.id);
        const index = updatedChats.findIndex(c => {
          const cNormalized = standardizeChatId(c.id);
          return cNormalized === normalizedChatId || c.id === normalizedChatId;
        });
        
        if (index >= 0) {
          const oldChat = updatedChats[index];
          const newUnreadCount = chat.unreadCount ?? oldChat.unreadCount;
          const newTimestamp = chat.conversationTimestamp || oldChat.conversationTimestamp;
          
          // Backend'den gelen contactName ve notify alanlarını da kontrol et
          const newContactName = chat.contactName !== undefined ? chat.contactName : oldChat.contactName;
          const newNotify = chat.notify !== undefined ? chat.notify : oldChat.notify;
          const newVerifiedName = chat.verifiedName !== undefined ? chat.verifiedName : oldChat.verifiedName;
          
          // Display name'i güncelle: contactName varsa contactName, yoksa notify, o da yoksa eski name
          let newDisplayName = oldChat.name;
          if (newContactName) {
            newDisplayName = newContactName;
          } else if (newNotify) {
            newDisplayName = newNotify;
          } else if (chat.name) {
            newDisplayName = chat.name;
          }
          
          if (newUnreadCount !== oldChat.unreadCount || newTimestamp !== oldChat.conversationTimestamp || 
              newContactName !== oldChat.contactName || newNotify !== oldChat.notify || 
              newDisplayName !== oldChat.name) {
            updatedChats[index] = {
              ...oldChat,
              id: normalizedChatId,
              unreadCount: newUnreadCount,
              conversationTimestamp: newTimestamp,
              name: newDisplayName,
              verifiedName: newVerifiedName,
              contactName: newContactName,
              notify: newNotify,
              profilePicture: chat.imgUrl || oldChat.profilePicture,
              archived: chat.archived ?? oldChat.archived,
            };
            hasChanges = true;
          }
        } else {
          const cached = contactsCacheRef.current.get(sessionId);
          const contactsMap = cached ? cached.data : new Map<string, any>();
          const contact = contactsMap.get(normalizedChatId);
          
          // Backend'den gelen contactName ve notify alanlarını öncelikli kullan
          let contactName = chat.contactName || null;
          let notify = chat.notify || null;
          let verifiedName = chat.verifiedName;
          let displayName = chat.name || chat.displayName || normalizedChatId;
          
          // Eğer backend'den gelmemişse, contactsMap'ten al
          if (!normalizedChatId.includes('@g.us')) {
            if (contact) {
              // Backend'den gelen veri yoksa contactsMap'ten al
              if (!contactName) contactName = contact.name || null;
              if (!notify) notify = contact.notify || null;
              if (!verifiedName) verifiedName = contact.verifiedName || chat.verifiedName;
              
              // Display name'i belirle: contactName varsa contactName, yoksa notify, o da yoksa telefon numarası
              displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || normalizedChatId;
            } else {
              // Contact yoksa, backend'den gelen contactName veya notify'ı kullan
              if (chat.contactName) {
                displayName = chat.contactName;
              } else if (chat.notify) {
                displayName = chat.notify;
              } else {
                // Hiçbiri yoksa telefon numarasını göster
                const phoneMatch = normalizedChatId.match(/^(\d+)@/);
                if (phoneMatch) {
                  displayName = phoneMatch[1];
                }
              }
            }
          }
          
          updatedChats.push({
            id: normalizedChatId,
            name: displayName,
            verifiedName: verifiedName,
            contactName: contactName,
            notify: notify,
            profilePicture: chat.imgUrl,
            unreadCount: chat.unreadCount || 0,
            conversationTimestamp: chat.conversationTimestamp || 0,
            archived: chat.archived || false,
            pinned: chat.pinned ? new Date(chat.pinned) : null,
            lastMessage: '',
            time: chat.conversationTimestamp 
              ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
              : '',
          });
          hasChanges = true;
        }
      });
      
      return hasChanges ? updatedChats : prevChats;
    });
  } catch (error) {
    console.error('[WebSocket] ❌ chats.upsert hatası:', error);
  }
};

export const handleChatsUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    chat,
  } = data;

  const {
    activeAccountRef,
    setChats,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  if (sessionId !== currentActiveAccount?.id || !chat) return;

  console.log('[WebSocket] Tek sohbet güncelleniyor...', chat.id);
  
  setChats(prevChats => {
    const index = prevChats.findIndex(c => c.id === chat.id);
    if (index >= 0) {
      const updatedChats = [...prevChats];
      updatedChats[index] = {
        ...updatedChats[index],
        unreadCount: chat.unreadCount ?? updatedChats[index].unreadCount,
        conversationTimestamp: chat.conversationTimestamp || updatedChats[index].conversationTimestamp,
        lastMessage: chat.lastMessage || updatedChats[index].lastMessage,
      };
      return updatedChats;
    }
    return prevChats;
  });
};

