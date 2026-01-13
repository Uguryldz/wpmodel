// ============================================
// JID (Jabber ID) Utility Functions
// ============================================

/**
 * JID'den telefon numarasını çıkarır
 * @example extractPhoneFromJid("905551234567@s.whatsapp.net") => "905551234567"
 */
export function extractPhoneFromJid(jid: string | undefined | null): string {
  if (!jid) return '';
  
  // @lid formatını kontrol et (önce temizle)
  if (jid.includes('@lid')) {
    const match = jid.match(/^(\d+):/);
    if (match) return match[1];
  }
  
  // Standart format: 905551234567@s.whatsapp.net
  const match = jid.match(/^(\d+)(?::\d+)?@/);
  return match ? match[1] : '';
}

/**
 * Telefon numarasını normalize eder (Türkiye için)
 * @example normalizePhoneNumber("05551234567") => "905551234567"
 */
export function normalizePhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  
  // Sadece rakamları al
  let cleaned = phone.replace(/\D/g, '');
  
  // Türkiye numarası için düzeltmeler
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    // 05551234567 -> 905551234567
    cleaned = '9' + cleaned;
  } else if (!cleaned.startsWith('9') && cleaned.length === 10) {
    // 5551234567 -> 905551234567
    cleaned = '90' + cleaned;
  }
  
  return cleaned;
}

/**
 * Chat ID'yi standart formata getirir
 * @example standardizeChatId("905551234567:123@lid") => "905551234567@s.whatsapp.net"
 */
export function standardizeChatId(jid: string | undefined | null): string {
  if (!jid) return '';
  
  // Grup chat'lerini olduğu gibi döndür
  if (jid.includes('@g.us')) return jid;
  
  // Broadcast'leri olduğu gibi döndür
  if (jid.includes('@broadcast')) return jid;
  
  // Telefon numarasını çıkar
  const phone = extractPhoneFromJid(jid);
  if (!phone) return jid;
  
  // Normalize et ve standart formata getir
  const normalizedPhone = normalizePhoneNumber(phone);
  return normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : jid;
}

/**
 * JID'in grup olup olmadığını kontrol eder
 */
export function isGroupJid(jid: string | undefined | null): boolean {
  return jid?.includes('@g.us') ?? false;
}

/**
 * JID'in broadcast olup olmadığını kontrol eder
 */
export function isBroadcastJid(jid: string | undefined | null): boolean {
  return jid?.includes('@broadcast') ?? false;
}

/**
 * İki JID'in aynı kişiye ait olup olmadığını kontrol eder
 */
export function isSameJid(jid1: string | undefined | null, jid2: string | undefined | null): boolean {
  if (!jid1 || !jid2) return false;
  
  // Tam eşleşme
  if (jid1 === jid2) return true;
  
  // Normalize edilmiş eşleşme
  const normalized1 = standardizeChatId(jid1);
  const normalized2 = standardizeChatId(jid2);
  if (normalized1 === normalized2) return true;
  
  // Telefon numarası eşleşmesi
  const phone1 = extractPhoneFromJid(jid1);
  const phone2 = extractPhoneFromJid(jid2);
  if (phone1 && phone2) {
    return normalizePhoneNumber(phone1) === normalizePhoneNumber(phone2);
  }
  
  return false;
}

