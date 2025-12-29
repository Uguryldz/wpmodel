// Error Handling Utilities
// Backend core error handling'den adapte edildi

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorType {
  NETWORK = 'network',
  API = 'api',
  WEBSOCKET = 'websocket',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown',
}

export interface AppError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  originalError?: Error;
  timestamp: Date;
  context?: any;
  retryable?: boolean;
}

/**
 * Error Handler
 * Hataları kategorize eder, loglar ve kullanıcıya uygun mesajlar gösterir
 */
export class ErrorHandler {
  private errorLog: AppError[] = [];
  private maxLogSize = 100;
  private onErrorCallback?: (error: AppError) => void;

  constructor(onError?: (error: AppError) => void) {
    this.onErrorCallback = onError;
  }

  /**
   * Hatayı handle et
   */
  handle(
    error: Error | string,
    type: ErrorType = ErrorType.UNKNOWN,
    context?: any
  ): AppError {
    const appError: AppError = {
      type,
      severity: this.determineSeverity(type, error),
      message: this.getUserFriendlyMessage(error, type),
      originalError: error instanceof Error ? error : undefined,
      timestamp: new Date(),
      context,
      retryable: this.isRetryable(type, error),
    };

    // Log ekle
    this.addToLog(appError);

    // Console'a yaz
    this.logToConsole(appError);

    // Callback çağır
    if (this.onErrorCallback) {
      this.onErrorCallback(appError);
    }

    return appError;
  }

  /**
   * Severity belirle
   */
  private determineSeverity(type: ErrorType, error: Error | string): ErrorSeverity {
    // Critical errors
    if (type === ErrorType.AUTHENTICATION) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity
    if (type === ErrorType.WEBSOCKET) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity
    if (type === ErrorType.API || type === ErrorType.NETWORK) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity
    return ErrorSeverity.LOW;
  }

  /**
   * Kullanıcı dostu mesaj oluştur
   */
  private getUserFriendlyMessage(error: Error | string, type: ErrorType): string {
    const errorMessage = error instanceof Error ? error.message : error;

    // Türkçe kullanıcı dostu mesajlar
    switch (type) {
      case ErrorType.NETWORK:
        return 'İnternet bağlantınızı kontrol edin';
      
      case ErrorType.WEBSOCKET:
        if (errorMessage.includes('timeout')) {
          return 'Bağlantı zaman aşımına uğradı';
        }
        return 'Sunucu bağlantısı kesildi';
      
      case ErrorType.API:
        if (errorMessage.includes('404')) {
          return 'İstenen kaynak bulunamadı';
        }
        if (errorMessage.includes('500')) {
          return 'Sunucu hatası oluştu';
        }
        return 'İstek başarısız oldu';
      
      case ErrorType.AUTHENTICATION:
        return 'Oturum süreniz doldu. Lütfen tekrar giriş yapın';
      
      case ErrorType.RATE_LIMIT:
        return 'Çok fazla istek gönderdiniz. Lütfen bekleyin';
      
      case ErrorType.VALIDATION:
        return errorMessage;
      
      default:
        return 'Bir hata oluştu. Lütfen tekrar deneyin';
    }
  }

  /**
   * Hatanın retry edilebilir olup olmadığını kontrol et
   */
  private isRetryable(type: ErrorType, error: Error | string): boolean {
    const errorMessage = error instanceof Error ? error.message : error;

    // Network ve timeout hataları retry edilebilir
    if (type === ErrorType.NETWORK) {
      return true;
    }

    if (type === ErrorType.WEBSOCKET) {
      return !errorMessage.includes('authentication');
    }

    if (type === ErrorType.API) {
      // 5xx hataları retry edilebilir, 4xx hataları edilemez
      if (errorMessage.includes('500') || errorMessage.includes('503')) {
        return true;
      }
      if (errorMessage.includes('404') || errorMessage.includes('401') || errorMessage.includes('403')) {
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Log'a ekle
   */
  private addToLog(error: AppError): void {
    this.errorLog.unshift(error);
    
    // Max log size'ı aşmasın
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize);
    }
  }

  /**
   * Console'a log
   */
  private logToConsole(error: AppError): void {
    const prefix = `[ErrorHandler] [${error.severity.toUpperCase()}] [${error.type}]`;
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error(prefix, error.message, error.originalError, error.context);
        break;
      case ErrorSeverity.HIGH:
        console.error(prefix, error.message, error.context);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(prefix, error.message, error.context);
        break;
      default:
        console.log(prefix, error.message);
        break;
    }
  }

  /**
   * Error log'u al
   */
  getErrorLog(): AppError[] {
    return [...this.errorLog];
  }

  /**
   * Error log'u temizle
   */
  clearLog(): void {
    this.errorLog = [];
  }

  /**
   * Son N hatayı al
   */
  getRecentErrors(count: number = 10): AppError[] {
    return this.errorLog.slice(0, count);
  }

  /**
   * Belirli bir type'daki hataları al
   */
  getErrorsByType(type: ErrorType): AppError[] {
    return this.errorLog.filter((error) => error.type === type);
  }
}

/**
 * Retry with timeout
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    timeout?: number;
    retryDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const timeout = options.timeout || 30000;
  const retryDelay = options.retryDelay || 1000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Timeout ile sarmalayalım
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout)
        ),
      ]);

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        if (options.onRetry) {
          options.onRetry(attempt + 1, lastError);
        }

        console.warn(`[RetryWithTimeout] Retry ${attempt + 1}/${maxRetries}`, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Circuit Breaker Pattern
 * Çok fazla hata oluştuğunda servisi geçici olarak devre dışı bırakır
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000, // 60 saniye
    private resetTimeout: number = 30000 // 30 saniye
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Circuit açıksa ve timeout dolmadıysa hemen fail et
    if (this.state === 'open') {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker is open');
      }
      // Timeout dolduysa half-open'a geç
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      console.warn(`[CircuitBreaker] Circuit açıldı (${this.failureCount} hata)`);

      // Reset timeout sonrası half-open'a geç
      setTimeout(() => {
        this.state = 'half-open';
        this.failureCount = 0;
        console.log('[CircuitBreaker] Circuit half-open');
      }, this.resetTimeout);
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'closed';
  }
}

