// Message sending functions
import { Readable } from "stream";
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { buildMediaContent } from "../utils/media.js";
import { logger } from "../../shared.js";

/**
 * Text mesaj gönder
 */
export const sendTextMessage = async ({ accountId, to, message, options }) => {
  if (!to || !message) {
    throw new Error("Mesaj göndermek için to ve message alanları zorunludur.");
  }

  const jid = normalizeJid(to);
  await ensureSocket(accountId).sendMessage(jid, { text: message }, options);

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

/**
 * Medya mesaj gönder
 * README'ye göre Stream veya URL kullanılması öneriliyor (memory optimization)
 * - media: base64 string, URL string, veya Stream
 * - mimetype: medya tipi
 * - caption: opsiyonel başlık
 * - viewOnce: true ise view once mesajı gönder (README'ye göre)
 * - gifPlayback: true ise gif olarak gönder (README'ye göre - video olarak gönderilir)
 * - ptv: true ise video note olarak gönder (README'ye göre)
 * - ptt: true ise push to talk (sesli mesaj) olarak gönder (README'ye göre)
 */
export const sendMediaMessage = async ({ accountId, to, media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt }) => {
  if (!media || !mimetype) {
    throw new Error("Medya göndermek için media (base64/URL) ve mimetype alanları zorunludur.");
  }

  const jid = normalizeJid(to);
  const sock = ensureSocket(accountId);
  
  // Eğer media bir URL ise direkt kullan (README'ye göre best practice - memory optimization)
  if (typeof media === "string" && (media.startsWith("http://") || media.startsWith("https://"))) {
    const content = buildMediaContent({ url: media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    await sock.sendMessage(jid, content);
  } 
  // Eğer media bir Stream ise direkt kullan
  else if (media instanceof Readable) {
    const content = buildMediaContent({ stream: media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    await sock.sendMessage(jid, content);
  }
  // Base64 string ise Stream'e çevir (memory optimization için)
  else if (typeof media === "string") {
    // Base64 string'i temizle (data:audio/webm;base64, gibi prefix'leri kaldır)
    let base64Clean = media.includes(',') ? media.split(',')[1] : media;
    
    // Whitespace ve yeni satır karakterlerini temizle
    base64Clean = base64Clean.trim().replace(/\s/g, '');
    
    // Base64 string boşsa hata ver
    if (!base64Clean || base64Clean.length === 0) {
      throw new Error("Base64 string boş veya geçersiz");
    }
    
    // Base64 string'in geçerli olup olmadığını kontrol et (sadece base64 karakterleri)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64Clean)) {
      throw new Error("Base64 string geçersiz karakterler içeriyor");
    }
    
    try {
      const buffer = Buffer.from(base64Clean, "base64");
      
      // Buffer boşsa hata ver
      if (!buffer || buffer.length === 0) {
        throw new Error("Base64 string'den geçerli bir buffer oluşturulamadı");
      }
      
      // BaileyTipREADME.md'ye göre: audio için Buffer direkt kullanılabilir veya Stream
      // Web araması sonuçlarına göre: PTT için Buffer kullanmak daha güvenilir
      // Audio için Buffer kullan (daha güvenilir, Baileys dokümantasyonuna göre)
      const content = buildMediaContent({ buffer, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
      
      // Debug log - content formatını kontrol et
      logger.info({ 
        accountId, 
        jid, 
        mimetype, 
        bufferSize: buffer.length,
        ptt: ptt || false,
        contentKeys: Object.keys(content),
        audioType: typeof content.audio
      }, "Ses mesajı gönderiliyor");
      
      // Baileys sendMessage çağrısı
      const result = await sock.sendMessage(jid, content);
      
      // Başarılı gönderim logu
      logger.info({ 
        accountId, 
        jid, 
        mimetype,
        messageId: result?.key?.id,
        ptt: ptt || false
      }, "Ses mesajı başarıyla gönderildi");
      
      return result;
    } catch (error) {
      logger.error({ 
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: error?.data?.code,
          statusCode: error?.output?.statusCode
        }, 
        accountId, 
        jid,
        mimetype, 
        bufferSize: buffer?.length,
        base64Length: base64Clean.length,
        ptt: ptt || false,
        contentKeys: content ? Object.keys(content) : []
      }, "Ses mesajı gönderilemedi");
      throw new Error(`Ses mesajı gönderilemedi: ${error.message}`);
    }
  }
  // Buffer ise Stream'e çevir
  else if (Buffer.isBuffer(media)) {
    const stream = Readable.from(media);
    const content = buildMediaContent({ stream, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    await sock.sendMessage(jid, content);
  }
  else {
    throw new Error("Media tipi desteklenmiyor. Base64 string, URL, Stream veya Buffer bekleniyor.");
  }

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

/**
 * Raw mesaj gönder
 */
export const sendRawMessage = async (accountId, jid, message, options) => {
  if (!jid || !message) {
    throw new Error("Mesaj göndermek için jid ve message alanları zorunludur.");
  }

  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(jid);
  await sock.sendMessage(normalized, message, options);

  return { accountId: getAccountId(accountId), jid: normalized, status: "queued" };
};

/**
 * Toplu mesaj gönder
 */
export const sendBulkMessages = async (accountId, items = []) => {
  const results = [];
  for (const item of items) {
    const { jid, message, options, type } = item || {};
    if (!jid || !message) continue;

    if (type === "text") {
      results.push(await sendTextMessage({ accountId, to: jid, message, options }));
    } else {
      results.push(await sendRawMessage(accountId, jid, message, options));
    }
  }

  return results;
};



