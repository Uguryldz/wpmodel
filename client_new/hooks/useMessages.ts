// ============================================
// useMessages Hook
// ============================================

import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../api';
import type { Message } from '../types';
import { getMessageId, sortMessagesByTime } from '../utils/message';

export function useMessages() {
  const { state, dispatch, sendRequest, showToast, activeAccount, selectedChat } = useApp();
  
  const {
    messages,
    messageInput,
    isLoadingMessages,
    isSendingMessage,
  } = state;
  
  /**
   * Mesajları yükle
   */
  const loadMessages = useCallback(async (chatId?: string, limit: number = 50) => {
    const targetChatId = chatId || selectedChat?.id;
    if (!activeAccount?.id || !targetChatId) return;
    
    dispatch({ type: 'SET_LOADING_MESSAGES', payload: true });
    
    try {
      const response = await sendRequest<Message[]>('getMessages', {
        sessionId: activeAccount.id,
        chatId: targetChatId,
        limit,
      });
      
      if (response && Array.isArray(response)) {
        const sorted = sortMessagesByTime(response);
        dispatch({ type: 'SET_MESSAGES', payload: sorted });
      }
    } catch (error) {
      console.error('[useMessages] Mesaj yükleme hatası:', error);
      
      // API fallback
      try {
        const messages = await api.getMessages(activeAccount.id, targetChatId, limit);
        dispatch({ type: 'SET_MESSAGES', payload: sortMessagesByTime(messages) });
      } catch (apiError) {
        console.error('[useMessages] API fallback hatası:', apiError);
      }
    } finally {
      dispatch({ type: 'SET_LOADING_MESSAGES', payload: false });
    }
  }, [activeAccount?.id, selectedChat?.id, dispatch, sendRequest]);
  
  /**
   * Mesaj input'unu güncelle
   */
  const setMessageInput = useCallback((text: string) => {
    dispatch({ type: 'SET_MESSAGE_INPUT', payload: text });
  }, [dispatch]);
  
  /**
   * Mesaj gönder
   */
  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || messageInput;
    if (!messageText.trim() || !activeAccount?.id || !selectedChat?.id) return;
    
    dispatch({ type: 'SET_SENDING_MESSAGE', payload: true });
    dispatch({ type: 'SET_MESSAGE_INPUT', payload: '' });
    
    // Optimistic update: Mesajı hemen state'e ekle
    const tempMessageId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage: Message = {
      id: tempMessageId,
      text: messageText.trim(),
      body: messageText.trim(),
      fromMe: true,
      timestamp: Math.floor(Date.now() / 1000),
      messageTimestamp: Math.floor(Date.now() / 1000),
      from: selectedChat.id,
      status: 'pending',
      key: {
        remoteJid: selectedChat.id,
        id: tempMessageId,
        fromMe: true,
      },
    };
    
    console.log('[useMessages] ✅ Optimistic mesaj eklendi:', optimisticMessage);
    dispatch({ type: 'ADD_MESSAGE', payload: optimisticMessage });
    
    // Optimistic mesajı kaydet (AppContext'teki ref'e erişmek için)
    // Bu işlem AppContext'te ADD_MESSAGE reducer'ında yapılacak
    // Şimdilik sadece dispatch ediyoruz
    
    try {
      await sendRequest('sendMessage', {
        sessionId: activeAccount.id,
        jid: selectedChat.id,
        message: messageText.trim(),
      });
      
      // Chat listesini güncelle
      dispatch({
        type: 'UPDATE_CHAT',
        payload: {
          id: selectedChat.id,
          lastMessage: messageText.trim(),
          conversationTimestamp: Math.floor(Date.now() / 1000),
        },
      });
      
      // WebSocket'ten gerçek mesaj geldiğinde optimistic mesaj otomatik olarak güncellenecek
      // veya duplicate kontrolü ile temizlenecek
    } catch (error: any) {
      console.error('[useMessages] Mesaj gönderme hatası:', error);
      showToast(error.message || 'Mesaj gönderilemedi', 'error');
      // Hata durumunda optimistic mesajı kaldır
      dispatch({ type: 'REMOVE_MESSAGE', payload: tempMessageId });
      // Input'u geri yükle
      dispatch({ type: 'SET_MESSAGE_INPUT', payload: messageText });
    } finally {
      dispatch({ type: 'SET_SENDING_MESSAGE', payload: false });
    }
  }, [messageInput, activeAccount?.id, selectedChat?.id, dispatch, sendRequest, showToast]);
  
  /**
   * Yanıtlı mesaj gönder
   */
  const sendReply = useCallback(async (text: string, quotedMessage: Message) => {
    if (!text.trim() || !activeAccount?.id || !selectedChat?.id) return;
    
    dispatch({ type: 'SET_SENDING_MESSAGE', payload: true });
    
    // Optimistic update: Mesajı hemen state'e ekle
    const tempMessageId = `temp-${Date.now()}-${Math.random()}`;
    const messageKey = quotedMessage.key || {
      remoteJid: selectedChat.id,
      id: getMessageId(quotedMessage),
      fromMe: quotedMessage.fromMe || false,
    };
    
    const optimisticMessage: Message = {
      id: tempMessageId,
      text: text.trim(),
      body: text.trim(),
      fromMe: true,
      timestamp: Math.floor(Date.now() / 1000),
      messageTimestamp: Math.floor(Date.now() / 1000),
      from: selectedChat.id,
      status: 'pending',
      key: {
        remoteJid: selectedChat.id,
        id: tempMessageId,
        fromMe: true,
      },
      message: {
        extendedTextMessage: {
          text: text.trim(),
          contextInfo: {
            quotedMessage: quotedMessage.message || { conversation: quotedMessage.text || '' },
            participant: messageKey.remoteJid,
            stanzaId: messageKey.id,
          },
        },
      },
    };
    
    console.log('[useMessages] ✅ Optimistic reply mesajı eklendi:', optimisticMessage);
    dispatch({ type: 'ADD_MESSAGE', payload: optimisticMessage });
    
    try {
      await sendRequest('sendMessage', {
        sessionId: activeAccount.id,
        jid: selectedChat.id,
        message: text.trim(),
        options: {
          quoted: {
            key: messageKey,
            message: quotedMessage.message || { conversation: quotedMessage.text || '' },
          },
        },
      });
      
      // Chat listesini güncelle
      dispatch({
        type: 'UPDATE_CHAT',
        payload: {
          id: selectedChat.id,
          lastMessage: text.trim(),
          conversationTimestamp: Math.floor(Date.now() / 1000),
        },
      });
      
      // WebSocket'ten gerçek mesaj geldiğinde optimistic mesaj otomatik olarak güncellenecek
    } catch (error: any) {
      console.error('[useMessages] Yanıt mesajı gönderme hatası:', error);
      showToast(error.message || 'Mesaj gönderilemedi', 'error');
      // Hata durumunda optimistic mesajı kaldır
      dispatch({ type: 'REMOVE_MESSAGE', payload: tempMessageId });
    } finally {
      dispatch({ type: 'SET_SENDING_MESSAGE', payload: false });
    }
  }, [activeAccount?.id, selectedChat?.id, dispatch, sendRequest, showToast]);
  
  /**
   * Mesajı düzenle
   */
  const editMessage = useCallback(async (message: Message, newText: string) => {
    if (!newText.trim() || !activeAccount?.id || !selectedChat?.id) return;
    
    const messageId = getMessageId(message);
    if (!messageId) {
      showToast('Mesaj ID bulunamadı', 'error');
      return;
    }
    
    try {
      await api.editMessage(activeAccount.id, selectedChat.id, messageId, newText.trim());
      
      // Optimistic update
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: {
          id: messageId,
          text: newText.trim(),
          body: newText.trim(),
          edited: true,
          editedAt: Date.now(),
        },
      });
      
      showToast('Mesaj düzenlendi', 'success');
    } catch (error: any) {
      showToast(error.message || 'Mesaj düzenlenemedi', 'error');
    }
  }, [activeAccount?.id, selectedChat?.id, dispatch, showToast]);
  
  /**
   * Mesajı sil
   */
  const deleteMessage = useCallback(async (message: Message, forEveryone: boolean = false) => {
    if (!activeAccount?.id || !selectedChat?.id) return;
    
    const messageId = getMessageId(message);
    if (!messageId) {
      showToast('Mesaj ID bulunamadı', 'error');
      return;
    }
    
    const confirmText = forEveryone
      ? 'Bu mesajı herkes için silmek istediğinizden emin misiniz?'
      : 'Bu mesajı silmek istediğinizden emin misiniz?';
    
    if (!confirm(confirmText)) return;
    
    try {
      // Optimistic update
      dispatch({ type: 'REMOVE_MESSAGE', payload: messageId });
      
      await api.deleteMessage(activeAccount.id, selectedChat.id, messageId, forEveryone);
      showToast(forEveryone ? 'Mesaj herkes için silindi' : 'Mesaj silindi', 'success');
    } catch (error: any) {
      // Hata durumunda mesajları yeniden yükle
      loadMessages();
      showToast(error.message || 'Mesaj silinemedi', 'error');
    }
  }, [activeAccount?.id, selectedChat?.id, dispatch, loadMessages, showToast]);
  
  /**
   * Mesajı ilet
   */
  const forwardMessage = useCallback(async (message: Message, toJid: string) => {
    if (!activeAccount?.id || !selectedChat?.id) return;
    
    const messageId = getMessageId(message);
    if (!messageId) {
      showToast('Mesaj ID bulunamadı', 'error');
      return;
    }
    
    try {
      await sendRequest('forwardMessage', {
        sessionId: activeAccount.id,
        fromJid: selectedChat.id,
        toJid,
        messageId,
      });
      showToast('Mesaj iletildi', 'success');
    } catch (error: any) {
      showToast(error.message || 'Mesaj iletilemedi', 'error');
    }
  }, [activeAccount?.id, selectedChat?.id, sendRequest, showToast]);
  
  /**
   * Reaction gönder
   */
  const sendReaction = useCallback(async (message: Message, emoji: string) => {
    if (!activeAccount?.id || !selectedChat?.id) return;
    
    const messageId = getMessageId(message);
    if (!messageId) return;
    
    try {
      await sendRequest('sendReaction', {
        sessionId: activeAccount.id,
        jid: selectedChat.id,
        messageId,
        emoji,
      });
    } catch (error: any) {
      showToast(error.message || 'Reaksiyon gönderilemedi', 'error');
    }
  }, [activeAccount?.id, selectedChat?.id, sendRequest, showToast]);
  
  /**
   * Mesajı yıldızla
   */
  const starMessage = useCallback(async (message: Message, star: boolean) => {
    if (!activeAccount?.id || !selectedChat?.id) return;
    
    const messageId = getMessageId(message);
    if (!messageId) return;
    
    try {
      await sendRequest('starMessage', {
        sessionId: activeAccount.id,
        jid: selectedChat.id,
        messageId,
        fromMe: message.fromMe || false,
        star,
      });
      
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: { id: messageId, starred: star },
      });
      
      showToast(star ? 'Mesaj yıldızlandı' : 'Yıldız kaldırıldı', 'success');
    } catch (error: any) {
      showToast(error.message || 'İşlem başarısız', 'error');
    }
  }, [activeAccount?.id, selectedChat?.id, dispatch, sendRequest, showToast]);
  
  /**
   * Mesajı kopyala
   */
  const copyMessage = useCallback((message: Message) => {
    const text = message.text || message.body || '';
    if (text) {
      navigator.clipboard.writeText(text);
      showToast('Mesaj kopyalandı', 'success');
    } else {
      showToast('Kopyalanacak metin bulunamadı', 'error');
    }
  }, [showToast]);
  
  return {
    messages,
    messageInput,
    isLoadingMessages,
    isSendingMessage,
    loadMessages,
    setMessageInput,
    sendMessage,
    sendReply,
    editMessage,
    deleteMessage,
    forwardMessage,
    sendReaction,
    starMessage,
    copyMessage,
  };
}

