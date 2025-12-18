// Media API module
const API_BASE = '';

/**
 * Mesaj medyasını indir ve blob URL oluştur
 */
export const downloadMessageMedia = async (
  sessionId: string,
  message: any,
  mediaType: 'image' | 'video' | 'audio' | 'document'
): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE}/${sessionId}/messages/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mediaType }),
    });

    if (!response.ok) {
      console.error('Medya indirilemedi:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.data) return null;

    // Base64'ü blob'a çevir
    const base64Data = data.data;
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    
    // MIME type'ı belirle
    let mimeType = 'application/octet-stream';
    if (mediaType === 'image') {
      mimeType = message.message?.imageMessage?.mimetype || 'image/jpeg';
    } else if (mediaType === 'video') {
      mimeType = message.message?.videoMessage?.mimetype || 'video/mp4';
    } else if (mediaType === 'audio') {
      mimeType = message.message?.audioMessage?.mimetype || 'audio/ogg';
    } else if (mediaType === 'document') {
      mimeType = message.message?.documentMessage?.mimetype || 'application/pdf';
    }

    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Medya indirme hatası:', error);
    return null;
  }
};

/**
 * Gelişmiş medya mesajı indirme
 * Backend'den decrypt edilmiş medya ve mimetype döner
 * .enc sorununu kalıcı çözer - decrypt edilmiş medya döner
 */
export const downloadMediaMessageAdvanced = async (
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
      console.error('Gelişmiş medya indirilemedi:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.data) {
      console.error('Medya data bulunamadı');
      return null;
    }

    // Base64'ü blob'a çevir - dikkatli decode et
    const base64Data = data.data;
    
    // Base64 string'i temizle (data:image/jpeg;base64, gibi prefix'leri kaldır)
    const base64Clean = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;
    
    try {
      const byteCharacters = atob(base64Clean);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      
      // Backend'den gelen mimetype'ı kullan, yoksa mesajdan belirle
      let mimeType = data.mimetype || 'application/octet-stream';
      
      if (!data.mimetype || mimeType === 'application/octet-stream') {
        // Fallback: MIME type'ı mesajdan belirle
        const messageType = message.type || (message.message ? Object.keys(message.message)[0] : 'unknown');
        
        if (messageType === 'imageMessage' || messageType === 'image') {
          mimeType = message.message?.imageMessage?.mimetype || 'image/jpeg';
        } else if (messageType === 'videoMessage' || messageType === 'video') {
          mimeType = message.message?.videoMessage?.mimetype || 'video/mp4';
        } else if (messageType === 'audioMessage' || messageType === 'audio' || messageType === 'ptt') {
          mimeType = message.message?.audioMessage?.mimetype || 'audio/ogg';
        } else if (messageType === 'documentMessage' || messageType === 'document') {
          mimeType = message.message?.documentMessage?.mimetype || 'application/pdf';
        } else if (messageType === 'stickerMessage' || messageType === 'sticker') {
          mimeType = message.message?.stickerMessage?.mimetype || 'image/webp';
        }
      }

      // Doğru MIME type ile blob oluştur (artık decrypt edilmiş medya)
      const blob = new Blob([byteArray], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      // Debug: Blob URL ve MIME type'ı kontrol et
      console.log('Medya yüklendi:', { mimeType, blobSize: blob.size, blobUrl });
      
      return blobUrl;
    } catch (decodeError) {
      console.error('Base64 decode hatası:', decodeError);
      return null;
    }
  } catch (error) {
    console.error('Gelişmiş medya indirme hatası:', error);
    return null;
  }
};

/**
 * Medya mesajını yeniden yükle (Re-upload Media Message) - README'ye göre
 */
export const updateMediaMessage = async (sessionId: string, message: any): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/media/reupload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw new Error('Medya mesajı yeniden yüklenemedi');
  return response.json();
};

/**
 * Medya URL proxy - .enc sorununu kalıcı çözer, direkt görsel blob URL döner
 */
export const proxyMediaUrl = async (
  sessionId: string,
  message: any,
  mimetype?: string
): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE}/${sessionId}/media/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mimetype }),
    });

    if (!response.ok) {
      console.error('Medya proxy başarısız:', response.status);
      return null;
    }

    // Backend'den direkt görsel blob döner (Content-Type ile)
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  } catch (error) {
    console.error('Medya proxy hatası:', error);
    return null;
  }
};

/**
 * Medya mesajı gönder (gelişmiş versiyon - viewOnce, gifPlayback, ptv, ptt desteği ile)
 */
export const sendMediaMessage = async (
  sessionId: string,
  jid: string,
  media: string | File | Blob,
  mimetype: string,
  caption?: string,
  options?: {
    viewOnce?: boolean;
    gifPlayback?: boolean;
    ptv?: boolean;
    ptt?: boolean; // Push to Talk (sesli mesaj)
  }
): Promise<any> => {
  // File veya Blob ise base64'e çevir
  let mediaBase64: string;
  if (media instanceof File || media instanceof Blob) {
    const arrayBuffer = await media.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    mediaBase64 = buffer.toString('base64');
  } else {
    mediaBase64 = media;
  }

  const response = await fetch(`${API_BASE}/${sessionId}/messages/send`, {
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
        ptt: options?.ptt, // Push to Talk desteği
      },
    }),
  });
  if (!response.ok) throw new Error('Medya mesajı gönderilemedi');
  return response.json();
};
