// Message operation handlers
import React from 'react';
import * as api from '../api';
import { Message, Chat, Account } from '../types';

export interface MessageHandlersDeps {
  activeAccount: Account | undefined;
  selectedChat: Chat | null;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessage: (message: string) => void;
  loadMessages: (sessionId: string, chatId: string, limit?: number, append?: boolean) => Promise<void>;
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  setReplyingTo: (msg: Message | null) => void;
  setEditingMessage: (msg: Message | null) => void;
  setEditingText: (text: string) => void;
  setToast: (toast: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null) => void;
  setIsSending: (sending: boolean) => void;
}

export const createMessageHandlers = (deps: MessageHandlersDeps) => {
  const {
    activeAccount,
    selectedChat,
    setMessages,
    setMessage,
    loadMessages,
    setChats,
    setReplyingTo,
    setEditingMessage,
    setEditingText,
    setToast,
    setIsSending,
  } = deps;

  const normalizeTimestamp = (ts: number | undefined) => {
    if (!ts) return 0;
    return ts > 1000000000000 ? ts : ts * 1000;
  };

  const addOptimisticMessage = (message: Message) => {
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id || m.key?.id));
      if (existingIds.has(message.id)) {
        return prev;
      }
      
      const merged = [...prev, message];
      merged.sort((a, b) => {
        const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
        const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
        return aTime - bTime;
      });
      return merged;
    });
  };

  const updateChatTimestamp = (chatId: string, lastMessage?: string) => {
    setChats(prevChats => {
      const index = prevChats.findIndex(c => c.id === chatId);
      if (index >= 0) {
        const updatedChats = [...prevChats];
        const now = Math.floor(Date.now() / 1000);
        updatedChats[index] = {
          ...updatedChats[index],
          conversationTimestamp: now,
          lastMessage: lastMessage || updatedChats[index].lastMessage,
          time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        };
        return updatedChats;
      }
      return prevChats;
    });
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || !activeAccount || !selectedChat) return;
    
    setIsSending(true);
    const tempMessageId = `temp-${Date.now()}`;
    
    const optimisticMessage: Message = {
      id: tempMessageId,
      text: messageText,
      body: messageText,
      fromMe: true,
      timestamp: Math.floor(Date.now() / 1000),
      from: selectedChat.id,
      status: 'sending',
    };
    
    addOptimisticMessage(optimisticMessage);
    setMessage('');
    
    try {
      const response = await api.sendMessage(activeAccount.id, selectedChat.id, messageText);
      updateChatTimestamp(selectedChat.id, messageText);
      
      setMessages(prev => 
        prev.map(m => {
          if (m.id === tempMessageId) {
            return {
              ...m,
              status: 'sent',
              id: response?.id || m.id,
            };
          }
          return m;
        })
      );
    } catch (error: any) {
      console.error('Mesaj gönderilemedi:', error);
      setMessages(prev => 
        prev.map(m => {
          if (m.id === tempMessageId) {
            return {
              ...m,
              status: 'error',
              error: error.message || 'Mesaj gönderilemedi',
            };
          }
          return m;
        })
      );
      alert(`Mesaj gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleReplyMessage = async (msg: Message, replyText?: string) => {
    if (!activeAccount || !selectedChat || !msg) return;
    
    const textToSend = replyText || '';
    if (!textToSend.trim()) return;
    
    try {
      await api.replyToMessage(activeAccount.id, selectedChat.id, msg.id || '', textToSend);
      setMessage('');
      setReplyingTo(null);
      updateChatTimestamp(selectedChat.id, textToSend);
      
      setTimeout(() => {
        loadMessages(activeAccount!.id, selectedChat!.id);
      }, 500);
    } catch (error) {
      console.error('Mesaj yanıtlanamadı:', error);
      setToast({ 
        message: 'Mesaj yanıtlanamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
    }
  };

  const handleEditMessage = async (msg: Message, newText: string) => {
    if (!activeAccount || !selectedChat || !newText.trim()) return;
    
    const messageId = msg.id || msg.key?.id;
    if (!messageId) {
      alert('Mesaj ID\'si bulunamadı');
      return;
    }
    
    try {
      await api.editMessage(activeAccount.id, selectedChat.id, messageId, newText);
      
      setMessages(prevMessages => 
        prevMessages.map(m => {
          const mId = m.id || m.key?.id;
          if (mId === messageId) {
            return {
              ...m,
              text: newText,
              body: newText,
              edited: true,
              editedAt: Date.now(),
            };
          }
          return m;
        })
      );
      
      setEditingMessage(null);
      setEditingText('');
    } catch (error) {
      console.error('Mesaj düzenlenemedi:', error);
      alert('Mesaj düzenlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteMessage = async (msg: Message, deleteForEveryone: boolean = false) => {
    if (!activeAccount || !selectedChat) return;
    
    if (!confirm(deleteForEveryone ? 'Bu mesajı herkes için silmek istediğinizden emin misiniz?' : 'Bu mesajı silmek istediğinizden emin misiniz?')) {
      return;
    }
    
    try {
      const messageId = msg.id || msg.key?.id;
      if (messageId) {
        setMessages(prev => prev.filter(m => {
          const mId = m.id || m.key?.id;
          return mId !== messageId;
        }));
      }
      
      await api.deleteMessage(activeAccount.id, selectedChat.id, messageId || '', deleteForEveryone);
      
      setToast({ 
        message: deleteForEveryone ? 'Mesaj herkes için silindi' : 'Mesaj silindi', 
        type: 'success' 
      });
      
      setTimeout(() => {
        loadMessages(activeAccount.id, selectedChat.id);
      }, 500);
    } catch (error) {
      console.error('Mesaj silinemedi:', error);
      setToast({ 
        message: 'Mesaj silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
      loadMessages(activeAccount.id, selectedChat.id);
    }
  };

  const handleForwardMessage = async (msg: Message, toJid: string) => {
    if (!activeAccount || !msg) return;
    
    try {
      await api.forwardMessage(activeAccount.id, selectedChat?.id || '', toJid, msg.id || '');
      setToast({ message: 'Mesaj iletildi', type: 'success' });
      
      if (selectedChat) {
        setTimeout(() => {
          loadMessages(activeAccount.id, selectedChat.id);
        }, 500);
      }
    } catch (error) {
      console.error('Mesaj iletilemedi:', error);
      setToast({ 
        message: 'Mesaj iletilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
    }
  };

  const handleStarMessage = async (msg: Message, star: boolean) => {
    if (!activeAccount || !selectedChat) return;
    
    try {
      await api.starMessage(activeAccount.id, selectedChat.id, msg.id || '', star);
      loadMessages(activeAccount.id, selectedChat.id);
    } catch (error) {
      console.error('Mesaj yıldızlanamadı:', error);
      alert('Mesaj yıldızlanamadı');
    }
  };

  const handleMarkAsRead = async () => {
    if (!activeAccount || !selectedChat) return;
    
    try {
      await api.markMessagesAsRead(activeAccount.id, selectedChat.id);
      loadMessages(activeAccount.id, selectedChat.id);
    } catch (error) {
      console.error('Mesajlar okundu olarak işaretlenemedi:', error);
      alert('Mesajlar okundu olarak işaretlenemedi');
    }
  };

  const handlePinMessage = async (msg: Message, type: number, time: number = 86400) => {
    if (!activeAccount || !selectedChat) return;
    
    try {
      await api.pinMessage(activeAccount.id, selectedChat.id, msg.key || { id: msg.id }, type, time);
      alert(type === 1 ? 'Mesaj sabitlendi' : 'Mesaj sabitlemesi kaldırıldı');
      loadMessages(activeAccount.id, selectedChat.id);
    } catch (error) {
      console.error('Mesaj pinlenemedi:', error);
      alert('Mesaj pinlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteMessageForMe = async (msg: Message) => {
    if (!activeAccount || !selectedChat) return;
    
    try {
      await api.deleteMessageForMe(activeAccount.id, selectedChat.id, msg.id || '', msg.fromMe || false);
      loadMessages(activeAccount.id, selectedChat.id);
    } catch (error) {
      console.error('Mesaj silinemedi:', error);
      alert('Mesaj silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  return {
    sendMessage,
    handleReplyMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleForwardMessage,
    handleStarMessage,
    handleMarkAsRead,
    handlePinMessage,
    handleDeleteMessageForMe,
    addOptimisticMessage,
    updateChatTimestamp,
  };
};

