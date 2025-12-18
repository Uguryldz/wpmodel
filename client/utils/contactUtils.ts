// JID'den telefon numarasını çıkar
export const extractPhoneFromJid = (jid: string): string => {
  // JID formatı: 905538682233@s.whatsapp.net veya 905538682233:123@g.us
  const match = jid.match(/^(\d+)@/);
  if (match) {
    let phone = match[1];
    // 90 ile başlıyorsa (Türkiye), 0 ekle
    if (phone.startsWith('90') && phone.length > 10) {
      phone = '0' + phone.substring(2);
    }
    return phone;
  }
  return jid;
};

// Telefon numarasını normalize et (sadece rakamlar)
export const normalizePhoneNumber = (phone: string): string => {
  return phone.replace(/[\s\-\+\(\)]/g, '');
};
