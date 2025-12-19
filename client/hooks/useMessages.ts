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
          // Cache'den gösterdikten sonra arka planda DB'den güncelle
          setTimeout(async () => {
            try {
              const dbData = await api.getMessages(sessionId, chatId, limit);
              if (dbData && dbData.length > 0) {
                // DB'den gelen mesajları cache ile birleştir
                const existingIds = new Set(cachedMessages.map(m => m.id || m.key?.id));
                const newMessages = dbData.filter((msg: any) => {
                  const msgId = msg.id || msg.key?.id;
                  return msgId && !existingIds.has(msgId);
                });
                if (newMessages.length > 0) {
                  const merged = [...cachedMessages, ...newMessages].sort((a, b) => {
                    const aTime = a.timestamp || a.messageTimestamp || 0;
                    const bTime = b.timestamp || b.messageTimestamp || 0;
                    return aTime - bTime;
                  });
                  messagesCacheRef.current.set(messagesKey, merged);
                  setMessages(merged);
                }
              }
            } catch (dbError) {
              console.debug('DB\'den mesaj güncelleme hatası:', dbError);
            }
          }, 1000);
        } else {
          setMessages([]);
          messagesInitialLoadRef.current.delete(messagesKey);
        }
      }
      
      const data = await api.getMessages(sessionId, chatId, limit);
      console.log('Mesajlar alındı (ham data):', data?.length || 0);
      
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
              };
            });

            mapped.sort((a, b) => {
              const aTime = a.timestamp || a.messageTimestamp || 0;
              const bTime = b.timestamp || b.messageTimestamp || 0;
              return aTime - bTime;
            });

            setMessages(mapped);
            messagesCacheRef.current.set(messagesKey, mapped);
            currentChatKeyRef.current = messagesKey;
            messagesInitialLoadRef.current.set(messagesKey, true);
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

        setMessages(mapped);
        // Cache'e kaydet
        messagesCacheRef.current.set(messagesKey, mapped);
        currentChatKeyRef.current = messagesKey;
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
