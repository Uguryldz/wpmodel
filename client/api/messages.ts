// Messages API module
import { Message } from '../types';

const API_BASE = '';

export const getMessages = async (sessionId: string, jid: string, limit: number = 20): Promise<Message[]> => {
  try {
    console.log('🔵 [API] getMessages çağrılıyor, sessionId:', sessionId, 'jid:', jid, 'limit:', limit);

    // 1. tercih: /:sessionId/messages?jid=... (cursor destekli endpoint)
    let url = `${API_BASE}/${sessionId}/messages?jid=${encodeURIComponent(jid)}&limit=${limit}`;
    console.log('🔵 [API] Messages API çağrısı (1. deneme):', url);
    let response = await fetch(url);
    console.log('🔵 [API] Messages response status (1. deneme):', response.status, 'ok:', response.ok);

    // 2. tercih: /:sessionId/chats/:jid (eski cursor endpoint'i)
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

    let messages: Message[] = [];
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

export const replyToMessage = async (sessionId: string, jid: string, messageId: string, message: string): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, messageId, message }),
  });
  if (!response.ok) throw new Error('Mesaj yanıtlanamadı');
  return response.json();
};

export const forwardMessage = async (sessionId: string, fromJid: string, toJid: string, messageId: string): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromJid, toJid, messageId }),
  });
  if (!response.ok) throw new Error('Mesaj iletilemedi');
  return response.json();
};

export const editMessage = async (sessionId: string, jid: string, messageId: string, message: string): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/${encodeURIComponent(jid)}/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw new Error('Mesaj düzenlenemedi');
  return response.json();
};

export const deleteMessage = async (sessionId: string, jid: string, messageId: string, deleteForEveryone: boolean = false): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/${encodeURIComponent(jid)}/${messageId}?deleteForEveryone=${deleteForEveryone}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Mesaj silinemedi');
  return response.json();
};

export const starMessage = async (sessionId: string, jid: string, messageId: string, star: boolean = true): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/star`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, messageId, star }),
  });
  if (!response.ok) throw new Error('Mesaj yıldızlanamadı');
  return response.json();
};

export const markMessagesAsRead = async (sessionId: string, jid: string, messageIds?: string[]): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, messageIds: messageIds || [] }),
  });
  if (!response.ok) throw new Error('Mesajlar okundu olarak işaretlenemedi');
  return response.json();
};
