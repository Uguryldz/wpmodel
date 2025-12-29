import { useState, useRef, useCallback, useEffect } from 'react';
import * as api from '../api';
import { Chat, Message } from '../types';
import { normalizeJid, extractPhoneFromJid, normalizePhoneNumber } from '../utils/contactUtils';

interface UseChatsProps {
  activeAccountId: string | undefined;
  contactsMap: Map<string, any>;
  chatProfilePictures: Map<string, string>;
  setChatProfilePictures: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  queueProfilePicture: (sessionId: string, jid: string) => void;
  messagesCacheRef?: React.MutableRefObject<Map<string, Message[]>>; // Mesaj cache'i için ref
}

export function useChats({ 
  activeAccountId, 
  contactsMap, 
  chatProfilePictures, 
  setChatProfilePictures,
  queueProfilePicture,
  messagesCacheRef
}: UseChatsProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups' | 'archived'>('all');
  const chatsLoadedRef = useRef<Map<string, boolean>>(new Map());
  const chatsInitialLoadRef = useRef<Map<string, boolean>>(new Map());
  const selectedChatRef = useRef<Chat | null>(null);
  const contactsMapRef = useRef<Map<string, any>>(contactsMap);
  const lastContactsMapSizeRef = useRef<number>(contactsMap.size);
  const chatsProfilePicturesLoadedRef = useRef<Map<string, boolean>>(new Map()); // Hangi session için profil fotoğrafları yüklendi

  // Duplicate chat'leri kaldır ve birleştir - SADECE TELEFON NUMARASI ÜZERİNDEN
  // MESAJ KAYBI OLMAMASI İÇİN: Eski chat'in mesajlarını yeni chat'e aktar
  const removeDuplicateChats = useCallback((chats: Chat[], sessionId?: string): Chat[] => {
    const phoneToChatMap = new Map<string, Chat>(); // Telefon numarası -> Chat mapping (UNIQUE KEY)
    const oldJidToNewJidMap = new Map<string, string>(); // Eski JID -> Yeni normalize edilmiş JID mapping
    
    for (const chat of chats) {
      // @lid formatındaki chat'ler için gerçek JID'yi lidJid'den al
      let chatId = chat.id;
      const chatAny = chat as any;
      if (chat.id && chat.id.includes('@lid') && chatAny.lidJid) {
        // Gerçek JID'yi lidJid'den al
        chatId = chatAny.lidJid;
        console.log(`[removeDuplicateChats] @lid formatı düzeltildi: ${chat.id} -> ${chatId}`);
      }
      
      // Grup chat'leri için duplicate kontrolü yapma (grup chat'lerde telefon numarası yok)
      if (chatId.includes('@g.us')) {
        // Grup chat'leri için JID'yi direkt kullan
        if (!phoneToChatMap.has(chatId)) {
          phoneToChatMap.set(chatId, { ...chat, id: chatId });
        }
        continue;
      }
      
      // Bireysel chat'ler için: SADECE TELEFON NUMARASINI ÇIKAR
      const phoneNumber = extractPhoneFromJid(chatId); // Örnek: 905538781507
      
      if (!phoneNumber) {
        // Telefon numarası çıkarılamadıysa, normalize edilmiş JID'yi direkt kullan
        const normalizedJid = normalizeJid(chatId);
        if (!phoneToChatMap.has(normalizedJid)) {
          phoneToChatMap.set(normalizedJid, { ...chat, id: normalizedJid });
        }
        continue;
      }
      
      // Normalize edilmiş telefon numarasını oluştur
      const phoneNumberNormalized = normalizePhoneNumber(phoneNumber); // 05538781507 -> 905538781507
      
      // Normalize edilmiş JID'yi oluştur
      const normalizedJid = normalizeJid(chatId); // 905538781507@s.whatsapp.net formatına getir
      
      // Eğer bu telefon numarası için zaten bir chat varsa (DUPLICATE)
      if (phoneToChatMap.has(phoneNumberNormalized)) {
        const existingChat = phoneToChatMap.get(phoneNumberNormalized)!;
        
        // MESAJ KAYBI OLMAMASI İÇİN: Eski chat'in mesajlarını yeni chat'e aktar
        if (messagesCacheRef && sessionId) {
          // Eski chat'in JID'sini normalize et (eğer @lid formatındaysa)
          let oldJid = existingChat.id;
          const existingChatAny = existingChat as any;
          if (oldJid && oldJid.includes('@lid') && existingChatAny.lidJid) {
            oldJid = existingChatAny.lidJid;
          }
          oldJid = normalizeJid(oldJid);
          const newJid = normalizedJid;
          
          // Eski chat'in mesajlarını al
          const oldMessagesKey = `${sessionId}-${oldJid}`;
          const oldMessages = messagesCacheRef.current.get(oldMessagesKey);
          
          // Yeni chat'in mesajlarını al
          const newMessagesKey = `${sessionId}-${newJid}`;
          const newMessages = messagesCacheRef.current.get(newMessagesKey);
          
          // Mesajları birleştir (duplicate kontrolü ile)
          if (oldMessages && oldMessages.length > 0) {
            if (newMessages && newMessages.length > 0) {
              // Her iki cache'de de mesaj var, birleştir
              const existingIds = new Set(newMessages.map(m => m.id || m.key?.id));
              const mergedMessages = [
                ...newMessages,
                ...oldMessages.filter(m => {
                  const msgId = m.id || m.key?.id;
                  return msgId && !existingIds.has(msgId);
                })
              ].sort((a, b) => {
                const aTime = a.timestamp || a.messageTimestamp || 0;
                const bTime = b.timestamp || b.messageTimestamp || 0;
                return aTime - bTime;
              });
              
              // Birleştirilmiş mesajları yeni JID'ye kaydet
              messagesCacheRef.current.set(newMessagesKey, mergedMessages);
              // Eski JID'yi temizle
              messagesCacheRef.current.delete(oldMessagesKey);
              console.log('[useChats] ✅ Mesajlar birleştirildi:', { eski: oldMessages.length, yeni: newMessages.length, birleşik: mergedMessages.length });
            } else {
              // Sadece eski chat'te mesaj var, yeni chat'e aktar
              messagesCacheRef.current.set(newMessagesKey, oldMessages);
              messagesCacheRef.current.delete(oldMessagesKey);
              console.log('[useChats] ✅ Mesajlar aktarıldı:', { eski: oldMessages.length });
            }
          }
          
          // JID mapping'i kaydet (WebSocket'ten gelen mesajlar için)
          oldJidToNewJidMap.set(oldJid, newJid);
        }
        
        // Daha yeni olan chat'i seç (conversationTimestamp'e göre)
        const existingTime = existingChat.conversationTimestamp || 0;
        const newTime = chat.conversationTimestamp || 0;
        
        if (newTime > existingTime) {
          // Yeni chat daha yeni, eski chat'i güncelle
          const mergedChat: Chat = {
            ...chat,
            id: normalizedJid, // Normalize edilmiş JID kullan
            // Eski chat'ten gelen bilgileri koru (eğer yeni chat'te yoksa)
            name: chat.name || existingChat.name,
            verifiedName: chat.verifiedName || existingChat.verifiedName,
            profilePicture: chat.profilePicture || existingChat.profilePicture,
            unreadCount: (existingChat.unreadCount || 0) + (chat.unreadCount || 0),
            // En yeni mesajı kullan
            lastMessage: chat.lastMessage || existingChat.lastMessage,
            time: chat.time || existingChat.time,
          };
          
          // Eski chat'i kaldır ve yeni chat'i ekle
          phoneToChatMap.delete(phoneNumberNormalized);
          phoneToChatMap.set(phoneNumberNormalized, mergedChat);
        } else {
          // Eski chat daha yeni, sadece unreadCount'u güncelle ve JID'yi normalize et
          existingChat.unreadCount = (existingChat.unreadCount || 0) + (chat.unreadCount || 0);
          existingChat.id = normalizedJid; // JID'yi normalize et
        }
      } else {
        // İlk kez görülen telefon numarası
        const normalizedChat: Chat = {
          ...chat,
          id: normalizedJid, // Normalize edilmiş JID kullan
        };
        // Normalize edilmiş telefon numarasını KEY olarak kullan
        phoneToChatMap.set(phoneNumberNormalized, normalizedChat);
      }
    }
    
    // Map'ten chat'leri al (telefon numarası key'lerini kullanarak)
    return Array.from(phoneToChatMap.values());
  }, [messagesCacheRef, activeAccountId]);

  // contactsMap'i ref'te tut - her zaman güncel değeri kullan
  useEffect(() => {
    const prevSize = contactsMapRef.current.size;
    contactsMapRef.current = contactsMap;
    const newSize = contactsMap.size;
    
    // Kişi listesi yüklendiğinde mevcut sohbetleri yeniden formatla
    if (newSize > 0 && newSize !== prevSize && chats.length > 0) {
      console.log('Kişi listesi güncellendi, sohbetler yeniden formatlanıyor...', { 
        contactsMapSize: newSize, 
        chatsCount: chats.length 
      });
      
      setChats(prevChats => prevChats.map(chat => {
        // Grup sohbetlerini atla
        if (chat.id.includes('@g.us')) {
          return chat;
        }
        
        const contact = contactsMap.get(chat.id);
        if (contact) {
          const verifiedName = contact.verifiedName || chat.verifiedName;
          const displayName = verifiedName || contact.verifiedName || contact.name || contact.notify || chat.name || chat.id;
          
          // Sadece isim değiştiyse güncelle
          if (displayName !== chat.name || verifiedName !== chat.verifiedName) {
            return {
              ...chat,
              name: displayName,
              verifiedName: verifiedName,
            };
          }
        }
        
        return chat;
      }));
      
      lastContactsMapSizeRef.current = newSize;
    } else if (newSize > lastContactsMapSizeRef.current) {
      lastContactsMapSizeRef.current = newSize;
    }
  }, [contactsMap, chats.length]); // contactsMap değiştiğinde tetikle

  const loadChats = useCallback(async (sessionId: string, limit: number = 50, force: boolean = false) => {
    try {
      // Temp session'lar için API çağrısı yapma (geçersiz session'lar)
      if (sessionId.startsWith('temp-') || sessionId.startsWith('account-')) {
        console.log('[useChats] ⚠️ Temp session için loadChats çağrıldı, atlanıyor:', sessionId);
        return;
      }
      
      // WebSocket'ten chat'ler geliyor, API çağrısı sadece fallback olarak kullanılacak
      const isLoaded = chatsLoadedRef.current.get(sessionId);
      const hasInitialLoad = chatsInitialLoadRef.current.get(sessionId);
      
      // Eğer zaten yüklendiyse ve force değilse, WebSocket'ten gelen güncellemeleri bekle
      if (!force && isLoaded && hasInitialLoad) {
        console.log('[useChats] Sohbetler WebSocket\'ten yüklendi, API çağrısı yapılmıyor');
        return;
      }
      
      // WebSocket'ten chats.set gelmediyse, API'den yükle (fallback)
      // WebSocket bağlantısı kurulduğunda chats.set event'i gelecek
      // Eğer 5 saniye içinde gelmezse, API'den yükle
      if (!hasInitialLoad) {
        console.log('[useChats] WebSocket\'ten chats.set bekleniyor, 5 saniye sonra API fallback devreye girecek...');
        
        const fallbackTimeout = setTimeout(async () => {
          const stillNotLoaded = !chatsInitialLoadRef.current.get(sessionId);
          if (stillNotLoaded) {
            console.warn('[useChats] WebSocket\'ten chats.set gelmedi, API\'den yükleniyor (fallback)...');
            
            try {
              const chatsData = await api.getChats(sessionId, limit);
              
              if (chatsData && chatsData.length > 0) {
                // API'den gelen chat'leri formatla ve set et
                const normalizedChats = chatsData.map((chat: any) => {
                  let chatId = chat.id;
                  if (chat.id && chat.id.includes('@lid') && chat.lidJid) {
                    chatId = chat.lidJid;
                  }
                  return {
                    ...chat,
                    id: normalizeJid(chatId),
                  };
                });
                
                const formattedChats = normalizedChats.map((chat: any) => {
                  const contact = contactsMapRef.current.get(chat.id);
                  let displayName = chat.name || chat.displayName || chat.id;
                  let verifiedName = chat.verifiedName;
                  
                  if (!chat.id.includes('@g.us') && contact) {
                    verifiedName = contact.verifiedName || chat.verifiedName;
                    displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || chat.id;
                  } else if (!chat.id.includes('@g.us')) {
                    const phoneMatch = chat.id.match(/^(\d+)@/);
                    if (phoneMatch) {
                      displayName = phoneMatch[1];
                    }
                  }
                  
                  return {
                    ...chat,
                    name: displayName,
                    verifiedName: verifiedName,
                    profilePicture: chat.imgUrl || chatProfilePictures.get(chat.id),
                    archived: chat.archived || false,
                    lastMessage: '',
                    time: chat.conversationTimestamp 
                      ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                      : '',
                  };
                });
                
                const deduplicatedChats = removeDuplicateChats(formattedChats, sessionId);
                setChats(deduplicatedChats);
                chatsLoadedRef.current.set(sessionId, true);
                chatsInitialLoadRef.current.set(sessionId, true);
                console.log('[useChats] ✅ API fallback ile sohbetler yüklendi:', deduplicatedChats.length);
              }
            } catch (error) {
              console.error('[useChats] ❌ API fallback hatası:', error);
            }
          }
        }, 5000); // 5 saniye bekle
        
        // Cleanup function - eğer WebSocket'ten chats.set gelirse timeout'u iptal et
        return () => {
          clearTimeout(fallbackTimeout);
        };
      }
      
      // Force reload durumunda API'den yükle
      if (force) {
        console.log('[useChats] Force reload: API\'den yükleniyor...');
        
        const chatsData = await api.getChats(sessionId, limit);
        
        if (chatsData && chatsData.length > 0) {
          const normalizedChats = chatsData.map((chat: any) => {
            let chatId = chat.id;
            if (chat.id && chat.id.includes('@lid') && chat.lidJid) {
              chatId = chat.lidJid;
            }
            return {
              ...chat,
              id: normalizeJid(chatId),
            };
          });
          
          const formattedChats = normalizedChats.map((chat: any) => {
            const contact = contactsMapRef.current.get(chat.id);
            let displayName = chat.name || chat.displayName || chat.id;
            let verifiedName = chat.verifiedName;
            
            if (!chat.id.includes('@g.us') && contact) {
              verifiedName = contact.verifiedName || chat.verifiedName;
              displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.displayName || chat.id;
            } else if (!chat.id.includes('@g.us')) {
              const phoneMatch = chat.id.match(/^(\d+)@/);
              if (phoneMatch) {
                displayName = phoneMatch[1];
              }
            }
            
            return {
              ...chat,
              name: displayName,
              verifiedName: verifiedName,
              profilePicture: chat.imgUrl || chatProfilePictures.get(chat.id),
              archived: chat.archived || false,
              lastMessage: '',
              time: chat.conversationTimestamp 
                ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : '',
            };
          });
          
          const deduplicatedChats = removeDuplicateChats(formattedChats, sessionId);
          setChats(deduplicatedChats);
          chatsLoadedRef.current.set(sessionId, true);
          chatsInitialLoadRef.current.set(sessionId, true);
          console.log('[useChats] ✅ Force reload ile sohbetler yüklendi:', deduplicatedChats.length);
        }
        return;
      }
    } catch (error: any) {
      console.error('[useChats] ❌ loadChats hatası:', error);
    }
  }, [chatProfilePictures, setChatProfilePictures, queueProfilePicture, removeDuplicateChats]); // removeDuplicateChats dependency olarak eklendi

  return {
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    chatSearchTerm,
    setChatSearchTerm,
    chatFilter,
    setChatFilter,
    chatsLoadedRef,
    chatsInitialLoadRef,
    selectedChatRef,
    loadChats,
  };
}
