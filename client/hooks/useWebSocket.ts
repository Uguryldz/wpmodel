// WebSocket bağlantı yönetimi hook'u
// Event handler'lar ayrı dosyalarda: client/websocket/handlers/
import { useEffect, useRef } from 'react';
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
} from '../websocket/handlers';

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
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;

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

    const connectWebSocket = () => {
      // Vite dev server için proxy kullan
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;
      console.log('[WebSocket] Bağlanılıyor:', wsUrl);
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        // Request handler'ı oluştur
        const requestHandler = new WebSocketRequestHandler(ws);
        requestHandlerRef.current = requestHandler;

        ws.onopen = () => {
          console.log('[WebSocket] ✅ Bağlantı kuruldu');
          reconnectTimeout = null;
          
          const currentActiveAccount = activeAccountRef.current;
          if (currentActiveAccount) {
            console.log('[WebSocket] Aktif hesap:', currentActiveAccount.id);
          }
        };
        
        ws.onerror = (error) => {
          console.error('[WebSocket] ❌ Hata:', error);
        };
        
        ws.onclose = (event) => {
          console.warn('[WebSocket] ⚠️ Bağlantı kapandı:', event.code, event.reason);
          wsRef.current = null;
          
          const isNormalClose = event.code === 1000 || event.code === 1001;
          const reconnectDelay = isNormalClose ? 3000 : 5000;
          
          if (isMountedRef.current && !reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              if (isMountedRef.current && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
                console.log('[WebSocket] 🔄 Yeniden bağlanılıyor...');
                connectWebSocket();
              }
            }, reconnectDelay);
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WebSocket] 📨 Mesaj alındı:', data);

            // Context'i güncelle (ref'ler her zaman güncel)
            context.chats = chats;
            context.selectedChat = selectedChat;
            context.chatProfilePictures = chatProfilePictures;

            // Response mesajları request handler'da işleniyor, buraya gelmez
            if (data.type === 'response') {
              // Request handler tarafından işlenecek
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
              case 'connected':
                console.log('[WebSocket] ✅ Bağlantı onayı alındı:', data.message);
                break;
              default:
                console.warn('[WebSocket] ⚠️ Bilinmeyen event tipi:', data.type);
            }
          } catch (error) {
            console.error('[WebSocket] ❌ Mesaj işleme hatası:', error);
            if (error instanceof Error) {
              console.error('[WebSocket] Hata detayları:', {
                message: error.message,
                stack: error.stack,
                name: error.name
              });
            }
          }
        };
      } catch (error) {
        console.error('[WebSocket] Bağlantı hatası:', error);
        if (isMountedRef.current && !reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            if (isMountedRef.current) {
              connectWebSocket();
            }
          }, 3000);
        }
      }
    };

    connectWebSocket();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (requestHandlerRef.current) {
        requestHandlerRef.current.cleanup();
        requestHandlerRef.current = null;
      }
      if (wsRef.current) {
        try {
        wsRef.current.close();
        } catch (error) {
          // Ignore close errors
        }
        wsRef.current = null;
      }
    };
  }, []); // Sadece mount'ta çalış - ref'ler zaten güncel değerleri içeriyor

  return { 
    wsRef, 
    sendRequest: (requestType: string, payload: any) => {
      if (requestHandlerRef.current) {
        return requestHandlerRef.current.sendRequest(requestType, payload);
      }
      return Promise.reject(new Error('WebSocket is not connected'));
    }
  };
}
