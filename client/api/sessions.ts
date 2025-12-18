// Sessions API module
import { Session, SessionStatus } from '../types';

const API_BASE = '';

export const getSessions = async (): Promise<Session[]> => {
  try {
    const url = `${API_BASE}/sessions`;
    console.log('🔵 [API] getSessions çağrılıyor');
    console.log('🔵 [API] URL:', url);
    
    const response = await fetch(url);
    console.log('🔵 [API] Response status:', response.status);
    console.log('🔵 [API] Response ok:', response.ok);
    
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

// QR üretimi için bağlantıyı başlat
export const startConnection = async (sessionId: string): Promise<SessionStatus> => {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/start`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Bağlantı başlatılamadı');
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

// SSE ile QR kod dinleme
export const subscribeToQR = (sessionId: string, onUpdate: (data: SessionStatus & { qr?: string }) => void) => {
  const url = `${API_BASE}/sessions/${sessionId}/add-sse`;
  console.log('[SSE] Bağlantı başlatılıyor:', url);
  const eventSource = new EventSource(url);
  
  eventSource.onopen = () => {
    console.log('[SSE] Bağlantı açıldı');
  };
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const qrValue = data.qr || data.lastQr;
      
      console.log('[SSE] Mesaj alındı:', { 
        hasQr: !!qrValue, 
        qrLength: qrValue?.length,
        hasDataQr: !!data.qr,
        hasDataLastQr: !!data.lastQr,
        status: data.status,
        socketReady: data.socketReady,
        keys: Object.keys(data)
      });
      
      // QR kod varsa log'la
      if (qrValue) {
        console.log('[SSE] ✅ QR kod bulundu, uzunluk:', qrValue.length, 'ilk 50 karakter:', qrValue.substring(0, 50));
      }
      
      // QR kod field'ını normalize et (hem qr hem de lastQr için)
      const normalizedData = {
        ...data,
        qr: qrValue || data.qr || null
      };
      
      onUpdate(normalizedData);
    } catch (error) {
      console.error('[SSE] Parse error:', error, 'Data:', event.data);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('[SSE] Error:', error);
    console.error('[SSE] EventSource readyState:', eventSource.readyState);
    // EventSource.CONNECTING = 0, EventSource.OPEN = 1, EventSource.CLOSED = 2
    if (eventSource.readyState === EventSource.CLOSED) {
      console.error('[SSE] Bağlantı kapandı');
    }
  };
  
  return () => {
    console.log('[SSE] Bağlantı kapatılıyor');
    eventSource.close();
  };
};
