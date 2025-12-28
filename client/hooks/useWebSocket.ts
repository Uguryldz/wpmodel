import { useEffect, useRef } from 'react';
import { Chat, Message } from '../types';
import { extractMessageText } from '../utils/messageUtils';
import { extractPhoneFromJid, normalizeJid, areJidsSamePerson, normalizePhoneNumber } from '../utils/contactUtils';

interface UseWebSocketProps {
  activeAccountRef: React.MutableRefObject<any>;
  selectedChatRef: React.MutableRefObject<Chat | null>;
  contactsCacheRef: React.MutableRefObject<Map<string, { data: Map<string, any>, timestamp: number }>>;
  chatsLoadedRef: React.MutableRefObject<Map<string, boolean>>;
  chatsInitialLoadRef: React.MutableRefObject<Map<string, boolean>>;
  messagesInitialLoadRef: React.MutableRefObject<Map<string, boolean>>;
  chatProfilePictures: Map<string, string>;
  chats: Chat[];
  selectedChat: Chat | null;
  // Callbacks
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setChatProfilePictures: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setSelectedChat: React.Dispatch<React.SetStateAction<Chat | null>>;
  queueProfilePicture: (sessionId: string, jid: string) => void;
  loadChats?: (sessionId: string, limit: number, force: boolean) => void;
  updateMessagesCache?: (sessionId: string, chatId: string, messages: Message[]) => void;
  messagesCacheRef?: React.MutableRefObject<Map<string, Message[]>>; // Mesaj cache'i için ref
}

export function useWebSocket({
  activeAccountRef,
  selectedChatRef,
  contactsCacheRef,
  chatsLoadedRef,
  chatsInitialLoadRef,
  messagesInitialLoadRef,
  chatProfilePictures,
  chats,
  selectedChat,
  setChats,
  setMessages,
  setChatProfilePictures,
  setSelectedChat,
  queueProfilePicture,
  loadChats,
  updateMessagesCache,
  messagesCacheRef,
}: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('[WebSocket] Bağlanılıyor:', wsUrl);
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[WebSocket] ✅ Bağlantı kuruldu');
          reconnectTimeout = null;
          
          // Bağlantı kurulduğunda aktif hesabı bildir (opsiyonel)
          const currentActiveAccount = activeAccountRef.current;
          if (currentActiveAccount) {
            console.log('[WebSocket] Aktif hesap:', currentActiveAccount.id);
          }
        };
        
        ws.onerror = (error) => {
          console.error('[WebSocket] ❌ Hata:', error);
        };
        
        ws.onclose = (event) => {
          console.warn('[WebSocket] ⚠️ Bağlantı kapandı:', event.code, event.reason);
          wsRef.current = null;
          
          // Normal kapanma kodları (1000, 1001) için yeniden bağlanma
          // Anormal kapanma kodları için daha uzun bekle
          const isNormalClose = event.code === 1000 || event.code === 1001;
          const reconnectDelay = isNormalClose ? 3000 : 5000;
          
          // Otomatik yeniden bağlanma
          if (isMountedRef.current && !reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null; // Timeout'u temizle
              if (isMountedRef.current && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
                console.log('[WebSocket] 🔄 Yeniden bağlanılıyor...');
                connectWebSocket();
              }
            }, reconnectDelay);
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WebSocket] 📨 Mesaj alındı:', data);

            const currentActiveAccount = activeAccountRef.current;
            const currentSelectedChat = selectedChatRef.current;

            // chats.set veya chats.upsert
            if ((data.type === 'chats.set' || data.type === 'chats.upsert') && data.sessionId === currentActiveAccount?.id) {
              console.log('[WebSocket] Sohbet listesi güncelleniyor...', data.chats?.length || 0);

              if (data.chats && Array.isArray(data.chats)) {
                // @lid formatındaki chat'ler için gerçek JID'yi lidJid'den al
                const normalizedChats = data.chats.map((chat: any) => {
                  let chatId = chat.id;
                  
                  // Eğer @lid formatındaysa ve lidJid varsa, gerçek JID'yi kullan
                  if (chat.id && chat.id.includes('@lid') && chat.lidJid) {
                    chatId = chat.lidJid;
                    console.log(`[WebSocket] @lid formatı düzeltildi: ${chat.id} -> ${chatId}`);
                  }
                  
                  return {
                    ...chat,
                    id: normalizeJid(chatId), // Gerçek JID'yi normalize et
                  };
                });
                
                // Profil resimlerini cache'e ekle (sadece yeni chat'ler için)
                normalizedChats.forEach((chat: any) => {
                  if (chat.imgUrl) {
                    setChatProfilePictures(prev => new Map(prev).set(chat.id, chat.imgUrl));
                  }
                  // WebSocket'ten gelen chat'ler için profil fotoğraflarını tekrar yükleme
                  // Sadece ilk yüklemede yüklenecek (useChats hook'unda)
                });
                
                const hasInitialLoad = chatsInitialLoadRef.current.get(data.sessionId);
                
                if (hasInitialLoad && chatsLoadedRef.current.get(data.sessionId)) {
                  // Chat listesi zaten yüklü, sadece yeni/güncellenen chat'leri işle
                  if (data.type === 'chats.upsert') {
                    try {
                      setChats(prevChats => {
                        let hasChanges = false;
                        const updatedChats = [...prevChats];

                      normalizedChats.forEach((chat: any) => {
                        // Normalize edilmiş chat ID ile ara
                        const normalizedChatId = normalizeJid(chat.id);
                        const index = updatedChats.findIndex(c => {
                          const cNormalized = normalizeJid(c.id);
                          return cNormalized === normalizedChatId || c.id === normalizedChatId;
                        });
                        
                        if (index >= 0) {
                          const oldChat = updatedChats[index];
                          const newUnreadCount = chat.unreadCount ?? oldChat.unreadCount;
                          const newTimestamp = chat.conversationTimestamp || oldChat.conversationTimestamp;
                          
                          if (newUnreadCount !== oldChat.unreadCount || newTimestamp !== oldChat.conversationTimestamp) {
                            updatedChats[index] = {
                              ...oldChat,
                              id: normalizedChatId, // Normalize edilmiş JID kullan
                              unreadCount: newUnreadCount,
                              conversationTimestamp: newTimestamp,
                              name: chat.name || oldChat.name,
                              verifiedName: chat.verifiedName || oldChat.verifiedName,
                              profilePicture: chat.imgUrl || oldChat.profilePicture,
                              archived: chat.archived ?? oldChat.archived,
                            };
                            hasChanges = true;
                          }
                        } else {
                          // Yeni chat - contact bilgilerini kontrol et
                          const cached = contactsCacheRef.current.get(data.sessionId);
                          const contactsMap = cached ? cached.data : new Map<string, any>();
                          const contact = contactsMap.get(normalizedChatId);
                          
                          let displayName = chat.name || chat.displayName || normalizedChatId;
                          let verifiedName = chat.verifiedName;
                          
                          if (!normalizedChatId.includes('@g.us') && contact) {
                            verifiedName = contact.verifiedName || chat.verifiedName;
                            displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || normalizedChatId;
                          } else if (!normalizedChatId.includes('@g.us')) {
                            // Telefon numarasını göster
                            const phoneMatch = normalizedChatId.match(/^(\d+)@/);
                            if (phoneMatch) {
                              displayName = phoneMatch[1];
                            }
                          }
                          
                          updatedChats.push({
                            id: normalizedChatId, // Normalize edilmiş JID kullan
                            name: displayName,
                            verifiedName: verifiedName,
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
                  }
                } else if (data.type === 'chats.set') {
                  // İlk bağlantı - tüm sohbetleri set et
                  const cached = contactsCacheRef.current.get(data.sessionId);
                  let contactsMap = cached ? cached.data : new Map<string, any>();
                  
                  // Eğer contact'lar yüklenmemişse, yükle
                  if (contactsMap.size === 0) {
                    try {
                      // API'den contact'ları yükle (async)
                      import('../api').then(async (apiModule) => {
                        const contactsData = await apiModule.getContacts(data.sessionId);
                        if (contactsData && contactsData.length > 0) {
                          contactsData.forEach((contact: any) => {
                            contactsMap.set(contact.id, contact);
                          });
                          contactsCacheRef.current.set(data.sessionId, {
                            data: contactsMap,
                            timestamp: Date.now()
                          });
                          // Chat'leri tekrar formatla ve güncelle
                          const updatedChats = normalizedChats.map((chat: any) => {
                            const contact = contactsMap.get(chat.id);
                            const existingChat = chats.find(c => c.id === chat.id);
                            
                            let displayName = chat.name || chat.displayName || chat.id;
                            let verifiedName = chat.verifiedName;
                            
                            if (!chat.id.includes('@g.us') && contact) {
                              verifiedName = contact.verifiedName || chat.verifiedName;
                              displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || chat.id;
                            } else if (!chat.id.includes('@g.us')) {
                              // Telefon numarasını göster
                              const phoneMatch = chat.id.match(/^(\d+)@/);
                              if (phoneMatch) {
                                displayName = phoneMatch[1];
                              }
                            }
                            
                            return {
                              id: chat.id,
                              name: displayName,
                              verifiedName: verifiedName,
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
                          
                          setChats(updatedChats);
                        }
                      }).catch((error) => {
                        console.warn('[WebSocket] Contact yükleme hatası:', error);
                      });
                    } catch (error) {
                      console.warn('[WebSocket] Contact yükleme hatası:', error);
                    }
                  }
                  
                  try {
                    const formattedChats = normalizedChats.map((chat: any) => {
                      const contact = contactsMap.get(chat.id);
                      const existingChat = chats.find(c => c.id === chat.id);
                    
                    let displayName = chat.name || chat.displayName || chat.id;
                    let verifiedName = chat.verifiedName;
                    
                    if (!chat.id.includes('@g.us') && contact) {
                      verifiedName = contact.verifiedName || chat.verifiedName;
                      displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || chat.id;
                    } else if (!chat.id.includes('@g.us')) {
                      // Telefon numarasını göster
                      const phoneMatch = chat.id.match(/^(\d+)@/);
                      if (phoneMatch) {
                        displayName = phoneMatch[1];
                      }
                    }
                    
                    return {
                      id: chat.id,
                      name: displayName,
                      verifiedName: verifiedName,
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
                  
                  try {
                    setChats(formattedChats);
                    chatsLoadedRef.current.set(data.sessionId, true);
                    console.log('[WebSocket] Sohbet listesi direkt güncellendi:', formattedChats.length);
                  } catch (error) {
                    console.error('[WebSocket] ❌ setChats hatası:', error);
                  }
                  } catch (error) {
                    console.error('[WebSocket] ❌ formattedChats oluşturma hatası:', error);
                  }
                } else if (!hasInitialLoad && loadChats) {
                  // WebSocket'ten chat gelmediyse API'den yükle
                  loadChats(data.sessionId, 50, true);
                }
              }
            } 
            // chats.update
            else if (data.type === 'chats.update' && data.sessionId === currentActiveAccount?.id && data.chat) {
              console.log('[WebSocket] Tek sohbet güncelleniyor...', data.chat.id);
              setChats(prevChats => {
                const index = prevChats.findIndex(c => c.id === data.chat.id);
                if (index >= 0) {
                  const updatedChats = [...prevChats];
                  updatedChats[index] = {
                    ...updatedChats[index],
                    unreadCount: data.chat.unreadCount ?? updatedChats[index].unreadCount,
                    conversationTimestamp: data.chat.conversationTimestamp || updatedChats[index].conversationTimestamp,
                    lastMessage: data.chat.lastMessage || updatedChats[index].lastMessage,
                  };
                  return updatedChats;
                }
                return prevChats;
              });
            } 
            // contacts.set veya contacts.upsert
            else if ((data.type === 'contacts.set' || data.type === 'contacts.upsert') && data.sessionId === currentActiveAccount?.id) {
              console.log('[WebSocket] Kişi listesi güncelleniyor...', data.contacts?.length || 0);
              
              const contactsMap = new Map<string, any>();
              if (data.contacts && Array.isArray(data.contacts)) {
                data.contacts.forEach((contact: any) => {
                  contactsMap.set(contact.id, contact);
                  
                  if (contact.imgUrl) {
                    setChatProfilePictures(prev => new Map(prev).set(contact.id, contact.imgUrl));
                    
                    if (currentSelectedChat && currentSelectedChat.id === contact.id) {
                      setSelectedChat(prev => prev ? { ...prev, profilePicture: contact.imgUrl } : null);
                    }
                  }
                });
                
                contactsCacheRef.current.set(data.sessionId, {
                  data: contactsMap,
                  timestamp: Date.now()
                });
                console.log('[WebSocket] Contact cache güncellendi:', contactsMap.size);
              }
            } 
            // messages.upsert
            // README'ye göre: "In messages.upsert it's recommended to use a loop like for (const message of event.messages)"
            else if (data.type === 'messages.upsert' && data.sessionId === currentActiveAccount?.id) {
              console.log('[WebSocket] 📩 Yeni mesajlar alındı:', data.messages?.length || 0, 'eventType:', data.eventType);
              
              if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
                console.warn('[WebSocket] ⚠️ messages.upsert event boş mesajlar içeriyor');
                return;
              }
              
              // Tüm mesajları chat bazında grupla
              // MESAJ KAYBI OLMAMASI İÇİN: Telefon numarasına göre grupla
              const messagesByChat = new Map<string, any[]>();
              const phoneToChatIdMap = new Map<string, string>(); // Telefon numarası -> normalize edilmiş chatId
              
              for (const msg of data.messages) {
                let chatId = msg.from || msg.key?.remoteJid;
                if (!chatId || chatId.includes('@broadcast')) continue;
                
                // @lid formatındaki chat'ler için gerçek JID'yi bul
                // Eğer mesaj @lid formatındaysa ve lidJid bilgisi varsa, gerçek JID'yi kullan
                if (chatId.includes('@lid')) {
                  // Backend'den gelen chat bilgilerinde lidJid olabilir
                  // Ama mesajlarda genelde direkt gerçek JID gelir, yine de kontrol edelim
                  // Şimdilik normalizeJid ile @lid'i @s.whatsapp.net'e çeviriyoruz
                  // Ama ideal olarak lidJid'den gerçek JID'yi bulmalıyız
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
                  // Eğer bu telefon numarası için zaten bir normalize edilmiş chatId varsa, onu kullan
                  if (phoneToChatIdMap.has(phoneNumber)) {
                    chatId = phoneToChatIdMap.get(phoneNumber)!;
                  } else {
                    // İlk kez görülen telefon numarası, normalize et
                    const normalizedChatId = normalizeJid(chatId);
                    phoneToChatIdMap.set(phoneNumber, normalizedChatId);
                    chatId = normalizedChatId;
                  }
                } else {
                  // Telefon numarası çıkarılamadıysa, normalize et
                  chatId = normalizeJid(chatId);
                }
                
                if (!messagesByChat.has(chatId)) {
                  messagesByChat.set(chatId, []);
                }
                messagesByChat.get(chatId)!.push(msg);
              }
              
              // Her chat için mesajları işle
              // MESAJ KAYBI OLMAMASI İÇİN: Normalize edilmiş chatId kullan
              for (const [chatId, chatMessages] of messagesByChat.entries()) {
                // Grup chat'leri için direkt kullan, bireysel chat'ler için normalize edilmiş chatId kullan
                const normalizedChatId = chatId.includes('@g.us') ? chatId : normalizeJid(chatId);
                const isSelectedChat = currentSelectedChat && (
                  normalizedChatId === currentSelectedChat.id || 
                  (!currentSelectedChat.id.includes('@g.us') && extractPhoneFromJid(normalizedChatId) === extractPhoneFromJid(currentSelectedChat.id))
                );
                
                if (isSelectedChat && chatMessages.length > 0) {
                  // Seçili sohbetin mesajlarıysa ekle (normalize edilmiş chatId kullan)
                  console.log('[WebSocket] Seçili sohbetin mesajlarına yeni mesajlar ekleniyor...', normalizedChatId);
                  
                  setMessages(prev => {
                    const existingIds = new Set(prev.map(m => {
                      const id = m.id || m.key?.id;
                      return id && id.toString().startsWith('temp-') ? id : id;
                    }));
                    
                    // README'ye göre best practice: loop kullan
                    const newMessages: Message[] = [];
                    for (const msg of chatMessages) {
                      const text = msg.text || extractMessageText(msg);
                      const body = msg.body || text;
                      const msgId = msg.id || msg.key?.id || `${msg.timestamp || msg.messageTimestamp || Date.now()}-${Math.random()}`;
                      const fromMe = msg.fromMe !== undefined 
                        ? Boolean(msg.fromMe) 
                        : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
                      
                      // Duplicate kontrolü
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
                    
                    // Temp mesajları kaldır
                    let filteredPrev = prev;
                    newMessages.forEach(newMsg => {
                      if (newMsg.fromMe && newMsg.text) {
                        filteredPrev = filteredPrev.filter(m => {
                          const mId = m.id || m.key?.id;
                          return !(mId && mId.toString().startsWith('temp-') && m.text === newMsg.text && m.fromMe === true);
                        });
                      }
                    });
                    
                    // Birleştir ve sırala (timestamp'e göre ascending - en eski önce)
                    const merged = [...filteredPrev, ...newMessages];
                    merged.sort((a, b) => {
                      const normalizeTimestamp = (ts: number | undefined) => {
                        if (!ts) return 0;
                        // Timestamp milisaniye cinsinden değilse (saniye cinsindense) 1000 ile çarp
                        return ts > 1000000000000 ? ts : ts * 1000;
                      };
                      const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
                      const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
                      return aTime - bTime; // Ascending - en eski önce
                    });
                    
                    // Duplicate kontrolü - aynı ID'ye sahip mesajları kaldır
                    const uniqueMessages = merged.filter((msg, index, self) => {
                      const msgId = msg.id || msg.key?.id;
                      if (!msgId) return true; // ID yoksa tut
                      const firstIndex = self.findIndex(m => (m.id || m.key?.id) === msgId);
                      return firstIndex === index; // İlk bulunan mesajı tut
                    });
                    
                    // Cache'i güncelle (normalize edilmiş chatId kullan)
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
                // MESAJ KAYBI OLMAMASI İÇİN: Normalize edilmiş chatId kullan
                if (chatMessages.length > 0) {
                  // En son mesajı bul (timestamp'e göre sırala)
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
                  const fromMe = lastMessage.fromMe !== undefined 
                    ? Boolean(lastMessage.fromMe) 
                    : (lastMessage.key?.fromMe === true || lastMessage.key?.fromMe === 'true' || lastMessage.key?.fromMe === 1);
                  
                  setChats(prevChats => {
                    // Grup chat'leri için direkt eşleşme ara
                    if (normalizedChatId.includes('@g.us')) {
                      const index = prevChats.findIndex(c => c.id === normalizedChatId);
                      if (index >= 0) {
                        // Mevcut chat'i güncelle
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
                    const phoneNumberRaw = extractPhoneFromJid(normalizedChatId); // Örnek: 905538781507
                    const phoneNumberNormalized = normalizePhoneNumber(phoneNumberRaw); // 05538781507 -> 905538781507
                    
                    // Aynı normalize edilmiş telefon numarasına sahip chat'i ara
                    let index = prevChats.findIndex(c => {
                      if (c.id.includes('@g.us')) return false; // Grup chat'leri hariç
                      const cPhoneRaw = extractPhoneFromJid(c.id); // Chat'in telefon numarasını çıkar
                      const cPhoneNormalized = normalizePhoneNumber(cPhoneRaw); // Normalize et
                      // RAW veya normalize edilmiş telefon numaraları eşleşiyor mu?
                      return cPhoneRaw === phoneNumberRaw || cPhoneNormalized === phoneNumberNormalized;
                    });
                    
                    if (index >= 0) {
                      // Mevcut chat'i güncelle
                      const updatedChats = [...prevChats];
                      const existingChat = updatedChats[index];
                      const normalizedChatId = normalizeJid(chatId); // 905538781507@s.whatsapp.net formatına getir
                      
                      updatedChats[index] = {
                        ...existingChat,
                        id: normalizedChatId, // Her zaman normalize edilmiş JID kullan
                        conversationTimestamp: messageTimestamp,
                        lastMessage: messageText,
                        time: new Date(messageTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                        unreadCount: isSelectedChat ? existingChat.unreadCount : (existingChat.unreadCount || 0) + 1,
                      };
                      
                      // Sıralamayı güncelle (en son mesaj alan chat en üste)
                      updatedChats.sort((a, b) => {
                        const aTime = a.conversationTimestamp || 0;
                        const bTime = b.conversationTimestamp || 0;
                        return Number(bTime) - Number(aTime);
                      });
                      return updatedChats;
                    } else {
                      // Yeni chat oluştur
                      console.log('[WebSocket] Yeni chat oluşturuluyor:', chatId);
                      const cached = contactsCacheRef.current.get(data.sessionId);
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
                      
                      // Normalize edilmiş JID kullan
                      const normalizedChatId = normalizeJid(chatId);
                      
                      const newChat: Chat = {
                        id: normalizedChatId, // Normalize edilmiş JID kullan
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
                      
                      // Yeni chat'i en başa ekle
                      const updatedChats = [newChat, ...prevChats];
                      return updatedChats;
                    }
                  });
                }
              }
            } 
            // messages.set
            else if (data.type === 'messages.set' && data.sessionId === currentActiveAccount?.id && currentSelectedChat) {
              const messagesKey = `${data.sessionId}-${currentSelectedChat.id}`;
              const hasInitialLoad = messagesInitialLoadRef.current.get(messagesKey);
              
              if (hasInitialLoad) {
                console.log('[WebSocket] messages.set event ignore edildi (zaten yüklendi):', data.messages?.length || 0);
                return;
              }
              
              console.log('[WebSocket] Mesaj geçmişi alındı (ilk yükleme):', data.messages?.length || 0);
              
              const chatMessages = (data.messages || []).filter((msg: any) => {
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
                      
                      // Cache'i güncelle
                      if (updateMessagesCache && currentSelectedChat) {
                        updateMessagesCache(currentActiveAccount?.id || '', currentSelectedChat.id, formattedMessages);
                      }
                    } catch (error) {
                      console.error('[WebSocket] ❌ setMessages hatası:', error);
                    }
              }
            }
          } catch (error) {
            console.error('[WebSocket] ❌ Mesaj işleme hatası:', error);
            // Hata oluştuğunda sayfanın çökmesini önle
            // Sadece log'la ve devam et
            if (error instanceof Error) {
              console.error('[WebSocket] Hata detayları:', {
                message: error.message,
                stack: error.stack,
                name: error.name
              });
            }
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] ❌ Hata:', error);
        };

        ws.onclose = (event) => {
          console.log('[WebSocket] 🔌 Bağlantı kapandı', event.code, event.reason);
          wsRef.current = null;
          
          if (isMountedRef.current && !reconnectTimeout) {
            console.log('[WebSocket] 3 saniye sonra yeniden bağlanılacak...');
            reconnectTimeout = setTimeout(() => {
              if (isMountedRef.current && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
                console.log('[WebSocket] Yeniden bağlanılıyor...');
                connectWebSocket();
              }
            }, 3000);
          }
        };
      } catch (error) {
        console.error('[WebSocket] Bağlantı hatası:', error);
        if (isMountedRef.current && !reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            if (isMountedRef.current) {
              connectWebSocket();
            }
          }, 3000);
        }
      }
    };

    connectWebSocket();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // Sadece mount'ta çalış

  return { wsRef };
}
