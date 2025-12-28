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

export const sendMessage = async (sessionId: string, jid: string, message: string): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, type: 'text', message }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Mesaj gönderilemedi');
  }
  return response.json();
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
  try {
    const response = await fetch(`${API_BASE}/${sessionId}/messages/${encodeURIComponent(jid)}/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    
    // Response'u text olarak oku (JSON parse hatası olabilir)
    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = 'Mesaj düzenlenemedi';
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = responseText || response.statusText || errorMessage;
      }
      console.error('[editMessage] API hatası:', {
        status: response.status,
        statusText: response.statusText,
        responseText,
        errorMessage
      });
      throw new Error(errorMessage);
    }
    
    // Başarılı response'u parse et
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      // JSON parse hatası varsa, response text'i direkt döndür
      console.warn('[editMessage] JSON parse hatası, text döndürülüyor:', responseText);
      result = { status: 'edited', message: responseText };
    }
    
    console.log('[editMessage] ✅ Başarılı:', result);
    return result;
  } catch (error: any) {
    // Network hatası veya diğer hatalar
    console.error('[editMessage] ❌ Hata:', error);
    if (error.message) {
      throw error; // Zaten Error objesi, direkt fırlat
    }
    throw new Error('Mesaj düzenlenemedi: ' + (error?.toString() || 'Bilinmeyen hata'));
  }
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

// Pin Message (README'ye göre) - Mesaj pin/unpin
export const pinMessage = async (
  sessionId: string, 
  jid: string, 
  messageKey: any, 
  type: number = 1, 
  time: number = 86400
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, messageKey, type, time }),
  });
  if (!response.ok) throw new Error('Mesaj pinlenemedi');
  return response.json();
};

// Mention ile mesaj gönder (README'ye göre)
export const sendMessageWithMention = async (
  sessionId: string, 
  jid: string, 
  text: string, 
  mentions: string[] = []
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/mention`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, text, mentions }),
  });
  if (!response.ok) throw new Error('Mention ile mesaj gönderilemedi');
  return response.json();
};

// Mesajı sadece benim için sil (Delete Message for Me) - README'ye göre
export const deleteMessageForMe = async (
  sessionId: string,
  jid: string,
  messageId: string,
  fromMe: boolean = false
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/chats/${encodeURIComponent(jid)}/messages/${messageId}/delete-for-me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromMe }),
  });
  if (!response.ok) throw new Error('Mesaj silinemedi');
  return response.json();
};

// ========== INTERACTIVE MESSAGES (Business Features) ==========

// Butonlu mesaj gönder
export interface ButtonMessage {
  buttonId: string;
  buttonText: { displayText: string } | string;
  type?: 1 | 2 | 3; // 1 = Quick Reply, 2 = URL, 3 = Call
  displayText?: string; // Alternatif format için
}

export interface ButtonMessageHeader {
  type: 1 | 2 | 3 | 4; // 1 = Text, 2 = Image, 3 = Video, 4 = Document
  text?: string;
  image?: { url: string };
  video?: { url: string };
  document?: { url: string; fileName?: string };
}

export const sendButtonMessage = async (
  sessionId: string,
  jid: string,
  text: string,
  buttons: ButtonMessage[],
  footer?: string,
  header?: ButtonMessageHeader
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/send/button`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, text, buttons, footer, header }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Butonlu mesaj gönderilemedi');
  }
  return response.json();
};

// Liste mesajı gönder
export interface ListSection {
  title: string;
  rows: Array<{
    title: string;
    description?: string;
    rowId: string;
  }>;
}

export const sendListMessage = async (
  sessionId: string,
  jid: string,
  text: string,
  title: string,
  buttonText: string,
  sections: ListSection[],
  footer?: string
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/send/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, text, title, buttonText, sections, footer }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Liste mesajı gönderilemedi');
  }
  return response.json();
};

// Şablon mesajı gönder
export interface TemplateComponent {
  type: string;
  parameters?: Array<{
    type: string;
    text?: string;
    image?: { url: string };
    video?: { url: string };
    document?: { url: string };
  }>;
}

export const sendTemplateMessage = async (
  sessionId: string,
  jid: string,
  templateName: string,
  languageCode: string = 'tr',
  components: TemplateComponent[] = []
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/send/template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, templateName, languageCode, components }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Şablon mesajı gönderilemedi');
  }
  return response.json();
};

// Ürün mesajı gönder
export interface ProductList {
  title: string;
  products: Array<{ productId: string }>;
}

export const sendProductMessage = async (
  sessionId: string,
  jid: string,
  text: string,
  productList: ProductList[],
  businessOwnerJid: string,
  footer?: string,
  thumbnail?: string
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/send/product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, text, productList, businessOwnerJid, footer, thumbnail }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Ürün mesajı gönderilemedi');
  }
  return response.json();
};
