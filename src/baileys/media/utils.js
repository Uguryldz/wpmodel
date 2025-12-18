// Media utility functions
import { 
  getAudioDuration as getAudioDurationFromBaileys,
  generateThumbnail,
  extractImageThumb,
  getAudioWaveform,
} from "baileys";
import { logger } from "../../shared.js";

/**
 * Ses dosyası süresi
 */
export const getAudioDuration = async (audioBuffer) => {
  if (!audioBuffer) {
    throw new Error("audioBuffer gereklidir");
  }

  try {
    const buffer = Buffer.isBuffer(audioBuffer) 
      ? audioBuffer 
      : Buffer.from(audioBuffer, "base64");
    
    const duration = await getAudioDurationFromBaileys(buffer);
    return { status: "success", data: duration };
  } catch (error) {
    logger.error({ error }, "Ses süresi hesaplanamadı");
    throw new Error(`Ses süresi hesaplanamadı: ${error.message}`);
  }
};

/**
 * Medya için thumbnail oluşturma
 */
export const generateThumbnailForMedia = async (mediaBuffer, mediaType) => {
  if (!mediaBuffer || !mediaType) {
    throw new Error("mediaBuffer ve mediaType gereklidir");
  }

  try {
    const buffer = Buffer.isBuffer(mediaBuffer) 
      ? mediaBuffer 
      : Buffer.from(mediaBuffer, "base64");
    
    const result = await generateThumbnail(buffer, mediaType);
    return { 
      status: "success", 
      thumbnail: result.thumbnail.toString("base64"),
      originalImageDimensions: result.originalImageDimensions
    };
  } catch (error) {
    logger.error({ error }, "Thumbnail oluşturulamadı");
    throw new Error(`Thumbnail oluşturulamadı: ${error.message}`);
  }
};

/**
 * Image thumbnail çıkarma
 */
export const extractImageThumbnail = async (imageBuffer, width = 32) => {
  if (!imageBuffer) {
    throw new Error("imageBuffer gereklidir");
  }

  try {
    const buffer = Buffer.isBuffer(imageBuffer) 
      ? imageBuffer 
      : Buffer.from(imageBuffer, "base64");
    
    const result = await extractImageThumb(buffer, width);
    return { 
      status: "success", 
      thumbnail: result.thumbnail.toString("base64"),
      originalImageDimensions: result.originalImageDimensions
    };
  } catch (error) {
    logger.error({ error }, "Image thumbnail çıkarılamadı");
    throw new Error(`Image thumbnail çıkarılamadı: ${error.message}`);
  }
};

/**
 * Ses dalga formu
 */
export const getAudioWaveformUtil = async (audioBuffer) => {
  if (!audioBuffer) {
    throw new Error("audioBuffer gereklidir");
  }

  try {
    const buffer = Buffer.isBuffer(audioBuffer) 
      ? audioBuffer 
      : Buffer.from(audioBuffer, "base64");
    
    const waveform = await getAudioWaveform(buffer);
    return { status: "success", data: waveform };
  } catch (error) {
    logger.error({ error }, "Ses dalga formu alınamadı");
    throw new Error(`Ses dalga formu alınamadı: ${error.message}`);
  }
};



