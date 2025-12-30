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
  // sendRequest ref'i - useWebSocket'ten gelecek
  const sendRequestRef = useRef<((requestType: string, payload: any) => Promise<any>) | null>(null);
  
  // sendRequest setter - dışarıdan çağrılabilir
  const setSendRequest = (sendRequest: (requestType: string, payload: any) => Promise<any>) => {
    sendRequestRef.current = sendRequest;
  };

  const loadMessages = async (sessionId: string, chatId: string, limit: number = 50, append: boolean = false) => {
    try {
      const messagesKey = `${sessionId}-${chatId}`;
      console.log('[useMessages] === Mesajlar yükleniyor ===', { sessionId, chatId, limit, append, messagesKey });
      
      // Cache'den mesajları yükle (eğer varsa ve append değilse)
      if (!append) {
        const cachedMessages = messagesCacheRef.current.get(messagesKey);
        if (cachedMessages && cachedMessages.length > 0) {
          console.log('[useMessages] ✅ Cache\'den mesajlar yüklendi:', cachedMessages.length);
          setMessages(cachedMessages);
          currentChatKeyRef.current = messagesKey;
          // Cache'den yüklendi, WebSocket'ten gelen mesajlar cache'e eklenecek
          return;
        } else {
          setMessages([]);
          messagesInitialLoadRef.current.delete(messagesKey);
        }
      }
      
      // İlk yükleme için WebSocket Request kullan (önce WebSocket, fallback API)
      const hasInitialLoad = messagesInitialLoadRef.current.get(messagesKey);
      if (!append && !hasInitialLoad) {
        console.log('[useMessages] ⏳ İlk mesaj yükleme - WebSocket request gönderiliyor...');
        
        // Önce WebSocket request dene
        if (sendRequestRef.current) {
          try {
            // Cursor-based pagination için en eski (ilk) mesajın timestamp'ini kullan
            // Mesajlar timestamp'e göre sıralı (en eski önce), append durumunda ilk mesaj en eski
            const cursor = append && messages.length > 0 
              ? (messages[0]?.timestamp || messages[0]?.messageTimestamp || null)?.toString() 
              : null;
            
            const data = await sendRequestRef.current('getMessages', { 
              sessionId, 
              chatId, 
              limit,
              cursor 
            });
            console.log('[useMessages] ✅ Mesajlar WebSocket\'ten alındı:', data?.length || 0, 'cursor:', cursor ? 'var' : 'yok');
            
            if (data && Array.isArray(data) && data.length > 0) {
              const mapped: Message[] = (data || [])
                .filter((msg: any) => {
                  // Protocol mesajlarını filtrele (sadece REVOKE olanlar gösterilebilir)
                  const messageStubType = msg.messageStubType || msg.message?.messageStubType;
                  if (messageStubType !== undefined && messageStubType !== null && messageStubType !== 1) {
                    return false; // REVOKE (1) hariç diğer protocol mesajlarını filtrele
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
                  const textToCheck = (textTrimmed || bodyTrimmed || '').toLowerCase().trim();
                  const meaninglessTexts = ['mesaj', 'message', 'sistem mesajı'];
                  if (meaninglessTexts.includes(textToCheck)) {
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

                  // Reaction'ları al - backend'den gelen reaction verilerini koru
                  const reactions = msg.reactions || msg.message?.reactions;
                  
                  // Debug: Reaction'ları logla (sadece varsa)
                  if (reactions) {
                    console.log('[useMessages] 🔍 Backend\'den reaction bulundu:', {
                      messageId: msgId,
                      reactions: reactions,
                      reactionsType: Array.isArray(reactions) ? 'array' : typeof reactions
                    });
                  }

                  return {
                    ...msg,
                    id: msgId,
                    text: text || body,
                    body: body || text,
                    fromMe: fromMe,
                    timestamp: msg.timestamp || msg.messageTimestamp || undefined,
                    edited: msg.edited,
                    editedAt: msg.editedAt,
                    // Reaction'ları koru - backend'den gelen reaction verilerini sakla
                    reactions: reactions || undefined,
                  };
                });

              mapped.sort((a, b) => {
                const aTime = a.timestamp || a.messageTimestamp || 0;
                const bTime = b.timestamp || b.messageTimestamp || 0;
                return aTime - bTime;
              });

              messagesCacheRef.current.set(messagesKey, mapped);
              currentChatKeyRef.current = messagesKey;
              messagesInitialLoadRef.current.set(messagesKey, true);
              setMessages(mapped);
              console.log('[useMessages] ✅ Mesajlar WebSocket\'ten yüklendi ve cache\'e kaydedildi:', mapped.length);
              return;
            }
          } catch (wsError) {
            console.warn('[useMessages] ⚠️ WebSocket request başarısız, API fallback kullanılıyor:', wsError);
          }
        }
        
        // Fallback: API'den yükle
        try {
          const data = await api.getMessages(sessionId, chatId, limit);
          if (data && data.length > 0) {
            const mapped: Message[] = (data || [])
              .filter((msg: any) => {
                // Protocol mesajlarını filtrele (sadece REVOKE olanlar gösterilebilir)
                const messageStubType = msg.messageStubType || msg.message?.messageStubType;
                if (messageStubType !== undefined && messageStubType !== null && messageStubType !== 1) {
                  return false; // REVOKE (1) hariç diğer protocol mesajlarını filtrele
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
                const textToCheck = (textTrimmed || bodyTrimmed || '').toLowerCase().trim();
                const meaninglessTexts = ['mesaj', 'message', 'sistem mesajı'];
                if (meaninglessTexts.includes(textToCheck)) {
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
                  edited: msg.edited,
                  editedAt: msg.editedAt,
                };
              });

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
              
              messagesCacheRef.current.set(messagesKey, merged);
              return merged;
            });
          }
        } catch (error: any) {
          console.error('[useMessages] ❌ Pagination mesaj yükleme hatası:', error);
        }
      }
    } catch (error: any) {
      console.error('[useMessages] ❌ loadMessages hatası:', error);
      if (!append) {
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
    
    // Tüm chat'ler için cache'i güncelle (sadece seçili chat için değil)
    // Reaction'ların korunması için önemli
    messagesCacheRef.current.set(messagesKey, newMessages);
    
    // Debug: Reaction'ların cache'e kaydedildiğini logla
    const messagesWithReactions = newMessages.filter(m => m.reactions || m.message?.reactions);
    if (messagesWithReactions.length > 0) {
      console.log('[useMessages] ✅ Cache güncellendi (reaction\'lar ile):', {
        chatId,
        totalMessages: newMessages.length,
        messagesWithReactions: messagesWithReactions.length
      });
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
    setSendRequest,
  };
}
