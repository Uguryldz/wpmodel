// ============================================
// useChats Hook
// ============================================

import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { formatChats } from '../context/AppContext';
import * as api from '../api';
import type { Chat, ChatFilter } from '../types';

export function useChats() {
  const { state, dispatch, sendRequest, showToast, filteredChats, selectedChat, activeAccount } = useApp();
  
  const {
    chats,
    selectedChatId,
    chatFilter,
    chatSearchTerm,
    isLoadingChats,
  } = state;
  
  /**
   * Chat listesini yükle
   */
  const loadChats = useCallback(async (force: boolean = false) => {
    if (!activeAccount?.id) {
      console.warn('[useChats] Active account yok, chat yüklenemedi');
      return;
    }
    
    dispatch({ type: 'SET_LOADING_CHATS', payload: true });
    
    try {
      // WebSocket üzerinden yükle
      const response = await sendRequest<any[]>('getChats', {
        sessionId: activeAccount.id,
        limit: 50,
      });
      
      // Response'u handle et (eğer chats.set event'i gelmediyse)
      if (response && Array.isArray(response) && response.length > 0) {
        console.log('[useChats] ✅ Response\'dan chat\'ler alındı:', response.length);
        // State'ten contacts ve profilePictures al
        const { contacts, profilePictures } = state;
        const formattedChats = formatChats(response, contacts, profilePictures);
        dispatch({ type: 'SET_CHATS', payload: formattedChats });
      } else {
        console.log('[useChats] ⚠️ Response boş veya array değil:', response);
      }
    } catch (error: any) {
      console.error('[useChats] Chat yükleme hatası:', error);
      
      // SessionId hatası ise API'ye düşme, sadece logla
      if (error.message?.includes('sessionId')) {
        console.warn('[useChats] SessionId hatası, API fallback atlanıyor');
        dispatch({ type: 'SET_LOADING_CHATS', payload: false });
        return;
      }
      
      // API fallback
      try {
        const chats = await api.getChats(activeAccount.id, 50);
        if (Array.isArray(chats)) {
          dispatch({ type: 'SET_CHATS', payload: chats });
        } else {
          console.warn('[useChats] API\'den array dönmedi:', chats);
          dispatch({ type: 'SET_CHATS', payload: [] });
        }
      } catch (apiError) {
        console.error('[useChats] API fallback hatası:', apiError);
        dispatch({ type: 'SET_CHATS', payload: [] });
      }
    } finally {
      dispatch({ type: 'SET_LOADING_CHATS', payload: false });
    }
  }, [activeAccount?.id, dispatch, sendRequest]);
  
  /**
   * Chat seç
   */
  const selectChat = useCallback((chatId: string | null) => {
    dispatch({ type: 'SET_SELECTED_CHAT', payload: chatId });
  }, [dispatch]);
  
  /**
   * Chat filtresini değiştir
   */
  const setFilter = useCallback((filter: ChatFilter) => {
    dispatch({ type: 'SET_CHAT_FILTER', payload: filter });
  }, [dispatch]);
  
  /**
   * Arama terimini değiştir
   */
  const setSearchTerm = useCallback((term: string) => {
    dispatch({ type: 'SET_CHAT_SEARCH', payload: term });
  }, [dispatch]);
  
  /**
   * Chat'i pinle
   */
  const pinChat = useCallback(async (chat: Chat, pin: boolean) => {
    if (!activeAccount?.id) return;
    
    try {
      await api.pinChat(activeAccount.id, chat.id, pin);
      dispatch({
        type: 'UPDATE_CHAT',
        payload: { id: chat.id, pinned: pin ? new Date() : null },
      });
      showToast(pin ? 'Sohbet sabitlendi' : 'Sabitleme kaldırıldı', 'success');
    } catch (error: any) {
      showToast(error.message || 'İşlem başarısız', 'error');
    }
  }, [activeAccount?.id, dispatch, showToast]);
  
  /**
   * Chat'i sessize al
   */
  const muteChat = useCallback(async (chat: Chat, durationMs: number | null) => {
    if (!activeAccount?.id) return;
    
    try {
      await api.muteChat(activeAccount.id, chat.id, durationMs);
      dispatch({
        type: 'UPDATE_CHAT',
        payload: { id: chat.id, isMuted: durationMs !== null },
      });
      showToast(durationMs ? 'Sohbet sessize alındı' : 'Sessiz mod kapatıldı', 'success');
    } catch (error: any) {
      showToast(error.message || 'İşlem başarısız', 'error');
    }
  }, [activeAccount?.id, dispatch, showToast]);
  
  /**
   * Chat'i arşivle
   */
  const archiveChat = useCallback(async (chat: Chat, archive: boolean) => {
    if (!activeAccount?.id) return;
    
    try {
      await api.archiveChat(activeAccount.id, chat.id, archive);
      dispatch({
        type: 'UPDATE_CHAT',
        payload: { id: chat.id, archived: archive },
      });
      
      if (archive && selectedChatId === chat.id) {
        dispatch({ type: 'SET_SELECTED_CHAT', payload: null });
      }
      
      showToast(archive ? 'Sohbet arşivlendi' : 'Sohbet arşivden çıkarıldı', 'success');
    } catch (error: any) {
      showToast(error.message || 'İşlem başarısız', 'error');
    }
  }, [activeAccount?.id, dispatch, selectedChatId, showToast]);
  
  /**
   * Chat'i sil
   */
  const deleteChat = useCallback(async (chat: Chat) => {
    if (!activeAccount?.id) return;
    
    if (!confirm('Bu sohbeti silmek istediğinizden emin misiniz?')) {
      return;
    }
    
    try {
      await api.deleteChat(activeAccount.id, chat.id);
      
      const newChats = chats.filter(c => c.id !== chat.id);
      dispatch({ type: 'SET_CHATS', payload: newChats });
      
      if (selectedChatId === chat.id) {
        dispatch({ type: 'SET_SELECTED_CHAT', payload: null });
        dispatch({ type: 'CLEAR_MESSAGES' });
      }
      
      showToast('Sohbet silindi', 'success');
    } catch (error: any) {
      showToast(error.message || 'Sohbet silinemedi', 'error');
    }
  }, [activeAccount?.id, chats, dispatch, selectedChatId, showToast]);
  
  /**
   * Chat'i okundu olarak işaretle
   */
  const markAsRead = useCallback(async (chat: Chat, read: boolean) => {
    if (!activeAccount?.id) return;
    
    try {
      await api.markChatRead(activeAccount.id, chat.id, read);
      dispatch({
        type: 'UPDATE_CHAT',
        payload: { id: chat.id, unreadCount: read ? 0 : chat.unreadCount },
      });
    } catch (error: any) {
      showToast(error.message || 'İşlem başarısız', 'error');
    }
  }, [activeAccount?.id, dispatch, showToast]);
  
  /**
   * Geçici mesajları ayarla
   */
  const setDisappearingMessages = useCallback(async (chat: Chat, duration: number) => {
    if (!activeAccount?.id) return;
    
    try {
      await api.setDisappearingMessages(activeAccount.id, chat.id, duration);
      showToast(
        duration === 0
          ? 'Geçici mesajlar kapatıldı'
          : 'Geçici mesajlar açıldı',
        'success'
      );
    } catch (error: any) {
      showToast(error.message || 'İşlem başarısız', 'error');
    }
  }, [activeAccount?.id, showToast]);
  
  return {
    chats,
    filteredChats,
    selectedChat,
    selectedChatId,
    chatFilter,
    chatSearchTerm,
    isLoadingChats,
    loadChats,
    selectChat,
    setFilter,
    setSearchTerm,
    pinChat,
    muteChat,
    archiveChat,
    deleteChat,
    markAsRead,
    setDisappearingMessages,
  };
}

