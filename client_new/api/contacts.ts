// ============================================
// Contact API Functions
// ============================================

import { apiGet } from './client';
import type { Contact } from '../types';

/**
 * Kişi listesini getir
 */
export async function getContacts(sessionId: string): Promise<Contact[]> {
  return apiGet<Contact[]>(`/${sessionId}/contacts`);
}

/**
 * Cihazdaki kişi listesini getir
 */
export async function getDeviceContacts(sessionId: string): Promise<Contact[]> {
  return apiGet<Contact[]>(`/${sessionId}/contacts/device`);
}

/**
 * Profil fotoğrafını getir
 */
export async function getProfilePicture(sessionId: string, jid: string): Promise<string | null> {
  try {
    const response = await apiGet<{ url?: string; imgUrl?: string }>(
      `/${sessionId}/contacts/${encodeURIComponent(jid)}/photo`
    );
    return response.url || response.imgUrl || null;
  } catch {
    return null;
  }
}

/**
 * Kişi bilgilerini getir
 */
export async function getContactInfo(sessionId: string, jid: string): Promise<Contact | null> {
  try {
    return await apiGet<Contact>(`/${sessionId}/contacts/${encodeURIComponent(jid)}`);
  } catch {
    return null;
  }
}

/**
 * Kişinin WhatsApp'ta olup olmadığını kontrol et
 */
export async function checkWhatsAppNumber(
  sessionId: string,
  phone: string
): Promise<{ exists: boolean; jid?: string }> {
  return apiGet(`/${sessionId}/contacts/check/${phone}`);
}

