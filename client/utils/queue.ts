// Frontend Message Queue and Rate Limiting Utilities
// Backend core'dan adapte edildi

/**
 * Message Queue for frontend
 * Prevents rate limiting by queuing messages and sending with delays
 */
export class MessageQueue {
  private queue: Array<{
    messageFn: () => Promise<any>;
    priority: number;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    retries: number;
    addedAt: number;
  }> = [];
  
  private processing = false;
  private messageDelay: number;
  private maxRetries: number;
  private retryDelay: number;

  constructor(options: {
    messageDelay?: number;
    maxRetries?: number;
    retryDelay?: number;
  } = {}) {
    this.messageDelay = options.messageDelay || 1000; // 1 saniye delay
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000; // 5 saniye retry delay
  }

  /**
   * Kuyruğa mesaj ekle
   */
  async enqueue<T>(messageFn: () => Promise<T>, priority: number = 0): Promise<T> {
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
  private async processQueue() {
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
      const item = this.queue.shift()!;

      try {
        console.log(`[MessageQueue] İşleniyor (kuyruk: ${this.queue.length}, yaş: ${Date.now() - item.addedAt}ms)`);

        // Mesajı gönder
        const result = await item.messageFn();
        item.resolve(result);

        // Rate limiting için delay
        if (this.queue.length > 0) {
          await this.delay(this.messageDelay);
        }
      } catch (error) {
        console.error('[MessageQueue] Hata:', error, `retry: ${item.retries}`);

        // Retry logic
        if (item.retries < this.maxRetries) {
          item.retries++;
          console.log(`[MessageQueue] Tekrar denenecek (${item.retries}/${this.maxRetries})`);

          // Kuyruğa tekrar ekle (öncelik düşük)
          this.queue.push({
            ...item,
            priority: item.priority - 1,
          });

          // Retry delay
          await this.delay(this.retryDelay);
        } else {
          // Max retry aşıldı, reject et
          item.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    this.processing = false;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
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
    console.log('[MessageQueue] Kuyruk temizlendi');
  }
}

/**
 * Rate Limiter with sliding window algorithm
 */
export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private requests: number[] = [];

  constructor(options: {
    maxRequests?: number;
    windowMs?: number;
  } = {}) {
    this.maxRequests = options.maxRequests || 50; // Max 50 request
    this.windowMs = options.windowMs || 60000; // 60 saniye window
  }

  /**
   * Rate limit kontrolü yap
   */
  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    
    // Eski request'leri temizle
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    // Rate limit aşıldı mı?
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      
      console.warn(`[RateLimiter] Limit aşıldı (${this.requests.length}/${this.maxRequests}), ${waitTime}ms bekleniyor`);

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
  private delay(ms: number): Promise<void> {
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
 */
export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
  } = {}
): Promise<T> {
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

      console.warn(`[ExponentialBackoff] Retry ${retries}/${maxRetries}, ${delay}ms bekleniyor`, error);

      await new Promise((resolve) => setTimeout(resolve, delay));
      
      // Exponential backoff: her retry'da delay'i artır
      delay = Math.min(delay * factor, maxDelay);
    }
  }

  throw new Error('Max retries reached');
}

