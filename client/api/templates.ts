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
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Şablonlar alınamadı');
  }
  const result = await response.json();
  return result.data || [];
};

export const createTemplate = async (
  sessionId: string,
  name: string,
  type: 'button' | 'list' | 'template' | 'product',
  data: any
): Promise<MessageTemplate> => {
  const response = await fetch(`${API_BASE}/${sessionId}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, data }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Şablon oluşturulamadı');
  }
  return response.json();
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
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Şablon güncellenemedi');
  }
  return response.json();
};

export const deleteTemplate = async (sessionId: string, templateId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/${sessionId}/templates/${templateId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Şablon silinemedi');
  }
};

export const getTemplate = async (sessionId: string, templateId: string): Promise<MessageTemplate> => {
  const response = await fetch(`${API_BASE}/${sessionId}/templates/${templateId}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Şablon alınamadı');
  }
  return response.json();
};
