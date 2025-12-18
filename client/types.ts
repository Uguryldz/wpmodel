// TypeScript type definitions for the API

export interface Account {
  id: string;
  name: string;
  status?: string;
  color: string;
  active: boolean;
  whatsappJid?: string | null;
}

export interface Session {
  id: string;
  status?: string;
  whatsappJid?: string | null;
}

export interface SessionStatus {
  status: string;
  version?: string;
  isLatest?: boolean;
  lastError?: string | null;
  qr?: string | null; // QR kod string'i (lastQr ile aynı değer)
  lastQr?: string | null;
  qrGeneratedAt?: string | null;
  startedAt?: string;
  socketReady?: boolean;
}

export interface Chat {
  id: string;
  name: string;
  unreadCount?: number;
  conversationTimestamp?: number | null;
  isMuted?: boolean;
  archived?: boolean;
  verifiedName?: string | null;
  imgUrl?: string | null;
  profilePicture?: string;
  lastMessage?: string;
  time?: string;
  displayName?: string;
  messages?: any[];
  lastMsgTimestamp?: number;
}

export interface Contact {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  imgUrl?: string | null;
  status?: string | null;
}

export interface Message {
  id?: string;
  key?: {
    fromMe?: boolean;
    id?: string;
    remoteJid?: string;
    participant?: string;
  };
  message?: any;
  pushName?: string;
  body?: string;
  text?: string;
  timestamp?: number;
  fromMe?: boolean;
  from?: string;
  type?: string;
  participant?: string;
  starred?: boolean;
  messageTimestamp?: number;
  edited?: boolean; // Mesaj düzenlendi mi?
  editedAt?: number; // Düzenlenme zamanı
  quotedMessage?: {
    id?: string;
    from?: string;
    text?: string;
  };
}
