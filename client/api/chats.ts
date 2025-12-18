// Chats API module
import { Chat } from '../types';

const API_BASE = '';

export const getChats = async (sessionId: string, limit: number = 50): Promise<Chat[]> => {
  try {
    console.log('🔵 [API] getChats çağrılıyor, sessionId:', sessionId, 'limit:', limit);
    
    // Önce /:sessionId/chats endpoint'ini dene (baileys-api-master formatı, limit ile)
    let url = `${API_BASE}/${sessionId}/chats?limit=${limit}`;
    console.log('🔵 [API] Chats API çağrısı (1. deneme):', url);
    let response = await fetch(url);
    console.log('🔵 [API] Chats API response status (1. deneme):', response.status);
    console.log('🔵 [API] Response ok (1. deneme):', response.ok);
    
    // Eğer başarısız ise /api/chats endpoint'ini dene (limit ile)
    if (!response.ok) {
      url = `${API_BASE}/api/chats?accountId=${sessionId}&limit=${limit}`;
      console.log('🔵 [API] Chats API çağrısı (2. deneme):', url);
      response = await fetch(url);
      console.log('🔵 [API] Chats API response status (2. deneme):', response.status);
      console.log('🔵 [API] Response ok (2. deneme):', response.ok);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔴 [API] Chats API error:', errorText);
      throw new Error(`Sohbetler alınamadı: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('🟢 [API] Chats API data (ham):', data);
    console.log('🟢 [API] Data type:', typeof data);
    console.log('🟢 [API] Is array:', Array.isArray(data));
    
    // Response formatı: { data: [...] } veya direkt array
    let chats: Chat[] = [];
    if (Array.isArray(data)) {
      chats = data;
    } else if (data.data && Array.isArray(data.data)) {
      chats = data.data;
    } else {
      console.warn('🟡 [API] Beklenmeyen response formatı:', data);
      chats = [];
    }
    
    console.log('🟢 [API] Chats (işlenmiş):', chats);
    console.log('🟢 [API] Chats count:', chats.length);
    return chats;
  } catch (error: any) {
    console.error('🔴 [API] Chats API catch error:', error);
    console.error('🔴 [API] Error type:', error.constructor.name);
    console.error('🔴 [API] Error message:', error.message);
    throw error;
  }
};
