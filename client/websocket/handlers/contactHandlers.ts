// Contact event handlers (contacts.set, contacts.upsert)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleContactsSet = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    contacts: rawContacts,
  } = data;

  const {
    activeAccountRef,
    selectedChatRef,
    contactsCacheRef,
    setChatProfilePictures,
    setSelectedChat,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  const currentSelectedChat = selectedChatRef.current;
  
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] Kişi listesi güncelleniyor...', rawContacts?.length || 0);
  
  const contactsMap = new Map<string, any>();
  if (rawContacts && Array.isArray(rawContacts)) {
    rawContacts.forEach((contact: any) => {
      contactsMap.set(contact.id, contact);
      
      if (contact.imgUrl) {
        setChatProfilePictures(prev => new Map(prev).set(contact.id, contact.imgUrl));
        
        if (currentSelectedChat && currentSelectedChat.id === contact.id) {
          setSelectedChat(prev => prev ? { ...prev, profilePicture: contact.imgUrl } : null);
        }
      }
    });
    
    contactsCacheRef.current.set(sessionId, {
      data: contactsMap,
      timestamp: Date.now()
    });
    console.log('[WebSocket] Contact cache güncellendi:', contactsMap.size);
  }
};

export const handleContactsUpsert = (data: WebSocketEvent, context: WebSocketContext) => {
  // contacts.upsert aynı mantıkla çalışıyor
  handleContactsSet(data, context);
};

