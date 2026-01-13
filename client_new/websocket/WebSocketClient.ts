// ============================================
// WebSocket Client
// ============================================

import { WEBSOCKET } from '../constants';
import type { ConnectionState, ConnectionStatus, WebSocketMessage } from '../types';
import { generateId } from '../utils';

type MessageHandler = (data: WebSocketMessage) => void;
type StateChangeHandler = (state: ConnectionState) => void;

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: Set<MessageHandler> = new Set();
  private stateChangeHandlers: Set<StateChangeHandler> = new Set();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;
  
  private state: ConnectionState = {
    status: 'disconnected',
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null,
    disconnectedAt: null,
  };
  
  constructor() {
    // Backend URL'ini al (proxy üzerinden)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.url = `${protocol}//${host}/ws`;
  }
  
  // ============================================
  // Public Methods
  // ============================================
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      
      this.shouldReconnect = true;
      this.updateState({ status: 'connecting' });
      
      try {
        this.ws = new WebSocket(this.url);
        
        const connectionTimeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, WEBSOCKET.CONNECTION_TIMEOUT);
        
        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.reconnectAttempts = 0;
          this.updateState({
            status: 'connected',
            reconnectAttempts: 0,
            lastError: null,
            connectedAt: new Date(),
          });
          this.startHeartbeat();
          console.log('[WebSocket] ✅ Bağlantı kuruldu');
          resolve();
        };
        
        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.stopHeartbeat();
          this.updateState({
            status: 'disconnected',
            disconnectedAt: new Date(),
          });
          console.log(`[WebSocket] 🔌 Bağlantı kapandı: ${event.code}`);
          
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        };
        
        this.ws.onerror = (error) => {
          // Bağlantı kurulmadan önce hata olabilir (React StrictMode double mount)
          if (this.ws?.readyState === WebSocket.CONNECTING || this.ws?.readyState === WebSocket.CLOSING) {
            console.log('[WebSocket] ⚠️ Bağlantı kurulurken/kapanırken hata (normal):', error);
          } else {
            console.error('[WebSocket] ❌ Hata:', error);
            this.updateState({ lastError: 'WebSocket error' });
          }
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.clearReconnectTimeout();
    
    if (this.ws) {
      // Sadece açık veya bağlanıyor durumundaysa kapat
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close();
        } catch (error) {
          // Bağlantı zaten kapalıysa sessizce devam et
          console.log('[WebSocket] Disconnect: Bağlantı zaten kapalı');
        }
      }
      this.ws = null;
    }
    
    // Pending request'leri temizle
    this.pendingRequests.forEach((request) => {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closed'));
    });
    this.pendingRequests.clear();
    
    this.updateState({
      status: 'disconnected',
      disconnectedAt: new Date(),
    });
  }
  
  /**
   * WebSocket üzerinden request gönder ve response bekle
   */
  sendRequest<T = any>(type: string, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }
      
      const requestId = generateId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, WEBSOCKET.REQUEST_TIMEOUT);
      
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      
      // Backend'in beklediği format: { type: 'request', requestType: '...', requestId: '...', payload: {...} }
      const message = {
        type: 'request',
        requestType: type,
        requestId,
        payload: payload || {},
      };
      
      this.ws.send(JSON.stringify(message));
    });
  }
  
  /**
   * Mesaj handler ekle
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
  
  /**
   * State change handler ekle
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    // İlk state'i hemen gönder
    handler(this.state);
    return () => this.stateChangeHandlers.delete(handler);
  }
  
  /**
   * Mevcut state'i al
   */
  getState(): ConnectionState {
    return { ...this.state };
  }
  
  /**
   * Bağlantı durumunu kontrol et
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  // ============================================
  // Private Methods
  // ============================================
  
  private handleMessage(rawData: string): void {
    try {
      const data: WebSocketMessage = JSON.parse(rawData);
      
      // Response mesajlarını handle et
      if (data.type === 'response' && data.requestId) {
        const pending = this.pendingRequests.get(data.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(data.requestId);
          
          if (data.success) {
            pending.resolve(data.data);
          } else {
            pending.reject(new Error(data.error || 'Request failed'));
          }
          return;
        }
      }
      
      // Ping/pong
      if (data.type === 'ping') {
        this.ws?.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      
      // Diğer mesajları handler'lara ilet
      this.messageHandlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error('[WebSocket] Message handler error:', error);
        }
      });
    } catch (error) {
      console.error('[WebSocket] Parse error:', error);
    }
  }
  
  private updateState(partial: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...partial };
    this.stateChangeHandlers.forEach((handler) => handler(this.state));
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= WEBSOCKET.MAX_RECONNECT_ATTEMPTS) {
      console.log('[WebSocket] ⚠️ Max reconnect attempts reached');
      this.updateState({ status: 'error', lastError: 'Max reconnect attempts reached' });
      return;
    }
    
    this.reconnectAttempts++;
    this.updateState({
      status: 'reconnecting',
      reconnectAttempts: this.reconnectAttempts,
    });
    
    const delay = WEBSOCKET.RECONNECT_DELAY * Math.pow(1.5, this.reconnectAttempts - 1);
    console.log(`[WebSocket] 🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WebSocket] Reconnect failed:', error);
      });
    }, delay);
  }
  
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
  
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, WEBSOCKET.HEARTBEAT_INTERVAL);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
  }
  return wsClient;
}

