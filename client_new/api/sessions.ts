// ============================================
// Session API Functions
// ============================================

import { apiGet, apiPost, apiDelete } from './client';
import type { Account } from '../types';

interface SessionInfo {
  id: string;
  status: string;
  whatsappJid?: string;
  qr?: string;
  lastQr?: string;
}

/**
 * Tüm session'ları getir
 */
export async function getSessions(): Promise<SessionInfo[]> {
  return apiGet<SessionInfo[]>('/sessions');
}

/**
 * Session durumunu getir
 */
export async function getSessionStatus(sessionId: string): Promise<SessionInfo> {
  return apiGet<SessionInfo>(`/sessions/${sessionId}/status`);
}

/**
 * Yeni session oluştur
 */
export async function createSession(sessionId: string): Promise<SessionInfo> {
  return apiPost<SessionInfo>('/sessions/add', { sessionId });
}

/**
 * Session'ı başlat (QR kod üretimi için)
 */
export async function startSession(sessionId: string): Promise<SessionInfo> {
  return apiGet<SessionInfo>(`/sessions/${sessionId}/start`);
}

/**
 * Session'ı sil
 */
export async function deleteSession(sessionId: string): Promise<void> {
  return apiDelete(`/sessions/${sessionId}`);
}

/**
 * Session'dan çıkış yap
 */
export async function logoutSession(sessionId: string): Promise<void> {
  return apiPost(`/sessions/${sessionId}/logout`);
}

/**
 * QR kod event'lerini dinle (SSE)
 */
export function subscribeToQR(
  sessionId: string,
  onMessage: (data: any) => void
): () => void {
  const eventSource = new EventSource(`/sessions/${sessionId}/qr`);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('[SSE] Parse error:', error);
    }
  };
  
  eventSource.onerror = () => {
    console.error('[SSE] Connection error');
  };
  
  return () => {
    eventSource.close();
  };
}

