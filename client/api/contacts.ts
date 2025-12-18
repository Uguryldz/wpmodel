// Contacts API module
import { Contact } from '../types';

const API_BASE = '';

export const getContacts = async (sessionId: string, limit?: number): Promise<Contact[]> => {
  try {
    // Limit belirtilmediyse cursor ile tüm contact'ları çek
    if (!limit) {
      const allContacts: Contact[] = [];
      let cursor: string | number | null = null;
      let hasMore = true;
      let pageCount = 0;
      const maxPages = 100; // Güvenlik için maksimum sayfa sayısı
      
      while (hasMore && pageCount < maxPages) {
        pageCount++;
        const url = cursor 
          ? `${API_BASE}/${sessionId}/contacts?cursor=${cursor}&limit=1000`
          : `${API_BASE}/${sessionId}/contacts?limit=1000`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.warn('Contact\'lar alınamadı:', response.status);
          break;
        }
        
        const data = await response.json();
        let contacts: Contact[] = [];
        let nextCursor: string | number | null = null;
        
        // Response formatı: { data: [...], nextCursor: ... } veya direkt array
        if (Array.isArray(data)) {
          contacts = data;
        } else if (data.data && Array.isArray(data.data)) {
          contacts = data.data;
          nextCursor = data.nextCursor || null;
        }
        
        if (contacts.length === 0) {
          hasMore = false;
        } else {
          allContacts.push(...contacts);
          cursor = nextCursor;
          hasMore = cursor !== null && cursor !== undefined;
        }
      }
      
      console.log('Tüm contact\'lar yüklendi:', allContacts.length, `(${pageCount} sayfa)`);
      return allContacts;
    }
    
    // Limit belirtilmişse normal şekilde çek
    const url = `${API_BASE}/${sessionId}/contacts?limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('Contact\'lar alınamadı:', response.status);
      return [];
    }
    const data = await response.json();
    // Response formatı: { data: [...] } veya direkt array
    if (Array.isArray(data)) {
      return data;
    } else if (data.data && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  } catch (error) {
    console.error('Contact\'lar yüklenirken hata:', error);
    return [];
  }
};

export const getProfilePicture = async (sessionId: string, jid: string): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE}/${sessionId}/contacts/${encodeURIComponent(jid)}/photo`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
};

/**
 * Cihazdaki kayıtlı kişi listesini ad soyad ile çek
 * Baileys API'nin fetchContacts metodunu kullanarak WhatsApp cihazındaki tüm contact'ları çeker
 */
export const getDeviceContacts = async (sessionId: string): Promise<Contact[]> => {
  try {
    const response = await fetch(`${API_BASE}/${sessionId}/contacts/device`);
    if (!response.ok) {
      console.warn('Cihazdan contact\'lar alınamadı:', response.status);
      return [];
    }
    const data = await response.json();
    // Response formatı: { data: [...], error?: ... }
    if (data.error) {
      console.error('Cihazdan contact\'lar çekilirken hata:', data.error);
      return [];
    }
    return Array.isArray(data.data) ? data.data : [];
  } catch (error) {
    console.error('Cihazdan contact\'lar yüklenirken hata:', error);
    return [];
  }
};
