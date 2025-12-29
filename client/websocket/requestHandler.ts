// WebSocket Request/Response handler
// Frontend'den backend'e request gönderip response almak için

export interface WebSocketRequest {
  requestId: string;
  requestType: string;
  payload: any;
}

export interface WebSocketResponse {
  requestId: string;
  success: boolean;
  data?: any;
  error?: string;
}

export class WebSocketRequestHandler {
  private ws: WebSocket;
  private pendingRequests: Map<string, {
    resolve: (data: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private requestTimeout: number = 30000; // 30 saniye

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.setupMessageHandler();
  }

  private setupMessageHandler() {
    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Response mesajı mı kontrol et
        if (data.type === 'response' && data.requestId) {
          const pendingRequest = this.pendingRequests.get(data.requestId);
          if (pendingRequest) {
            clearTimeout(pendingRequest.timeout);
            this.pendingRequests.delete(data.requestId);
            
            if (data.success) {
              pendingRequest.resolve(data.data);
            } else {
              pendingRequest.reject(new Error(data.error || 'Request failed'));
            }
          }
        }
      } catch (error) {
        // Response değilse, normal event handler'a bırak
      }
    });
  }

  async sendRequest(requestType: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${requestType}`));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
      });

      try {
        this.ws.send(JSON.stringify({
          type: 'request',
          requestId,
          requestType,
          payload,
        }));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  cleanup() {
    // Tüm pending request'leri iptal et
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('WebSocket request handler cleanup'));
    });
    this.pendingRequests.clear();
  }
}

