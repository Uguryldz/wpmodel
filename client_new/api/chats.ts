// ============================================
// Chat API Functions
// ============================================

import { apiGet, apiPost } from './client';
import type { Chat } from '../types';

/**
 * Chat listesini getir
 */
export async function getChats(sessionId: string, limit: number = 50): Promise<Chat[]> {
  return apiGet<Chat[]>(`/${sessionId}/chats?limit=${limit}`);
}

/**
 * Chat'i pinle/pinlemeyi kaldır
 */
export async function pinChat(sessionId: string, jid: string, pin: boolean): Promise<void> {
  return apiPost(`/${sessionId}/chats/${encodeURIComponent(jid)}/pin`, { pin });
}

/**
 * Chat'i sessize al
 */
export async function muteChat(
  sessionId: string,
  jid: string,
  durationMs: number | null
): Promise<void> {
  return apiPost(`/${sessionId}/chats/${encodeURIComponent(jid)}/mute`, { duration: durationMs });
}

/**
 * Chat'i arşivle
 */
export async function archiveChat(
  sessionId: string,
  jid: string,
  archive: boolean
): Promise<void> {
  return apiPost(`/${sessionId}/chats/${encodeURIComponent(jid)}/archive`, { archive });
}

/**
 * Chat'i sil
 */
export async function deleteChat(sessionId: string, jid: string): Promise<void> {
  return apiPost(`/${sessionId}/chats/${encodeURIComponent(jid)}/delete`);
}

/**
 * Chat'i okundu olarak işaretle
 */
export async function markChatRead(
  sessionId: string,
  jid: string,
  read: boolean
): Promise<void> {
  return apiPost(`/${sessionId}/chats/${encodeURIComponent(jid)}/mark-read`, { markRead: read });
}

/**
 * Geçici mesajları ayarla
 */
export async function setDisappearingMessages(
  sessionId: string,
  jid: string,
  duration: number
): Promise<void> {
  return apiPost(`/${sessionId}/chats/${encodeURIComponent(jid)}/disappearing`, { duration });
}

