// Tarih yardımcı fonksiyonları

/**
 * Mesajlar için tarih ayırıcı metni oluşturur
 * @param timestamp Mesaj timestamp'i (ms veya saniye)
 * @returns "Bugün", "Dün", "15 Ocak 2025" gibi formatlanmış tarih
 */
export const formatMessageDate = (timestamp: number | undefined): string => {
  if (!timestamp) return '';
  
  // Timestamp'i normalize et (ms'ye çevir)
  const ts = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
  const date = new Date(ts);
  const now = new Date();
  
  // Bugün mü?
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (messageDate.getTime() === today.getTime()) {
    return 'Bugün';
  }
  
  // Dün mü?
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (messageDate.getTime() === yesterday.getTime()) {
    return 'Dün';
  }
  
  // Bu hafta mı?
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  if (messageDate.getTime() > weekAgo.getTime()) {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return days[date.getDay()];
  }
  
  // Tarih formatla: "15 Ocak 2025"
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];
  
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

/**
 * İki mesaj arasında tarih ayırıcı gerekli mi kontrol eder
 * @param prevTimestamp Önceki mesaj timestamp'i
 * @param currentTimestamp Mevcut mesaj timestamp'i
 * @returns true ise tarih ayırıcı gösterilmeli
 */
export const shouldShowDateSeparator = (
  prevTimestamp: number | undefined,
  currentTimestamp: number | undefined
): boolean => {
  if (!prevTimestamp || !currentTimestamp) return true;
  
  // Timestamp'leri normalize et
  const prev = prevTimestamp > 1000000000000 ? prevTimestamp : prevTimestamp * 1000;
  const curr = currentTimestamp > 1000000000000 ? currentTimestamp : currentTimestamp * 1000;
  
  const prevDate = new Date(prev);
  const currDate = new Date(curr);
  
  // Farklı günlerde mi?
  return (
    prevDate.getDate() !== currDate.getDate() ||
    prevDate.getMonth() !== currDate.getMonth() ||
    prevDate.getFullYear() !== currDate.getFullYear()
  );
};
