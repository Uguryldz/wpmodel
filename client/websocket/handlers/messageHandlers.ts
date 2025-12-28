// Message event handlers (messages.upsert, messages.set, messages.update)
import { Message, Chat } from '../../types';
import { extractMessageText } from '../../utils/messageUtils';
import { extractPhoneFromJid, normalizeJid, normalizePhoneNumber } from '../../utils/contactUtils';
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleMessagesUpsert = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    messages: rawMessages,
    eventType,
  } = data;

  const {
    activeAccountRef,
    selectedChatRef,
    contactsCacheRef,
    chatProfilePictures,
    setMessages,
    setChats,
    updateMessagesCache,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  const currentSelectedChat = selectedChatRef.current;
  
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] 📩 Yeni mesajlar alındı:', rawMessages?.length || 0, 'eventType:', eventType);
  
  if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
    console.warn('[WebSocket] ⚠️ messages.upsert event boş mesajlar içeriyor');
    return;
  }
  
  // Tüm mesajları chat bazında grupla
  const messagesByChat = new Map<string, any[]>();
  const phoneToChatIdMap = new Map<string, string>();
  
  for (const msg of rawMessages) {
    let chatId = msg.from || msg.key?.remoteJid;
    if (!chatId || chatId.includes('@broadcast')) continue;
    
    // Grup chat'leri için direkt kullan
    if (chatId.includes('@g.us')) {
      if (!messagesByChat.has(chatId)) {
        messagesByChat.set(chatId, []);
      }
      messagesByChat.get(chatId)!.push(msg);
      continue;
    }
    
    // Bireysel chat'ler için: Telefon numarasına göre normalize et
    const phoneNumber = extractPhoneFromJid(chatId);
    if (phoneNumber) {
      if (phoneToChatIdMap.has(phoneNumber)) {
        chatId = phoneToChatIdMap.get(phoneNumber)!;
      } else {
        const normalizedChatId = normalizeJid(chatId);
        phoneToChatIdMap.set(phoneNumber, normalizedChatId);
        chatId = normalizedChatId;
      }
    } else {
      chatId = normalizeJid(chatId);
    }
    
    if (!messagesByChat.has(chatId)) {
      messagesByChat.set(chatId, []);
    }
    messagesByChat.get(chatId)!.push(msg);
  }
  
  // Her chat için mesajları işle
  for (const [chatId, chatMessages] of messagesByChat.entries()) {
    const normalizedChatId = chatId.includes('@g.us') ? chatId : normalizeJid(chatId);
    const isSelectedChat = currentSelectedChat && (
      normalizedChatId === currentSelectedChat.id || 
      (!currentSelectedChat.id.includes('@g.us') && extractPhoneFromJid(normalizedChatId) === extractPhoneFromJid(currentSelectedChat.id))
    );
    
    if (isSelectedChat && chatMessages.length > 0) {
      console.log('[WebSocket] Seçili sohbetin mesajlarına yeni mesajlar ekleniyor...', normalizedChatId);
      
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => {
          const id = m.id || m.key?.id;
          return id && id.toString().startsWith('temp-') ? id : id;
        }));
        
        const newMessages: Message[] = [];
        for (const msg of chatMessages) {
          const text = msg.text || extractMessageText(msg);
          const body = msg.body || text;
          const msgId = msg.id || msg.key?.id || `${msg.timestamp || msg.messageTimestamp || Date.now()}-${Math.random()}`;
          const fromMe = msg.fromMe !== undefined 
            ? Boolean(msg.fromMe) 
            : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
          
          if (msgId && !existingIds.has(msgId)) {
            newMessages.push({
              ...msg,
              id: msgId,
              text: text || body,
              body: body || text,
              fromMe: fromMe,
              timestamp: msg.timestamp || msg.messageTimestamp || undefined,
            });
          }
        }
        
        if (newMessages.length === 0) return prev;
        
        // Temp mesajları kaldır - WebSocket'ten gerçek mesaj geldiğinde temp mesajları temizle
        let filteredPrev = prev;
        newMessages.forEach(newMsg => {
          if (newMsg.fromMe) {
            // Gönderdiğimiz mesajlar için: temp mesajları kaldır
            filteredPrev = filteredPrev.filter(m => {
              const mId = m.id || m.key?.id;
              if (!mId || !mId.toString().startsWith('temp-')) return true; // Temp değilse tut
              
              // Temp mesaj ise, gerçek mesajla eşleşip eşleşmediğini kontrol et
              if (!m.fromMe) return true; // Başkasından gelen mesajları tut
              
              // Aynı text içeriğine sahip temp mesajı kaldır
              if (newMsg.text && m.text) {
                const newText = (newMsg.text || '').trim();
                const mText = (m.text || '').trim();
                if (mText === newText && m.fromMe === true) {
                  console.log('[WebSocket] 🗑️ Temp mesaj kaldırıldı (text eşleşmesi):', mId, '->', newMsg.id || newMsg.key?.id);
                  return false;
                }
              }
              
              // Timestamp'e göre de kontrol et (10 saniye içindeki temp mesajları kaldır)
              if (m.fromMe === true && newMsg.timestamp && m.timestamp) {
                const newTime = newMsg.timestamp > 1000000000000 ? newMsg.timestamp / 1000 : newMsg.timestamp;
                const mTime = m.timestamp > 1000000000000 ? m.timestamp / 1000 : m.timestamp;
                const timeDiff = Math.abs(newTime - mTime);
                if (timeDiff < 10) {
                  console.log('[WebSocket] 🗑️ Temp mesaj kaldırıldı (timestamp eşleşmesi):', mId, '->', newMsg.id || newMsg.key?.id);
                  return false;
                }
              }
              
              return true; // Eşleşme yoksa temp mesajı tut
            });
          }
        });
        
        // Birleştir ve sırala
        const merged = [...filteredPrev, ...newMessages];
        merged.sort((a, b) => {
          const normalizeTimestamp = (ts: number | undefined) => {
            if (!ts) return 0;
            return ts > 1000000000000 ? ts : ts * 1000;
          };
          const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
          const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
          return aTime - bTime;
        });
        
        // Duplicate kontrolü ve eski temp mesajları temizle (30 saniyeden eski temp mesajları kaldır)
        const now = Date.now();
        const uniqueMessages = merged.filter((msg, index, self) => {
          const msgId = msg.id || msg.key?.id;
          if (!msgId) return true;
          
          // Eski temp mesajları temizle (30 saniyeden eski)
          if (msgId.toString().startsWith('temp-')) {
            const tempTimestamp = parseInt(msgId.toString().replace('temp-', '').split('-')[0]);
            if (!isNaN(tempTimestamp) && now - tempTimestamp > 30000) {
              console.log('[WebSocket] 🗑️ Eski temp mesaj kaldırıldı (30 saniye geçti):', msgId);
              return false;
            }
          }
          
          // Duplicate kontrolü
          const firstIndex = self.findIndex(m => (m.id || m.key?.id) === msgId);
          return firstIndex === index;
        });
        
        // Cache'i güncelle
        if (updateMessagesCache && currentSelectedChat) {
          updateMessagesCache(currentActiveAccount?.id || '', normalizedChatId, uniqueMessages);
        }
        
        console.log('[WebSocket] ✅ Mesajlar eklendi:', { 
          yeni: newMessages.length, 
          toplam: uniqueMessages.length,
          chatId: normalizedChatId 
        });
        
        return uniqueMessages;
      });
    }
    
    // Chat listesindeki bilgileri güncelle (tüm chat'ler için)
    if (chatMessages.length > 0) {
      let lastMessage = chatMessages[0];
      for (const msg of chatMessages) {
        const msgTime = msg.timestamp || msg.messageTimestamp || 0;
        const lastTime = lastMessage.timestamp || lastMessage.messageTimestamp || 0;
        if (msgTime > lastTime) {
          lastMessage = msg;
        }
      }
      
      const messageText = lastMessage.text || extractMessageText(lastMessage) || '';
      const messageTimestamp = lastMessage.timestamp || lastMessage.messageTimestamp || Math.floor(Date.now() / 1000);
      
      setChats(prevChats => {
        // Grup chat'leri için direkt eşleşme ara
        if (normalizedChatId.includes('@g.us')) {
          const index = prevChats.findIndex(c => c.id === normalizedChatId);
          if (index >= 0) {
            const updatedChats = [...prevChats];
            updatedChats[index] = {
              ...updatedChats[index],
              conversationTimestamp: messageTimestamp,
              lastMessage: messageText,
              time: new Date(messageTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              unreadCount: isSelectedChat ? updatedChats[index].unreadCount : (updatedChats[index].unreadCount || 0) + 1,
            };
            updatedChats.sort((a, b) => {
              const aTime = a.conversationTimestamp || 0;
              const bTime = b.conversationTimestamp || 0;
              return Number(bTime) - Number(aTime);
            });
            return updatedChats;
          }
        }
        
        // Bireysel chat'ler için: NORMALIZE EDİLMİŞ TELEFON NUMARASINA GÖRE ARA
        const phoneNumberRaw = extractPhoneFromJid(normalizedChatId);
        const phoneNumberNormalized = normalizePhoneNumber(phoneNumberRaw);
        
        let index = prevChats.findIndex(c => {
          if (c.id.includes('@g.us')) return false;
          const cPhoneRaw = extractPhoneFromJid(c.id);
          const cPhoneNormalized = normalizePhoneNumber(cPhoneRaw);
          return cPhoneRaw === phoneNumberRaw || cPhoneNormalized === phoneNumberNormalized;
        });
        
        if (index >= 0) {
          const updatedChats = [...prevChats];
          const existingChat = updatedChats[index];
          const normalizedChatId = normalizeJid(chatId);
          
          updatedChats[index] = {
            ...existingChat,
            id: normalizedChatId,
            conversationTimestamp: messageTimestamp,
            lastMessage: messageText,
            time: new Date(messageTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            unreadCount: isSelectedChat ? existingChat.unreadCount : (existingChat.unreadCount || 0) + 1,
          };
          
          updatedChats.sort((a, b) => {
            const aTime = a.conversationTimestamp || 0;
            const bTime = b.conversationTimestamp || 0;
            return Number(bTime) - Number(aTime);
          });
          return updatedChats;
        } else {
          // Yeni chat oluştur
          console.log('[WebSocket] Yeni chat oluşturuluyor:', chatId);
          const cached = contactsCacheRef.current.get(sessionId);
          const contactsMap = cached ? cached.data : new Map<string, any>();
          const contact = contactsMap.get(chatId);
          
          let displayName = chatId;
          let verifiedName: string | undefined = undefined;
          
          if (!chatId.includes('@g.us') && contact) {
            verifiedName = contact.verifiedName;
            displayName = contact.verifiedName || contact.name || contact.notify || chatId;
          } else if (!chatId.includes('@g.us')) {
            const phoneMatch = chatId.match(/^(\d+)@/);
            if (phoneMatch) {
              displayName = phoneMatch[1];
            }
          }
          
          const normalizedChatId = normalizeJid(chatId);
          
          const newChat: Chat = {
            id: normalizedChatId,
            name: displayName,
            verifiedName: verifiedName,
            profilePicture: contact?.imgUrl || chatProfilePictures.get(chatId) || chatProfilePictures.get(normalizedChatId),
            unreadCount: isSelectedChat ? 0 : 1,
            conversationTimestamp: messageTimestamp,
            archived: false,
            pinned: null,
            lastMessage: messageText,
            time: new Date(messageTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            isMuted: false,
          };
          
          return [newChat, ...prevChats];
        }
      });
    }
  }
};

export const handleMessagesSet = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    messages: rawMessages,
  } = data;

  const {
    activeAccountRef,
    selectedChatRef,
    messagesInitialLoadRef,
    setMessages,
    updateMessagesCache,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  const currentSelectedChat = selectedChatRef.current;
  
  if (sessionId !== currentActiveAccount?.id || !currentSelectedChat) return;

  const messagesKey = `${sessionId}-${currentSelectedChat.id}`;
  const hasInitialLoad = messagesInitialLoadRef.current.get(messagesKey);
  
  if (hasInitialLoad) {
    console.log('[WebSocket] messages.set event ignore edildi (zaten yüklendi):', rawMessages?.length || 0);
    return;
  }
  
  console.log('[WebSocket] Mesaj geçmişi alındı (ilk yükleme):', rawMessages?.length || 0);
  
  const chatMessages = (rawMessages || []).filter((msg: any) => {
    const msgFrom = msg.from || msg.key?.remoteJid;
    return msgFrom === currentSelectedChat.id;
  });
  
  if (chatMessages.length > 0) {
    const formattedMessages: Message[] = chatMessages.map((msg: any) => {
      const text = msg.text || extractMessageText(msg);
      const body = msg.body || text;
      const msgId = msg.id || msg.key?.id || `${msg.timestamp || msg.messageTimestamp || Date.now()}-${Math.random()}`;
      const fromMe = msg.fromMe !== undefined 
        ? Boolean(msg.fromMe) 
        : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
      
      return {
        ...msg,
        id: msgId,
        text: text || body,
        body: body || text,
        fromMe: fromMe,
        timestamp: msg.timestamp || msg.messageTimestamp || undefined,
      };
    });
    
    formattedMessages.sort((a, b) => {
      const normalizeTimestamp = (ts: number | undefined) => {
        if (!ts) return 0;
        return ts > 1000000000000 ? ts : ts * 1000;
      };
      const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
      const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
      return aTime - bTime;
    });
    
    try {
      messagesInitialLoadRef.current.set(messagesKey, true);
      setMessages(formattedMessages);
      
      if (updateMessagesCache && currentSelectedChat) {
        updateMessagesCache(currentActiveAccount?.id || '', currentSelectedChat.id, formattedMessages);
      }
    } catch (error) {
      console.error('[WebSocket] ❌ setMessages hatası:', error);
    }
  }
};

export const handleMessagesUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessionId,
    updates: rawUpdates,
  } = data;

  const {
    activeAccountRef,
    selectedChatRef,
    setMessages,
  } = context;

  const currentActiveAccount = activeAccountRef.current;
  const currentSelectedChat = selectedChatRef.current;
  
  if (sessionId !== currentActiveAccount?.id) return;

  console.log('[WebSocket] 📝 Mesaj güncellemeleri alındı:', rawUpdates?.length || 0);
  
  if (!rawUpdates || !Array.isArray(rawUpdates) || rawUpdates.length === 0) return;

  const isSelectedChat = currentSelectedChat && rawUpdates.some((update: any) => {
    const updateJid = update.jid || update.key?.remoteJid;
    return updateJid === currentSelectedChat.id || 
      (!currentSelectedChat.id.includes('@g.us') && 
       extractPhoneFromJid(updateJid) === extractPhoneFromJid(currentSelectedChat.id));
  });
  
  if (isSelectedChat && currentSelectedChat) {
    setMessages(prev => {
      const updated = [...prev];
      let hasChanges = false;
      
      for (const update of rawUpdates) {
        const updateId = update.key?.id;
        if (!updateId) continue;
        
        const index = updated.findIndex(m => {
          const mId = m.id || m.key?.id;
          return mId === updateId;
        });
        
        if (index >= 0) {
          // Mesaj okundu bilgisi
          if (update.updateType === 'read_receipt' && update.updateData?.receipt) {
            updated[index] = {
              ...updated[index],
              read: true,
              readReceipt: true,
              readTimestamp: update.updateData.receiptTimestamp,
            };
            hasChanges = true;
          }
          
          // Mesaj düzenleme
          if (update.updateType === 'message_edit' && update.updateData?.message) {
            updated[index] = {
              ...updated[index],
              message: update.updateData.message,
              edited: true,
            };
            hasChanges = true;
          }
          
          // Mesaj silme
          if (update.updateType === 'message_delete') {
            updated.splice(index, 1);
            hasChanges = true;
          }
          
          // Reaksiyonlar
          if (update.updateType === 'reaction' && update.updateData?.reactions) {
            updated[index] = {
              ...updated[index],
              reactions: update.updateData.reactions,
            };
            hasChanges = true;
          }
          
          // Poll votes
          if (update.updateType === 'poll_vote' && update.updateData?.pollVotes) {
            updated[index] = {
              ...updated[index],
              pollVotes: update.updateData.pollVotes,
            };
            hasChanges = true;
          }
        }
      }
      
      return hasChanges ? updated : prev;
    });
  }
};

