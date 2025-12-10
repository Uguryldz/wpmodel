// Vite proxy kullanıyoruz - relative path kullan
const API_BASE = '';

export interface Session {
  id: string;
  status?: string;
}

export interface SessionStatus {
  status: string;
  version?: string;
  isLatest?: boolean;
  lastError?: string | null;
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
}

export interface Contact {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  imgUrl?: string | null;
  status?: string | null;
}

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

// Sessions API
export const getSessions = async (): Promise<Session[]> => {
  try {
    const url = `${API_BASE}/sessions`;
    console.log('🔵 [API] getSessions çağrılıyor');
    console.log('🔵 [API] URL:', url);
    console.log('🔵 [API] API_BASE:', API_BASE);
    
    const response = await fetch(url);
    console.log('🔵 [API] Response status:', response.status);
    console.log('🔵 [API] Response ok:', response.ok);
    console.log('🔵 [API] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔴 [API] Sessions API error:', errorText);
      throw new Error(`Sessions alınamadı: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log('🟢 [API] Sessions API data:', data);
    return data;
  } catch (error: any) {
    console.error('🔴 [API] Sessions API catch error:', error);
    console.error('🔴 [API] Error type:', error.constructor.name);
    console.error('🔴 [API] Error message:', error.message);
    throw error;
  }
};

export const createSession = async (sessionId: string): Promise<SessionStatus> => {
  const response = await fetch(`${API_BASE}/sessions/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) throw new Error('Session oluşturulamadı');
  return response.json();
};

export const getSessionStatus = async (sessionId: string): Promise<SessionStatus> => {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/status`);
  if (!response.ok) throw new Error('Session durumu alınamadı');
  return response.json();
};

export const getQRCode = async (sessionId: string): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE}/api/qr?accountId=${sessionId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.qr || null;
  } catch {
    return null;
  }
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Session silinemedi');
};

// Chats API
export const getChats = async (sessionId: string, limit: number = 50): Promise<Chat[]> => {
  try {
    console.log('🔵 [API] getChats çağrılıyor, sessionId:', sessionId, 'limit:', limit);
    console.log('🔵 [API] API_BASE:', API_BASE);
    
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

// Contacts API
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

// Messages API
export const getMessages = async (sessionId: string, jid: string, limit: number = 20): Promise<any[]> => {
  try {
    console.log('🔵 [API] getMessages çağrılıyor, sessionId:', sessionId, 'jid:', jid, 'limit:', limit);
    console.log('🔵 [API] API_BASE:', API_BASE);

    // 1. tercih: /:sessionId/messages?jid=... (cursor destekli endpoint)
    let url = `${API_BASE}/${sessionId}/messages?jid=${encodeURIComponent(jid)}&limit=${limit}`;
    console.log('🔵 [API] Messages API çağrısı (1. deneme):', url);
    let response = await fetch(url);
    console.log('🔵 [API] Messages response status (1. deneme):', response.status, 'ok:', response.ok);

    // 2. tercih: /:sessionId/chats/:jid (eski cursor endpoint’i)
    if (!response.ok) {
      url = `${API_BASE}/${sessionId}/chats/${encodeURIComponent(jid)}?limit=${limit}`;
      console.log('🔵 [API] Messages API çağrısı (2. deneme):', url);
      response = await fetch(url);
      console.log('🔵 [API] Messages response status (2. deneme):', response.status, 'ok:', response.ok);
    }

    // 3. tercih: /api/messages/:jid?accountId=...
    if (!response.ok) {
      url = `${API_BASE}/api/messages/${encodeURIComponent(jid)}?accountId=${sessionId}&limit=${limit}`;
      console.log('🔵 [API] Messages API çağrısı (3. deneme):', url);
      response = await fetch(url);
      console.log('🔵 [API] Messages response status (3. deneme):', response.status, 'ok:', response.ok);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔴 [API] Messages API error:', errorText);
      throw new Error(`Mesajlar alınamadı: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🟢 [API] Messages API data (ham):', data);

    let messages: any[] = [];
    if (Array.isArray(data)) {
      messages = data;
    } else if (data.data && Array.isArray(data.data)) {
      messages = data.data;
    } else {
      console.warn('🟡 [API] Beklenmeyen messages response formatı:', data);
      messages = [];
    }

    console.log('🟢 [API] Messages (işlenmiş) count:', messages.length);
    return messages;
  } catch (error: any) {
    console.error('🔴 [API] Messages API catch error:', error);
    throw error;
  }
};

export const sendMessage = async (sessionId: string, jid: string, message: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, type: 'text', message }),
  });
  if (!response.ok) throw new Error('Mesaj gönderilemedi');
};

// SSE ile QR kod dinleme
export const subscribeToQR = (sessionId: string, onUpdate: (data: SessionStatus & { qr?: string }) => void) => {
  const eventSource = new EventSource(`${API_BASE}/sessions/${sessionId}/add-sse`);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onUpdate(data);
    } catch (error) {
      console.error('SSE parse error:', error);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    eventSource.close();
  };
  
  return () => eventSource.close();
};

