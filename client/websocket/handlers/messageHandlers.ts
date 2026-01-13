// Message event handlers (messages.upsert, messages.set, messages.update)
import { Message, Chat } from '../../types';
import { extractMessageText } from '../../utils/messageUtils';
import { extractPhoneFromJid, standardizeMessageJid, standardizeChatId, normalizeGroupMessageJids, normalizeJid, normalizePhoneNumber } from '../../utils/contactUtils';
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
    // Backend'den gelen mesaj formatı: { id, from, fromMe, timestamp, text, body, key, message, ... }
    // formatMessage fonksiyonu: { id, from: key.remoteJid, fromMe: Boolean(key.fromMe), ... }
    // from alanı chat ID'sini içerir (key.remoteJid'den gelir)
    let chatId = msg.from || msg.key?.remoteJid;
    
    // Debug: Mesaj formatını kontrol et
    if (!chatId) {
      console.warn('[WebSocket] ⚠️ Mesaj atlandı (chatId yok):', { 
        from: msg.from, 
        remoteJid: msg.key?.remoteJid, 
        id: msg.id || msg.key?.id,
        fromMe: msg.fromMe,
        keyFromMe: msg.key?.fromMe,
        fullMsg: JSON.stringify(msg).substring(0, 200)
      });
      continue;
    }
    
    if (chatId.includes('@broadcast')) {
      console.log('[WebSocket] ⚠️ Broadcast mesajı atlandı:', chatId);
      continue;
    }
    
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
        const normalizedChatId = standardizeChatId(chatId);
        phoneToChatIdMap.set(phoneNumber, normalizedChatId);
        chatId = normalizedChatId;
      }
    } else {
      chatId = standardizeChatId(chatId);
    }
    
    if (!messagesByChat.has(chatId)) {
      messagesByChat.set(chatId, []);
    }
    messagesByChat.get(chatId)!.push(msg);
  }
  
  // Debug: Gönderilen mesajları kontrol et
  const fromMeMessages = rawMessages.filter((msg: any) => {
    const fromMe = msg.fromMe !== undefined 
      ? Boolean(msg.fromMe) 
      : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
    return fromMe;
  });
  if (fromMeMessages.length > 0) {
    console.log('[WebSocket] 📤 Gönderilen mesajlar tespit edildi:', fromMeMessages.length, fromMeMessages.map((m: any) => ({
      id: m.id || m.key?.id,
      from: m.from || m.key?.remoteJid,
      text: m.text || m.body,
      fromMe: m.fromMe !== undefined ? Boolean(m.fromMe) : (m.key?.fromMe === true || m.key?.fromMe === 'true' || m.key?.fromMe === 1)
    })));
  }
  
  // Her chat için mesajları işle
  for (const [chatId, chatMessages] of messagesByChat.entries()) {
    const normalizedChatId = chatId.includes('@g.us') ? chatId : standardizeChatId(chatId);
    
    // Chat ID eşleştirmesi: Hem tam eşleşme hem de telefon numarası eşleşmesi kontrol et (mesaj filtrelenmeden önce)
    let isSelectedChat = false;
    if (currentSelectedChat) {
      // Tam eşleşme
      if (normalizedChatId === currentSelectedChat.id) {
        isSelectedChat = true;
      }
      // Telefon numarası eşleşmesi (bireysel chat'ler için)
      else if (!currentSelectedChat.id.includes('@g.us') && !normalizedChatId.includes('@g.us')) {
        const msgPhone = extractPhoneFromJid(normalizedChatId);
        const selectedPhone = extractPhoneFromJid(currentSelectedChat.id);
        if (msgPhone && selectedPhone && msgPhone === selectedPhone) {
          isSelectedChat = true;
        }
      }
      
      // Gönderilen mesajlar için daha esnek eşleştirme (fromMe kontrolü)
      if (!isSelectedChat && chatMessages.length > 0) {
        const hasFromMe = chatMessages.some((m: any) => {
          const fromMe = m.fromMe !== undefined 
            ? Boolean(m.fromMe) 
            : (m.key?.fromMe === true || m.key?.fromMe === 'true' || m.key?.fromMe === 1);
          return fromMe;
        });
        
        // Eğer gönderilen mesaj varsa ve chat ID'leri normalize edilmiş formatta eşleşiyorsa, seçili chat olarak kabul et
        if (hasFromMe) {
          const normalizedSelectedChatId = standardizeChatId(currentSelectedChat.id);
          if (normalizedChatId === normalizedSelectedChatId) {
            isSelectedChat = true;
            console.log('[WebSocket] ✅ Gönderilen mesaj için chat ID eşleştirmesi yapıldı:', {
              normalizedChatId,
              normalizedSelectedChatId,
              selectedChatId: currentSelectedChat.id
            });
          }
        }
      }
    }
    
    // Silinen mesajları filtrele (messageStubType === 0 veya messageStubParameters varsa)
    // Ama reaction mesajlarını filtreleme (bunlar ayrı mesaj olarak gösterilmemeli ama silinmiş olarak da işaretlenmemeli)
    const validMessages = chatMessages.filter((msg: any) => {
      // Reaction mesajlarını filtrele (ayrı mesaj olarak gösterilmemeli)
      if (msg.message?.reactionMessage || msg.type === 'reactionMessage') {
        console.log('[WebSocket] ⚠️ Reaction mesajı messages.upsert\'te atlandı (ayrı mesaj olarak gösterilmeyecek):', {
          id: msg.id || msg.key?.id,
          reactionText: msg.message?.reactionMessage?.text || msg.text
        });
        return false;
      }
      
      // Eğer mesaj silinmişse (messageStubType === 0), messages.upsert'te gelmemeli
      // Bu mesajlar messages.update event'inde işlenecek
      if (msg.messageStubType === 0 || msg.messageStubParameters) {
        console.log('[WebSocket] ⚠️ Silinen mesaj messages.upsert\'te atlandı:', {
          id: msg.id || msg.key?.id,
          messageStubType: msg.messageStubType,
          messageStubParameters: msg.messageStubParameters
        });
        return false;
      }
      return true;
    });
    
    if (validMessages.length === 0) {
      // Seçili chat ise bilgilendirici log ekle
      if (isSelectedChat) {
        console.log('[WebSocket] ℹ️ Seçili chat için mesajlar alındı ama tümü silinmiş, atlanıyor:', {
          normalizedChatId,
          selectedChatId: currentSelectedChat?.id,
          totalMessages: chatMessages.length,
          filteredMessages: validMessages.length
        });
      } else {
        console.log('[WebSocket] ℹ️ Tüm mesajlar silinmiş, atlanıyor:', normalizedChatId);
      }
      continue;
    }
    
    // Debug: Eşleşme kontrolü (gönderilen mesajlar için)
    // Gönderilen mesajlar için daha esnek eşleştirme yap
    if (currentSelectedChat && !isSelectedChat && chatMessages.length > 0) {
        const hasFromMe = chatMessages.some((m: any) => {
          const fromMe = m.fromMe !== undefined 
            ? Boolean(m.fromMe) 
            : (m.key?.fromMe === true || m.key?.fromMe === 'true' || m.key?.fromMe === 1);
          return fromMe;
        });
        
        if (hasFromMe) {
          // Gönderilen mesajlar için daha esnek eşleştirme: normalize edilmiş chat ID'leri karşılaştır
          const normalizedSelectedChatId = standardizeChatId(currentSelectedChat.id);
          if (normalizedChatId === normalizedSelectedChatId) {
            isSelectedChat = true;
            console.log('[WebSocket] ✅ Gönderilen mesaj için chat ID eşleştirmesi yapıldı (esnek):', {
              normalizedChatId,
              normalizedSelectedChatId,
              selectedChatId: currentSelectedChat.id
            });
          } else {
            console.log('[WebSocket] ⚠️ Gönderilen mesaj seçili chat ile eşleşmedi:', {
              normalizedChatId,
              normalizedSelectedChatId,
              selectedChatId: currentSelectedChat.id,
              msgPhone: extractPhoneFromJid(normalizedChatId),
              selectedPhone: extractPhoneFromJid(currentSelectedChat.id),
              messages: chatMessages.map((m: any) => ({
                id: m.id || m.key?.id,
                from: m.from || m.key?.remoteJid,
                fromMe: m.fromMe !== undefined ? Boolean(m.fromMe) : (m.key?.fromMe === true || m.key?.fromMe === 'true' || m.key?.fromMe === 1)
              }))
            });
          }
        }
    }
    
    // Seçili chat'teki mesajları işle (gönderilen mesajlar dahil)
    if (isSelectedChat && chatMessages.length > 0) {
      console.log('[WebSocket] ✅ Seçili sohbetin mesajlarına yeni mesajlar ekleniyor...', {
        normalizedChatId,
        selectedChatId: currentSelectedChat?.id,
        messageCount: chatMessages.length,
        fromMeCount: chatMessages.filter((m: any) => {
          const fromMe = m.fromMe !== undefined 
            ? Boolean(m.fromMe) 
            : (m.key?.fromMe === true || m.key?.fromMe === 'true' || m.key?.fromMe === 1);
          return fromMe;
        }).length
      });
      
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => {
          return m.id || m.key?.id;
        }));
        
        const newMessages: Message[] = [];
        for (const msg of chatMessages) {
          // Silinen mesajları atla (messageStubType === 0)
          if (msg.messageStubType === 0 || msg.messageStubParameters) {
            console.log('[WebSocket] ⚠️ Silinen mesaj messages.upsert\'te atlandı:', {
              id: msg.id || msg.key?.id,
              messageStubType: msg.messageStubType
            });
            continue;
          }
          
          const msgId = msg.id || msg.key?.id || `${msg.timestamp || msg.messageTimestamp || Date.now()}-${Math.random()}`;
          
          // ÖNEMLİ: Eğer mesaj zaten varsa ve düzenlenmişse, messages.upsert ile güncelleme yapma
          const existingMessage = prev.find(m => {
            const mId = m.id || m.key?.id;
            if (!mId) return false;
            const mIdStr = String(mId).trim();
            const msgIdStr = String(msgId).trim();
            // Tam eşleşme
            if (mIdStr === msgIdStr) return true;
            // Case-insensitive karşılaştırma
            if (mIdStr.toLowerCase() === msgIdStr.toLowerCase()) return true;
            return false;
          });
          
          if (existingMessage) {
            // Eğer mesaj düzenlenmişse, yeni mesajı atla
            if (existingMessage.edited) {
              console.log('[WebSocket] ⚠️ Düzenlenmiş mesaj messages.upsert\'te güncellenmeye çalışıldı, atlandı:', {
                msgId,
                existingText: existingMessage.text?.substring(0, 30),
                existingEdited: existingMessage.edited,
                msgType: msg.type,
                msgText: (msg.text || extractMessageText(msg))?.substring(0, 30)
              });
              continue; // Bu mesajı atla, mevcut düzenlenmiş mesajı koru
            }
            // Eğer mesaj zaten varsa ve düzenlenmemişse, duplicate olarak ekleme
            console.log('[WebSocket] ℹ️ Mesaj zaten var, duplicate olarak eklenmedi:', {
              msgId,
              existingText: existingMessage.text?.substring(0, 30)
            });
            continue;
          }
          
          // Eğer mesaj zaten varsa (ID kontrolü)
          if (existingIds.has(msgId)) {
            // Mesaj zaten var, duplicate olarak ekleme
            continue;
          }
          
          const text = msg.text || extractMessageText(msg);
          const body = msg.body || text;
          const fromMe = msg.fromMe !== undefined 
            ? Boolean(msg.fromMe) 
            : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
          
          // Protocol mesajlarını filtrele (messageStubType olan mesajlar genellikle sistem mesajlarıdır)
          // FUTUREPROOF (3) ve bazı protocol mesajları anlamsız "Mesaj" text'i döndürebilir
          const messageStubType = msg.messageStubType || msg.message?.messageStubType;
          if (messageStubType !== undefined && messageStubType !== null) {
            // Sadece belirli protocol mesaj tiplerini göster (silinen mesaj, şifreli mesaj vb)
            // Diğerlerini (özellikle FUTUREPROOF - 3) filtrele çünkü anlamsız "Mesaj" text'i döndürüyorlar
            const allowedProtocolTypes = [1]; // Sadece REVOKE (silinen mesaj) göster
            if (!allowedProtocolTypes.includes(messageStubType)) {
              console.log('[WebSocket] ⚠️ Protocol mesajı atlandı:', {
                id: msgId,
                messageStubType,
                text: text?.substring(0, 30)
              });
              continue;
            }
          }
          
          // Boş mesajları atla (text ve body yoksa veya sadece boş string ise)
          const textTrimmed = text?.trim();
          const bodyTrimmed = body?.trim();
          if ((!textTrimmed && !bodyTrimmed) || (textTrimmed === '' && bodyTrimmed === '')) {
            console.warn('[WebSocket] ⚠️ Boş mesaj atlandı:', {
              id: msgId,
              type: msg.type,
              msg: JSON.stringify(msg).substring(0, 200)
            });
            continue;
          }
          
          // "Mesaj" gibi generic/anlamsız text'leri filtrele
          const textToCheck = (textTrimmed || bodyTrimmed || '').toLowerCase();
          if (textToCheck === 'mesaj' || textToCheck === 'message' || textToCheck === 'sistem mesajı') {
            console.warn('[WebSocket] ⚠️ Generic/anlamsız mesaj text\'i atlandı:', {
              id: msgId,
              type: msg.type,
              text: textTrimmed || bodyTrimmed,
              messageStubType
            });
            continue;
          }
          
          // Eğer mesaj tipi sadece "type" string'i ise (örneğin "conversation", "imageMessage" vs) ve text yoksa, atla
          // Bu genellikle formatMessage fonksiyonunun yanlış çıkardığı mesaj tipleridir
          if (msg.type && !textTrimmed && !bodyTrimmed && typeof msg.type === 'string' && !msg.type.startsWith('protocol_')) {
            console.warn('[WebSocket] ⚠️ Sadece tip bilgisi olan mesaj atlandı:', {
              id: msgId,
              type: msg.type,
              hasMessage: !!msg.message,
              messageKeys: msg.message ? Object.keys(msg.message) : []
            });
            continue;
          }
          
          if (msgId) {
            newMessages.push({
              ...msg,
              id: msgId,
              text: text || body || '',
              body: body || text || '',
              fromMe: fromMe,
              timestamp: msg.timestamp || msg.messageTimestamp || undefined,
            });
          }
        }
        
        if (newMessages.length === 0) return prev;
        
        // Birleştir ve sırala
        // ÖNEMLİ: Düzenlenmiş mesajları koru - messages.upsert ile güncelleme yapma
        const merged: Message[] = [];
        const processedIds = new Set<string>();
        const editedMessages = new Map<string, Message>();
        
        // Önce mevcut mesajları ekle (düzenlenmiş mesajları özellikle koru)
        for (const msg of prev) {
          const msgId = msg.id || msg.key?.id;
          if (msgId) {
            const msgIdStr = String(msgId);
            processedIds.add(msgIdStr);
            
            // Düzenlenmiş mesajları özel olarak sakla
            if (msg.edited || msg.editedAt) {
              editedMessages.set(msgIdStr, msg);
              console.log('[WebSocket] 🔒 Düzenlenmiş mesaj korunuyor:', {
                msgId: msgIdStr,
                text: msg.text?.substring(0, 30),
                edited: msg.edited,
                editedAt: msg.editedAt
              });
            }
            
            merged.push(msg);
          }
        }
        
        // Sonra yeni mesajları ekle (düzenlenmiş mesajları atla)
        for (const newMsg of newMessages) {
          const msgId = newMsg.id || newMsg.key?.id;
          if (!msgId) continue;
          
          const msgIdStr = String(msgId);
          
          // Eğer bu mesaj zaten varsa ve düzenlenmişse, yeni mesajı kesinlikle atla
          if (editedMessages.has(msgIdStr)) {
            const editedMsg = editedMessages.get(msgIdStr)!;
            console.log('[WebSocket] ⚠️ Düzenlenmiş mesaj messages.upsert\'te güncellenmeye çalışıldı, kesinlikle atlandı:', {
              msgId: msgIdStr,
              existingText: editedMsg.text?.substring(0, 30),
              existingEdited: editedMsg.edited,
              newText: newMsg.text?.substring(0, 30)
            });
            continue; // Düzenlenmiş mesajı koru, yeni mesajı atla
          }
          
          // Eğer bu mesaj zaten varsa ama düzenlenmemişse, kontrol et
          const existingIndex = merged.findIndex(m => {
            const mId = m.id || m.key?.id;
            return mId && String(mId) === msgIdStr;
          });
          
          if (existingIndex >= 0) {
            const existingMsg = merged[existingIndex];
            // Eğer mevcut mesaj düzenlenmişse, yeni mesajı atla
            if (existingMsg.edited || existingMsg.editedAt) {
              console.log('[WebSocket] ⚠️ Düzenlenmiş mesaj messages.upsert\'te güncellenmeye çalışıldı, atlandı:', {
                msgId: msgIdStr,
                existingText: existingMsg.text?.substring(0, 30),
                newText: newMsg.text?.substring(0, 30)
              });
              continue;
            }
            // Eğer mevcut mesaj düzenlenmemişse, yeni mesajla güncelle
            // Ama reaction'ları koru - mevcut mesajdaki reaction'ları yeni mesaja ekle
            const existingReactions = existingMsg.reactions || existingMsg.message?.reactions;
            if (existingReactions) {
              newMsg.reactions = existingReactions;
              if (newMsg.message) {
                newMsg.message.reactions = existingReactions;
              } else if (existingReactions) {
                newMsg.message = { reactions: existingReactions };
              }
            }
            merged[existingIndex] = newMsg;
          } else {
            // Yeni mesaj, ekle
            merged.push(newMsg);
          }
        }
        
        // Sırala
        merged.sort((a, b) => {
          const normalizeTimestamp = (ts: number | undefined) => {
            if (!ts) return 0;
            return ts > 1000000000000 ? ts : ts * 1000;
          };
          const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
          const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
          return aTime - bTime;
        });
        
        // Duplicate kontrolü
        // ÖNEMLİ: Düzenlenmiş mesajları koru - duplicate kontrolünde düzenlenmiş mesajları önceliklendir
        const uniqueMessages = merged.filter((msg, index, self) => {
          const msgId = msg.id || msg.key?.id;
          if (!msgId) return true;
          
          // Duplicate kontrolü - düzenlenmiş mesajları önceliklendir
          const duplicates = self.filter(m => {
            const mId = m.id || m.key?.id;
            return mId && String(mId) === String(msgId);
          });
          
          if (duplicates.length > 1) {
            // Eğer duplicate varsa, düzenlenmiş olanı koru
            const editedMsg = duplicates.find(m => m.edited || m.editedAt);
            if (editedMsg) {
              // Eğer bu mesaj düzenlenmişse ve bu düzenlenmiş mesajsa, bunu koru
              if ((msg.edited || msg.editedAt) && msg === editedMsg) {
                // Bu düzenlenmiş mesajın ilk göründüğü index'i bul
                const editedIndex = self.findIndex(m => m === editedMsg);
                return index === editedIndex;
              }
              // Eğer başka bir düzenlenmiş mesaj varsa ve bu düzenlenmiş değilse, bunu atla
              if (!(msg.edited || msg.editedAt)) {
                return false;
              }
            }
          }
          
          // Normal duplicate kontrolü - ama düzenlenmiş mesajları önceliklendir
          const firstIndex = self.findIndex(m => {
            const mId = m.id || m.key?.id;
            if (mId && String(mId) === String(msgId)) {
              // Eğer düzenlenmiş mesaj varsa, onu önceliklendir
              if (m.edited || m.editedAt) {
                return true;
              }
              // Eğer bu mesaj düzenlenmişse, onu önceliklendir
              if (msg.edited || msg.editedAt) {
                return m === msg;
              }
              return true;
            }
            return false;
          });
          
          // Eğer ilk index'teki mesaj düzenlenmişse ve bu mesaj düzenlenmemişse, bunu atla
          if (firstIndex >= 0 && firstIndex !== index) {
            const firstMsg = self[firstIndex];
            if ((firstMsg.edited || firstMsg.editedAt) && !(msg.edited || msg.editedAt)) {
              return false;
            }
          }
          
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
    
    // Chat listesindeki bilgileri güncelle (TÜM chat'ler için - seçili olmasa bile)
    if (chatMessages.length > 0) {
      // En son mesajı bul
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
      const messageTime = new Date(messageTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      
      // Mesajın gönderenini kontrol et (unreadCount için)
      const fromMe = lastMessage.fromMe !== undefined 
        ? Boolean(lastMessage.fromMe) 
        : (lastMessage.key?.fromMe === true || lastMessage.key?.fromMe === 'true' || lastMessage.key?.fromMe === 1);
      
      setChats(prevChats => {
        let updatedChats = [...prevChats];
        let chatUpdated = false;
        
        // Grup chat'leri için direkt eşleşme ara
        if (normalizedChatId.includes('@g.us')) {
          const index = prevChats.findIndex(c => c.id === normalizedChatId);
          if (index >= 0) {
            chatUpdated = true;
            updatedChats[index] = {
              ...updatedChats[index],
              conversationTimestamp: messageTimestamp,
              lastMessage: messageText,
              time: messageTime,
              unreadCount: (isSelectedChat || fromMe) ? (updatedChats[index].unreadCount || 0) : ((updatedChats[index].unreadCount || 0) + 1),
            };
          }
        } else {
          // Bireysel chat'ler için: Telefon numarasına göre eşleşme ara
          const phoneNumberRaw = extractPhoneFromJid(normalizedChatId);
          const phoneNumberNormalized = normalizePhoneNumber(phoneNumberRaw);
          
          const index = prevChats.findIndex(c => {
            if (c.id.includes('@g.us')) return false;
            if (c.id === normalizedChatId) return true;
            const cPhoneRaw = extractPhoneFromJid(c.id);
            const cPhoneNormalized = normalizePhoneNumber(cPhoneRaw);
            return cPhoneRaw === phoneNumberRaw || cPhoneNormalized === phoneNumberNormalized;
          });
          
          if (index >= 0) {
            chatUpdated = true;
            updatedChats[index] = {
              ...updatedChats[index],
              id: normalizedChatId, // Normalize edilmiş ID'yi kullan
              conversationTimestamp: messageTimestamp,
              lastMessage: messageText,
              time: messageTime,
              unreadCount: (isSelectedChat || fromMe) ? (updatedChats[index].unreadCount || 0) : ((updatedChats[index].unreadCount || 0) + 1),
            };
          } else {
            // Chat yoksa yeni chat oluştur (mesaj geldiğinde otomatik oluştur)
            chatUpdated = true;
            const cached = contactsCacheRef.current.get(sessionId);
            const contactsMap = cached ? cached.data : new Map<string, any>();
            const contact = contactsMap.get(normalizedChatId);
            
            let displayName = normalizedChatId.split('@')[0];
            let verifiedName: string | undefined = undefined;
            
            if (contact) {
              verifiedName = contact.verifiedName;
              displayName = contact.verifiedName || contact.name || contact.notify || displayName;
            }
            
            const newChat: Chat = {
              id: normalizedChatId,
              name: displayName,
              verifiedName: verifiedName,
              profilePicture: contact?.imgUrl || chatProfilePictures.get(normalizedChatId) || null,
              unreadCount: fromMe ? 0 : 1,
              conversationTimestamp: messageTimestamp,
              archived: false,
              pinned: null,
              lastMessage: messageText,
              time: messageTime,
              isMuted: false,
            };
            
            updatedChats.push(newChat);
          }
        }
        
        // Chat listesini conversationTimestamp'e göre sırala (en yeni mesajlar üstte)
        if (chatUpdated) {
          updatedChats.sort((a, b) => {
            const aTime = a.conversationTimestamp || 0;
            const bTime = b.conversationTimestamp || 0;
            return Number(bTime) - Number(aTime);
          });
          
          console.log('[WebSocket] ✅ Chat listesi güncellendi:', {
            chatId: normalizedChatId,
            lastMessage: messageText.substring(0, 50),
            timestamp: messageTimestamp,
            fromMe: fromMe,
            isSelectedChat: isSelectedChat
          });
        }
        
        return updatedChats;
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
    const formattedMessages: Message[] = chatMessages
      .filter((msg: any) => {
        // Protocol mesajlarını filtrele (FUTUREPROOF vb anlamsız mesajlar)
        const messageStubType = msg.messageStubType || msg.message?.messageStubType;
        if (messageStubType !== undefined && messageStubType !== null) {
          const allowedProtocolTypes = [1]; // Sadece REVOKE (silinen mesaj) göster
          if (!allowedProtocolTypes.includes(messageStubType)) {
            return false;
          }
        }
        
        // Boş mesajları filtrele
        const text = msg.text || extractMessageText(msg);
        const body = msg.body || text;
        const textTrimmed = text?.trim();
        const bodyTrimmed = body?.trim();
        if ((!textTrimmed && !bodyTrimmed) || (textTrimmed === '' && bodyTrimmed === '')) {
          return false;
        }
        
        // Generic/anlamsız text'leri filtrele
        const textToCheck = (textTrimmed || bodyTrimmed || '').toLowerCase();
        if (textToCheck === 'mesaj' || textToCheck === 'message' || textToCheck === 'sistem mesajı') {
          return false;
        }
        
        return true;
      })
      .map((msg: any) => {
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
  rawUpdates?.forEach((u: any, idx: number) => {
    console.log(`[WebSocket] 📝 Update ${idx + 1}:`, {
      updateType: u.updateType,
      updateId: u.key?.id,
      jid: u.jid,
      remoteJid: u.key?.remoteJid,
      normalizedJid: u.jid?.replace(/:\d+@/, '@'),
      updateDataKeys: u.updateData ? Object.keys(u.updateData) : [],
      hasReactions: !!u.updateData?.reactions,
      reactions: u.updateData?.reactions,
      fullUpdate: u
    });
  });
  
  if (!rawUpdates || !Array.isArray(rawUpdates) || rawUpdates.length === 0) return;

  // Tüm chat'ler için mesaj güncellemelerini işle (sadece seçili chat değil)
  // Ancak mesajları sadece seçili chat için güncelle
  const isSelectedChat = currentSelectedChat && rawUpdates.some((update: any) => {
    const updateJid = update.jid || update.key?.remoteJid;
    if (!updateJid) {
      console.warn('[WebSocket] ⚠️ Update JID yok:', update);
      return false;
    }
    
    // JID normalizasyonu: Merkezi converter kullan
    const normalizedUpdateJid = standardizeChatId(updateJid);
    const normalizedSelectedChatId = standardizeChatId(currentSelectedChat.id);
    
    // Telefon numarasına göre eşleştirme (@lid formatı için)
    const updatePhone = extractPhoneFromJid(updateJid) || extractPhoneFromJid(normalizedUpdateJid);
    const selectedPhone = extractPhoneFromJid(currentSelectedChat.id) || extractPhoneFromJid(normalizedSelectedChatId);
    
    const matches = normalizedUpdateJid === normalizedSelectedChatId || 
      updateJid === currentSelectedChat.id ||
      normalizedUpdateJid === currentSelectedChat.id ||
      (!currentSelectedChat.id.includes('@g.us') && 
       (extractPhoneFromJid(updateJid) === extractPhoneFromJid(currentSelectedChat.id) ||
        updatePhone === selectedPhone ||
        (updatePhone && selectedPhone && updatePhone === selectedPhone)));
    
    if (!matches && update.updateType === 'reaction') {
      console.log('[WebSocket] 🔍 Reaction update JID eşleşmedi:', {
        updateJid,
        normalizedUpdateJid,
        updatePhone,
        selectedChatId: currentSelectedChat.id,
        normalizedSelectedChatId,
        selectedPhone,
        updateType: update.updateType,
        updateId: update.key?.id,
        phonesMatch: updatePhone === selectedPhone
      });
    }
    
    return matches;
  });
  
  // Seçili chat varsa ve güncellemeler bu chat'e aitse, mesajları güncelle
  if (isSelectedChat && currentSelectedChat) {
    setMessages(prev => {
      const updated = [...prev];
      let hasChanges = false;
      
      for (const update of rawUpdates) {
        const updateId = update.key?.id;
        const updateJid = update.jid || update.key?.remoteJid;
        if (!updateId) {
          console.warn('[WebSocket] ⚠️ Update ID yok:', update);
          continue;
        }
        
        console.log('[WebSocket] 🔍 Mesaj güncellemesi aranıyor:', {
          updateId,
          updateJid,
          updateType: update.updateType,
          totalMessages: updated.length,
          firstFewIds: updated.slice(0, 10).map(m => ({
            id: m.id || m.key?.id,
            text: m.text?.substring(0, 20),
            edited: m.edited
          }))
        });
        
        // Mesaj ID'sine göre ara (hem tam eşleşme hem de string karşılaştırması)
        let index = -1;
        const updateIdStr = String(updateId).trim();
        const updateIdLower = updateIdStr.toLowerCase();
        
        // Önce tam ID eşleşmesi dene (hem m.id hem de m.key.id)
        index = updated.findIndex(m => {
          const mId = m.id || m.key?.id;
          if (!mId) return false;
          const mIdStr = String(mId).trim();
          if (mIdStr === updateIdStr) return true;
          // Case-insensitive karşılaştırma
          if (mIdStr.toLowerCase() === updateIdLower) return true;
          return false;
        });
        
        // Eğer bulunamadıysa, key.id ile de dene
        if (index < 0) {
          index = updated.findIndex(m => {
            if (m.key?.id) {
              const mKeyIdStr = String(m.key.id).trim();
              if (mKeyIdStr === updateIdStr) return true;
              if (mKeyIdStr.toLowerCase() === updateIdLower) return true;
            }
            return false;
          });
        }
        
        // Hala bulunamadıysa, message.key.id ile de dene
        if (index < 0) {
          index = updated.findIndex(m => {
            if (m.message?.key?.id) {
              const mKeyIdStr = String(m.message.key.id).trim();
              if (mKeyIdStr === updateIdStr) return true;
              if (mKeyIdStr.toLowerCase() === updateIdLower) return true;
            }
            return false;
          });
        }
        
        // Hala bulunamadıysa, tüm mesajları kontrol et (daha detaylı log)
        if (index < 0) {
          console.log('[WebSocket] 🔍 Mesaj bulunamadı, tüm mesajları kontrol ediliyor:', {
            updateId,
            updateIdStr,
            allMessageIds: updated.map((m, idx) => ({
              index: idx,
              id: m.id || m.key?.id,
              keyId: m.key?.id,
              messageKeyId: m.message?.key?.id,
              text: m.text?.substring(0, 20),
              edited: m.edited
            }))
          });
        }
        
        // Hala bulunamadıysa, JID + timestamp eşleştirmesi yap (60 saniye tolerans - düzenleme için daha geniş)
        if (index < 0 && updateJid) {
          const updateTime = update.updateData?.timestamp || update.key?.timestamp || 0;
          index = updated.findIndex(m => {
            const mJid = m.from || m.key?.remoteJid;
            if (!mJid) return false;
            
            // JID eşleştirmesi (standart formata getirilmiş)
            const mJidNormalized = mJid.includes('@g.us') ? mJid : standardizeChatId(mJid);
            const updateJidNormalized = updateJid.includes('@g.us') ? updateJid : standardizeChatId(updateJid);
            
            if (mJidNormalized !== updateJidNormalized) return false;
            
            // Timestamp eşleştirmesi (60 saniye tolerans - düzenleme için daha geniş)
            const mTime = m.timestamp || m.messageTimestamp || 0;
            if (updateTime > 0 && mTime > 0) {
              // Timestamp'leri normalize et (saniye cinsinden)
              const mTimeNormalized = mTime > 1000000000000 ? Math.floor(mTime / 1000) : mTime;
              const updateTimeNormalized = updateTime > 1000000000000 ? Math.floor(updateTime / 1000) : updateTime;
              const timeDiff = Math.abs(mTimeNormalized - updateTimeNormalized);
              if (timeDiff < 60) { // 60 saniye tolerans
                return true;
              }
            }
            return false;
          });
        }
        
        if (index >= 0) {
          console.log('[WebSocket] ✅ Mesaj bulundu:', {
            index,
            updateId,
            messageId: updated[index].id || updated[index].key?.id,
            updateType: update.updateType
          });
          
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
            const editedMessage = update.updateData.message;
            
            // Backend'den gelen editedMessage direkt Baileys message formatında
            // Yani: { conversation: "text" } veya { extendedTextMessage: { text: "text" } }
            // NOT: editedMessage.message değil, editedMessage direkt message objesi
            
            let editedText = '';
            
            // Direkt Baileys message formatını kontrol et
            if (editedMessage.conversation) {
              editedText = editedMessage.conversation;
            } else if (editedMessage.extendedTextMessage?.text) {
              editedText = editedMessage.extendedTextMessage.text;
            } else if (editedMessage.text) {
              editedText = editedMessage.text;
            } else if (editedMessage.body) {
              editedText = editedMessage.body;
            } else {
              // Eğer wrapped formatında ise (editedMessage.message varsa)
              if (editedMessage.message) {
                const msg = editedMessage.message;
                if (msg.conversation) {
                  editedText = msg.conversation;
                } else if (msg.extendedTextMessage?.text) {
                  editedText = msg.extendedTextMessage.text;
                } else if (msg.text) {
                  editedText = msg.text;
                } else {
                  // extractMessageText ile dene
                  editedText = extractMessageText(editedMessage) || extractMessageText({ message: editedMessage });
                }
              } else {
                // extractMessageText ile dene
                editedText = extractMessageText(editedMessage) || extractMessageText({ message: editedMessage });
              }
            }
            
            console.log('[WebSocket] 📝 Mesaj düzenleniyor:', {
              index,
              updateId,
              originalText: updated[index].text?.substring(0, 30),
              newText: editedText?.substring(0, 30) || '(boş)',
              editedMessageKeys: Object.keys(editedMessage),
              editedMessageStructure: JSON.stringify(editedMessage).substring(0, 300),
              extractedText: editedText
            });
            
            const oldMessage = updated[index];
            
            // Text çıkarıldıysa, mesajı güncelle
            if (editedText && editedText.trim()) {
              updated[index] = {
                ...oldMessage,
                message: {
                  ...(oldMessage.message || {}),
                  ...editedMessage
                },
                text: editedText,
                body: editedText,
                edited: true,
                editedAt: Date.now(),
              };
              hasChanges = true;
              console.log('[WebSocket] ✅ Mesaj düzenlendi:', {
                messageId: updateId,
                matchedIndex: index,
                oldText: oldMessage.text?.substring(0, 30),
                newText: editedText.substring(0, 50),
                chatId: currentSelectedChat.id,
                finalText: updated[index].text,
                finalBody: updated[index].body,
                editedFlag: updated[index].edited
              });
            } else {
              // Text çıkarılamadıysa, eski text'i koru ve edited flag'ini set et
              // Boş mesaj oluşturma - sadece edited flag'ini güncelle
              if (oldMessage && oldMessage.text && oldMessage.text.trim()) {
                updated[index] = {
                  ...oldMessage,
                  message: {
                    ...(oldMessage.message || {}),
                    ...editedMessage
                  },
                  edited: true,
                  editedAt: Date.now(),
                };
                hasChanges = true;
                console.log('[WebSocket] ⚠️ Text çıkarılamadı, eski text korundu:', {
                  messageId: updateId,
                  oldText: oldMessage.text.substring(0, 30)
                });
              } else {
                // Eğer eski text de yoksa, extractMessageText ile tekrar dene
                const fallbackText = extractMessageText(editedMessage) || extractMessageText({ message: editedMessage });
                if (fallbackText && fallbackText.trim()) {
                  updated[index] = {
                    ...oldMessage,
                    message: {
                      ...(oldMessage.message || {}),
                      ...editedMessage
                    },
                    text: fallbackText,
                    body: fallbackText,
                    edited: true,
                    editedAt: Date.now(),
                  };
                  hasChanges = true;
                  console.log('[WebSocket] ✅ Fallback text ile mesaj düzenlendi:', {
                    messageId: updateId,
                    fallbackText: fallbackText.substring(0, 30)
                  });
                } else {
                  // Son çare: mesajı güncelleme (boş mesaj oluşturma)
                  console.warn('[WebSocket] ⚠️ Hem yeni hem eski text yok, mesaj güncellenmedi:', {
                    messageId: updateId,
                    editedMessage: JSON.stringify(editedMessage).substring(0, 500)
                  });
                }
              }
            }
          }
          
          // Mesaj silme
          if (update.updateType === 'message_delete') {
            const messageToDelete = updated[index];
            if (messageToDelete) {
              console.log('[WebSocket] 🗑️ Mesaj siliniyor:', {
                index,
                updateId,
                messageId: messageToDelete.id || messageToDelete.key?.id,
                messageText: messageToDelete.text?.substring(0, 30)
              });
              updated.splice(index, 1);
              hasChanges = true;
              console.log('[WebSocket] ✅ Mesaj silindi, kalan mesaj sayısı:', updated.length);
            }
          }
          
          // Reaksiyonlar
          if (update.updateType === 'reaction' && update.updateData?.reactions) {
            console.log('[WebSocket] 🎭 Reaction update alındı:', {
              updateId,
              index,
              messageId: updated[index]?.id || updated[index]?.key?.id,
              reactions: update.updateData.reactions,
              updateData: update.updateData
            });
            
            const existingMessage = updated[index];
            const reactions = update.updateData.reactions;
            
            // Hem reactions hem de message.reactions'ı güncelle
            updated[index] = {
              ...existingMessage,
              reactions: reactions,
              message: existingMessage.message ? {
                ...existingMessage.message,
                reactions: reactions
              } : { reactions: reactions }
            };
            
            hasChanges = true;
            console.log('[WebSocket] ✅ Reaction eklendi, güncellenmiş mesaj:', {
              messageId: updated[index]?.id || updated[index]?.key?.id,
              reactions: updated[index].reactions,
              messageReactions: updated[index].message?.reactions
            });
          }
          
          // Poll votes
          if (update.updateType === 'poll_vote' && update.updateData?.pollVotes) {
            updated[index] = {
              ...updated[index],
              pollVotes: update.updateData.pollVotes,
            };
            hasChanges = true;
          }
        } else {
          // Mesaj bulunamadı
          console.warn('[WebSocket] ⚠️ Mesaj bulunamadı:', {
            updateId,
            updateType: update.updateType,
            updateJid,
            availableMessageIds: updated.slice(0, 10).map(m => m.id || m.key?.id).filter(Boolean)
          });
        }
      }
      
      if (hasChanges) {
        console.log('[WebSocket] ✅ Mesaj güncellemeleri uygulandı:', {
          chatId: currentSelectedChat.id,
          updateCount: rawUpdates.length,
          finalMessageCount: updated.length
        });
      } else {
        console.warn('[WebSocket] ⚠️ Mesaj güncellemeleri uygulanamadı - mesajlar bulunamadı:', {
          chatId: currentSelectedChat.id,
          updateCount: rawUpdates.length,
          updateIds: rawUpdates.map((u: any) => u.key?.id).filter(Boolean),
          availableMessageIds: updated.slice(0, 10).map(m => m.id || m.key?.id).filter(Boolean)
        });
      }
      
      return hasChanges ? updated : prev;
    });
  } else {
    // Seçili chat yoksa veya güncellemeler farklı bir chat'e aitse
    console.log('[WebSocket] ℹ️ Mesaj güncellemeleri alındı ama seçili chat yok veya farklı chat:', {
      hasSelectedChat: !!currentSelectedChat,
      selectedChatId: currentSelectedChat?.id,
      updateJids: rawUpdates.map((u: any) => u.jid || u.key?.remoteJid).filter(Boolean),
      updateTypes: rawUpdates.map((u: any) => u.updateType),
      updates: rawUpdates.map((u: any) => ({
        updateType: u.updateType,
        updateId: u.key?.id,
        jid: u.jid,
        remoteJid: u.key?.remoteJid,
        normalizedJid: u.jid?.replace(/:\d+@/, '@'),
        updateDataKeys: u.updateData ? Object.keys(u.updateData) : [],
        hasReactions: !!u.updateData?.reactions,
        reactions: u.updateData?.reactions
      }))
    });
  }
};

