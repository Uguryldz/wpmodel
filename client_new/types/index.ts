// ============================================
// WhatsApp Multi-Account Types
// ============================================

// Account/Session Types
export interface Account {
  id: string;
  name: string;
  status: 'open' | 'connecting' | 'close' | 'unknown' | 'initializing';
  color: string;
  active: boolean;
  whatsappJid?: string | null;
}

// Chat Types
export interface Chat {
  id: string;
  name: string;
  verifiedName?: string;
  contactName?: string;
  notify?: string;
  profilePicture?: string | null;
  unreadCount: number;
  conversationTimestamp: number | null;
  lastMsgTimestamp?: number;
  archived: boolean;
  pinned: Date | null;
  lastMessage: string;
  time: string;
  isMuted?: boolean;
}

// Message Types
export interface MessageKey {
  remoteJid: string;
  remoteJidAlt?: string; // Alternative JID (LID format)
  id: string;
  fromMe: boolean;
  participant?: string;
}

export interface Message {
  id: string;
  key?: MessageKey;
  from?: string;
  fromMe: boolean;
  timestamp?: number;
  messageTimestamp?: number;
  text?: string;
  body?: string;
  status?: string;
  type?: string;
  message?: any;
  edited?: boolean;
  editedAt?: number;
  starred?: boolean;
  reactions?: any[];
  pollVotes?: any;
  read?: boolean;
  readReceipt?: boolean;
  readTimestamp?: number;
  error?: string;
  pushName?: string;
  participant?: string;
  messageStubType?: number;
  messageStubParameters?: any;
}

// Contact Types
export interface Contact {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  displayName?: string;
  imgUrl?: string;
  status?: string;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  sessionId?: string;
  requestId?: string;
  success?: boolean;
  data?: any;
  error?: string;
  chats?: Chat[];
  messages?: Message[];
  contacts?: Contact[];
  updates?: any[];
  sessions?: any[];
  chat?: Chat;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  reconnectAttempts: number;
  lastError: string | null;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
}

// Toast Types
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Cache Types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Attachment Types
export interface AttachmentOption {
  icon: React.ComponentType<any>;
  label: string;
  color: string;
}

// Filter Types
export type ChatFilter = 'all' | 'unread' | 'groups' | 'archived';

