// ============================================
// Message Utility Functions
// ============================================

import type { Message } from '../types';

/**
 * Mesajdan text içeriğini çıkarır
 */
export function extractMessageText(msg: Message | any): string {
  if (!msg) return '';
  
  // Önce direkt text/body alanlarını kontrol et
  if (msg.text) return msg.text;
  if (msg.body) return msg.body;
  
  // Message objesi içinden çıkar
  const message = msg.message;
  if (!message) return '';
  
  // Conversation (düz metin)
  if (message.conversation) return message.conversation;
  
  // Extended Text Message
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  
  // Image/Video/Audio with caption
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.audioMessage?.caption) return message.audioMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  
  // Sticker
  if (message.stickerMessage) return '🏷️ Sticker';
  
  // Location
  if (message.locationMessage) return '📍 Konum';
  if (message.liveLocationMessage) return '📍 Canlı Konum';
  
  // Contact
  if (message.contactMessage) return '👤 Kişi';
  if (message.contactsArrayMessage) return '👥 Kişiler';
  
  // Media messages without caption
  if (message.imageMessage) return '📷 Fotoğraf';
  if (message.videoMessage) return '🎥 Video';
  if (message.audioMessage || message.pttMessage) return '🎵 Ses';
  if (message.documentMessage) {
    const fileName = message.documentMessage.fileName || 'Belge';
    return `📄 ${fileName}`;
  }
  
  // Poll
  if (message.pollCreationMessage) {
    return `📊 Anket: ${message.pollCreationMessage.name || 'Anket'}`;
  }
  
  // Reaction
  if (message.reactionMessage) {
    return message.reactionMessage.text || '👍';
  }
  
  // Protocol messages
  if (message.protocolMessage) {
    const type = message.protocolMessage.type;
    switch (type) {
      case 0: return '🗑️ Mesaj silindi';
      case 4: return '✏️ Mesaj düzenlendi';
      default: return '';
    }
  }
  
  return '';
}

/**
 * Mesaj ID'sini alır
 */
export function getMessageId(msg: Message | any): string {
  if (!msg) return '';
  return msg.id || msg.key?.id || '';
}

/**
 * Mesajın gönderen tarafından olup olmadığını kontrol eder
 */
export function isFromMe(msg: Message | any): boolean {
  if (!msg) return false;
  
  if (msg.fromMe !== undefined) return Boolean(msg.fromMe);
  if (msg.key?.fromMe !== undefined) {
    return msg.key.fromMe === true || msg.key.fromMe === 'true' || msg.key.fromMe === 1;
  }
  
  return false;
}

/**
 * Mesaj timestamp'ini normalize eder (milisaniye cinsinden)
 */
export function normalizeTimestamp(ts: number | undefined | null): number {
  if (!ts) return 0;
  // Saniye cinsindeyse milisaniyeye çevir
  return ts > 1000000000000 ? ts : ts * 1000;
}

/**
 * Mesajları timestamp'e göre sıralar
 */
export function sortMessagesByTime(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
    const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
    return aTime - bTime;
  });
}

/**
 * Mesaj listesinden duplicate'ları kaldırır
 */
export function removeDuplicateMessages(messages: Message[]): Message[] {
  const seen = new Map<string, Message>();
  
  for (const msg of messages) {
    const id = getMessageId(msg);
    if (!id) continue;
    
    const existing = seen.get(id);
    if (!existing) {
      seen.set(id, msg);
    } else if (msg.edited || msg.editedAt) {
      // Düzenlenmiş mesajı tercih et
      seen.set(id, msg);
    }
  }
  
  return Array.from(seen.values());
}

