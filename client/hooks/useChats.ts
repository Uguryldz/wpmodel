import { useState, useRef, useCallback, useEffect } from 'react';
import * as api from '../api';
import { Chat, Message } from '../types';
import { extractMessageText } from '../utils/messageUtils';
import { normalizeJid, areJidsSamePerson, extractPhoneFromJid, normalizePhoneNumber } from '../utils/contactUtils';

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
      // Grup chat'leri için duplicate kontrolü yapma (grup chat'lerde telefon numarası yok)
      if (chat.id.includes('@g.us')) {
        // Grup chat'leri için JID'yi direkt kullan
        if (!phoneToChatMap.has(chat.id)) {
          phoneToChatMap.set(chat.id, chat);
        }
        continue;
      }
      
      // Bireysel chat'ler için: SADECE TELEFON NUMARASINI ÇIKAR
      const phoneNumber = extractPhoneFromJid(chat.id); // Örnek: 905538781507
      
      if (!phoneNumber) {
        // Telefon numarası çıkarılamadıysa, JID'yi direkt kullan
        if (!phoneToChatMap.has(chat.id)) {
          phoneToChatMap.set(chat.id, chat);
        }
        continue;
      }
      
      // Normalize edilmiş telefon numarasını oluştur
      const phoneNumberNormalized = normalizePhoneNumber(phoneNumber); // 05538781507 -> 905538781507
      
      // Normalize edilmiş JID'yi oluştur
      const normalizedJid = normalizeJid(chat.id); // 905538781507@s.whatsapp.net formatına getir
      
      // Eğer bu telefon numarası için zaten bir chat varsa (DUPLICATE)
      if (phoneToChatMap.has(phoneNumberNormalized)) {
        const existingChat = phoneToChatMap.get(phoneNumberNormalized)!;
        
        // MESAJ KAYBI OLMAMASI İÇİN: Eski chat'in mesajlarını yeni chat'e aktar
        if (messagesCacheRef && sessionId) {
          const oldJid = existingChat.id;
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
      // chats state'ini kontrol etmek yerine ref kullan
      const isLoaded = chatsLoadedRef.current.get(sessionId);
      if (!force && isLoaded) {
        console.log('Sohbetler zaten yüklü, tekrar yüklenmiyor');
        // Yine de DB'den güncel veriyi kontrol et (senkronizasyon için)
        // Ama sadece arka planda güncelle
        setTimeout(async () => {
          try {
            const chatsData = await api.getChats(sessionId, limit);
            if (chatsData && chatsData.length > 0) {
              // Mevcut chat'leri güncelle (sessizce)
              setChats(prevChats => {
                const updatedChats = [...prevChats];
                chatsData.forEach((newChat: any) => {
                  // Grup chat'leri için direkt eşleşme ara
                  if (newChat.id.includes('@g.us')) {
                    const index = updatedChats.findIndex(c => c.id === newChat.id);
                    if (index >= 0) {
                      // Mevcut chat'i güncelle
                      updatedChats[index] = {
                        ...updatedChats[index],
                        unreadCount: newChat.unreadCount ?? updatedChats[index].unreadCount,
                        conversationTimestamp: newChat.conversationTimestamp || updatedChats[index].conversationTimestamp,
                        name: newChat.name || updatedChats[index].name,
                        verifiedName: newChat.verifiedName || updatedChats[index].verifiedName,
                        profilePicture: newChat.imgUrl || updatedChats[index].profilePicture,
                        archived: newChat.archived ?? updatedChats[index].archived,
                        pinned: newChat.pinned ? new Date(newChat.pinned) : updatedChats[index].pinned,
                      };
                    } else {
                      // Yeni grup chat ekle
                      updatedChats.push({
                        id: newChat.id,
                        name: newChat.name || newChat.displayName || newChat.id,
                        verifiedName: newChat.verifiedName,
                        profilePicture: newChat.imgUrl,
                        unreadCount: newChat.unreadCount || 0,
                        conversationTimestamp: newChat.conversationTimestamp || null,
                        archived: newChat.archived || false,
                        pinned: newChat.pinned ? new Date(newChat.pinned) : null,
                        lastMessage: '',
                        time: newChat.conversationTimestamp 
                          ? new Date(Number(newChat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                          : '',
                      });
                    }
                    return; // Grup chat'i işlendi, devam et
                  }
                  
                  // Bireysel chat'ler için: SADECE TELEFON NUMARASINA GÖRE ARA
                  const phoneNumber = extractPhoneFromJid(newChat.id); // Örnek: 905538781507
                  const phoneNumberNormalized = normalizePhoneNumber(phoneNumber); // Normalize et
                  
                  // Aynı telefon numarasına sahip chat'i ara
                  let index = updatedChats.findIndex(c => {
                    if (c.id.includes('@g.us')) return false; // Grup chat'leri hariç
                    const cPhone = extractPhoneFromJid(c.id); // Chat'in telefon numarasını çıkar
                    const cPhoneNormalized = normalizePhoneNumber(cPhone); // Normalize et
                    return cPhoneNormalized === phoneNumberNormalized || cPhone === phoneNumber; // Telefon numaraları eşleşiyor mu?
                  });
                  
                  if (index >= 0) {
                    // Mevcut chat'i güncelle (telefon numarasına göre bulundu)
                    const existingChat = updatedChats[index];
                    const normalizedJid = normalizeJid(newChat.id); // 905538781507@s.whatsapp.net formatına getir
                    updatedChats[index] = {
                      ...existingChat,
                      id: normalizedJid, // Her zaman normalize edilmiş JID kullan
                      unreadCount: newChat.unreadCount ?? existingChat.unreadCount,
                      conversationTimestamp: newChat.conversationTimestamp || existingChat.conversationTimestamp,
                      name: newChat.name || existingChat.name,
                      verifiedName: newChat.verifiedName || existingChat.verifiedName,
                      profilePicture: newChat.imgUrl || existingChat.profilePicture,
                      archived: newChat.archived ?? existingChat.archived,
                      pinned: newChat.pinned ? new Date(newChat.pinned) : existingChat.pinned,
                    };
                  } else {
                    // Yeni chat ekle (bu telefon numarası için ilk kez görülüyor)
                    const normalizedJid = normalizeJid(newChat.id); // 905538781507@s.whatsapp.net formatına getir
                    updatedChats.push({
                      id: normalizedJid, // Normalize edilmiş JID kullan
                      name: newChat.name || newChat.displayName || normalizedJid,
                      verifiedName: newChat.verifiedName,
                      profilePicture: newChat.imgUrl,
                      unreadCount: newChat.unreadCount || 0,
                      conversationTimestamp: newChat.conversationTimestamp || null,
                      archived: newChat.archived || false,
                      pinned: newChat.pinned ? new Date(newChat.pinned) : null,
                      lastMessage: '',
                      time: newChat.conversationTimestamp 
                        ? new Date(Number(newChat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        : '',
                    });
                  }
                });
                
                // Duplicate'leri temizle
                const deduplicated = removeDuplicateChats(updatedChats);
                
                return deduplicated.sort((a, b) => {
                  const aTime = a.conversationTimestamp || 0;
                  const bTime = b.conversationTimestamp || 0;
                  return Number(bTime) - Number(aTime);
                });
              });
            }
          } catch (error) {
            // Sessizce devam et
            console.debug('Arka plan chat güncelleme hatası:', error);
          }
        }, 5000); // 5 saniye sonra arka planda güncelle
        return;
      }
      
      console.log('=== Sohbetler yükleniyor ===', { sessionId, limit, force });
      
      const chatsData = await api.getChats(sessionId, limit);
      
      console.log('Sohbetler alındı (ham data):', chatsData);
      
      if (!chatsData || chatsData.length === 0) {
        console.warn('Sohbet listesi boş!');
        // DB'den tekrar dene (fallback)
        try {
          const dbChats = await api.getChats(sessionId, limit);
          if (dbChats && dbChats.length > 0) {
            console.log('DB\'den sohbetler yüklendi:', dbChats.length);
            chatsData = dbChats;
          }
        } catch (dbError) {
          console.error('DB\'den sohbetler yüklenemedi:', dbError);
        }
        
        if (!chatsData || chatsData.length === 0) {
          return;
        }
      }
      
      chatsLoadedRef.current.set(sessionId, true);
      
      // Bu session için profil fotoğrafları zaten yüklendiyse tekrar yükleme
      const alreadyLoaded = chatsProfilePicturesLoadedRef.current.get(sessionId);
      
      const sortedChats = [...chatsData].sort((a, b) => {
        const aTime = a.conversationTimestamp || (a as any).lastMsgTimestamp || 0;
        const bTime = b.conversationTimestamp || (b as any).lastMsgTimestamp || 0;
        return Number(bTime) - Number(aTime);
      }).slice(0, limit);
      
      // Güncel contactsMap'i ref'ten al
      const currentContactsMap = contactsMapRef.current;
      
      // Eğer contact'lar yüklenmemişse, önce yükle
      if (currentContactsMap.size === 0) {
        try {
          console.log('Contact\'lar yüklenmemiş, yükleniyor...');
          const contactsData = await api.getContacts(sessionId);
          if (contactsData && contactsData.length > 0) {
            contactsData.forEach((contact: any) => {
              currentContactsMap.set(contact.id, contact);
            });
            contactsMapRef.current = currentContactsMap;
            console.log('Contact\'lar yüklendi:', contactsData.length);
          }
        } catch (contactError) {
          console.warn('Contact\'lar yüklenemedi:', contactError);
        }
      }
      
      // JID'leri normalize et ve duplicate'leri kaldır
      // @lid formatındaki chat'ler için lidJid'den gerçek JID'yi kullan
      const normalizedChats = sortedChats.map(chat => {
        let chatId = chat.id;
        
        // Eğer @lid formatındaysa ve lidJid varsa, gerçek JID'yi kullan
        if (chat.id && chat.id.includes('@lid') && (chat as any).lidJid) {
          chatId = (chat as any).lidJid;
          console.log(`[useChats] @lid formatı düzeltildi: ${chat.id} -> ${chatId}`);
        }
        
        return {
          ...chat,
          id: normalizeJid(chatId), // Gerçek JID'yi normalize et
        };
      });
      
      const formattedChats = normalizedChats.map(chat => {
        let lastMessage = '';
        if (chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0) {
          const lastMsg = chat.messages[chat.messages.length - 1];
          lastMessage = extractMessageText(lastMsg);
        } else if ((chat as any).lastMessage) {
          lastMessage = extractMessageText((chat as any).lastMessage);
        }
        
        let displayName = chat.name || (chat as any).displayName || chat.id;
        let verifiedName: string | undefined = chat.verifiedName || undefined;
        let profilePicture: string | undefined = chatProfilePictures.get(chat.id);
        
        if (!chat.id.includes('@g.us')) {
          const contact = currentContactsMap.get(chat.id);
          if (contact) {
            verifiedName = verifiedName || contact.verifiedName;
            // Contact bilgilerini önceliklendir - telefon rehberindeki isim öncelikli
            displayName = contact.verifiedName || contact.name || contact.notify || chat.name || chat.id;
            
            if (contact.imgUrl) {
              profilePicture = contact.imgUrl;
              if (!chatProfilePictures.has(chat.id)) {
                setChatProfilePictures(prev => new Map(prev).set(chat.id, contact.imgUrl));
              }
            } else if (!chatProfilePictures.has(chat.id) && !alreadyLoaded) {
              // Sadece ilk yüklemede profil fotoğraflarını çek
              queueProfilePicture(sessionId, chat.id);
            } else {
              const cached = chatProfilePictures.get(chat.id);
              profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
            }
          } else {
            // Contact yoksa, telefon numarasını göster
            const phoneMatch = chat.id.match(/^(\d+)@/);
            if (phoneMatch) {
              displayName = phoneMatch[1];
            } else {
              displayName = chat.name || chat.displayName || chat.id;
            }
            
            // Contact bilgilerini tekrar kontrol et (yukarıda yüklendi)
            const foundContact = currentContactsMap.get(chat.id);
            if (foundContact) {
              verifiedName = foundContact.verifiedName;
              displayName = foundContact.verifiedName || foundContact.name || foundContact.notify || displayName;
              if (foundContact.imgUrl) {
                profilePicture = foundContact.imgUrl;
                if (!chatProfilePictures.has(chat.id)) {
                  setChatProfilePictures(prev => new Map(prev).set(chat.id, foundContact.imgUrl));
                }
              }
            }
            
            if (!chatProfilePictures.has(chat.id) && !alreadyLoaded) {
              // Sadece ilk yüklemede profil fotoğraflarını çek
              queueProfilePicture(sessionId, chat.id);
            } else {
              const cached = chatProfilePictures.get(chat.id);
              profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
            }
          }
        } else {
          if (!chatProfilePictures.has(chat.id) && !alreadyLoaded) {
            // Sadece ilk yüklemede profil fotoğraflarını çek
            queueProfilePicture(sessionId, chat.id);
          } else {
            const cached = chatProfilePictures.get(chat.id);
            profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
          }
        }
        
        return {
          ...chat,
          name: displayName,
          verifiedName: verifiedName,
          profilePicture: profilePicture,
          archived: chat.archived || false,
          lastMessage: lastMessage || '',
          time: chat.conversationTimestamp 
            ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            : (chat as any).lastMsgTimestamp
            ? new Date(Number((chat as any).lastMsgTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            : '',
        };
      });
      
      console.log('Formatlanmış sohbetler:', formattedChats);
      
      // Duplicate chat'leri birleştir (aynı telefon numarasına sahip chat'ler)
      // MESAJ KAYBI OLMAMASI İÇİN: sessionId parametresini geç
      const deduplicatedChats = removeDuplicateChats(formattedChats, sessionId);
      if (formattedChats.length !== deduplicatedChats.length) {
        console.log('✅ Duplicate chat\'ler temizlendi (mesajlar birleştirildi):', { önce: formattedChats.length, sonra: deduplicatedChats.length });
      }
      
      // İlk yüklemede profil fotoğrafları yüklendiğini işaretle
      if (!alreadyLoaded) {
        chatsProfilePicturesLoadedRef.current.set(sessionId, true);
      }
      
      setChats(deduplicatedChats);
      setSelectedChat(prev => {
        if (!prev) {
          // Sadece selectedChat yoksa, ilk chat'i seç
          if (deduplicatedChats.length > 0) {
            return deduplicatedChats[0];
          }
          return null;
        }
        
        // Grup chat'leri için direkt eşleşme ara
        if (prev.id.includes('@g.us')) {
          const foundChat = deduplicatedChats.find(c => c.id === prev.id);
          return foundChat || prev;
        }
        
        // Bireysel chat'ler için: SADECE TELEFON NUMARASINA GÖRE ARA
        const prevPhone = extractPhoneFromJid(prev.id); // Örnek: 905538781507
        const foundChat = deduplicatedChats.find(c => {
          if (c.id.includes('@g.us')) return false; // Grup chat'leri hariç
          const cPhone = extractPhoneFromJid(c.id); // Chat'in telefon numarasını çıkar
          return cPhone === prevPhone; // Telefon numaraları eşleşiyor mu?
        });
        
        if (foundChat) {
          // Normalize edilmiş JID ile güncelle
          return {
            ...foundChat,
            id: normalizeJid(foundChat.id), // 905538781507@s.whatsapp.net formatına getir
          };
        }
        
        return prev;
      });
    } catch (error: any) {
      console.error('Sohbetler yüklenemedi:', error);
      console.warn(`Sohbetler yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
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
