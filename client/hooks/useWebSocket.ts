// WebSocket bağlantı yönetimi hook'u
// Event handler'lar ayrı dosyalarda: client/websocket/handlers/
// Backend core'dan adapte edilmiş gelişmiş connection management
import { useEffect, useRef, useState } from 'react';
import { Chat, Message } from '../types';
import { WebSocketContext } from '../websocket/types';
import { WebSocketRequestHandler } from '../websocket/requestHandler';
import {
  handleChatsSet,
  handleChatsUpsert,
  handleChatsUpdate,
  handleMessagesUpsert,
  handleMessagesSet,
  handleMessagesUpdate,
  handleContactsSet,
  handleContactsUpsert,
  handlePresenceUpdate,
  handleGroupsUpdate,
  handleGroupParticipantsUpdate,
  handleConnectionUpdate,
  handleSessionsUpdate,
  handleProfileUpdate,
  handlePrivacyUpdate,
  handleBroadcastQuery,
  handleStatusUpdate,
} from '../websocket/handlers';
import { 
  ConnectionManager, 
  ConnectionState as ConnState 
} from '../utils/connectionManager';
import { 
  ErrorHandler, 
  ErrorType, 
  AppError 
} from '../utils/errorHandler';

interface UseWebSocketProps {
  activeAccountRef: React.MutableRefObject<any>;
  selectedChatRef: React.MutableRefObject<Chat | null>;
  contactsCacheRef: React.MutableRefObject<Map<string, { data: Map<string, any>, timestamp: number }>>;
  chatsLoadedRef: React.MutableRefObject<Map<string, boolean>>;
  chatsInitialLoadRef: React.MutableRefObject<Map<string, boolean>>;
  messagesInitialLoadRef: React.MutableRefObject<Map<string, boolean>>;
  chatProfilePictures: Map<string, string>;
  chats: Chat[];
  selectedChat: Chat | null;
  // Callbacks
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setChatProfilePictures: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setSelectedChat: React.Dispatch<React.SetStateAction<Chat | null>>;
  queueProfilePicture: (sessionId: string, jid: string) => void;
  loadChats?: (sessionId: string, limit: number, force: boolean) => void;
  updateMessagesCache?: (sessionId: string, chatId: string, messages: Message[]) => void;
  messagesCacheRef?: React.MutableRefObject<Map<string, Message[]>>;
  setAccounts?: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useWebSocket({
  activeAccountRef,
  selectedChatRef,
  contactsCacheRef,
  chatsLoadedRef,
  chatsInitialLoadRef,
  messagesInitialLoadRef,
  chatProfilePictures,
  chats,
  selectedChat,
  setChats,
  setMessages,
  setChatProfilePictures,
  setSelectedChat,
  queueProfilePicture,
  loadChats,
  updateMessagesCache,
  messagesCacheRef,
  setAccounts,
}: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const requestHandlerRef = useRef<WebSocketRequestHandler | null>(null);
  const connectionManagerRef = useRef<ConnectionManager | null>(null);
  const errorHandlerRef = useRef<ErrorHandler | null>(null);
  const isMountedRef = useRef<boolean>(true);
  
  // Connection state tracking (UI için)
  const [connectionState, setConnectionState] = useState<ConnState>({
    status: 'disconnected',
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null,
    disconnectedAt: null,
  });

  useEffect(() => {
    isMountedRef.current = true;

    // Error Handler oluştur
    const errorHandler = new ErrorHandler((error: AppError) => {
      console.error('[useWebSocket] Error:', error);
      // UI'da error göstermek için state güncellenebilir
    });
    errorHandlerRef.current = errorHandler;

    // WebSocket context - handler'lara geçirilecek
    const context: WebSocketContext = {
      activeAccountRef,
      selectedChatRef,
      contactsCacheRef,
      chatsLoadedRef,
      chatsInitialLoadRef,
      messagesInitialLoadRef,
      chatProfilePictures,
      chats,
      selectedChat,
      setChats,
      setMessages,
      setChatProfilePictures,
      setSelectedChat,
      queueProfilePicture,
      loadChats,
      updateMessagesCache,
      messagesCacheRef,
      setAccounts,
    };

    // WebSocket URL oluştur
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    // Connection Manager oluştur (Backend core'dan adapte edilmiş)
    const connectionManager = new ConnectionManager({
      url: wsUrl,
      reconnect: true,
      reconnectDelay: 2000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      
      // State değişikliklerini izle
      onStateChange: (state) => {
        console.log('[ConnectionManager] State değişti:', state);
        setConnectionState(state);
      },
      
      // Mesajları işle
      onMessage: (data) => {
        try {
          console.log('[WebSocket] 📨 Mesaj alındı:', data);

          // Context'i güncelle (ref'ler her zaman güncel)
          context.chats = chats;
          context.selectedChat = selectedChat;
          context.chatProfilePictures = chatProfilePictures;

          // Response mesajları - reaction response'larını özel olarak işle
          if (data.type === 'response') {
            // Reaction response'unu kontrol et
            if (data.success && data.data?.status === 'reacted' && data.data?.messageId && data.data?.emoji) {
              console.log('[WebSocket] 🎭 Reaction response alındı:', data.data);
              
              // İlgili mesajı bul ve güncelle
              setMessages(prevMessages => {
                const messageId = data.data.messageId;
                const emoji = data.data.emoji;
                
                // Debug: Mevcut mesajların ID'lerini logla
                console.log('[WebSocket] 🔍 Mesaj arama - Aranan messageId:', messageId);
                console.log('[WebSocket] 🔍 Mevcut mesajların ID\'leri:', prevMessages.map((msg, idx) => ({
                  index: idx,
                  id: msg.id,
                  keyId: msg.key?.id,
                  matches: (msg.id === messageId) || (msg.key?.id === messageId)
                })).slice(0, 5));
                
                // Mesajı bul - daha kapsamlı arama
                const messageIndex = prevMessages.findIndex(msg => {
                  // Tam eşleşme
                  if (msg.id === messageId || msg.key?.id === messageId) {
                    return true;
                  }
                  // Case-insensitive eşleşme
                  if (msg.id && msg.id.toUpperCase() === messageId.toUpperCase()) {
                    return true;
                  }
                  if (msg.key?.id && msg.key.id.toUpperCase() === messageId.toUpperCase()) {
                    return true;
                  }
                  // String olarak karşılaştır (trim ve normalize)
                  const msgIdStr = String(msg.id || msg.key?.id || '').trim();
                  const searchIdStr = String(messageId).trim();
                  if (msgIdStr && searchIdStr && msgIdStr === searchIdStr) {
                    return true;
                  }
                  return false;
                });
                
                if (messageIndex === -1) {
                  console.warn('[WebSocket] ⚠️ Reaction için mesaj bulunamadı:', {
                    searchedMessageId: messageId,
                    availableIds: prevMessages.slice(0, 10).map(m => ({
                      id: m.id,
                      keyId: m.key?.id
                    }))
                  });
                  return prevMessages;
                }
                
                console.log('[WebSocket] ✅ Mesaj bulundu:', {
                  index: messageIndex,
                  messageId: messageId,
                  foundMessageId: prevMessages[messageIndex].id || prevMessages[messageIndex].key?.id
                });
                
                const updatedMessages = [...prevMessages];
                const message = updatedMessages[messageIndex];
                
                // Reaction'ları güncelle
                // Reaction formatı: array veya object olabilir
                let reactions = message.reactions || message.message?.reactions || [];
                
                // Eğer array değilse, array'e çevir
                if (!Array.isArray(reactions)) {
                  if (typeof reactions === 'object' && reactions !== null) {
                    reactions = Object.entries(reactions).map(([key, value]: [string, any]) => ({
                      emoji: value?.emoji || value?.text || key,
                      key: value?.key || key,
                      count: value?.count || 1
                    }));
                  } else {
                    reactions = [];
                  }
                }
                
                // Aynı emoji'yi kontrol et - varsa güncelle, yoksa ekle
                const existingReactionIndex = reactions.findIndex((r: any) => 
                  (r.emoji === emoji) || (r.text === emoji)
                );
                
                if (existingReactionIndex >= 0) {
                  // Reaction zaten var, güncelle (count artır veya değiştir)
                  reactions[existingReactionIndex] = {
                    ...reactions[existingReactionIndex],
                    emoji: emoji,
                    count: (reactions[existingReactionIndex].count || 1) + 1
                  };
                } else {
                  // Yeni reaction ekle
                  reactions.push({
                    emoji: emoji,
                    key: `reaction-${Date.now()}`,
                    count: 1
                  });
                }
                
                // Mesajı güncelle
                updatedMessages[messageIndex] = {
                  ...message,
                  reactions: reactions,
                  message: message.message ? {
                    ...message.message,
                    reactions: reactions
                  } : undefined
                };
                
                console.log('[WebSocket] ✅ Reaction eklendi, güncellenmiş mesaj:', {
                  messageId: messageId,
                  emoji: emoji,
                  reactions: reactions
                });
                
                return updatedMessages;
              });
              
              // Request handler'a da bırak (pending request varsa resolve etsin)
              return;
            }
            
            // Diğer response'lar request handler'da işlenecek
            return;
          }

          // Event handler'ları çağır
          switch (data.type) {
            case 'chats.set':
              handleChatsSet(data, context);
              break;
            case 'chats.upsert':
              handleChatsUpsert(data, context);
              break;
            case 'chats.update':
              handleChatsUpdate(data, context);
              break;
            case 'contacts.set':
              handleContactsSet(data, context);
              break;
            case 'contacts.upsert':
              handleContactsUpsert(data, context);
              break;
            case 'messages.upsert':
              handleMessagesUpsert(data, context);
              break;
            case 'messages.set':
              handleMessagesSet(data, context);
              break;
            case 'messages.update':
              handleMessagesUpdate(data, context);
              break;
            case 'presence.update':
              handlePresenceUpdate(data, context);
              break;
            case 'groups.update':
              handleGroupsUpdate(data, context);
              break;
            case 'group-participants.update':
              handleGroupParticipantsUpdate(data, context);
              break;
            case 'connection.update':
              handleConnectionUpdate(data, context);
              break;
            case 'sessions.update':
              handleSessionsUpdate(data, context);
              break;
            case 'profile.update':
              handleProfileUpdate(data, context);
              break;
            case 'privacy.update':
              handlePrivacyUpdate(data, context);
              break;
            case 'broadcast.query':
              handleBroadcastQuery(data, context);
              break;
            case 'status.update':
              handleStatusUpdate(data, context);
              break;
            case 'connected':
              console.log('[WebSocket] ✅ Bağlantı onayı alındı:', data.message);
              break;
            case 'ping':
              // Heartbeat - ignore
              break;
            default:
              console.warn('[WebSocket] ⚠️ Bilinmeyen event tipi:', data.type);
          }
        } catch (error) {
          console.error('[WebSocket] ❌ Mesaj işleme hatası:', error);
          errorHandler.handle(
            error instanceof Error ? error : new Error(String(error)),
            ErrorType.WEBSOCKET,
            { data }
          );
        }
      },
      
      // Hataları işle
      onError: (error) => {
        errorHandler.handle(error, ErrorType.WEBSOCKET);
      },
    });

    connectionManagerRef.current = connectionManager;

    // Bağlantıyı başlat
    connectionManager.connect().then(() => {
      const ws = connectionManager.getWebSocket();
      if (ws) {
        wsRef.current = ws;
        
        // Request handler'ı oluştur
        const requestHandler = new WebSocketRequestHandler(ws);
        requestHandlerRef.current = requestHandler;
        
        const currentActiveAccount = activeAccountRef.current;
        if (currentActiveAccount) {
          console.log('[WebSocket] Aktif hesap:', currentActiveAccount.id);
        }
      }
    }).catch((error) => {
      console.error('[WebSocket] Bağlantı başlatma hatası:', error);
      errorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        ErrorType.WEBSOCKET
      );
    });

    // Cleanup
    return () => {
      isMountedRef.current = false;
      
      if (requestHandlerRef.current) {
        requestHandlerRef.current.cleanup();
        requestHandlerRef.current = null;
      }
      
      if (connectionManagerRef.current) {
        connectionManagerRef.current.disconnect();
        connectionManagerRef.current = null;
      }
      
      wsRef.current = null;
    };
  }, []); // Sadece mount'ta çalış - ref'ler zaten güncel değerleri içeriyor

  return { 
    wsRef, 
    connectionState, // Backend core'dan adapte edilmiş connection state
    sendRequest: (requestType: string, payload: any) => {
      if (requestHandlerRef.current) {
        return requestHandlerRef.current.sendRequest(requestType, payload);
      }
      return Promise.reject(new Error('WebSocket is not connected'));
    },
    // Connection manager'a direkt erişim (advanced kullanım için)
    connectionManager: connectionManagerRef.current,
    errorHandler: errorHandlerRef.current,
  };
}
