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
      // Backend'den gelen contact objesi: { id, name, notify, verifiedName, displayName, imgUrl, status }
      // Tüm alanları kaydet (name, notify, verifiedName önemli!)
      contactsMap.set(contact.id, {
        id: contact.id,
        name: contact.name || null, // Ham name alanı (cihaz rehberindeki isim)
        notify: contact.notify || null, // WhatsApp'ta kayıtlı isim
        verifiedName: contact.verifiedName || null, // Doğrulanmış isim
        displayName: contact.displayName || contact.name || contact.notify || contact.verifiedName || null, // Formatlanmış isim (fallback ile)
        imgUrl: contact.imgUrl || null,
        status: contact.status || null,
      });
      
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
    console.log('[WebSocket] Contact cache güncellendi:', contactsMap.size, 'contact');
    
    // Debug: İlk birkaç contact'ın isimlerini kontrol et
    if (rawContacts.length > 0) {
      const sampleContacts = rawContacts.slice(0, 3);
      console.log('[WebSocket] Contact örnekleri:', sampleContacts.map((c: any) => ({
        id: c.id,
        name: c.name,
        notify: c.notify,
        verifiedName: c.verifiedName
      })));
    }
  }
};

export const handleContactsUpsert = (data: WebSocketEvent, context: WebSocketContext) => {
  // contacts.upsert aynı mantıkla çalışıyor
  handleContactsSet(data, context);
};

