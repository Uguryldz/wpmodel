// Media message handlers
import * as api from '../api';
import { Message, Chat, Account } from '../types';

export interface MediaHandlersDeps {
  activeAccount: Account | undefined;
  selectedChat: Chat | null;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  loadMessages: (sessionId: string, chatId: string, limit?: number, append?: boolean) => Promise<void>;
  setIsSending: (sending: boolean) => void;
  setShowMediaPreview: (show: boolean) => void;
  setSelectedMediaFile: (file: File | null) => void;
}

export const createMediaHandlers = (deps: MediaHandlersDeps) => {
  const {
    activeAccount,
    selectedChat,
    setMessages,
    setChats,
    loadMessages,
    setIsSending,
    setShowMediaPreview,
    setSelectedMediaFile,
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
      return [...prev, message].sort((a, b) => {
        const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
        const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
        return aTime - bTime;
      });
    });
  };

  const handleSendMedia = async (file: File, type: 'image' | 'video' | 'document', caption?: string) => {
    if (!activeAccount || !selectedChat) return;
    
    setIsSending(true);
    const tempMessageId = `temp-media-${Date.now()}`;
    
    try {
      let mimetype = file.type || 'application/octet-stream';
      if (type === 'image' && !mimetype.startsWith('image/')) {
        mimetype = 'image/jpeg';
      } else if (type === 'video' && !mimetype.startsWith('video/')) {
        mimetype = 'video/mp4';
      }
      
      const optimisticMessage: Message = {
        id: tempMessageId,
        text: type === 'image' ? '📷 Resim' : type === 'video' ? '🎥 Video' : `📎 ${file.name}`,
        body: type === 'image' ? '📷 Resim' : type === 'video' ? '🎥 Video' : `📎 ${file.name}`,
        fromMe: true,
        timestamp: Math.floor(Date.now() / 1000),
        from: selectedChat.id,
        status: 'sending',
        type: type === 'image' ? 'imageMessage' : type === 'video' ? 'videoMessage' : 'documentMessage',
      };
      
      addOptimisticMessage(optimisticMessage);
      
      await api.sendMediaMessage(
        activeAccount.id,
        selectedChat.id,
        file,
        mimetype,
        caption,
        type === 'video' ? { ptv: true } : undefined
      );
      
      setShowMediaPreview(false);
      setSelectedMediaFile(null);
      
      setMessages(prev => 
        prev.map(m => {
          if (m.id === tempMessageId) {
            return { ...m, status: 'sent' };
          }
          return m;
        })
      );
      
      setTimeout(() => {
        loadMessages(activeAccount.id, selectedChat.id, 50, false);
      }, 1000);
    } catch (error: any) {
      console.error('Medya mesajı gönderilemedi:', error);
      setMessages(prev => 
        prev.map(m => {
          if (m.id === tempMessageId) {
            return { ...m, status: 'error', error: error.message || 'Medya gönderilemedi' };
          }
          return m;
        })
      );
      alert(`Medya gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendVoiceMessage = async (audioBlob: Blob) => {
    if (!activeAccount || !selectedChat) return;
    
    const tempMessageId = `temp-voice-${Date.now()}`;
    const mimetype = 'audio/mp4';

    try {
      const optimisticMessage: Message = {
        id: tempMessageId,
        text: '🎤 Ses mesajı',
        body: '🎤 Ses mesajı',
        fromMe: true,
        timestamp: Math.floor(Date.now() / 1000),
        from: selectedChat.id,
        status: 'sending',
        type: 'audioMessage',
        message: {
          audioMessage: {
            mimetype: mimetype,
            ptt: true,
          }
        }
      };

      addOptimisticMessage(optimisticMessage);

      await api.sendMediaMessage(
        activeAccount.id,
        selectedChat.id,
        audioBlob,
        mimetype,
        undefined,
        { ptt: true }
      );

      setChats(prevChats => {
        const index = prevChats.findIndex(c => c.id === selectedChat.id);
        if (index >= 0) {
          const updatedChats = [...prevChats];
          const now = Math.floor(Date.now() / 1000);
          updatedChats[index] = {
            ...updatedChats[index],
            conversationTimestamp: now,
            lastMsgTimestamp: now,
          };
          return updatedChats.sort((a, b) => {
            const aTime = a.conversationTimestamp || a.lastMsgTimestamp || 0;
            const bTime = b.conversationTimestamp || b.lastMsgTimestamp || 0;
            return Number(bTime) - Number(aTime);
          });
        }
        return prevChats;
      });
      
      setTimeout(() => {
        loadMessages(activeAccount.id, selectedChat.id, 50, false);
      }, 1000);
    } catch (error) {
      console.error('Ses mesajı gönderilemedi:', error);
      alert('Ses mesajı gönderilemedi');
      setMessages(prev => prev.filter(m => m.id !== tempMessageId));
    }
  };

  return {
    handleSendMedia,
    handleSendVoiceMessage,
  };
};

