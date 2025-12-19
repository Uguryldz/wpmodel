// Templates API module
const API_BASE = '';

export interface MessageTemplate {
  id: string;
  name: string;
  type: 'button' | 'list' | 'template' | 'product';
  data: any;
  createdAt: number;
  updatedAt?: number | null;
  sessionId?: string;
}

export const getTemplates = async (sessionId?: string): Promise<MessageTemplate[]> => {
  const url = sessionId 
    ? `${API_BASE}/${sessionId}/templates`
    : `${API_BASE}/api/templates`;
  
  const response = await fetch(url);
  const responseText = await response.text();
  
  if (!response.ok) {
    let errorMessage = 'Şablonlar alınamadı';
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      errorMessage = responseText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  
  const result = JSON.parse(responseText);
  return result.data || [];
};

export const createTemplate = async (
  sessionId: string,
  name: string,
  type: 'button' | 'list' | 'template' | 'product',
  data: any
): Promise<MessageTemplate> => {
  try {
    const response = await fetch(`${API_BASE}/${sessionId}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, data }),
    });
    
    // Response body'yi bir kez oku
    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = 'Şablon oluşturulamadı';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    // Response başarılıysa JSON parse et
    const result = JSON.parse(responseText);
    // Backend { data: template } formatında döndürüyor
    return result.data || result;
  } catch (error: any) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Şablon oluşturulamadı: ${error?.message || 'Bilinmeyen hata'}`);
  }
};

export const updateTemplate = async (
  sessionId: string,
  templateId: string,
  updates: { name?: string; type?: string; data?: any }
): Promise<MessageTemplate> => {
  const response = await fetch(`${API_BASE}/${sessionId}/templates/${templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const responseText = await response.text();
  
  if (!response.ok) {
    let errorMessage = 'Şablon güncellenemedi';
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      errorMessage = responseText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  
  return JSON.parse(responseText);
};

export const deleteTemplate = async (sessionId: string, templateId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/${sessionId}/templates/${templateId}`, {
    method: 'DELETE',
  });
  const responseText = await response.text();
  
  if (!response.ok) {
    let errorMessage = 'Şablon silinemedi';
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      errorMessage = responseText || errorMessage;
    }
    throw new Error(errorMessage);
  }
};

export const getTemplate = async (sessionId: string, templateId: string): Promise<MessageTemplate> => {
  const response = await fetch(`${API_BASE}/${sessionId}/templates/${templateId}`);
  const responseText = await response.text();
  
  if (!response.ok) {
    let errorMessage = 'Şablon alınamadı';
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      errorMessage = responseText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  
  return JSON.parse(responseText);
};
