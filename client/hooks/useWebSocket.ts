import { useEffect, useRef } from 'react';
import { Chat, Message } from '../types';
import { extractMessageText } from '../utils/messageUtils';

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
                // Profil resimlerini cache'e ekle
                data.chats.forEach((chat: any) => {
                  if (chat.imgUrl) {
                    setChatProfilePictures(prev => new Map(prev).set(chat.id, chat.imgUrl));
                  } else if (!chatProfilePictures.has(chat.id)) {
                    queueProfilePicture(data.sessionId, chat.id);
                  }
                });
                
                const hasInitialLoad = chatsInitialLoadRef.current.get(data.sessionId);
                
                if (hasInitialLoad && chatsLoadedRef.current.get(data.sessionId)) {
                  // Chat listesi zaten yüklü, sadece yeni/güncellenen chat'leri işle
                  if (data.type === 'chats.upsert') {
                    setChats(prevChats => {
                      let hasChanges = false;
                      const updatedChats = [...prevChats];
                      
                      data.chats.forEach((chat: any) => {
                        const index = updatedChats.findIndex(c => c.id === chat.id);
                        if (index >= 0) {
                          const oldChat = updatedChats[index];
                          const newUnreadCount = chat.unreadCount ?? oldChat.unreadCount;
                          const newTimestamp = chat.conversationTimestamp || oldChat.conversationTimestamp;
                          
                          if (newUnreadCount !== oldChat.unreadCount || newTimestamp !== oldChat.conversationTimestamp) {
                            updatedChats[index] = {
                              ...oldChat,
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
                          updatedChats.push({
                            id: chat.id,
                            name: chat.name || chat.displayName || chat.id,
                            verifiedName: chat.verifiedName,
                            profilePicture: chat.imgUrl,
                            unreadCount: chat.unreadCount || 0,
                            conversationTimestamp: chat.conversationTimestamp || 0,
                            archived: chat.archived || false,
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
                  }
                } else if (data.type === 'chats.set') {
                  // İlk bağlantı - tüm sohbetleri set et
                  const cached = contactsCacheRef.current.get(data.sessionId);
                  const contactsMap = cached ? cached.data : new Map<string, any>();
                  
                  const formattedChats = data.chats.map((chat: any) => {
                    const contact = contactsMap.get(chat.id);
                    const existingChat = chats.find(c => c.id === chat.id);
                    
                    return {
                      id: chat.id,
                      name: chat.name || chat.displayName || chat.id,
                      verifiedName: contact?.verifiedName || chat.verifiedName,
                      profilePicture: chat.imgUrl || chatProfilePictures.get(chat.id) || existingChat?.profilePicture,
                      unreadCount: chat.unreadCount ?? existingChat?.unreadCount ?? 0,
                      conversationTimestamp: chat.conversationTimestamp || existingChat?.conversationTimestamp || 0,
                      archived: chat.archived ?? existingChat?.archived ?? false,
                      lastMessage: existingChat?.lastMessage || '',
                      time: chat.conversationTimestamp 
                        ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        : existingChat?.time || '',
                    };
                  });
                  
                  setChats(formattedChats);
                  chatsLoadedRef.current.set(data.sessionId, true);
                  console.log('[WebSocket] Sohbet listesi direkt güncellendi:', formattedChats.length);
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
            else if (data.type === 'messages.upsert' && data.sessionId === currentActiveAccount?.id) {
              console.log('[WebSocket] Yeni mesajlar alındı:', data.messages.length);
              
              if (currentSelectedChat && data.messages.some((msg: any) => (msg.from || msg.key?.remoteJid) === currentSelectedChat.id)) {
                // Seçili sohbetin mesajlarıysa ekle
                console.log('[WebSocket] Seçili sohbetin mesajlarına yeni mesajlar ekleniyor...');
                
                setMessages(prev => {
                  const existingIds = new Set(prev.map(m => {
                    const id = m.id || m.key?.id;
                    return id && id.toString().startsWith('temp-') ? id : id;
                  }));
                  
                  const newMessages = data.messages
                    .filter((msg: any) => (msg.from || msg.key?.remoteJid) === currentSelectedChat.id)
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
                    })
                    .filter(msg => {
                      const msgId = msg.id || msg.key?.id;
                      return msgId && !existingIds.has(msgId);
                    });
                  
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
                  
                  return merged;
                });
                
                // Chat listesindeki bilgileri güncelle
                const lastMessage = data.messages
                  .filter((msg: any) => (msg.from || msg.key?.remoteJid) === currentSelectedChat.id)
                  .sort((a: any, b: any) => {
                    const aTime = a.timestamp || a.messageTimestamp || 0;
                    const bTime = b.timestamp || b.messageTimestamp || 0;
                    return bTime - aTime;
                  })[0];
                
                if (lastMessage) {
                  const messageText = lastMessage.text || extractMessageText(lastMessage) || '';
                  const messageTimestamp = lastMessage.timestamp || lastMessage.messageTimestamp || Math.floor(Date.now() / 1000);
                  
                  setChats(prevChats => {
                    const index = prevChats.findIndex(c => c.id === currentSelectedChat.id);
                    if (index >= 0) {
                      const updatedChats = [...prevChats];
                      updatedChats[index] = {
                        ...updatedChats[index],
                        conversationTimestamp: messageTimestamp,
                        lastMessage: messageText,
                        time: new Date(messageTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                      };
                      return updatedChats;
                    }
                    return prevChats;
                  });
                }
              } else {
                // Seçili olmayan sohbetlere mesaj geldi
                const affectedChats = new Map<string, { text: string, timestamp: number }>();
                data.messages.forEach((msg: any) => {
                  const msgFrom = msg.from || msg.key?.remoteJid;
                  if (msgFrom && msgFrom !== currentSelectedChat?.id) {
                    const messageText = msg.text || extractMessageText(msg) || '';
                    const messageTimestamp = msg.timestamp || msg.messageTimestamp || Math.floor(Date.now() / 1000);
                    const existing = affectedChats.get(msgFrom);
                    if (!existing || messageTimestamp > existing.timestamp) {
                      affectedChats.set(msgFrom, { text: messageText, timestamp: messageTimestamp });
                    }
                  }
                });
                
                if (affectedChats.size > 0) {
                  setChats(prevChats => {
                    let hasChanges = false;
                    const updatedChats = prevChats.map(chat => {
                      const chatUpdate = affectedChats.get(chat.id);
                      if (chatUpdate) {
                        hasChanges = true;
                        return {
                          ...chat,
                          unreadCount: (chat.unreadCount || 0) + 1,
                          conversationTimestamp: chatUpdate.timestamp,
                          lastMessage: chatUpdate.text,
                          time: new Date(chatUpdate.timestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                        };
                      }
                      return chat;
                    });
                    return hasChanges ? updatedChats : prevChats;
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
                
                messagesInitialLoadRef.current.set(messagesKey, true);
                setMessages(formattedMessages);
              }
            }
          } catch (error) {
            console.error('[WebSocket] Mesaj parse hatası:', error);
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
