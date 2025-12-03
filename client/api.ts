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
}

export interface Contact {
  id: string;
  name?: string;
  notify?: string;
}

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
export const getChats = async (sessionId: string): Promise<Chat[]> => {
  try {
    console.log('🔵 [API] getChats çağrılıyor, sessionId:', sessionId);
    console.log('🔵 [API] API_BASE:', API_BASE);
    
    // Önce /:sessionId/chats endpoint'ini dene (baileys-api-master formatı)
    let url = `${API_BASE}/${sessionId}/chats`;
    console.log('🔵 [API] Chats API çağrısı (1. deneme):', url);
    let response = await fetch(url);
    console.log('🔵 [API] Chats API response status (1. deneme):', response.status);
    console.log('🔵 [API] Response ok (1. deneme):', response.ok);
    
    // Eğer başarısız ise /api/chats endpoint'ini dene
    if (!response.ok) {
      url = `${API_BASE}/api/chats?accountId=${sessionId}`;
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
export const getContacts = async (sessionId: string): Promise<Contact[]> => {
  const response = await fetch(`${API_BASE}/${sessionId}/contacts`);
  if (!response.ok) throw new Error('Kişiler alınamadı');
  const data = await response.json();
  return data.data || [];
};

// Messages API
export const getMessages = async (sessionId: string, jid: string, limit: number = 20): Promise<any[]> => {
  const response = await fetch(`${API_BASE}/${sessionId}/chats/${jid}?limit=${limit}`);
  if (!response.ok) throw new Error('Mesajlar alınamadı');
  const data = await response.json();
  return data.data || [];
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

