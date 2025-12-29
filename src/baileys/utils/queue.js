// Message Queue and Rate Limiting Utilities
// Baileys.wiki best practice: Rate limiting protection

import { logger } from "../../shared.js";

/**
 * Simple message queue with rate limiting
 * Prevents WhatsApp rate limiting by queuing messages
 */
export class MessageQueue {
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.queue = [];
    this.processing = false;
    this.messageDelay = options.messageDelay || 1000; // 1 saniye delay (rate limiting için)
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000; // 5 saniye retry delay
  }

  /**
   * Kuyruğa mesaj ekle
   */
  async enqueue(messageFn, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        messageFn,
        priority,
        resolve,
        reject,
        retries: 0,
        addedAt: Date.now(),
      });

      // Priority'ye göre sırala (yüksek priority önce)
      this.queue.sort((a, b) => b.priority - a.priority);

      // İşleme başla
      this.processQueue();
    });
  }

  /**
   * Kuyruğu işle
   */
  async processQueue() {
    // Zaten işleniyor ise, atla
    if (this.processing) {
      return;
    }

    // Kuyruk boş ise, atla
    if (this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();

      try {
        logger.debug({ 
          sessionId: this.sessionId, 
          queueLength: this.queue.length,
          itemAge: Date.now() - item.addedAt 
        }, "Mesaj kuyruğundan işleniyor");

        // Mesajı gönder
        const result = await item.messageFn();
        item.resolve(result);

        // Rate limiting için delay
        if (this.queue.length > 0) {
          await this.delay(this.messageDelay);
        }
      } catch (error) {
        logger.error({ 
          error, 
          sessionId: this.sessionId, 
          retries: item.retries 
        }, "Mesaj gönderme hatası");

        // Retry logic
        if (item.retries < this.maxRetries) {
          item.retries++;
          logger.info({ 
            sessionId: this.sessionId, 
            retries: item.retries 
          }, "Mesaj tekrar denenecek");

          // Kuyruğa tekrar ekle (öncelik düşük)
          this.queue.push({
            ...item,
            priority: item.priority - 1,
          });

          // Retry delay
          await this.delay(this.retryDelay);
        } else {
          // Max retry aşıldı, reject et
          item.reject(error);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Kuyruk durumunu al
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      oldestItem: this.queue.length > 0 ? Date.now() - this.queue[0].addedAt : null,
    };
  }

  /**
   * Kuyruğu temizle
   */
  clear() {
    this.queue = [];
    this.processing = false;
    logger.info({ sessionId: this.sessionId }, "Mesaj kuyruğu temizlendi");
  }
}

/**
 * Rate limiter with sliding window algorithm
 * Baileys.wiki best practice: Rate limiting
 */
export class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 50; // Max 50 request
    this.windowMs = options.windowMs || 60000; // 60 saniye window
    this.requests = [];
  }

  /**
   * Rate limit kontrolü yap
   */
  async checkLimit() {
    const now = Date.now();
    
    // Eski request'leri temizle
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    // Rate limit aşıldı mı?
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      
      logger.warn({ 
        requests: this.requests.length, 
        maxRequests: this.maxRequests,
        waitTime 
      }, "Rate limit aşıldı, bekleniyor");

      // Rate limit aşıldı, bekle
      await this.delay(waitTime);
      
      // Tekrar kontrol et (recursive)
      return this.checkLimit();
    }

    // Rate limit aşılmadı, request ekle
    this.requests.push(now);
    return true;
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Rate limiter durumunu al
   */
  getStatus() {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);
    
    return {
      requests: this.requests.length,
      maxRequests: this.maxRequests,
      remaining: this.maxRequests - this.requests.length,
      resetAt: this.requests.length > 0 ? Math.min(...this.requests) + this.windowMs : null,
    };
  }

  /**
   * Rate limiter'ı sıfırla
   */
  reset() {
    this.requests = [];
  }
}

/**
 * Exponential backoff utility
 * Baileys.wiki best practice: Retry with exponential backoff
 */
export async function exponentialBackoff(fn, options = {}) {
  const maxRetries = options.maxRetries || 5;
  const initialDelay = options.initialDelay || 1000;
  const maxDelay = options.maxDelay || 30000;
  const factor = options.factor || 2;

  let retries = 0;
  let delay = initialDelay;

  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        throw error;
      }

      logger.warn({ 
        error: error.message, 
        retries, 
        maxRetries, 
        delay 
      }, "Retry ile tekrar deneniyor (exponential backoff)");

      await new Promise((resolve) => setTimeout(resolve, delay));
      
      // Exponential backoff: her retry'da delay'i artır
      delay = Math.min(delay * factor, maxDelay);
    }
  }
}

