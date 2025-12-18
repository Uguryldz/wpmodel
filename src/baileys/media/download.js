// Media download functions
import { downloadContentFromMessage, downloadMediaMessage } from "baileys";
import { ensureSocket } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Mesaj medyasını indir
 * NOT: downloadContentFromMessage şifrelenmiş medya döndürebilir (.enc dosyaları)
 * Bu yüzden downloadMediaMessage kullanıyoruz ki otomatik decrypt edilsin
 */
export const downloadMessageMedia = async (accountId, message, mediaType) => {
  if (!message || !mediaType) {
    throw new Error("Medya indirmek için message ve mediaType alanları zorunludur.");
  }

  const sock = ensureSocket(accountId);

  try {
    // downloadMediaMessage otomatik olarak decrypt eder, .enc dosyaları gelmez
    const result = await downloadMediaMessage(
      message,
      'stream',
      {},
      { 
        logger: logger, 
        reuploadRequest: sock.updateMediaMessage 
      }
    );

    const chunks = [];
    for await (const chunk of result) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    return buffer.toString("base64");
  } catch (error) {
    logger.error({ error, accountId }, "Medya indirme başarısız");
    throw new Error(`Medya indirme başarısız: ${error.message}`);
  }
};

/**
 * Gelişmiş medya mesajı indirme
 * README'ye göre: downloadMediaMessage otomatik olarak decrypt eder
 * Eğer medya silinmişse, reuploadRequest ile yeniden yüklenir
 */
export const downloadMediaMessageAdvanced = async (accountId, message) => {
  if (!message) {
    throw new Error("message objesi gereklidir");
  }

  const sock = ensureSocket(accountId);

  try {
    // README'ye göre: downloadMediaMessage decrypt edilmiş stream döndürür
    // Eğer medya silinmişse, reuploadRequest ile otomatik yeniden yüklenir
    const result = await downloadMediaMessage(
      message,
      'stream', // 'buffer' da kullanılabilir ama stream memory için daha iyi
      {},
      { 
        logger: logger, 
        reuploadRequest: sock.updateMediaMessage // Silinmiş medya için otomatik re-upload
      }
    );

    const chunks = [];
    for await (const chunk of result) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    
    // Buffer'ın geçerli olup olmadığını kontrol et
    if (!buffer || buffer.length === 0) {
      throw new Error("İndirilen medya buffer'ı boş");
    }
    
    // MIME type'ı mesajdan belirle
    const messageType = message.type || (message.message ? Object.keys(message.message)[0] : 'unknown');
    let mimetype = 'application/octet-stream';
    
    if (messageType === 'imageMessage' || messageType === 'image') {
      mimetype = message.message?.imageMessage?.mimetype || 'image/jpeg';
    } else if (messageType === 'videoMessage' || messageType === 'video') {
      mimetype = message.message?.videoMessage?.mimetype || 'video/mp4';
    } else if (messageType === 'audioMessage' || messageType === 'audio' || messageType === 'ptt') {
      mimetype = message.message?.audioMessage?.mimetype || 'audio/ogg';
    } else if (messageType === 'documentMessage' || messageType === 'document') {
      mimetype = message.message?.documentMessage?.mimetype || 'application/pdf';
    } else if (messageType === 'stickerMessage' || messageType === 'sticker') {
      mimetype = message.message?.stickerMessage?.mimetype || 'image/webp';
    }
    
    // Base64 encoding - dikkatli yap
    const base64Data = buffer.toString("base64");
    
    // Debug log
    logger.info({ 
      accountId, 
      bufferSize: buffer.length, 
      base64Length: base64Data.length,
      mimetype,
      messageType 
    }, "Medya başarıyla indirildi");
    
    return { 
      status: "success", 
      data: base64Data,
      buffer: buffer,
      mimetype: mimetype // MIME type'ı da döndür
    };
  } catch (error) {
    logger.error({ error, accountId }, "Gelişmiş medya indirme başarısız");
    
    // Eğer medya silinmişse, önce re-upload dene
    try {
      logger.info({ accountId }, "Medya silinmiş olabilir, re-upload deneniyor...");
      await sock.updateMediaMessage(message);
      
      // Re-upload sonrası tekrar dene
      const result = await downloadMediaMessage(
        message,
        'stream',
        {},
        { 
          logger: logger, 
          reuploadRequest: sock.updateMediaMessage 
        }
      );

      const chunks = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      
      // Buffer'ın geçerli olup olmadığını kontrol et
      if (!buffer || buffer.length === 0) {
        throw new Error("Re-upload sonrası indirilen medya buffer'ı boş");
      }
      
      const messageType = message.type || (message.message ? Object.keys(message.message)[0] : 'unknown');
      let mimetype = 'application/octet-stream';
      
      if (messageType === 'imageMessage' || messageType === 'image') {
        mimetype = message.message?.imageMessage?.mimetype || 'image/jpeg';
      } else if (messageType === 'videoMessage' || messageType === 'video') {
        mimetype = message.message?.videoMessage?.mimetype || 'video/mp4';
      } else if (messageType === 'audioMessage' || messageType === 'audio' || messageType === 'ptt') {
        mimetype = message.message?.audioMessage?.mimetype || 'audio/ogg';
      } else if (messageType === 'documentMessage' || messageType === 'document') {
        mimetype = message.message?.documentMessage?.mimetype || 'application/pdf';
      } else if (messageType === 'stickerMessage' || messageType === 'sticker') {
        mimetype = message.message?.stickerMessage?.mimetype || 'image/webp';
      }
      
      const base64Data = buffer.toString("base64");
      
      return { 
        status: "success", 
        data: base64Data,
        buffer: buffer,
        mimetype: mimetype
      };
    } catch (retryError) {
      logger.error({ error: retryError, accountId }, "Re-upload sonrası medya indirme başarısız");
      throw new Error(`Gelişmiş medya indirme başarısız: ${error.message}`);
    }
  }
};

/**
 * Medya mesajını yeniden yükle (Re-upload Media Message to Whatsapp)
 * README'ye göre: WhatsApp automatically removes old media from their servers.
 * For the device to access said media -- a re-upload is required by another device that has it.
 */
export const updateMediaMessage = async (accountId, message) => {
  if (!message) {
    throw new Error("message objesi gereklidir");
  }

  const sock = ensureSocket(accountId);

  try {
    await sock.updateMediaMessage(message);
    logger.info({ accountId }, "Medya mesajı yeniden yüklendi");
    return { status: "success", message: "Medya mesajı yeniden yüklendi" };
  } catch (error) {
    logger.error({ error, accountId }, "Medya mesajı yeniden yüklenemedi");
    throw new Error(`Medya mesajı yeniden yüklenemedi: ${error.message}`);
  }
};

/**
 * WhatsApp medya URL'sini proxy edip görsel olarak döndür
 * .enc sorununu kalıcı olarak çözer - direkt görsel blob döner
 * NOT: WhatsApp medya URL'leri authentication gerektirir, bu yüzden mesaj objesi ile kullanılmalı
 */
export const proxyMediaUrl = async (accountId, message, mimetype) => {
  if (!message) {
    throw new Error("message objesi gereklidir");
  }

  const sock = ensureSocket(accountId);

  try {
    // Mesaj objesinden medyayı indir (otomatik decrypt edilir)
    // Bu şekilde .enc sorunu tamamen çözülür
    const result = await downloadMediaMessage(
      message,
      'stream',
      {},
      { 
        logger: logger, 
        reuploadRequest: sock.updateMediaMessage 
      }
    );

    const chunks = [];
    for await (const chunk of result) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    
    // MIME type'ı belirle
    const messageType = message.type || (message.message ? Object.keys(message.message)[0] : 'unknown');
    let contentType = mimetype || 'application/octet-stream';
    
    if (!mimetype) {
      if (messageType === 'imageMessage' || messageType === 'image') {
        contentType = message.message?.imageMessage?.mimetype || 'image/jpeg';
      } else if (messageType === 'videoMessage' || messageType === 'video') {
        contentType = message.message?.videoMessage?.mimetype || 'video/mp4';
      } else if (messageType === 'audioMessage' || messageType === 'audio' || messageType === 'ptt') {
        contentType = message.message?.audioMessage?.mimetype || 'audio/ogg';
      } else if (messageType === 'documentMessage' || messageType === 'document') {
        contentType = message.message?.documentMessage?.mimetype || 'application/pdf';
      } else if (messageType === 'stickerMessage' || messageType === 'sticker') {
        contentType = message.message?.stickerMessage?.mimetype || 'image/webp';
      }
    }
    
    return {
      status: "success",
      buffer: buffer,
      mimetype: contentType,
      data: buffer.toString("base64")
    };
  } catch (error) {
    logger.error({ error, accountId }, "Medya URL proxy başarısız");
    throw new Error(`Medya URL proxy başarısız: ${error.message}`);
  }
};



