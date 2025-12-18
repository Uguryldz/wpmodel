// Otomatik scroll hook'u
import { useEffect, useRef } from 'react';

interface UseAutoScrollOptions {
  messages: any[];
  selectedChatId: string | null;
  enabled?: boolean;
}

/**
 * Yeni mesaj geldiğinde otomatik scroll yapar
 */
export function useAutoScroll({ messages, selectedChatId, enabled = true }: UseAutoScrollOptions) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const prevChatIdRef = useRef<string | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);

  // Scroll pozisyonunu kontrol et
  const checkScrollPosition = () => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    shouldAutoScrollRef.current = isNearBottom;
  };

  // En alta scroll et
  const scrollToBottom = (smooth: boolean = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    }
  };

  // Chat değiştiğinde scroll et
  useEffect(() => {
    if (selectedChatId !== prevChatIdRef.current) {
      prevChatIdRef.current = selectedChatId;
      setTimeout(() => {
        scrollToBottom(false);
        shouldAutoScrollRef.current = true;
      }, 100);
    }
  }, [selectedChatId]);

  // Yeni mesaj geldiğinde scroll et
  useEffect(() => {
    if (!enabled || !selectedChatId) return;
    
    const messagesLength = messages.length;
    const prevLength = prevMessagesLengthRef.current;
    
    // Yeni mesaj geldi mi?
    if (messagesLength > prevLength) {
      // Kullanıcı en alttaysa otomatik scroll et
      if (shouldAutoScrollRef.current) {
        setTimeout(() => {
          scrollToBottom(true);
        }, 100);
      }
    }
    
    prevMessagesLengthRef.current = messagesLength;
  }, [messages.length, selectedChatId, enabled]);

  // Scroll event listener ekle
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', checkScrollPosition);
    
    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
    };
  }, []);

  return {
    messagesEndRef,
    messagesContainerRef,
    scrollToBottom,
  };
}
