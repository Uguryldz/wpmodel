// WebSocket Connection Manager with reconnection logic
// Backend core'dan adapte edildi

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectAttempts: number;
  lastError: string | null;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
}

export interface ConnectionManagerOptions {
  url: string;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  onStateChange?: (state: ConnectionState) => void;
  onMessage?: (data: any) => void;
  onError?: (error: Error) => void;
}

/**
 * WebSocket Connection Manager
 * Otomatik reconnection, heartbeat, error handling
 */
export class ConnectionManager {
  private ws: WebSocket | null = null;
  private options: Required<ConnectionManagerOptions>;
  private state: ConnectionState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: Array<string> = [];
  private isIntentionallyClosed = false;

  constructor(options: ConnectionManagerOptions) {
    this.options = {
      reconnect: true,
      reconnectDelay: 2000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000, // 30 saniye
      connectionTimeout: 10000, // 10 saniye
      onStateChange: () => {},
      onMessage: () => {},
      onError: () => {},
      ...options,
    };

    this.state = {
      status: 'disconnected',
      reconnectAttempts: 0,
      lastError: null,
      connectedAt: null,
      disconnectedAt: null,
    };
  }

  /**
   * Bağlantıyı başlat
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isIntentionallyClosed = false;
      this.updateState({ status: 'connecting' });

      try {
        this.ws = new WebSocket(this.options.url);

        // Connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            this.handleError(new Error('Connection timeout'));
            reject(new Error('Connection timeout'));
          }
        }, this.options.connectionTimeout);

        this.ws.onopen = () => {
          if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
          }

          this.updateState({ 
            status: 'connected',
            reconnectAttempts: 0,
            lastError: null,
            connectedAt: new Date(),
          });

          // Heartbeat başlat
          this.startHeartbeat();

          // Queue'daki mesajları gönder
          this.flushMessageQueue();

          console.log('[ConnectionManager] ✅ Bağlantı kuruldu');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.options.onMessage(data);
          } catch (error) {
            console.error('[ConnectionManager] Message parse hatası:', error);
          }
        };

        this.ws.onerror = (event) => {
          console.error('[ConnectionManager] WebSocket error:', event);
          this.handleError(new Error('WebSocket error'));
        };

        this.ws.onclose = (event) => {
          if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
          }

          this.stopHeartbeat();

          this.updateState({ 
            status: 'disconnected',
            disconnectedAt: new Date(),
          });

          console.warn('[ConnectionManager] ⚠️ Bağlantı kapandı:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });

          // Reconnect logic
          if (!this.isIntentionallyClosed && this.options.reconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
        reject(error);
      }
    });
  }

  /**
   * Bağlantıyı kapat
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.updateState({ status: 'disconnected' });
    console.log('[ConnectionManager] Bağlantı kapatıldı');
  }

  /**
   * Mesaj gönder
   */
  send(data: any): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(message);
      } catch (error) {
        console.error('[ConnectionManager] Mesaj gönderilemedi:', error);
        // Queue'ya ekle, reconnect sonrası gönderilecek
        this.messageQueue.push(message);
      }
    } else {
      // Bağlantı yoksa queue'ya ekle
      console.warn('[ConnectionManager] Bağlantı yok, mesaj queue\'ya eklendi');
      this.messageQueue.push(message);
    }
  }

  /**
   * Bağlantı durumunu al
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * WebSocket instance'ını al
   */
  getWebSocket(): WebSocket | null {
    return this.ws;
  }

  /**
   * State güncelle ve callback çağır
   */
  private updateState(updates: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...updates };
    this.options.onStateChange(this.state);
  }

  /**
   * Hata işle
   */
  private handleError(error: Error): void {
    console.error('[ConnectionManager] ❌ Hata:', error);
    this.updateState({ 
      status: 'error',
      lastError: error.message,
    });
    this.options.onError(error);
  }

  /**
   * Yeniden bağlanma planla (exponential backoff)
   */
  private scheduleReconnect(): void {
    if (this.state.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('[ConnectionManager] ❌ Max reconnect attempts aşıldı');
      this.handleError(new Error('Max reconnect attempts reached'));
      return;
    }

    // Exponential backoff: 2^attempt * base delay (max 30 saniye)
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(2, this.state.reconnectAttempts),
      30000
    );

    this.updateState({ 
      reconnectAttempts: this.state.reconnectAttempts + 1 
    });

    console.log(`[ConnectionManager] 🔄 Yeniden bağlanma (${delay}ms sonra, deneme: ${this.state.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[ConnectionManager] Reconnect hatası:', error);
      });
    }, delay);
  }

  /**
   * Heartbeat başlat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // Ping gönder
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('[ConnectionManager] Heartbeat hatası:', error);
        }
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Heartbeat durdur
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Message queue'yu flush et
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length > 0) {
      console.log(`[ConnectionManager] ${this.messageQueue.length} mesaj queue'dan gönderiliyor`);
      
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (message) {
          this.send(message);
        }
      }
    }
  }
}

