import { useState, useRef, useCallback, useEffect } from 'react';
import * as api from '../api';
import { Chat } from '../types';
import { extractMessageText } from '../utils/messageUtils';

interface UseChatsProps {
  activeAccountId: string | undefined;
  contactsMap: Map<string, any>;
  chatProfilePictures: Map<string, string>;
  setChatProfilePictures: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  queueProfilePicture: (sessionId: string, jid: string) => void;
}

export function useChats({ 
  activeAccountId, 
  contactsMap, 
  chatProfilePictures, 
  setChatProfilePictures,
  queueProfilePicture 
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
        return;
      }
      
      console.log('=== Sohbetler yükleniyor ===', { sessionId, limit, force });
      
      const chatsData = await api.getChats(sessionId, limit);
      
      console.log('Sohbetler alındı (ham data):', chatsData);
      
      if (!chatsData || chatsData.length === 0) {
        console.warn('Sohbet listesi boş!');
        return;
      }
      
      chatsLoadedRef.current.set(sessionId, true);
      
      const sortedChats = [...chatsData].sort((a, b) => {
        const aTime = a.conversationTimestamp || (a as any).lastMsgTimestamp || 0;
        const bTime = b.conversationTimestamp || (b as any).lastMsgTimestamp || 0;
        return Number(bTime) - Number(aTime);
      }).slice(0, limit);
      
      // Güncel contactsMap'i ref'ten al
      const currentContactsMap = contactsMapRef.current;
      
      const formattedChats = sortedChats.map(chat => {
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
            displayName = verifiedName || contact.verifiedName || contact.name || contact.notify || chat.name || chat.id;
            
            if (contact.imgUrl) {
              profilePicture = contact.imgUrl;
              if (!chatProfilePictures.has(chat.id)) {
                setChatProfilePictures(prev => new Map(prev).set(chat.id, contact.imgUrl));
              }
            } else if (!chatProfilePictures.has(chat.id)) {
              queueProfilePicture(sessionId, chat.id);
            } else {
              const cached = chatProfilePictures.get(chat.id);
              profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
            }
          } else {
            const phoneMatch = chat.id.match(/^(\d+)@/);
            if (phoneMatch) {
              displayName = phoneMatch[1];
            }
            
            if (!chatProfilePictures.has(chat.id)) {
              queueProfilePicture(sessionId, chat.id);
            } else {
              const cached = chatProfilePictures.get(chat.id);
              profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
            }
          }
        } else {
          if (!chatProfilePictures.has(chat.id)) {
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
      setChats(formattedChats);
      setSelectedChat(prev => {
        // Sadece selectedChat yoksa veya değiştiyse güncelle
        if (!prev && formattedChats.length > 0) {
          return formattedChats[0];
        }
        return prev;
      });
    } catch (error: any) {
      console.error('Sohbetler yüklenemedi:', error);
      console.warn(`Sohbetler yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
  }, [chatProfilePictures, setChatProfilePictures, queueProfilePicture]); // contactsMap dependency array'den çıkarıldı, ref kullanılıyor

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
