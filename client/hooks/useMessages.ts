import { useState, useRef } from 'react';
import * as api from '../api';
import { Message } from '../types';
import { extractMessageText } from '../utils/messageUtils';

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const messagesInitialLoadRef = useRef<Map<string, boolean>>(new Map());
  // Mesajları chat bazında cache'le - hızlı geçiş için
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  const currentChatKeyRef = useRef<string | null>(null);

  const loadMessages = async (sessionId: string, chatId: string, limit: number = 50, append: boolean = false) => {
    try {
      const messagesKey = `${sessionId}-${chatId}`;
      console.log('=== Mesajlar yükleniyor ===', { sessionId, chatId, limit, append, messagesKey });
      
      // Cache'den mesajları yükle (eğer varsa ve append değilse)
      if (!append) {
        const cachedMessages = messagesCacheRef.current.get(messagesKey);
        if (cachedMessages && cachedMessages.length > 0) {
          console.log('Cache\'den mesajlar yüklendi:', cachedMessages.length);
          setMessages(cachedMessages);
          currentChatKeyRef.current = messagesKey;
          // DB'den yükleme işlemini kaldırdık - sadece cache'den yükle
          return;
        } else {
          setMessages([]);
          messagesInitialLoadRef.current.delete(messagesKey);
        }
      }
      
      const data = await api.getMessages(sessionId, chatId, limit);
      console.log('Mesajlar alındı (ham data):', data?.length || 0);
      
      // Bugünün mesajlarını kontrol et
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStartTimestamp = Math.floor(today.getTime() / 1000);
      const todayMessages = data?.filter((msg: any) => {
        const msgTime = msg.timestamp || msg.messageTimestamp || 0;
        // Timestamp saniye cinsindeyse direkt karşılaştır, milisaniye cinsindeyse 1000'e böl
        const normalizedTime = msgTime > 1000000000000 ? Math.floor(msgTime / 1000) : msgTime;
        return normalizedTime >= todayStartTimestamp;
      }) || [];
      
      if (todayMessages.length === 0 && data && data.length > 0) {
        console.log('⚠️ Bugünün mesajları yok, tüm mesajlar yükleniyor...');
      }
      
      // Eğer data boşsa ve DB'den yüklenmemişse, DB'den tekrar dene
      if ((!data || data.length === 0) && !append) {
        console.log('Mesajlar boş, DB\'den tekrar deneniyor...');
        try {
          const dbData = await api.getMessages(sessionId, chatId, limit);
          if (dbData && dbData.length > 0) {
            console.log('DB\'den mesajlar yüklendi:', dbData.length);
            // DB'den gelen veriyi kullan
            const mapped: Message[] = (dbData || []).map((msg: any) => {
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
                // Düzenlenmiş mesaj bilgilerini koru (eğer varsa)
                edited: msg.edited,
                editedAt: msg.editedAt,
              };
            });

            mapped.sort((a, b) => {
              const aTime = a.timestamp || a.messageTimestamp || 0;
              const bTime = b.timestamp || b.messageTimestamp || 0;
              return aTime - bTime;
            });

            // DB'den yükleme işlemini kaldırdık - sadece ilk yüklemede DB'den yükle
            // Mevcut state'i koru, DB'den gelen mesajları kullanma
            setMessages(prev => {
              // Eğer mevcut mesajlar varsa ve düzenlenmiş mesajlar varsa, onları koru
              if (prev.length > 0) {
                const editedMap = new Map<string, Message>();
                prev.forEach(m => {
                  const mId = m.id || m.key?.id;
                  if (mId && (m.edited || m.editedAt)) {
                    editedMap.set(String(mId), m);
                  }
                });
                
                // Sadece yeni mesajları ekle, mevcut düzenlenmiş mesajları koru
                const existingIds = new Set(prev.map(m => String(m.id || m.key?.id)));
                const newMessages = mapped.filter(msg => {
                  const msgId = msg.id || msg.key?.id;
                  return msgId && !existingIds.has(String(msgId));
                });
                
                // Mevcut mesajları koru, sadece yeni mesajları ekle
                const merged = [...prev, ...newMessages].sort((a, b) => {
                  const aTime = a.timestamp || a.messageTimestamp || 0;
                  const bTime = b.timestamp || b.messageTimestamp || 0;
                  return aTime - bTime;
                });
                
                messagesCacheRef.current.set(messagesKey, merged);
                currentChatKeyRef.current = messagesKey;
                messagesInitialLoadRef.current.set(messagesKey, true);
                return merged;
              }
              
              // İlk yükleme - DB'den yükle
              messagesCacheRef.current.set(messagesKey, mapped);
              currentChatKeyRef.current = messagesKey;
              messagesInitialLoadRef.current.set(messagesKey, true);
              return mapped;
            });
            return;
          }
        } catch (dbError) {
          console.warn('DB\'den mesajlar yüklenemedi:', dbError);
        }
      }
      
      if (!append && data && data.length > 0) {
        messagesInitialLoadRef.current.set(messagesKey, true);
      }

      const mapped: Message[] = (data || []).map((msg: any) => {
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
          // Düzenlenmiş mesaj bilgilerini koru (eğer varsa)
          edited: msg.edited,
          editedAt: msg.editedAt,
        };
      });

      if (append) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id || m.key?.id));
          
          const newMessages = mapped.filter(msg => {
            const msgId = msg.id || msg.key?.id;
            return msgId && !existingIds.has(msgId);
          });
          
          const merged = [...prev, ...newMessages];
          merged.sort((a, b) => {
            const normalizeTimestamp = (ts: number | undefined) => {
              if (!ts) return 0;
              return ts > 1000000000000 ? ts : ts * 1000;
            };
            
            const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
            const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
            return aTime - bTime;
          });
          
          // Cache'e kaydet
          messagesCacheRef.current.set(messagesKey, merged);
          return merged;
        });
      } else {
        mapped.sort((a, b) => {
          const aTime = a.timestamp || a.messageTimestamp || 0;
          const bTime = b.timestamp || b.messageTimestamp || 0;
          return aTime - bTime;
        });

        // Mevcut mesajların edited bilgilerini koru - DB'den yükleme işlemini kaldırdık
        setMessages(prev => {
          // Eğer önceki mesajlar varsa, onları koru (özellikle düzenlenmiş mesajları)
          if (prev.length > 0) {
            // Mevcut mesajları koru, DB'den gelen mesajları kullanma
            // Sadece yeni mesajları ekle
            const existingIds = new Set(prev.map(m => String(m.id || m.key?.id)));
            const newMessages = mapped.filter(msg => {
              const msgId = msg.id || msg.key?.id;
              return msgId && !existingIds.has(String(msgId));
            });
            
            // Mevcut mesajları koru, sadece yeni mesajları ekle
            const merged = [...prev, ...newMessages].sort((a, b) => {
              const aTime = a.timestamp || a.messageTimestamp || 0;
              const bTime = b.timestamp || b.messageTimestamp || 0;
              return aTime - bTime;
            });
            
            // Cache'e kaydet
            messagesCacheRef.current.set(messagesKey, merged);
            currentChatKeyRef.current = messagesKey;
            return merged;
          }
          
          // İlk yükleme - DB'den yükle
          messagesCacheRef.current.set(messagesKey, mapped);
          currentChatKeyRef.current = messagesKey;
          return mapped;
        });
      }
    } catch (error: any) {
      console.error('Mesajlar yüklenemedi:', error);
      if (!append) {
        alert(`Mesajlar yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
        setMessages([]);
      }
    }
  };

  // Mesajları cache'den yükle (chat değiştiğinde hızlı gösterim için)
  const loadMessagesFromCache = (sessionId: string, chatId: string) => {
    const messagesKey = `${sessionId}-${chatId}`;
    const cachedMessages = messagesCacheRef.current.get(messagesKey);
    if (cachedMessages && cachedMessages.length > 0) {
      setMessages(cachedMessages);
      currentChatKeyRef.current = messagesKey;
      return true; // Cache'den yüklendi
    }
    return false; // Cache'de yok
  };

  // Mesajları cache'e kaydet (WebSocket'ten gelen yeni mesajlar için)
  const updateMessagesCache = (sessionId: string, chatId: string, newMessages: Message[]) => {
    const messagesKey = `${sessionId}-${chatId}`;
    if (currentChatKeyRef.current === messagesKey) {
      // Eğer bu chat şu anda açıksa, cache'i güncelle
      messagesCacheRef.current.set(messagesKey, newMessages);
    }
  };

  return {
    messages,
    setMessages,
    message,
    setMessage,
    messagesInitialLoadRef,
    messagesCacheRef,
    loadMessages,
    loadMessagesFromCache,
    updateMessagesCache,
  };
}
