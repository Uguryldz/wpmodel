// ============================================
// Date Utility Functions
// ============================================

/**
 * Timestamp'i saat formatına çevirir (HH:mm)
 */
export function formatTime(timestamp: number | undefined | null): string {
  if (!timestamp) return '';
  
  // Saniye cinsindeyse milisaniyeye çevir
  const ms = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
  
  return new Date(ms).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Timestamp'i tarih formatına çevirir (DD.MM.YYYY)
 */
export function formatDate(timestamp: number | undefined | null): string {
  if (!timestamp) return '';
  
  const ms = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
  
  return new Date(ms).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Timestamp'i tam tarih-saat formatına çevirir
 */
export function formatDateTime(timestamp: number | undefined | null): string {
  if (!timestamp) return '';
  
  const ms = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
  
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * İki timestamp'in aynı gün olup olmadığını kontrol eder
 */
export function isSameDay(ts1: number | undefined | null, ts2: number | undefined | null): boolean {
  if (!ts1 || !ts2) return false;
  
  const ms1 = ts1 > 1000000000000 ? ts1 : ts1 * 1000;
  const ms2 = ts2 > 1000000000000 ? ts2 : ts2 * 1000;
  
  const d1 = new Date(ms1);
  const d2 = new Date(ms2);
  
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

/**
 * Timestamp'in bugün olup olmadığını kontrol eder
 */
export function isToday(timestamp: number | undefined | null): boolean {
  if (!timestamp) return false;
  return isSameDay(timestamp, Date.now());
}

/**
 * Timestamp'in dün olup olmadığını kontrol eder
 */
export function isYesterday(timestamp: number | undefined | null): boolean {
  if (!timestamp) return false;
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return isSameDay(timestamp, yesterday.getTime());
}

/**
 * Chat listesi için akıllı tarih formatı
 */
export function formatChatTime(timestamp: number | undefined | null): string {
  if (!timestamp) return '';
  
  if (isToday(timestamp)) {
    return formatTime(timestamp);
  }
  
  if (isYesterday(timestamp)) {
    return 'Dün';
  }
  
  return formatDate(timestamp);
}

