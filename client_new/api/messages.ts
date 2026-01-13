// ============================================
// Message API Functions
// ============================================

import { apiGet, apiPost, apiUpload } from './client';
import type { Message } from '../types';

/**
 * Mesaj geçmişini getir
 */
export async function getMessages(
  sessionId: string,
  jid: string,
  limit: number = 50
): Promise<Message[]> {
  return apiGet<Message[]>(`/${sessionId}/messages/${encodeURIComponent(jid)}?limit=${limit}`);
}

/**
 * Metin mesajı gönder
 */
export async function sendMessage(
  sessionId: string,
  jid: string,
  text: string,
  options?: { quoted?: any }
): Promise<any> {
  return apiPost(`/${sessionId}/messages/send`, {
    jid,
    text,
    ...(options || {}),
  });
}

/**
 * Medya mesajı gönder
 */
export async function sendMediaMessage(
  sessionId: string,
  jid: string,
  file: File | Blob,
  mimetype: string,
  caption?: string,
  options?: { ptt?: boolean; ptv?: boolean }
): Promise<any> {
  // File'ı base64'e çevir
  const base64 = await fileToBase64(file);
  
  return apiPost(`/${sessionId}/messages/send/media`, {
    jid,
    media: base64,
    mimetype,
    caption,
    ...(options || {}),
  });
}

/**
 * Mesajı düzenle
 */
export async function editMessage(
  sessionId: string,
  jid: string,
  messageId: string,
  newText: string
): Promise<any> {
  return apiPost(`/${sessionId}/messages/${encodeURIComponent(jid)}/${messageId}/edit`, {
    text: newText,
  });
}

/**
 * Mesajı sil
 */
export async function deleteMessage(
  sessionId: string,
  jid: string,
  messageId: string,
  forEveryone: boolean = false
): Promise<void> {
  return apiPost(`/${sessionId}/messages/${encodeURIComponent(jid)}/${messageId}/delete`, {
    forEveryone,
  });
}

/**
 * Mesajı sadece benim için sil
 */
export async function deleteMessageForMe(
  sessionId: string,
  jid: string,
  messageId: string,
  fromMe: boolean
): Promise<void> {
  return apiPost(`/${sessionId}/messages/${encodeURIComponent(jid)}/${messageId}/delete-for-me`, {
    fromMe,
  });
}

/**
 * Mesajı ilet
 */
export async function forwardMessage(
  sessionId: string,
  fromJid: string,
  toJid: string,
  messageId: string
): Promise<any> {
  return apiPost(`/${sessionId}/messages/forward`, {
    fromJid,
    toJid,
    messageId,
  });
}

/**
 * Mesajları okundu olarak işaretle
 */
export async function markMessagesAsRead(sessionId: string, jid: string): Promise<void> {
  return apiPost(`/${sessionId}/messages/${encodeURIComponent(jid)}/read`);
}

// Helper: File'ı base64'e çevir
async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/png;base64,... formatından sadece base64 kısmını al
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

