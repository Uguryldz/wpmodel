// Webhook utility - Lead webhook gönderme fonksiyonu
import { logger, prisma, getPhoneMapIdFromSessionId } from '../shared.js';
import { formatContactName } from '../baileys/shared.js';
import { jidNormalizedUser } from 'baileys';
import { extractPhoneFromJid, convertInternationalToTurkish, normalizePhoneNumber } from './jidConverter.js';
import https from 'https';
import http from 'http';
import { URL } from 'url';

/**
 * Mesajdan ad soyad bilgisini çıkar
 */
const extractContactName = (message, instance) => {
  // Önce pushName'i kontrol et
  if (message.pushName) {
    return message.pushName;
  }
  
  // Sonra contact store'dan al
  const remoteJid = message.key?.remoteJid || message.from;
  if (remoteJid && instance) {
    const contact = instance.contactsStore?.get(remoteJid);
    if (contact) {
      return formatContactName(contact);
    }
  }
  
  // Son çare: JID'den telefon numarasını al
  const phone = extractPhoneFromJid(remoteJid);
  return phone || 'Bilinmeyen';
};

/**
 * Mesajdan telefon numarasını çıkar
 */
const extractPhoneNumber = (message) => {
  // Önce remoteJidAlt'ı kontrol et (@lid formatı için)
  let remoteJid = message.key?.remoteJidAlt || message.key?.remoteJid || message.from;
  if (!remoteJid) return null;
  
  // Eğer @lid formatındaysa ve remoteJidAlt varsa onu kullan
  if (remoteJid.includes('@lid') && message.key?.remoteJidAlt) {
    remoteJid = message.key.remoteJidAlt;
  }
  
  const phone = extractPhoneFromJid(remoteJid);
  if (!phone) return null;
  
  // Telefon numarasını formatla
  // Eğer zaten + ile başlıyorsa olduğu gibi döndür
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Türkiye formatı (90 ile başlar)
  if (phone.startsWith('90') && phone.length === 12) {
    return `+${phone}`;
  }
  
  // Uluslararası format (1 ile başlar) - olduğu gibi döndür
  if (phone.startsWith('1')) {
    return `+${phone}`;
  }
  
  // Diğer durumlarda + ekle
  return `+${phone}`;
};

/**
 * Mesajdan text içeriğini çıkar
 */
const extractMessageText = (message) => {
  if (!message.message) return '';
  
  // Normal metin mesajları
  if (message.message.conversation) {
    return message.message.conversation;
  }
  
  // Uzun metin mesajları
  if (message.message.extendedTextMessage?.text) {
    return message.message.extendedTextMessage.text;
  }
  
  // Medya mesajları - caption varsa onu döndür
  if (message.message.imageMessage?.caption) {
    return message.message.imageMessage.caption;
  }
  if (message.message.videoMessage?.caption) {
    return message.message.videoMessage.caption;
  }
  if (message.message.documentMessage?.caption) {
    return message.message.documentMessage.caption;
  }
  
  // Medya mesajları - caption yoksa tip belirt
  if (message.message.imageMessage) return '📷 Fotoğraf';
  if (message.message.videoMessage) return '📹 Video';
  if (message.message.audioMessage) {
    if (message.message.audioMessage.ptt) return '🎤 Sesli Mesaj';
    return '🎵 Ses';
  }
  if (message.message.documentMessage) {
    const fileName = message.message.documentMessage.fileName || 'Belge';
    return `📄 ${fileName}`;
  }
  if (message.message.stickerMessage) return '🎨 Sticker';
  if (message.message.locationMessage) return '📍 Konum';
  if (message.message.contactMessage) return '👤 Kişi';
  
  return '';
};

/**
 * Unique lead ID oluştur
 */
const generateUniqueLeadId = (message, sessionId) => {
  const messageId = message.key?.id || message.id;
  const remoteJid = message.key?.remoteJid || message.from;
  const timestamp = message.messageTimestamp || message.timestamp || Date.now();
  
  // Format: sessionId-messageId-timestamp
  return `${sessionId}-${messageId}-${timestamp}`;
};

/**
 * Hesap sahibinin telefon numarasını al (Türkiye formatında)
 * Veritabanından SessionPhoneMap'ten telefon numarasını alır ve normalize eder
 */
const getAccountPhoneNumber = async (instance, sessionId) => {
  try {
    // Önce veritabanından SessionPhoneMap'ten telefon numarasını al
    const phoneMapId = await getPhoneMapIdFromSessionId(sessionId);
    
    if (phoneMapId) {
      const phoneMap = await prisma.sessionPhoneMap.findUnique({
        where: { pkId: phoneMapId },
        select: { phoneNum: true },
      });
      
      if (phoneMap?.phoneNum) {
        const rawPhone = phoneMap.phoneNum;
        
        // Telefon numarasını Türkiye formatına çevir
        // Önce normalize et (0 ile başlıyorsa 90 ekle)
        let normalizedPhone = normalizePhoneNumber(rawPhone);
        
        // Eğer zaten Türkiye formatında ise (90 ile başlıyorsa ve 12 haneli), olduğu gibi döndür
        if (normalizedPhone.startsWith('90') && normalizedPhone.length === 12) {
          return normalizedPhone;
        }
        
        // Uluslararası formatı (1 ile başlar) Türkiye formatına çevir
        if (normalizedPhone.startsWith('1') && normalizedPhone.length >= 10) {
          const turkishPhone = convertInternationalToTurkish(normalizedPhone);
          // Tekrar normalize et (gerekirse)
          normalizedPhone = normalizePhoneNumber(turkishPhone);
          
          // Eğer hala 12 haneli değilse, tekrar kontrol et
          if (normalizedPhone.startsWith('90') && normalizedPhone.length === 12) {
            return normalizedPhone;
          }
        }
        
        // Eğer hala normalize edilemediyse, raw phone'u döndür
        return normalizedPhone;
      }
    }
    
    // Veritabanından alınamadıysa, instance'dan sock.user?.id'yi kontrol et
    if (instance?.sock?.user?.id) {
      const rawPhone = extractPhoneFromJid(instance.sock.user.id);
      if (rawPhone) {
        // Normalize et ve Türkiye formatına çevir
        let normalizedPhone = normalizePhoneNumber(rawPhone);
        
        if (normalizedPhone.startsWith('90') && normalizedPhone.length === 12) {
          return normalizedPhone;
        }
        
        if (normalizedPhone.startsWith('1') && normalizedPhone.length >= 10) {
          const turkishPhone = convertInternationalToTurkish(normalizedPhone);
          return normalizePhoneNumber(turkishPhone);
        }
        
        return normalizedPhone;
      }
    }
    
    // Son çare: SessionId'den telefon numarasını çıkarmayı dene
    if (sessionId) {
      // account- prefix'ini kaldır
      const sessionIdWithoutPrefix = sessionId.replace(/^account-/, '');
      
      // Eğer sadece rakamlardan oluşuyorsa ve geçerli bir telefon numarası gibi görünüyorsa
      if (/^\d+$/.test(sessionIdWithoutPrefix) && sessionIdWithoutPrefix.length >= 10) {
        let normalizedPhone = normalizePhoneNumber(sessionIdWithoutPrefix);
        
        if (normalizedPhone.startsWith('90') && normalizedPhone.length === 12) {
          return normalizedPhone;
        }
        
        if (normalizedPhone.startsWith('1') && normalizedPhone.length >= 10) {
          const turkishPhone = convertInternationalToTurkish(normalizedPhone);
          return normalizePhoneNumber(turkishPhone);
        }
        
        return normalizedPhone;
      }
    }
    
    return null;
  } catch (error) {
    logger.error({ error, sessionId }, "getAccountPhoneNumber hatası");
    return null;
  }
};

/**
 * Webhook'a POST isteği gönder
 */
export const sendWebhook = async (message, sessionId, instance) => {
  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookToken = process.env.WEBHOOK_TOKEN;
  
  // Webhook URL ve token kontrolü
  if (!webhookUrl || !webhookToken) {
    logger.warn({ sessionId, messageId: message.key?.id || message.id }, "Webhook URL veya Token tanımlı değil, webhook gönderilemedi");
    return;
  }
  
  logger.info({ 
    sessionId, 
    messageId: message.key?.id || message.id,
    hasWebhookUrl: !!webhookUrl,
    hasWebhookToken: !!webhookToken,
    remoteJid: message.key?.remoteJid,
    fromMe: message.key?.fromMe
  }, "Webhook fonksiyonu çağrıldı");
  
  try {
    // Sadece gelen mesajları işle (fromMe = false)
    // Baileys'ten gelen mesajlarda fromMe boolean, number veya undefined olabilir
    const isFromMe = message.key?.fromMe === true || message.key?.fromMe === 1 || message.fromMe === true || message.fromMe === 1;
    if (isFromMe) {
      logger.debug({ 
        sessionId, 
        messageId: message.key?.id || message.id,
        fromMe: message.key?.fromMe,
        messageFromMe: message.fromMe
      }, "Webhook atlandı (gönderilen mesaj - webhook fonksiyonu içinde)");
      return; // Gönderilen mesajları webhook'a gönderme
    }
    
    // Mesaj verilerini hazırla
    const adSoyad = extractContactName(message, instance);
    const telno = extractPhoneNumber(message);
    const mesaj = extractMessageText(message);
    const uniqueLeadId = generateUniqueLeadId(message, sessionId);
    const accountPhoneNumber = await getAccountPhoneNumber(instance, sessionId);
    
    // Raw data: Sadece mesaj objesinin JSON string'i (basit ve güvenli)
    let rawDataString = '';
    try {
      // Mesaj objesini güvenli bir şekilde serialize et
      const rawDataObject = {
        ...message,
        // Hesap sahibinin telefon numarasını ekle
        account_phone_number: accountPhoneNumber || null,
        session_id: sessionId
      };
      
      rawDataString = JSON.stringify(rawDataObject, (key, value) => {
        // Circular reference'ları ve fonksiyonları filtrele
        if (typeof value === 'function') return undefined;
        if (value instanceof Error) return { message: value.message, name: value.name };
        // Buffer'ları string'e çevir
        if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
          return Buffer.from(value.data).toString('base64');
        }
        return value;
      }, 2);
    } catch (serializeError) {
      // Eğer serialize edilemezse, minimal bir obje gönder
      logger.warn(
        { 
          error: serializeError.message,
          sessionId, 
          messageId: message.key?.id || message.id 
        },
        'Raw data serialize edilemedi, minimal obje gönderiliyor'
      );
      rawDataString = JSON.stringify({
        key: message.key,
        message: message.message,
        messageTimestamp: message.messageTimestamp,
        pushName: message.pushName,
        account_phone_number: accountPhoneNumber || null,
        session_id: sessionId
      }, null, 2);
    }
    
    // Webhook payload'ı oluştur (sadece temel bilgiler)
    const payload = {
      ad_soyad: adSoyad,
      telno: telno,
      mesaj: mesaj,
      unique_lead_id: uniqueLeadId,
      account_phone_number: accountPhoneNumber || null, // Hesap sahibinin telefon numarası
      raw_data: rawDataString, // WhatsApp'ın ham mesaj objesi (parse edilmez)
    };
    
    // Webhook'a POST isteği gönder (timeout ile)
    logger.info(
      { 
        sessionId, 
        messageId: message.key?.id || message.id,
        webhookUrl: webhookUrl.substring(0, 50) + '...',
        payloadSize: JSON.stringify(payload).length
      },
      'Webhook isteği gönderiliyor'
    );
    
    // SSL sertifika doğrulamasını atla - Node.js https/http modüllerini kullan
    try {
      const url = new URL(webhookUrl);
      const payloadString = JSON.stringify(payload);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': webhookToken,
          'Content-Length': Buffer.byteLength(payloadString),
        },
        // SSL sertifika doğrulamasını atla (sadece HTTPS için)
        ...(isHttps && { rejectUnauthorized: false }),
      };
      
      const response = await new Promise((resolve, reject) => {
        const req = httpModule.request(options, (res) => {
          let responseText = '';
          
          res.on('data', (chunk) => {
            responseText += chunk.toString();
          });
          
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              statusText: res.statusMessage,
              ok: res.statusCode >= 200 && res.statusCode < 300,
              text: async () => responseText,
            });
          });
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        // Timeout kontrolü
        const timeout = setTimeout(() => {
          req.destroy();
          reject(new Error('Request timeout'));
        }, 10000);
        
        req.on('finish', () => {
          clearTimeout(timeout);
        });
        
        req.write(payloadString);
        req.end();
      });
      
      // Response body'yi oku
      let responseText = '';
      try {
        responseText = await response.text();
      } catch (textError) {
        responseText = 'Response body okunamadı';
      }
      
      if (!response.ok) {
        logger.error(
          { 
            sessionId, 
            messageId: message.key?.id || message.id,
            status: response.status,
            statusText: response.statusText,
            responseText: responseText.substring(0, 500),
            webhookUrl: webhookUrl.substring(0, 50) + '...'
          },
          'Webhook gönderilemedi (HTTP hatası)'
        );
      } else {
        logger.info(
          { 
            sessionId, 
            messageId: message.key?.id || message.id,
            uniqueLeadId,
            telno,
            status: response.status
          },
          'Webhook başarıyla gönderildi'
        );
      }
    } catch (fetchError) {
      // Fetch hatasını yeniden fırlat (catch bloğunda handle edilecek)
      throw fetchError;
    }
  } catch (error) {
    // Hata objesini serialize et (circular reference'ları handle et)
    let errorDetails = {};
    try {
      errorDetails = {
        message: error.message || String(error),
        name: error.name,
        code: error.code,
        stack: error.stack,
        cause: error.cause ? String(error.cause) : undefined,
      };
    } catch (serializeError) {
      errorDetails = {
        message: String(error),
        name: 'SerializationError',
      };
    }
    
    logger.error(
      { 
        error: errorDetails, 
        sessionId, 
        messageId: message.key?.id || message.id,
        webhookUrl: webhookUrl ? webhookUrl.substring(0, 50) + '...' : null,
        remoteJid: message.key?.remoteJid || message.from
      },
      'Webhook gönderme hatası'
    );
  }
};

