// JID'den telefon numarasını çıkar - SADECE RAW TELEFON NUMARASI (905538781507 gibi)
export const extractPhoneFromJid = (jid: string): string => {
  if (!jid) return '';
  
  // @lid formatı: 52523188617453@lid -> 52523188617453
  if (jid.includes('@lid')) {
    const match = jid.match(/^(\d+)@lid/);
    if (match) {
      return match[1]; // Raw telefon numarasını döndür
    }
  }
  
  // JID formatı: 905538781507@s.whatsapp.net veya 905538781507:123@g.us
  const match = jid.match(/^(\d+)@/);
  if (match) {
    // RAW telefon numarasını döndür (905538781507) - formatlamadan
    return match[1];
  }
  
  // Eğer sadece numara ise (JID formatı yoksa)
  if (/^\d+$/.test(jid)) {
    return jid;
  }
  
  return '';
};

// Telefon numarasını normalize et (sadece rakamlar)
// Ayrıca 0 ile başlayan Türkiye numaralarını 90 ile başlayan formata çevirir
export const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  
  // Önce sadece rakamları al
  let normalized = phone.replace(/[\s\-\+\(\)]/g, '');
  
  // Eğer 0 ile başlıyorsa ve 11 haneli ise (Türkiye formatı: 05538781507)
  // 90 ile başlayan formata çevir (905538781507)
  if (normalized.startsWith('0') && normalized.length === 11) {
    normalized = '90' + normalized.substring(1);
  }
  
  return normalized;
};

// JID'yi normalize et - aynı telefon numarasına sahip JID'leri birleştir
export const normalizeJid = (jid: string): string => {
  if (!jid) return '';
  
  // @lid formatı: 52523188617453@lid -> 52523188617453@s.whatsapp.net'e çevir
  if (jid.includes('@lid')) {
    const match = jid.match(/^(\d+)@lid/);
    if (match) {
      return `${match[1]}@s.whatsapp.net`;
    }
  }
  
  // Eğer zaten tam JID formatındaysa (@s.whatsapp.net veya @g.us ile bitiyorsa)
  if (jid.includes('@s.whatsapp.net') || jid.includes('@g.us')) {
    return jid;
  }
  
  // Sadece numara ise, @s.whatsapp.net ekle
  if (/^\d+$/.test(jid)) {
    return `${jid}@s.whatsapp.net`;
  }
  
  // Diğer @ formatları (@lid hariç) için olduğu gibi döndür
  if (jid.includes('@')) {
    return jid;
  }
  
  return jid;
};

// İki JID'nin aynı kişiye ait olup olmadığını kontrol et
export const areJidsSamePerson = (jid1: string, jid2: string): boolean => {
  if (!jid1 || !jid2) return false;
  
  // Grup chat'leri için false döndür
  if (jid1.includes('@g.us') || jid2.includes('@g.us')) {
    return jid1 === jid2; // Grup chat'leri için tam eşleşme gerekli
  }
  
  // Telefon numaralarını çıkar (RAW telefon numarası - 905538781507 gibi)
  const phone1Raw = extractPhoneFromJid(jid1);
  const phone2Raw = extractPhoneFromJid(jid2);
  
  // Önce RAW karşılaştırma (905538781507 === 905538781507)
  if (phone1Raw && phone2Raw && phone1Raw === phone2Raw) {
    return true;
  }
  
  // Normalize edilmiş telefon numaralarını karşılaştır (05538781507 === 905538781507)
  const phone1Normalized = normalizePhoneNumber(phone1Raw);
  const phone2Normalized = normalizePhoneNumber(phone2Raw);
  
  if (phone1Normalized && phone2Normalized && phone1Normalized === phone2Normalized) {
    return true;
  }
  
  // Normalize edilmiş JID'leri karşılaştır (fallback)
  const normalized1 = normalizeJid(jid1);
  const normalized2 = normalizeJid(jid2);
  
  return normalized1 === normalized2;
};
