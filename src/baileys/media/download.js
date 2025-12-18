// Media download functions
import { downloadContentFromMessage, downloadMediaMessage, getContentType } from "baileys";
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

  // Önce mesajı Baileys formatına çevir, sonra getContentType kullan
  // Baileys downloadMediaMessage için message.message.audioMessage gibi yapı bekler
  let formattedMessage = { ...message };
  
  // Eğer message.message yoksa veya boşsa, type'a göre oluştur
  // Ayrıca quoted message içindeki medya mesajını da kontrol et
  if (!formattedMessage.message || Object.keys(formattedMessage.message).length === 0) {
    formattedMessage.message = {};
    
    const messageType = message.type || (message.message ? Object.keys(message.message)[0] : null);
    
    // Quoted message içindeki medya mesajını kontrol et
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                         message.message?.quotedMessage ||
                         message.quotedMessage;
    
    // Mesajın içindeki medya objelerini kontrol et
    if (message.message?.audioMessage) {
      formattedMessage.message.audioMessage = message.message.audioMessage;
    } else if (message.audioMessage) {
      formattedMessage.message.audioMessage = message.audioMessage;
    } else if (quotedMessage?.message?.audioMessage) {
      // Quoted message içindeki audio mesajını kullan
      formattedMessage.message.audioMessage = quotedMessage.message.audioMessage;
    } else if (messageType === 'audioMessage' || messageType === 'audio' || messageType === 'ptt') {
      // Type'a göre boş obje oluştur (Baileys'in beklediği format)
      formattedMessage.message.audioMessage = {};
    }
    
    if (message.message?.imageMessage) {
      formattedMessage.message.imageMessage = message.message.imageMessage;
    } else if (message.imageMessage) {
      formattedMessage.message.imageMessage = message.imageMessage;
    } else if (quotedMessage?.message?.imageMessage) {
      // Quoted message içindeki image mesajını kullan
      formattedMessage.message.imageMessage = quotedMessage.message.imageMessage;
    } else if (messageType === 'imageMessage' || messageType === 'image') {
      formattedMessage.message.imageMessage = {};
    }
    
    if (message.message?.videoMessage) {
      formattedMessage.message.videoMessage = message.message.videoMessage;
    } else if (message.videoMessage) {
      formattedMessage.message.videoMessage = message.videoMessage;
    } else if (quotedMessage?.message?.videoMessage) {
      formattedMessage.message.videoMessage = quotedMessage.message.videoMessage;
    } else if (messageType === 'videoMessage' || messageType === 'video') {
      formattedMessage.message.videoMessage = {};
    }
    
    if (message.message?.documentMessage) {
      formattedMessage.message.documentMessage = message.message.documentMessage;
    } else if (message.documentMessage) {
      formattedMessage.message.documentMessage = message.documentMessage;
    } else if (quotedMessage?.message?.documentMessage) {
      formattedMessage.message.documentMessage = quotedMessage.message.documentMessage;
    } else if (messageType === 'documentMessage' || messageType === 'document') {
      formattedMessage.message.documentMessage = {};
    }
    
    if (message.message?.stickerMessage) {
      formattedMessage.message.stickerMessage = message.message.stickerMessage;
    } else if (message.stickerMessage) {
      formattedMessage.message.stickerMessage = message.stickerMessage;
    } else if (quotedMessage?.message?.stickerMessage) {
      formattedMessage.message.stickerMessage = quotedMessage.message.stickerMessage;
    } else if (messageType === 'stickerMessage' || messageType === 'sticker') {
      formattedMessage.message.stickerMessage = {};
    }
  }
  
  // Key objesi yoksa oluştur (Baileys için gerekli olabilir)
  if (!formattedMessage.key) {
    formattedMessage.key = {
      remoteJid: message.from || message.key?.remoteJid,
      fromMe: message.fromMe !== undefined ? message.fromMe : (message.key?.fromMe || false),
      id: message.id || message.key?.id || message.messageTimestamp?.toString() || Date.now().toString(),
      participant: message.participant || message.key?.participant
    };
  }
  
  // Baileys'in getContentType fonksiyonunu kullanarak mesaj tipini kontrol et
  let contentType = null;
  try {
    contentType = getContentType(formattedMessage);
  } catch (error) {
    // getContentType başarısız olursa manuel kontrol yap
    contentType = formattedMessage.type || (formattedMessage.message ? Object.keys(formattedMessage.message)[0] : null);
  }
  
  // Eğer contentType quotedMessage ise, quoted message içindeki medya mesajını kontrol et
  if (contentType === 'quotedMessage' || contentType === 'protocolMessage') {
    // Quoted message içindeki medya mesajını kontrol et
    const quotedMessage = formattedMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                         formattedMessage.message?.quotedMessage ||
                         formattedMessage.quotedMessage;
    
    if (quotedMessage?.message) {
      // Quoted message içindeki medya tipini kontrol et
      const quotedContentType = getContentType({ message: quotedMessage.message });
      if (quotedContentType === 'imageMessage' ||
          quotedContentType === 'videoMessage' ||
          quotedContentType === 'audioMessage' ||
          quotedContentType === 'documentMessage' ||
          quotedContentType === 'stickerMessage') {
        // Quoted message içindeki medya mesajını kullan
        formattedMessage.message = quotedMessage.message;
        contentType = quotedContentType;
      }
    }
  }
  
  // Medya mesajı kontrolü (Baileys'in beklediği format)
  const isMediaMessage = 
    contentType === 'imageMessage' ||
    contentType === 'videoMessage' ||
    contentType === 'audioMessage' ||
    contentType === 'documentMessage' ||
    contentType === 'stickerMessage' ||
    formattedMessage.message?.imageMessage ||
    formattedMessage.message?.videoMessage ||
    formattedMessage.message?.audioMessage ||
    formattedMessage.message?.documentMessage ||
    formattedMessage.message?.stickerMessage;

  if (!isMediaMessage) {
    throw new Error(`"${contentType || 'unknown'}" message is not a media message`);
  }

  // Debug: Formatlanmış mesajı logla
  logger.info({ 
    accountId, 
    originalType: contentType,
    hasMessage: !!formattedMessage.message,
    messageKeys: formattedMessage.message ? Object.keys(formattedMessage.message) : [],
    hasKey: !!formattedMessage.key
  }, "Mesaj formatlandı");

  const sock = ensureSocket(accountId);

  try {
    // README'ye göre: downloadMediaMessage decrypt edilmiş stream döndürür
    // Eğer medya silinmişse, reuploadRequest ile otomatik yeniden yüklenir
    const result = await downloadMediaMessage(
      formattedMessage, // Formatlanmış mesajı kullan
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
    
    // MIME type'ı mesajdan belirle (formatlanmış mesajdan)
    const finalMessageType = formattedMessage.type || (formattedMessage.message ? Object.keys(formattedMessage.message)[0] : 'unknown');
    let mimetype = 'application/octet-stream';
    
    if (finalMessageType === 'imageMessage' || finalMessageType === 'image') {
      mimetype = formattedMessage.message?.imageMessage?.mimetype || 'image/jpeg';
    } else if (finalMessageType === 'videoMessage' || finalMessageType === 'video') {
      mimetype = formattedMessage.message?.videoMessage?.mimetype || 'video/mp4';
    } else if (finalMessageType === 'audioMessage' || finalMessageType === 'audio' || finalMessageType === 'ptt') {
      mimetype = formattedMessage.message?.audioMessage?.mimetype || 'audio/ogg';
    } else if (finalMessageType === 'documentMessage' || finalMessageType === 'document') {
      mimetype = formattedMessage.message?.documentMessage?.mimetype || 'application/pdf';
    } else if (finalMessageType === 'stickerMessage' || finalMessageType === 'sticker') {
      mimetype = formattedMessage.message?.stickerMessage?.mimetype || 'image/webp';
    }
    
    // Base64 encoding - dikkatli yap
    const base64Data = buffer.toString("base64");
    
    // Debug log
    logger.info({ 
      accountId, 
      bufferSize: buffer.length, 
      base64Length: base64Data.length,
      mimetype,
      messageType: finalMessageType 
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
      await sock.updateMediaMessage(formattedMessage);
      
      // Re-upload sonrası tekrar dene
      const result = await downloadMediaMessage(
        formattedMessage, // Formatlanmış mesajı kullan
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
      
      const retryMessageType = formattedMessage.type || (formattedMessage.message ? Object.keys(formattedMessage.message)[0] : 'unknown');
      let mimetype = 'application/octet-stream';
      
      if (retryMessageType === 'imageMessage' || retryMessageType === 'image') {
        mimetype = formattedMessage.message?.imageMessage?.mimetype || 'image/jpeg';
      } else if (retryMessageType === 'videoMessage' || retryMessageType === 'video') {
        mimetype = formattedMessage.message?.videoMessage?.mimetype || 'video/mp4';
      } else if (retryMessageType === 'audioMessage' || retryMessageType === 'audio' || retryMessageType === 'ptt') {
        mimetype = formattedMessage.message?.audioMessage?.mimetype || 'audio/ogg';
      } else if (retryMessageType === 'documentMessage' || retryMessageType === 'document') {
        mimetype = formattedMessage.message?.documentMessage?.mimetype || 'application/pdf';
      } else if (retryMessageType === 'stickerMessage' || retryMessageType === 'sticker') {
        mimetype = formattedMessage.message?.stickerMessage?.mimetype || 'image/webp';
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



