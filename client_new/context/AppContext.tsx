// ============================================
// Application Context
// Global state management with React Context
// ============================================

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import type { Account, Chat, Message, Contact, ConnectionState, Toast, ChatFilter } from '../types';
import { getWebSocketClient, WebSocketClient } from '../websocket/WebSocketClient';
import { standardizeChatId, isSameJid, extractPhoneFromJid, normalizePhoneNumber } from '../utils/jid';
import { extractMessageText, getMessageId, isFromMe, sortMessagesByTime, removeDuplicateMessages } from '../utils/message';
import { COLORS } from '../constants';

// ============================================
// State Types
// ============================================

interface AppState {
  // Account state
  accounts: Account[];
  activeAccountId: string | null;
  
  // Chat state
  chats: Chat[];
  selectedChatId: string | null;
  chatFilter: ChatFilter;
  chatSearchTerm: string;
  
  // Message state
  messages: Message[];
  messageInput: string;
  
  // Contact state
  contacts: Map<string, Contact>;
  
  // Profile pictures
  profilePictures: Map<string, string>;
  
  // Connection state
  connectionState: ConnectionState;
  
  // UI state
  toasts: Toast[];
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  isLoadingContacts: boolean;
  isSendingMessage: boolean;
}

// ============================================
// Action Types
// ============================================

type AppAction =
  // Account actions
  | { type: 'SET_ACCOUNTS'; payload: Account[] }
  | { type: 'SET_ACTIVE_ACCOUNT'; payload: string }
  | { type: 'UPDATE_ACCOUNT'; payload: Partial<Account> & { id: string } }
  
  // Chat actions
  | { type: 'SET_CHATS'; payload: Chat[] }
  | { type: 'UPDATE_CHAT'; payload: Partial<Chat> & { id: string } }
  | { type: 'UPSERT_CHATS'; payload: Chat[] }
  | { type: 'SET_SELECTED_CHAT'; payload: string | null }
  | { type: 'SET_CHAT_FILTER'; payload: ChatFilter }
  | { type: 'SET_CHAT_SEARCH'; payload: string }
  | { type: 'CLEAR_CHATS' }
  
  // Message actions
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: Partial<Message> & { id: string } }
  | { type: 'REMOVE_MESSAGE'; payload: string }
  | { type: 'SET_MESSAGE_INPUT'; payload: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'REGISTER_OPTIMISTIC_MESSAGE'; payload: { tempId: string; chatId: string; text: string; timestamp: number } }
  | { type: 'MATCH_OPTIMISTIC_MESSAGE'; payload: { tempId: string; realId: string } }
  
  // Contact actions
  | { type: 'SET_CONTACTS'; payload: Map<string, Contact> }
  | { type: 'UPSERT_CONTACTS'; payload: Contact[] }
  | { type: 'CLEAR_CONTACTS' }
  
  // Profile picture actions
  | { type: 'SET_PROFILE_PICTURE'; payload: { jid: string; url: string } }
  | { type: 'SET_PROFILE_PICTURES'; payload: Map<string, string> }
  
  // Connection actions
  | { type: 'SET_CONNECTION_STATE'; payload: ConnectionState }
  
  // UI actions
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_LOADING_CHATS'; payload: boolean }
  | { type: 'SET_LOADING_MESSAGES'; payload: boolean }
  | { type: 'SET_LOADING_CONTACTS'; payload: boolean }
  | { type: 'SET_SENDING_MESSAGE'; payload: boolean }
  
  // Reset action (hesap değişikliğinde)
  | { type: 'RESET_FOR_ACCOUNT_CHANGE' };

// ============================================
// Initial State
// ============================================

const initialState: AppState = {
  accounts: [],
  activeAccountId: null,
  chats: [],
  selectedChatId: null,
  chatFilter: 'all',
  chatSearchTerm: '',
  messages: [],
  messageInput: '',
  contacts: new Map(),
  profilePictures: new Map(),
  connectionState: {
    status: 'disconnected',
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null,
    disconnectedAt: null,
  },
  toasts: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  isLoadingContacts: false,
  isSendingMessage: false,
};

// ============================================
// Reducer
// ============================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // Account actions
    case 'SET_ACCOUNTS':
      return { ...state, accounts: action.payload };
    
    case 'SET_ACTIVE_ACCOUNT': {
      const newAccounts = state.accounts.map(acc => ({
        ...acc,
        active: acc.id === action.payload,
      }));
      return { ...state, accounts: newAccounts, activeAccountId: action.payload };
    }
    
    case 'UPDATE_ACCOUNT': {
      const newAccounts = state.accounts.map(acc =>
        acc.id === action.payload.id ? { ...acc, ...action.payload } : acc
      );
      return { ...state, accounts: newAccounts };
    }
    
    // Chat actions
    case 'SET_CHATS':
      return { ...state, chats: Array.isArray(action.payload) ? action.payload : [], isLoadingChats: false };
    
    case 'UPDATE_CHAT': {
      const currentChats = Array.isArray(state.chats) ? state.chats : [];
      const newChats = currentChats.map(chat =>
        chat.id === action.payload.id ? { ...chat, ...action.payload } : chat
      );
      return { ...state, chats: newChats };
    }
    
    case 'UPSERT_CHATS': {
      if (!Array.isArray(action.payload)) {
        console.warn('[AppContext] UPSERT_CHATS: payload array değil:', action.payload);
        return state;
      }
      const currentChats = Array.isArray(state.chats) ? state.chats : [];
      const chatMap = new Map(currentChats.map(c => [c.id, c]));
      action.payload.forEach(chat => {
        const normalizedId = standardizeChatId(chat.id);
        const existing = chatMap.get(normalizedId);
        chatMap.set(normalizedId, existing ? { ...existing, ...chat, id: normalizedId } : { ...chat, id: normalizedId });
      });
      const newChats = Array.from(chatMap.values()).sort((a, b) => {
        const aTime = a.conversationTimestamp || 0;
        const bTime = b.conversationTimestamp || 0;
        return Number(bTime) - Number(aTime);
      });
      return { ...state, chats: newChats };
    }
    
    case 'SET_SELECTED_CHAT':
      return { ...state, selectedChatId: action.payload };
    
    case 'SET_CHAT_FILTER':
      return { ...state, chatFilter: action.payload };
    
    case 'SET_CHAT_SEARCH':
      return { ...state, chatSearchTerm: action.payload };
    
    case 'CLEAR_CHATS':
      return { ...state, chats: [], selectedChatId: null };
    
    // Message actions
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload, isLoadingMessages: false };
    
    case 'ADD_MESSAGE': {
      const existingIds = new Set(state.messages.map(m => getMessageId(m)));
      const newMsgId = getMessageId(action.payload);
      
      console.log('[AppContext] 🔍 ADD_MESSAGE reducer:', {
        newMsgId,
        existingCount: state.messages.length,
        isDuplicate: existingIds.has(newMsgId),
        messageText: action.payload.text?.substring(0, 30),
        fromMe: action.payload.fromMe,
        isTemp: newMsgId.startsWith('temp-')
      });
      
      // Duplicate kontrolü
      if (existingIds.has(newMsgId)) {
        console.log('[AppContext] ⚠️ Mesaj zaten var, duplicate atlandı:', newMsgId);
        return state;
      }
      
      // Optimistic mesaj kaydet (temp- ile başlıyorsa)
      // Bu işlem reducer dışında yapılmalı ama şimdilik burada yapıyoruz
      // Çünkü reducer içinde ref'lere erişemiyoruz
      
      // Eğer gerçek mesaj geliyorsa (temp- ile başlamıyorsa) ve fromMe ise,
      // optimistic mesajı bul ve değiştir
      if (!newMsgId.startsWith('temp-') && action.payload.fromMe && action.payload.text) {
        const chatId = action.payload.from || action.payload.key?.remoteJid || '';
        const normalizedChatId = chatId ? standardizeChatId(chatId) : '';
        
        // Optimistic mesajları kontrol et - text ve timestamp'e göre
        let foundOptimisticId: string | null = null;
        const filteredMessages = state.messages.filter(msg => {
          const msgId = getMessageId(msg);
          // Optimistic mesajları kontrol et
          if (msgId.startsWith('temp-') && msg.fromMe && msg.text === action.payload.text) {
            const timeDiff = Math.abs((msg.timestamp || 0) - (action.payload.timestamp || 0));
            // 5 saniye içinde gönderilmişse, optimistic mesajı kaldır
            if (timeDiff < 5) {
              foundOptimisticId = msgId;
              console.log('[AppContext] 🔄 Optimistic mesaj bulundu, gerçek mesaj ile değiştiriliyor:', {
                optimisticId: msgId,
                realId: newMsgId,
                timeDiff,
                chatId: normalizedChatId
              });
              return false;
            }
          }
          return true;
        });
        
        // Optimistic mesaj mapping'den kaldır - bu işlem reducer dışında yapılacak
        
        const newMessages = sortMessagesByTime([...filteredMessages, action.payload]);
        console.log('[AppContext] ✅ Mesaj eklendi (optimistic temizlendi), yeni toplam:', newMessages.length);
        return { ...state, messages: newMessages };
      }
      
      const newMessages = sortMessagesByTime([...state.messages, action.payload]);
      console.log('[AppContext] ✅ Mesaj eklendi, yeni toplam:', newMessages.length);
      return { ...state, messages: newMessages };
    }
    
    case 'UPDATE_MESSAGE': {
      const newMessages = state.messages.map(msg =>
        getMessageId(msg) === action.payload.id ? { ...msg, ...action.payload } : msg
      );
      return { ...state, messages: newMessages };
    }
    
    case 'REMOVE_MESSAGE': {
      const newMessages = state.messages.filter(msg => getMessageId(msg) !== action.payload);
      return { ...state, messages: newMessages };
    }
    
    case 'SET_MESSAGE_INPUT':
      return { ...state, messageInput: action.payload };
    
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [], messageInput: '' };
    
    // Contact actions
    case 'SET_CONTACTS':
      return { ...state, contacts: action.payload, isLoadingContacts: false };
    
    case 'UPSERT_CONTACTS': {
      const newContacts = new Map(state.contacts);
      action.payload.forEach(contact => {
        newContacts.set(contact.id, { ...newContacts.get(contact.id), ...contact });
      });
      return { ...state, contacts: newContacts };
    }
    
    case 'CLEAR_CONTACTS':
      return { ...state, contacts: new Map() };
    
    // Profile picture actions
    case 'SET_PROFILE_PICTURE': {
      const newPictures = new Map(state.profilePictures);
      newPictures.set(action.payload.jid, action.payload.url);
      return { ...state, profilePictures: newPictures };
    }
    
    case 'SET_PROFILE_PICTURES':
      return { ...state, profilePictures: action.payload };
    
    // Connection actions
    case 'SET_CONNECTION_STATE':
      return { ...state, connectionState: action.payload };
    
    // UI actions
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] };
    
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    
    case 'SET_LOADING_CHATS':
      return { ...state, isLoadingChats: action.payload };
    
    case 'SET_LOADING_MESSAGES':
      return { ...state, isLoadingMessages: action.payload };
    
    case 'SET_LOADING_CONTACTS':
      return { ...state, isLoadingContacts: action.payload };
    
    case 'SET_SENDING_MESSAGE':
      return { ...state, isSendingMessage: action.payload };
    
    // Reset for account change
    case 'RESET_FOR_ACCOUNT_CHANGE':
      return {
        ...state,
        chats: [],
        selectedChatId: null,
        messages: [],
        messageInput: '',
        contacts: new Map(),
        isLoadingChats: false,
        isLoadingMessages: false,
        isLoadingContacts: false,
      };
    
    default:
      return state;
  }
}

// ============================================
// Context
// ============================================

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  wsClient: WebSocketClient;
  // Computed values
  activeAccount: Account | null;
  selectedChat: Chat | null;
  filteredChats: Chat[];
  // Actions
  sendRequest: <T = any>(type: string, payload: any) => Promise<T>;
  showToast: (message: string, type: Toast['type']) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ============================================
// Provider
// ============================================

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const wsClientRef = useRef<WebSocketClient>(getWebSocketClient());
  const prevActiveAccountIdRef = useRef<string | null>(null);
  const prevSelectedChatIdRef = useRef<string | null>(null);
  // Mesajları chat bazında cache'le: sessionId-chatId -> Message[]
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  // Optimistic mesajları takip et: tempId -> {chatId, text, timestamp, realId}
  const optimisticMessagesRef = useRef<Map<string, { chatId: string; text: string; timestamp: number; realId?: string }>>(new Map());
  // Stale closure sorununu çözmek için ref'ler (WebSocket callback'leri için)
  const selectedChatIdRef = useRef<string | null>(null);
  const activeAccountIdRef = useRef<string | null>(null);
  
  const wsClient = wsClientRef.current;
  
  // Optimistic mesajları sadece memory'de tut (localStorage'a kaydetme)
  // LocalStorage kaydı kaldırıldı - sadece memory'de tutuluyor
  
  // Optimistic mesajları kaydet (ADD_MESSAGE action'ından sonra) - sadece memory'de
  useEffect(() => {
    // Son eklenen mesajı kontrol et
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage) {
      const msgId = getMessageId(lastMessage);
      // Eğer optimistic mesaj ise kaydet
      if (msgId.startsWith('temp-') && lastMessage.fromMe && lastMessage.text) {
        const chatId = lastMessage.from || lastMessage.key?.remoteJid || '';
        if (chatId && !optimisticMessagesRef.current.has(msgId)) {
          optimisticMessagesRef.current.set(msgId, {
            chatId: standardizeChatId(chatId),
            text: lastMessage.text,
            timestamp: lastMessage.timestamp || Math.floor(Date.now() / 1000)
          });
          console.log('[AppContext] 📝 Optimistic mesaj kaydedildi (memory):', {
            tempId: msgId,
            chatId: standardizeChatId(chatId),
            text: lastMessage.text
          });
        }
      }
    }
  }, [state.messages]);
  
  // State değiştiğinde ref'leri güncelle (stale closure sorununu çözmek için)
  useEffect(() => {
    selectedChatIdRef.current = state.selectedChatId;
  }, [state.selectedChatId]);
  
  useEffect(() => {
    activeAccountIdRef.current = state.activeAccountId;
  }, [state.activeAccountId]);
  
  // ============================================
  // WebSocket Connection
  // ============================================
  
  useEffect(() => {
    let isMounted = true;
    
    // WebSocket'e bağlan
    wsClient.connect().catch((error) => {
      if (isMounted) {
        console.error('[AppContext] WebSocket bağlantı hatası:', error);
      }
    });
    
    // State change handler
    const unsubState = wsClient.onStateChange((connectionState) => {
      if (isMounted) {
        dispatch({ type: 'SET_CONNECTION_STATE', payload: connectionState });
      }
    });
    
    // Message handler
    const unsubMessage = wsClient.onMessage((data) => {
      if (isMounted) {
        handleWebSocketMessage(data);
      }
    });
    
    return () => {
      isMounted = false;
      unsubState();
      unsubMessage();
      // Sadece bağlantı açıksa disconnect et
      if (wsClient.isConnected()) {
        wsClient.disconnect();
      }
    };
  }, []);
  
  // ============================================
  // WebSocket Message Handler
  // ============================================
  
  const handleWebSocketMessage = useCallback((data: any) => {
    // Ref'lerden güncel değerleri al (stale closure sorununu çözmek için)
    const activeAccountId = activeAccountIdRef.current;
    const selectedChatId = selectedChatIdRef.current;
    
    // State'in diğer kısımları için dispatch kullanılacak
    const currentState = state;
    
    console.log('[AppContext] 📨 WebSocket mesajı:', data.type, { 
      sessionId: data.sessionId, 
      activeAccountId,
      selectedChatId,
      hasMessages: Array.isArray(data.messages),
      messageCount: data.messages?.length || 0
    });
    
    switch (data.type) {
      case 'chats.set':
        // SessionId kontrolü - eşleşiyorsa veya aktif hesap yoksa (ilk yükleme) işle
        if ((!activeAccountId || data.sessionId === activeAccountId) && data.chats && Array.isArray(data.chats)) {
          console.log('[AppContext] ✅ chats.set işleniyor:', data.chats.length, 'chat');
          const formattedChats = formatChats(data.chats, currentState.contacts, currentState.profilePictures);
          dispatch({ type: 'SET_CHATS', payload: formattedChats });
        } else {
          console.log('[AppContext] ⚠️ chats.set atlandı:', { 
            sessionId: data.sessionId, 
            activeAccountId, 
            match: data.sessionId === activeAccountId,
            hasChats: Array.isArray(data.chats)
          });
        }
        break;
      
      case 'chats.upsert':
        if (data.sessionId === activeAccountId && data.chats && Array.isArray(data.chats)) {
          const formattedChats = formatChats(data.chats, currentState.contacts, currentState.profilePictures);
          dispatch({ type: 'UPSERT_CHATS', payload: formattedChats });
        }
        break;
      
      case 'contacts.set':
      case 'contacts.upsert':
        // SessionId kontrolü - eşleşiyorsa veya aktif hesap yoksa (ilk yükleme) işle
        if ((!activeAccountId || data.sessionId === activeAccountId) && data.contacts && Array.isArray(data.contacts)) {
          console.log('[AppContext] ✅ contacts.set işleniyor:', data.contacts.length, 'contact');
          const contactsMap = new Map<string, Contact>();
          data.contacts.forEach((contact: any) => {
            // @lid formatını handle et
            let contactId = contact.id;
            if (contact.id && contact.id.includes('@lid') && contact.lidJid) {
              contactId = contact.lidJid;
            }
            contactId = standardizeChatId(contactId);
            
            contactsMap.set(contactId, {
              id: contactId,
              name: contact.name,
              notify: contact.notify,
              verifiedName: contact.verifiedName,
              imgUrl: contact.imgUrl,
              status: contact.status,
            });
            if (contact.imgUrl) {
              dispatch({ type: 'SET_PROFILE_PICTURE', payload: { jid: contactId, url: contact.imgUrl } });
            }
          });
          dispatch({ type: 'SET_CONTACTS', payload: contactsMap });
        } else {
          console.log('[AppContext] ⚠️ contacts.set atlandı:', { 
            sessionId: data.sessionId, 
            activeAccountId, 
            match: data.sessionId === activeAccountId,
            hasContacts: Array.isArray(data.contacts)
          });
        }
        break;
      
      case 'messages.upsert':
        // SessionId kontrolü - eşleşiyorsa veya aktif hesap yoksa (ilk yükleme) işle
        const sessionId = data.sessionId || activeAccountId;
        if (sessionId && data.messages && Array.isArray(data.messages)) {
          console.log('[AppContext] ✅ messages.upsert işleniyor:', {
            messageCount: data.messages.length,
            sessionId,
            selectedChatId,
            eventType: data.eventType, // "append" veya "notify"
            firstMessage: data.messages[0] ? {
              id: data.messages[0].id,
              from: data.messages[0].from,
              fromMe: data.messages[0].fromMe,
              text: data.messages[0].text?.substring(0, 30)
            } : null
          });
          handleMessagesUpsert(data.messages, sessionId, data.eventType);
        } else {
          console.log('[AppContext] ⚠️ messages.upsert atlandı:', { 
            sessionId: data.sessionId, 
            activeAccountId, 
            hasMessages: Array.isArray(data.messages)
          });
        }
        break;
      
      case 'chats.update':
        // SessionId kontrolü - eşleşiyorsa veya aktif hesap yoksa (ilk yükleme) işle
        const updateSessionId = data.sessionId || activeAccountId;
        if (updateSessionId && data.updates && Array.isArray(data.updates)) {
          console.log('[AppContext] ✅ chats.update işleniyor:', {
            updateCount: data.updates.length,
            sessionId: updateSessionId
          });
          handleChatsUpdate(data.updates, updateSessionId);
        } else {
          console.log('[AppContext] ⚠️ chats.update atlandı:', { 
            sessionId: data.sessionId, 
            activeAccountId, 
            hasUpdates: Array.isArray(data.updates)
          });
        }
        break;
      
      case 'messages.update':
        if ((!activeAccountId || data.sessionId === activeAccountId) && data.updates && Array.isArray(data.updates)) {
          console.log('[AppContext] ✅ messages.update işleniyor:', {
            updateCount: data.updates.length,
            sessionId: data.sessionId,
            updates: data.updates.map((u: any) => ({
              updateType: u.updateType,
              jid: u.jid,
              key: u.key
            }))
          });
          handleMessagesUpdate(data.updates, selectedChatId);
        }
        break;
      
      case 'response':
        // Response event'ini handle et (sendMessage için status güncellemesi)
        if (data.requestId && data.success !== undefined) {
          handleResponse(data.requestId, data.success, data.data);
        }
        break;
      
      case 'sessions.update':
        if (data.sessions) {
          handleSessionsUpdate(data.sessions);
        }
        break;
    }
  }, []); // ✅ Artık dependency'ye gerek yok, ref'ler kullanılıyor
  
  // ============================================
  // Message Handlers
  // ============================================
  
  const handleMessagesUpsert = useCallback((messages: any[], sessionId: string | null, eventType?: string) => {
    // Ref'lerden güncel değerleri al (stale closure sorununu çözmek için)
    const activeAccountId = activeAccountIdRef.current;
    const selectedChatId = selectedChatIdRef.current;
    
    // State'in diğer kısımları için dispatch kullanılacak
    const currentState = state;
    
    console.log('[AppContext] 🔍 handleMessagesUpsert başladı:', {
      messageCount: messages.length,
      sessionId,
      activeAccountId,
      selectedChatId,
      normalizedSelectedChatId: selectedChatId ? standardizeChatId(selectedChatId) : null,
      firstMessage: messages[0] ? {
        id: messages[0].id,
        from: messages[0].from,
        keyRemoteJid: messages[0].key?.remoteJid,
        keyRemoteJidAlt: messages[0].key?.remoteJidAlt,
        fromMe: messages[0].fromMe,
        text: messages[0].text
      } : null
    });
    
    if (!sessionId) {
      console.log('[AppContext] ⚠️ handleMessagesUpsert: sessionId yok');
      return;
    }
    
    // Mesajları chat bazında grupla
    const messagesByChat = new Map<string, any[]>();
    
    messages.forEach((msg: any) => {
      // Mesajın hangi chat'e ait olduğunu bul - önce from, sonra remoteJid (remoteJidAlt ayrı chatId olarak eklenmez)
      const msgChatId = msg.from || msg.key?.remoteJid || msg.remoteJid;
      if (!msgChatId) {
        console.log('[AppContext] ⚠️ Mesajda chat ID bulunamadı:', msg);
        return;
      }
      
      const normalizedChatId = standardizeChatId(msgChatId);
      
      // Normalize edilmiş ID'yi kullan - sadece ana chatId altında grupla
      if (!messagesByChat.has(normalizedChatId)) {
        messagesByChat.set(normalizedChatId, []);
      }
      messagesByChat.get(normalizedChatId)!.push(msg);
      
      // remoteJidAlt'ı ayrı chatId olarak EKLEME - sadece eşleştirme için kullanılacak
      // Bu kısım kaldırıldı çünkü remoteJidAlt alternatif bir JID, ayrı bir chat değil
    });
    
    console.log('[AppContext] 📊 Mesajlar chat bazında gruplandı:', {
      chatIds: Array.from(messagesByChat.keys()),
      selectedChatId,
      normalizedSelectedChatId: selectedChatId ? standardizeChatId(selectedChatId) : null,
      willMatch: selectedChatId ? Array.from(messagesByChat.keys()).some(chatId => 
        isSameJid(chatId, standardizeChatId(selectedChatId)) || 
        isSameJid(chatId, selectedChatId) ||
        chatId === selectedChatId ||
        chatId === standardizeChatId(selectedChatId)
      ) : false
    });
    
    // Her chat için mesajları işle
    messagesByChat.forEach((chatMessages, chatId) => {
      const formattedMessages = chatMessages
        .filter((msg: any) => {
          // Protocol mesajlarını filtrele (sadece silinen mesajları göster)
          if (msg.messageStubType !== undefined && msg.messageStubType !== null && msg.messageStubType !== 1) {
            return false;
          }
          // Reaction mesajlarını filtrele
          if (msg.message?.reactionMessage) return false;
          // Boş mesajları filtrele
          const text = msg.text || extractMessageText(msg);
          return text && text.trim();
        })
        .map((msg: any) => formatMessage(msg));
      
      if (formattedMessages.length === 0) return;
      
      // Cache'e ekle
      const cacheKey = `${sessionId}-${chatId}`;
      const cachedMessages = messagesCacheRef.current.get(cacheKey) || [];
      const existingIds = new Set(cachedMessages.map(m => getMessageId(m)));
      
      const newMessages = formattedMessages.filter(msg => {
        const msgId = getMessageId(msg);
        return !existingIds.has(msgId);
      });
      
      if (newMessages.length > 0) {
        // Optimistic mesajları kontrol et ve eşleştir
        const normalizedChatId = standardizeChatId(chatId);
        const messagesToAdd: Message[] = [];
        const optimisticIdsToRemove: string[] = [];
        
        newMessages.forEach((formatted: Message) => {
          // Eğer fromMe ise ve optimistic mesaj varsa, eşleştir
          if (formatted.fromMe && formatted.text) {
            // Optimistic mesajları kontrol et
            for (const [tempId, optimisticData] of optimisticMessagesRef.current.entries()) {
              // Aynı chat ve aynı text ise eşleştir
              if (optimisticData.chatId === normalizedChatId && 
                  optimisticData.text === formatted.text) {
                const timeDiff = Math.abs(optimisticData.timestamp - (formatted.timestamp || 0));
                // 5 saniye içinde gönderilmişse eşleştir
                if (timeDiff < 5) {
                  console.log('[AppContext] 🔗 Optimistic mesaj eşleştirildi:', {
                    tempId,
                    realId: formatted.id,
                    chatId: normalizedChatId,
                    text: formatted.text,
                    timeDiff
                  });
                  
                  // Optimistic mesajı state'ten kaldır ve gerçek mesajı ekle
                  optimisticIdsToRemove.push(tempId);
                  
                  // Optimistic mesaj mapping'den kaldır
                  optimisticMessagesRef.current.delete(tempId);
                  
                  // Gerçek mesajı ekle
                  messagesToAdd.push(formatted);
                  return;
                }
              }
            }
          }
          
          // Optimistic mesaj eşleşmediyse normal ekle
          messagesToAdd.push(formatted);
        });
        
        // Optimistic mesajları state'ten kaldır
        if (optimisticIdsToRemove.length > 0) {
          optimisticIdsToRemove.forEach(tempId => {
            dispatch({ type: 'REMOVE_MESSAGE', payload: tempId });
          });
        }
        
        if (messagesToAdd.length > 0) {
        const updatedMessages = sortMessagesByTime([...cachedMessages, ...messagesToAdd]);
        messagesCacheRef.current.set(cacheKey, updatedMessages);
        
        console.log('[AppContext] ✅ Mesajlar cache\'e eklendi:', {
          chatId,
          newCount: messagesToAdd.length,
          totalCount: updatedMessages.length,
          optimisticRemoved: optimisticIdsToRemove.length
        });
        
        // Eğer bu chat seçiliyse veya state'te bu chat'e ait mesajlar varsa, mesajları state'e ekle
        const normalizedSelectedChatId = selectedChatId ? standardizeChatId(selectedChatId) : null;
        
        // Mesajın tüm olası chat ID'lerini topla
        const allPossibleChatIds = new Set<string>();
        chatMessages.forEach((msg: any) => {
          if (msg.from) {
            allPossibleChatIds.add(msg.from);
            allPossibleChatIds.add(standardizeChatId(msg.from));
          }
          if (msg.key?.remoteJid) {
            allPossibleChatIds.add(msg.key.remoteJid);
            allPossibleChatIds.add(standardizeChatId(msg.key.remoteJid));
          }
          if (msg.key?.remoteJidAlt) {
            allPossibleChatIds.add(msg.key.remoteJidAlt);
            allPossibleChatIds.add(standardizeChatId(msg.key.remoteJidAlt));
          }
        });
        
        // State'teki mevcut mesajlarda bu chatId'ye ait mesaj var mı kontrol et
        // Özellikle fromMe: true olan mesajları kontrol et (mesaj gönderilmişse)
        const hasMessagesInState = currentState.messages.some(msg => {
          const msgChatId = msg.from || msg.key?.remoteJid;
          if (!msgChatId) return false;
          const normalizedMsgChatId = standardizeChatId(msgChatId);
          
          // Ana chatId ile eşleşme
          if (normalizedMsgChatId === chatId || isSameJid(normalizedMsgChatId, chatId)) {
            return true;
          }
          
          // remoteJidAlt ile de kontrol et (eşleştirme için)
          const key = msg.key as any;
          if (key?.remoteJidAlt) {
            const altNormalized = standardizeChatId(key.remoteJidAlt);
            if (altNormalized === chatId || isSameJid(altNormalized, chatId)) {
              return true;
            }
          }
          
          // Tüm olası chat ID'leri ile kontrol et
          return Array.from(allPossibleChatIds).some(possibleId => 
            isSameJid(possibleId, normalizedMsgChatId) ||
            standardizeChatId(possibleId) === normalizedMsgChatId
          );
        });
        
        // Optimistic mesajlarda bu chatId'ye ait mesaj var mı kontrol et (mesaj gönderilmişse)
        const hasOptimisticMessage = Array.from(optimisticMessagesRef.current.values()).some(optMsg => {
          const normalizedOptChatId = standardizeChatId(optMsg.chatId);
          return normalizedOptChatId === chatId || isSameJid(normalizedOptChatId, chatId);
        });
        
        // State'te fromMe: true olan mesajların chatId'lerini kontrol et (mesaj gönderilmişse)
        const hasSentMessages = currentState.messages.some(msg => {
          if (!msg.fromMe) return false;
          const msgChatId = msg.from || msg.key?.remoteJid;
          if (!msgChatId) return false;
          const normalizedMsgChatId = standardizeChatId(msgChatId);
          return normalizedMsgChatId === chatId || isSameJid(normalizedMsgChatId, chatId);
        });
        
        // selectedChatId ile eşleşme kontrolü
        const allSelectedChatIds = new Set<string>();
        if (selectedChatId) {
          allSelectedChatIds.add(selectedChatId);
          allSelectedChatIds.add(standardizeChatId(selectedChatId));
          // @lid formatını da kontrol et
          if (selectedChatId.includes('@lid')) {
            const phone = extractPhoneFromJid(selectedChatId);
            if (phone) {
              const normalizedPhone = normalizePhoneNumber(phone);
              allSelectedChatIds.add(`${normalizedPhone}@s.whatsapp.net`);
            }
          }
        }
        
        // selectedChatId ile eşleşme veya state'te bu chat'e ait mesaj varsa ekle
        const isSelectedByState = selectedChatId && (
          // Normalize edilmiş chatId ile karşılaştır
          isSameJid(chatId, normalizedSelectedChatId || '') ||
          isSameJid(chatId, selectedChatId) ||
          chatId === selectedChatId ||
          chatId === normalizedSelectedChatId ||
          // Tüm olası mesaj chat ID'leri ile tüm olası selectedChatId formatlarını karşılaştır
          Array.from(allPossibleChatIds).some(msgChatId => 
            Array.from(allSelectedChatIds).some(selChatId =>
              isSameJid(msgChatId, selChatId) ||
              msgChatId === selChatId ||
              standardizeChatId(msgChatId) === standardizeChatId(selChatId) ||
              standardizeChatId(msgChatId) === selChatId ||
              msgChatId === standardizeChatId(selChatId)
            )
          )
        );
        
        // Eğer selectedChatId null ise ama:
        // 1. State'te bu chat'e ait mesaj varsa VEYA
        // 2. Optimistic mesaj varsa (mesaj gönderilmişse) VEYA
        // 3. State'te fromMe: true mesaj varsa (mesaj gönderilmişse)
        // mesajı ekle
        const isSelected = isSelectedByState || (!selectedChatId && (hasMessagesInState || hasOptimisticMessage || hasSentMessages));
        
        if (isSelected) {
          console.log('[AppContext] ✅ Chat\'e mesajlar ekleniyor:', {
            chatId,
            selectedChatId,
            normalizedSelectedChatId,
            hasMessagesInState,
            hasOptimisticMessage,
            hasSentMessages,
            isSelectedByState,
            allPossibleChatIds: Array.from(allPossibleChatIds),
            messageCount: messagesToAdd.length,
            firstMessage: messagesToAdd[0] ? {
              id: getMessageId(messagesToAdd[0]),
              text: messagesToAdd[0].text?.substring(0, 30)
            } : null
          });
          messagesToAdd.forEach(msg => {
            dispatch({ type: 'ADD_MESSAGE', payload: msg });
          });
        } else {
          console.log('[AppContext] ⚠️ Chat seçili değil veya eşleşmiyor:', {
            chatId,
            selectedChatId,
            normalizedSelectedChatId,
            hasMessagesInState,
            hasOptimisticMessage,
            hasSentMessages,
            isSelectedByState,
            allPossibleChatIds: Array.from(allPossibleChatIds),
            isSameNormalized: normalizedSelectedChatId ? isSameJid(chatId, normalizedSelectedChatId) : false,
            isSameOriginal: selectedChatId ? isSameJid(chatId, selectedChatId) : false,
            exactMatch: chatId === selectedChatId || chatId === normalizedSelectedChatId,
            anyMatch: Array.from(allPossibleChatIds).some(msgChatId => 
              isSameJid(msgChatId, selectedChatId) ||
              isSameJid(msgChatId, normalizedSelectedChatId || '')
            )
          });
        }
        
        // Chat listesini güncelle (son mesaj)
        const lastMsg = formattedMessages[formattedMessages.length - 1];
        dispatch({
          type: 'UPDATE_CHAT',
          payload: {
            id: chatId,
            lastMessage: lastMsg.text || '',
            conversationTimestamp: lastMsg.timestamp || Math.floor(Date.now() / 1000),
          },
        });
        }
      }
    });
  }, [state, dispatch]);
  
  // Chats.update event handler
  const handleChatsUpdate = useCallback((updates: any[], sessionId: string) => {
    // Ref'den güncel değeri al (stale closure sorununu çözmek için)
    const selectedChatId = selectedChatIdRef.current;
    
    // State'in diğer kısımları için dispatch kullanılacak
    const currentState = state;
    
    console.log('[AppContext] 🔍 handleChatsUpdate başladı:', {
      updateCount: updates.length,
      sessionId,
      selectedChatId
    });
    
    updates.forEach((update: any) => {
      const chatId = standardizeChatId(update.id);
      const normalizedSelectedChatId = selectedChatId ? standardizeChatId(selectedChatId) : null;
      
      console.log('[AppContext] 🔍 Chat update işleniyor:', {
        chatId,
        originalId: update.id,
        selectedChatId,
        normalizedSelectedChatId,
        isSelected: selectedChatId && (
          isSameJid(chatId, normalizedSelectedChatId || '') ||
          isSameJid(chatId, selectedChatId) ||
          chatId === selectedChatId ||
          chatId === normalizedSelectedChatId
        ),
        hasMessages: Array.isArray(update.messages),
        messageCount: update.messages?.length || 0,
        conversationTimestamp: update.conversationTimestamp
      });
      
      // Mesajları işle ve cache'e ekle
      if (update.messages && Array.isArray(update.messages) && update.messages.length > 0) {
        const lastMsg = update.messages[update.messages.length - 1];
        
        // Mesaj formatını düzelt (backend'den gelen format: { message: {...} })
        const formattedMessages = update.messages
          .map((msgWrapper: any) => {
            // Backend formatı: { message: { key: {...}, message: {...}, messageTimestamp: ..., status: ... } }
            const msg = msgWrapper.message || msgWrapper;
            
            // Mesajı formatla
            const formatted = formatMessage(msg);
            
            // Status varsa ekle
            if (msgWrapper.status) {
              formatted.status = msgWrapper.status;
            }
            
            return formatted;
          })
          .filter((msg: Message) => {
            // Boş mesajları filtrele
            const text = msg.text || extractMessageText(msg);
            return text && text.trim();
          });
        
        if (formattedMessages.length > 0) {
          // Cache'e ekle
          const cacheKey = `${sessionId}-${chatId}`;
          const cachedMessages = messagesCacheRef.current.get(cacheKey) || [];
          const existingIds = new Set(cachedMessages.map(m => getMessageId(m)));
          
          const newMessages = formattedMessages.filter(msg => {
            const msgId = getMessageId(msg);
            return !existingIds.has(msgId);
          });
          
          if (newMessages.length > 0) {
            const updatedMessages = sortMessagesByTime([...cachedMessages, ...newMessages]);
            messagesCacheRef.current.set(cacheKey, updatedMessages);
            
            console.log('[AppContext] ✅ Mesajlar cache\'e eklendi (chats.update):', {
              chatId,
              newCount: newMessages.length,
              totalCount: updatedMessages.length
            });
            
            // Eğer bu chat seçiliyse veya state'te bu chat'e ait mesajlar varsa, mesajları state'e ekle
            const normalizedSelectedChatId = selectedChatId ? standardizeChatId(selectedChatId) : null;
            
            // State'teki mevcut mesajlarda bu chatId'ye ait mesaj var mı kontrol et
            // Özellikle fromMe: true olan mesajları kontrol et (mesaj gönderilmişse)
            const hasMessagesInState = currentState.messages.some(msg => {
              const msgChatId = msg.from || msg.key?.remoteJid;
              if (!msgChatId) return false;
              const normalizedMsgChatId = standardizeChatId(msgChatId);
              
              // Ana chatId ile eşleşme
              if (normalizedMsgChatId === chatId || isSameJid(normalizedMsgChatId, chatId)) {
                return true;
              }
              
              // remoteJidAlt ile de kontrol et (eşleştirme için)
              const key = msg.key as any;
              if (key?.remoteJidAlt) {
                const altNormalized = standardizeChatId(key.remoteJidAlt);
                if (altNormalized === chatId || isSameJid(altNormalized, chatId)) {
                  return true;
                }
              }
              
              return false;
            });
            
            // Optimistic mesajlarda bu chatId'ye ait mesaj var mı kontrol et (mesaj gönderilmişse)
            const hasOptimisticMessage = Array.from(optimisticMessagesRef.current.values()).some(optMsg => {
              const normalizedOptChatId = standardizeChatId(optMsg.chatId);
              return normalizedOptChatId === chatId || isSameJid(normalizedOptChatId, chatId);
            });
            
            // State'te fromMe: true olan mesajların chatId'lerini kontrol et (mesaj gönderilmişse)
            const hasSentMessages = currentState.messages.some(msg => {
              if (!msg.fromMe) return false;
              const msgChatId = msg.from || msg.key?.remoteJid;
              if (!msgChatId) return false;
              const normalizedMsgChatId = standardizeChatId(msgChatId);
              return normalizedMsgChatId === chatId || isSameJid(normalizedMsgChatId, chatId);
            });
            
            // selectedChatId ile eşleşme veya state'te bu chat'e ait mesaj varsa ekle
            const isSelectedByState = selectedChatId && (
              isSameJid(chatId, normalizedSelectedChatId || '') ||
              isSameJid(chatId, selectedChatId) ||
              chatId === selectedChatId ||
              chatId === normalizedSelectedChatId
            );
            
            // Eğer selectedChatId null ise ama:
            // 1. State'te bu chat'e ait mesaj varsa VEYA
            // 2. Optimistic mesaj varsa (mesaj gönderilmişse) VEYA
            // 3. State'te fromMe: true mesaj varsa (mesaj gönderilmişse)
            // mesajı ekle
            const isSelected = isSelectedByState || (!selectedChatId && (hasMessagesInState || hasOptimisticMessage || hasSentMessages));
            
            if (isSelected) {
              console.log('[AppContext] ✅ Chat\'e mesajlar ekleniyor (chats.update):', {
                chatId,
                selectedChatId,
                normalizedSelectedChatId,
                hasMessagesInState,
                hasOptimisticMessage,
                hasSentMessages,
                isSelectedByState,
                messageCount: newMessages.length,
                firstMessage: newMessages[0] ? {
                  id: getMessageId(newMessages[0]),
                  text: newMessages[0].text?.substring(0, 30)
                } : null
              });
              newMessages.forEach(msg => {
                dispatch({ type: 'ADD_MESSAGE', payload: msg });
              });
            } else {
              console.log('[AppContext] ⚠️ Chat seçili değil veya eşleşmiyor (chats.update):', {
                chatId,
                selectedChatId,
                normalizedSelectedChatId,
                hasMessagesInState,
                hasOptimisticMessage,
                hasSentMessages,
                isSelectedByState,
                isSameNormalized: normalizedSelectedChatId ? isSameJid(chatId, normalizedSelectedChatId) : false,
                isSameOriginal: selectedChatId ? isSameJid(chatId, selectedChatId) : false,
                exactMatch: chatId === selectedChatId || chatId === normalizedSelectedChatId
              });
            }
          }
          
          // Chat listesini güncelle (son mesaj)
          const lastFormattedMsg = formattedMessages[formattedMessages.length - 1];
          const timestamp = update.conversationTimestamp || lastFormattedMsg.timestamp;
          const parsedTimestamp = timestamp ? (typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp) : null;
          
          // Unread count'u güncelle (eğer varsa)
          const updatePayload: any = {
            id: chatId,
            lastMessage: lastFormattedMsg.text || '',
            conversationTimestamp: parsedTimestamp,
          };
          
          if (update.unreadCount !== undefined) {
            updatePayload.unreadCount = update.unreadCount;
          }
          
          dispatch({
            type: 'UPDATE_CHAT',
            payload: updatePayload,
          });
          
          console.log('[AppContext] ✅ Chat güncellendi (chats.update):', {
            chatId,
            lastMessage: lastFormattedMsg.text?.substring(0, 30),
            timestamp: parsedTimestamp,
            unreadCount: update.unreadCount
          });
        }
      } else if (update.conversationTimestamp || update.unreadCount !== undefined) {
        // Mesaj yoksa sadece timestamp ve unreadCount'u güncelle
        const parsedTimestamp = update.conversationTimestamp 
          ? (typeof update.conversationTimestamp === 'string' 
            ? parseInt(update.conversationTimestamp, 10) 
            : update.conversationTimestamp)
          : undefined;
        
        const updatePayload: any = { id: chatId };
        if (parsedTimestamp !== undefined) {
          updatePayload.conversationTimestamp = parsedTimestamp;
        }
        if (update.unreadCount !== undefined) {
          updatePayload.unreadCount = update.unreadCount;
        }
        
        dispatch({
          type: 'UPDATE_CHAT',
          payload: updatePayload,
        });
      }
    });
  }, [state, dispatch]);
  
  const handleMessagesUpdate = useCallback((updates: any[], selectedChatId: string | null) => {
    if (!selectedChatId) return;
    
    updates.forEach((update: any) => {
      const updateJid = update.jid || update.key?.remoteJid || update.key?.remoteJidAlt;
      if (!updateJid) {
        console.log('[AppContext] ⚠️ messages.update: jid bulunamadı', update);
        return;
      }
      
      // JID eşleşme kontrolü - normalize et
      const normalizedUpdateJid = standardizeChatId(updateJid);
      const normalizedSelectedChatId = standardizeChatId(selectedChatId);
      
      if (!isSameJid(normalizedUpdateJid, normalizedSelectedChatId) && 
          normalizedUpdateJid !== normalizedSelectedChatId &&
          updateJid !== selectedChatId) {
        // Seçili chat ile eşleşmiyor, ama chat listesini güncellemek için kontrol edebiliriz
        console.log('[AppContext] ⚠️ messages.update: jid eşleşmiyor', {
          updateJid,
          normalizedUpdateJid,
          selectedChatId,
          normalizedSelectedChatId
        });
        // Yine de mesaj status güncellemesi yapabiliriz (tüm chatlerde)
      }
      
      const messageId = update.key?.id;
      if (!messageId) {
        console.log('[AppContext] ⚠️ messages.update: messageId bulunamadı', update);
        return;
      }
      
      const updateType = update.updateType;
      const updateData = update.updateData;
      
      console.log('[AppContext] 🔍 messages.update işleniyor:', {
        updateType,
        messageId,
        jid: updateJid,
        hasUpdateData: !!updateData
      });
      
      // Mesaj düzenleme
      if (updateType === 'message_edit' && updateData?.message) {
        const editedText = extractEditedText(updateData.message);
        if (editedText) {
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: { id: messageId, text: editedText, body: editedText, edited: true, editedAt: Date.now() },
          });
        }
      }
      
      // Mesaj silme
      else if (updateType === 'message_delete') {
        dispatch({ type: 'REMOVE_MESSAGE', payload: messageId });
      }
      
      // Reaction
      else if (updateType === 'reaction' && updateData?.reactions) {
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: { id: messageId, reactions: updateData.reactions },
        });
      }
      
      // Mesaj status güncellemesi (PENDING -> SENT -> DELIVERED -> READ)
      else if (updateType === 'status' || updateType === 'unknown') {
        // Status güncellemesi için updateData'dan status'u al
        const status = updateData?.status || update.status;
        if (status) {
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: { id: messageId, status },
          });
        }
      }
    });
  }, []);
  
  // Response event handler (sendMessage için status güncellemesi)
  const handleResponse = useCallback((requestId: string, success: boolean, data: any) => {
    console.log('[AppContext] 📨 Response event:', {
      requestId,
      success,
      data
    });
    
    // sendMessage response'u için status güncellemesi
    if (success && data && data.status) {
      // Eğer data'da jid ve status varsa, mesaj status'unu güncelle
      // Ancak bu genellikle messages.update event'i ile gelir
      // Burada sadece loglama yapıyoruz
    }
  }, []);
  
  const handleSessionsUpdate = useCallback((sessions: any[]) => {
    const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
    const validSessions = sessions.filter((s: any) => !s.id?.startsWith('temp-'));
    
    const accounts: Account[] = validSessions.map((session: any, index: number) => ({
      id: session.id,
      name: accountNames[session.id] || session.id,
      status: session.status || 'unknown',
      color: COLORS[index % COLORS.length],
      active: state.activeAccountId === session.id,
      whatsappJid: session.whatsappJid,
    }));
    
    // Aktif hesabı koru
    if (!accounts.some(a => a.active) && accounts.length > 0) {
      accounts[0].active = true;
    }
    
    dispatch({ type: 'SET_ACCOUNTS', payload: accounts });
  }, [state.activeAccountId]);
  
  // ============================================
  // Account Change Handler
  // ============================================
  
  useEffect(() => {
    const prevId = prevActiveAccountIdRef.current;
    const currentId = state.activeAccountId;
    
    if (prevId && currentId && prevId !== currentId) {
      console.log(`[AppContext] 🔄 Hesap değişti: ${prevId} -> ${currentId}`);
      
      // State'i sıfırla
      dispatch({ type: 'RESET_FOR_ACCOUNT_CHANGE' });
      
      // WebSocket'ten yeni verileri iste
      if (wsClient.isConnected()) {
        setTimeout(() => {
          wsClient.sendRequest('getChats', { sessionId: currentId, limit: 50 }).catch(console.error);
          wsClient.sendRequest('getContacts', { sessionId: currentId }).catch(console.error);
        }, 100);
      }
    }
    
    prevActiveAccountIdRef.current = currentId;
  }, [state.activeAccountId]);
  
  // ============================================
  // Selected Chat Change Handler
  // ============================================
  
  useEffect(() => {
    const prevId = prevSelectedChatIdRef.current;
    const currentId = state.selectedChatId;
    
    if (prevId !== currentId) {
      console.log(`[AppContext] 💬 Seçili sohbet değişti: ${prevId} -> ${currentId}`);
      
      // Mesajları temizle
      dispatch({ type: 'CLEAR_MESSAGES' });
      
      // Önce cache'den yükle
      if (currentId && state.activeAccountId) {
        const cacheKey = `${state.activeAccountId}-${standardizeChatId(currentId)}`;
        const cachedMessages = messagesCacheRef.current.get(cacheKey);
        
        if (cachedMessages && cachedMessages.length > 0) {
          console.log('[AppContext] ✅ Cache\'den mesajlar yüklendi:', cachedMessages.length);
          dispatch({ type: 'SET_MESSAGES', payload: cachedMessages });
        }
      }
      
      // Yeni mesajları WebSocket'ten yükle
      if (currentId && state.activeAccountId && wsClient.isConnected()) {
        dispatch({ type: 'SET_LOADING_MESSAGES', payload: true });
        wsClient.sendRequest('getMessages', {
          sessionId: state.activeAccountId,
          chatId: currentId,
          limit: 50,
        }).then((messages: any[]) => {
          if (messages && Array.isArray(messages)) {
            const formatted = messages
              .filter((msg: any) => {
                const text = msg.text || extractMessageText(msg);
                return text && text.trim();
              })
              .map(formatMessage);
            
            const sorted = sortMessagesByTime(formatted);
            dispatch({ type: 'SET_MESSAGES', payload: sorted });
            
            // Cache'e kaydet
            if (currentId && state.activeAccountId) {
              const cacheKey = `${state.activeAccountId}-${standardizeChatId(currentId)}`;
              messagesCacheRef.current.set(cacheKey, sorted);
            }
          }
        }).catch(console.error).finally(() => {
          dispatch({ type: 'SET_LOADING_MESSAGES', payload: false });
        });
      }
    }
    
    prevSelectedChatIdRef.current = currentId;
  }, [state.selectedChatId, state.activeAccountId]);
  
  // ============================================
  // Actions
  // ============================================
  
  const sendRequest = useCallback(<T = any>(type: string, payload: any): Promise<T> => {
    return wsClient.sendRequest<T>(type, payload);
  }, []);
  
  const showToast = useCallback((message: string, type: Toast['type']) => {
    const id = `toast-${Date.now()}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
    setTimeout(() => {
      dispatch({ type: 'REMOVE_TOAST', payload: id });
    }, 3000);
  }, []);
  
  // ============================================
  // Computed Values
  // ============================================
  
  const activeAccount = state.accounts.find(a => a.active) || null;
  const selectedChat = Array.isArray(state.chats) ? state.chats.find(c => c.id === state.selectedChatId) || null : null;
  
  const filteredChats = Array.isArray(state.chats) ? state.chats.filter(chat => {
    // Arama filtresi
    if (state.chatSearchTerm) {
      const search = state.chatSearchTerm.toLowerCase();
      const name = (chat.name || '').toLowerCase();
      const id = (chat.id || '').toLowerCase();
      if (!name.includes(search) && !id.includes(search)) {
        return false;
      }
    }
    
    // Tip filtresi
    switch (state.chatFilter) {
      case 'unread':
        return chat.unreadCount > 0;
      case 'groups':
        return chat.id.includes('@g.us');
      case 'archived':
        return chat.archived;
      case 'all':
      default:
        return !chat.archived;
    }
  }) : [];
  
  // ============================================
  // Context Value
  // ============================================
  
  const value: AppContextValue = {
    state,
    dispatch,
    wsClient,
    activeAccount,
    selectedChat,
    filteredChats,
    sendRequest,
    showToast,
  };
  
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

// ============================================
// Helper Functions
// ============================================

// BigInt timestamp'i number'a çevir (export edilebilir)
export function parseTimestamp(ts: any): number | null {
  if (!ts) return null;
  
  // Direkt number ise
  if (typeof ts === 'number') {
    return ts;
  }
  
  // BigInt formatı: {low, high, unsigned}
  if (ts.low !== undefined && ts.high !== undefined) {
    // 64-bit integer'i number'a çevir
    const low = ts.low >>> 0; // Unsigned 32-bit
    const high = ts.high >>> 0; // Unsigned 32-bit
    const result = high * 0x100000000 + low;
    return result;
  }
  
  // String ise number'a çevir
  if (typeof ts === 'string') {
    const num = Number(ts);
    return isNaN(num) ? null : num;
  }
  
  return null;
}

// formatChats fonksiyonunu export et (hook'larda kullanmak için)
export function formatChats(
  rawChats: any[],
  contacts: Map<string, Contact>,
  profilePictures: Map<string, string>
): Chat[] {
  return rawChats.map((chat: any) => {
    const chatId = standardizeChatId(chat.id);
    const contact = contacts.get(chatId);
    
    let displayName = chat.name || chat.displayName || chatId;
    if (!chatId.includes('@g.us') && contact) {
      displayName = contact.verifiedName || contact.name || contact.notify || displayName;
    }
    
    // Timestamp'i parse et
    const conversationTimestamp = parseTimestamp(chat.conversationTimestamp);
    const lastMsgTimestamp = parseTimestamp(chat.lastMsgTimestamp);
    
    return {
      id: chatId,
      name: displayName,
      verifiedName: chat.verifiedName || contact?.verifiedName,
      contactName: chat.contactName || contact?.name,
      notify: chat.notify || contact?.notify,
      profilePicture: chat.imgUrl || profilePictures.get(chatId) || null,
      unreadCount: chat.unreadCount || 0,
      conversationTimestamp: conversationTimestamp,
      lastMsgTimestamp: lastMsgTimestamp || undefined,
      archived: chat.archived || false,
      pinned: chat.pinned ? new Date(chat.pinned) : null,
      lastMessage: chat.lastMessage || '',
      time: conversationTimestamp
        ? new Date(conversationTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : '',
      isMuted: !!chat.isMuted || !!chat.muteEndTime,
    };
  });
}

function formatMessage(msg: any): Message {
  // Text'i çıkar - önce direkt text, sonra extractMessageText
  const text = msg.text || extractMessageText(msg);
  const id = getMessageId(msg);
  const fromMe = isFromMe(msg);
  
  // Timestamp'i parse et (string veya number olabilir)
  let timestamp = msg.timestamp || msg.messageTimestamp;
  if (typeof timestamp === 'string') {
    timestamp = parseInt(timestamp, 10);
  }
  if (!timestamp || isNaN(timestamp)) {
    timestamp = Math.floor(Date.now() / 1000);
  }
  
  // Key'i oluştur (eğer yoksa)
  let key = msg.key;
  if (!key && (msg.from || msg.remoteJid)) {
    key = {
      remoteJid: msg.from || msg.remoteJid || '',
      id: id,
      fromMe: fromMe,
      participant: msg.participant || undefined,
    };
  }
  
  // Status'u belirle (eğer yoksa)
  let status = msg.status;
  if (!status && fromMe) {
    // Kendi gönderdiğimiz mesajlar için varsayılan status
    status = 'pending';
  }
  
  console.log('[AppContext] formatMessage:', {
    id,
    text: text?.substring(0, 30),
    fromMe,
    timestamp,
    hasText: !!text,
    originalTimestamp: msg.timestamp || msg.messageTimestamp,
    type: msg.type,
    hasKey: !!key,
    status
  });
  
  const formatted: Message = {
    ...msg,
    id,
    text: text || '',
    body: text || '',
    fromMe,
    timestamp: timestamp,
    messageTimestamp: timestamp,
    key: key,
    status: status,
    type: msg.type,
    participant: msg.participant,
    messageStubType: msg.messageStubType,
    reactions: msg.reactions || [],
  };
  
  return formatted;
}

function extractEditedText(message: any): string {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.text) return message.text;
  if (message.body) return message.body;
  if (message.message) return extractEditedText(message.message);
  return extractMessageText(message);
}

