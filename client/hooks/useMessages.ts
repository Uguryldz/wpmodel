import { useState, useRef } from 'react';
import * as api from '../api';
import { Message } from '../types';
import { extractMessageText } from '../utils/messageUtils';

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const messagesInitialLoadRef = useRef<Map<string, boolean>>(new Map());

  const loadMessages = async (sessionId: string, chatId: string, limit: number = 50, append: boolean = false) => {
    try {
      console.log('=== Mesajlar yükleniyor ===', { sessionId, chatId, limit, append });
      
      if (!append) {
        setMessages([]);
        const messagesKey = `${sessionId}-${chatId}`;
        messagesInitialLoadRef.current.delete(messagesKey);
      }
      
      const data = await api.getMessages(sessionId, chatId, limit);
      console.log('Mesajlar alındı (ham data):', data);
      
      if (!append && data && data.length > 0) {
        const messagesKey = `${sessionId}-${chatId}`;
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
          
          return merged;
        });
      } else {
        mapped.sort((a, b) => {
          const aTime = a.timestamp || a.messageTimestamp || 0;
          const bTime = b.timestamp || b.messageTimestamp || 0;
          return aTime - bTime;
        });

        setMessages(mapped);
      }
    } catch (error: any) {
      console.error('Mesajlar yüklenemedi:', error);
      if (!append) {
        alert(`Mesajlar yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
        setMessages([]);
      }
    }
  };

  return {
    messages,
    setMessages,
    message,
    setMessage,
    messagesInitialLoadRef,
    loadMessages,
  };
}
