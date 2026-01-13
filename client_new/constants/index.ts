// ============================================
// Application Constants
// ============================================

// Account Colors
export const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
];

// Emoji Categories
export const EMOJIS = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘'],
  gestures: ['👍', '👎', '👌', '✌️', '🤞', '🤜', '🤛', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✋', '🖐️', '👋'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖'],
  objects: ['🎉', '🎊', '🎁', '🎂', '🎈', '🎀', '🏆', '🥇', '🎯', '🔥', '⭐', '🌟', '✨', '💫', '🌈', '☀️'],
};

// Attachment Options
export const ATTACHMENT_OPTIONS = [
  { icon: 'Camera', label: 'Fotoğraf', color: 'bg-purple-500' },
  { icon: 'Video', label: 'Video', color: 'bg-pink-500' },
  { icon: 'Music', label: 'Ses', color: 'bg-orange-500' },
  { icon: 'FileText', label: 'Belge', color: 'bg-blue-500' },
  { icon: 'User', label: 'Kişi', color: 'bg-cyan-500' },
  { icon: 'MapPin', label: 'Konum', color: 'bg-green-500' },
];

// Cache TTL (Time To Live)
export const CACHE_TTL = {
  CONTACTS: 5 * 60 * 1000, // 5 dakika
  CHATS: 60 * 1000, // 1 dakika
  MESSAGES: 30 * 1000, // 30 saniye
  PROFILE_PICTURE: 24 * 60 * 60 * 1000, // 24 saat
};

// Profile Picture Loading
export const PROFILE_PICTURE = {
  BATCH_SIZE: 5,
  DEBOUNCE_MS: 500,
  BATCH_DELAY_MS: 100,
};

// WebSocket
export const WEBSOCKET = {
  RECONNECT_DELAY: 2000,
  MAX_RECONNECT_ATTEMPTS: 10,
  HEARTBEAT_INTERVAL: 30000,
  CONNECTION_TIMEOUT: 10000,
  REQUEST_TIMEOUT: 30000,
};

// API
export const API = {
  BASE_URL: '',
  TIMEOUT: 30000,
};

// Pagination
export const PAGINATION = {
  CHATS_LIMIT: 50,
  MESSAGES_LIMIT: 50,
  CONTACTS_LIMIT: 100,
};

// Message Status
export const MESSAGE_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  ERROR: 'error',
};

// Date Format
export const DATE_FORMAT = {
  TIME: { hour: '2-digit' as const, minute: '2-digit' as const },
  DATE: { day: '2-digit' as const, month: '2-digit' as const, year: 'numeric' as const },
  FULL: { 
    day: '2-digit' as const, 
    month: '2-digit' as const, 
    year: 'numeric' as const,
    hour: '2-digit' as const, 
    minute: '2-digit' as const 
  },
};

