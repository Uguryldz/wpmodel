// ============================================
// Media API Module
// ============================================

const API_BASE = '';

/**
 * Medya mesajı gönder (Resim, Video, Belge, Ses)
 */
export const sendMediaMessage = async (
  sessionId: string,
  jid: string,
  media: File | Blob,
  mimetype: string,
  caption?: string,
  options?: {
    viewOnce?: boolean;
    gifPlayback?: boolean;
    ptv?: boolean;
    ptt?: boolean;
  }
): Promise<any> => {

  try {
    // File veya Blob'u base64'e çevir
    const mediaBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // data:image/jpeg;base64, prefix'ini kaldır
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        console.log('[API] Base64 dönüşümü tamamlandı, uzunluk:', base64.length);
        resolve(base64);
      };
      reader.onerror = (error) => {
        console.error('[API] FileReader hatası:', error);
        reject(error);
      };
      reader.readAsDataURL(media);
    });

    const url = `${API_BASE}/${sessionId}/messages/send`;
    console.log('[API] Fetch isteği gönderiliyor:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jid,
        type: 'media',
        message: {
          media: mediaBase64,
          mimetype,
          caption,
          viewOnce: options?.viewOnce,
          gifPlayback: options?.gifPlayback,
          ptv: options?.ptv,
          ptt: options?.ptt,
        },
      }),
    });

    console.log('[API] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Bilinmeyen hata' }));
      console.error('[API] Response hatası:', errorData);
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[API] Başarılı response:', result);
    return result;
  } catch (error: any) {
    console.error('[API] sendMediaMessage hatası:', error);
    throw error;
  }
};

/**
 * Medya indirme (decrypt edilmiş)
 */
export const downloadMediaMessage = async (
  sessionId: string,
  message: any
): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE}/${sessionId}/messages/download-advanced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      console.error('Medya indirilemedi:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.data) return null;

    // Base64'ü temizle
    const base64Clean = data.data.includes(',') 
      ? data.data.split(',')[1] 
      : data.data;

    // Blob'a çevir
    const byteCharacters = atob(base64Clean);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // MIME type
    const mimeType = data.mimetype || 'application/octet-stream';
    const blob = new Blob([byteArray], { type: mimeType });
    
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Medya indirme hatası:', error);
    return null;
  }
};