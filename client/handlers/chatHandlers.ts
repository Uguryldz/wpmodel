// Chat operation handlers
import React from 'react';
import * as api from '../api';
import { Chat, Account } from '../types';

export interface ChatHandlersDeps {
  activeAccount: Account | undefined;
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  setSelectedChat: (chat: Chat | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  loadChats: (sessionId: string, limit: number) => Promise<void>;
  setToast: (toast: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null) => void;
  selectedChat: Chat | null;
  chats: Chat[];
}

export const createChatHandlers = (deps: ChatHandlersDeps) => {
  const {
    activeAccount,
    setChats,
    setSelectedChat,
    setMessages,
    loadChats,
    setToast,
    selectedChat,
    chats,
  } = deps;

  const handlePinChat = async (chat: Chat, pin: boolean) => {
    if (!activeAccount) return;
    
    try {
      await api.pinChat(activeAccount.id, chat.id, pin);
      loadChats(activeAccount.id, 50);
    } catch (error) {
      console.error('Chat pinlenemedi:', error);
      alert('Chat pinlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleMuteChat = async (chat: Chat, durationMs: number | null) => {
    if (!activeAccount) return;
    
    try {
      await api.muteChat(activeAccount.id, chat.id, durationMs);
      loadChats(activeAccount.id, 50);
    } catch (error) {
      console.error('Chat sessize alınamadı:', error);
      alert('Chat sessize alınamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleArchiveChat = async (chat: Chat, archive: boolean) => {
    if (!activeAccount) return;
    
    try {
      await api.archiveChat(activeAccount.id, chat.id, archive);
      loadChats(activeAccount.id, 50);
      if (archive && selectedChat?.id === chat.id) {
        setSelectedChat(null);
      }
    } catch (error) {
      console.error('Sohbet arşivlenemedi:', error);
      alert('Sohbet arşivlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteChat = async (chat: Chat) => {
    if (!activeAccount) return;
    
    if (!confirm('Bu sohbeti silmek istediğinizden emin misiniz? Tüm mesajlar silinecektir.')) {
      return;
    }
    
    try {
      const chatIndex = chats.findIndex(c => c.id === chat.id);
      if (chatIndex >= 0) {
        setChats(prevChats => {
          const updated = [...prevChats];
          updated.splice(chatIndex, 1);
          return updated;
        });
      }
      
      await api.deleteChat(activeAccount.id, chat.id);
      
      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        setMessages([]);
      }
      
      setToast({ message: 'Sohbet başarıyla silindi', type: 'success' });
      
      setTimeout(() => {
        loadChats(activeAccount.id, 50);
      }, 300);
    } catch (error) {
      console.error('Sohbet silinemedi:', error);
      setToast({ 
        message: 'Sohbet silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
      loadChats(activeAccount.id, 50);
    }
  };

  const handleMarkChatRead = async (chat: Chat, markRead: boolean) => {
    if (!activeAccount) return;
    
    try {
      await api.markChatRead(activeAccount.id, chat.id, markRead);
      loadChats(activeAccount.id, 50);
    } catch (error) {
      console.error('Sohbet okundu olarak işaretlenemedi:', error);
      alert('Sohbet okundu olarak işaretlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  return {
    handlePinChat,
    handleMuteChat,
    handleArchiveChat,
    handleDeleteChat,
    handleMarkChatRead,
  };
};

