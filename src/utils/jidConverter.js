/**
 * Merkezi JID Format Dönüştürme Modülü (Server)
 * 
 * Bu modül, WhatsApp JID formatlarını (Türkiye ve uluslararası) 
 * birbirine dönüştürmek ve normalize etmek için kullanılır.
 * 
 * Formatlar:
 * - Türkiye formatı: 905335989539@s.whatsapp.net (12 haneli)
 * - Uluslararası format: 161782895247385@s.whatsapp.net (15 haneli)
 */

/**
 * Telefon numarasının formatını tespit et
 * @param {string} phone - Telefon numarası
 * @returns {'turkish' | 'international' | 'unknown'}
 */
const detectPhoneFormat = (phone) => {
  if (!phone || typeof phone !== 'string') return 'unknown';
  
  // Sadece rakamları al
  const digits = phone.replace(/\D/g, '');
  
  // Türkiye formatı: 90 ile başlar ve 12 haneli
  if (digits.startsWith('90') && digits.length === 12) {
    return 'turkish';
  }
  
  // Uluslararası format: 1 ile başlar ve genellikle 15 haneli
  if (digits.startsWith('1') && digits.length >= 10) {
    return 'international';
  }
  
  // Diğer ülkeler için uluslararası format kabul et
  if (digits.length >= 10) {
    return 'international';
  }
  
  return 'unknown';
};

/**
 * Türkiye formatından uluslararası formata dönüştür
 * @param {string} phone - Telefon numarası
 * @returns {string} Dönüştürülmüş telefon numarası
 */
const convertTurkishToInternational = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  
  const digits = phone.replace(/\D/g, '');
  
  // Eğer zaten uluslararası formatta ise, olduğu gibi döndür
  if (digits.startsWith('1') && digits.length >= 15) {
    return digits;
  }
  
  // Türkiye formatı: 90 ile başlar
  if (digits.startsWith('90') && digits.length === 12) {
    // 90'ı kaldır, 1 ekle (WhatsApp'ın formatı)
    const withoutCountryCode = digits.substring(2);
    return `1${withoutCountryCode}`;
  }
  
  return digits;
};

/**
 * Uluslararası formattan Türkiye formatına dönüştür
 * @param {string} phone - Telefon numarası
 * @returns {string} Dönüştürülmüş telefon numarası
 */
const convertInternationalToTurkish = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  
  const digits = phone.replace(/\D/g, '');
  
  // Eğer zaten Türkiye formatında ise, olduğu gibi döndür
  if (digits.startsWith('90') && digits.length === 12) {
    return digits;
  }
  
  // Uluslararası format: 1 ile başlar
  if (digits.startsWith('1') && digits.length >= 10) {
    // 1'i kaldır, 90 ekle
    const withoutCountryCode = digits.substring(1);
    return `90${withoutCountryCode}`;
  }
  
  return digits;
};

/**
 * JID'den telefon numarasını çıkar (raw format)
 * @param {string} jid - JID
 * @returns {string} Telefon numarası
 */
const extractPhoneFromJid = (jid) => {
  if (!jid || typeof jid !== 'string') return '';
  
  // @lid formatı: 52523188617453@lid -> 52523188617453
  if (jid.includes('@lid')) {
    const match = jid.match(/^(\d+)@lid/);
    if (match) {
      return match[1];
    }
  }
  
  // JID formatı: 905538781507@s.whatsapp.net veya 905538781507:123@g.us
  const match = jid.match(/^(\d+)@/);
  if (match) {
    return match[1];
  }
  
  // Eğer sadece numara ise
  if (/^\d+$/.test(jid)) {
    return jid;
  }
  
  return '';
};

/**
 * Telefon numarasını normalize et
 * @param {string} phone - Telefon numarası
 * @returns {string} Normalize edilmiş telefon numarası
 */
const normalizePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  
  // Önce sadece rakamları al
  let normalized = phone.replace(/[\s\-\+\(\)]/g, '');
  
  // Eğer 0 ile başlıyorsa ve 11 haneli ise (Türkiye formatı: 05538781507)
  // 90 ile başlayan formata çevir (905538781507)
  if (normalized.startsWith('0') && normalized.length === 11) {
    normalized = '90' + normalized.substring(1);
  }
  
  return normalized;
};

/**
 * JID'yi normalize et ve standart formata getir
 * @param {string} jid - JID
 * @returns {string} Normalize edilmiş JID
 */
const normalizeJid = (jid) => {
  if (!jid || typeof jid !== 'string') {
    throw new Error("Alıcı (jid) değeri zorunludur.");
  }
  
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
    const suffix = jid.includes('-') ? '@g.us' : '@s.whatsapp.net';
    return `${jid}${suffix}`;
  }
  
  // Diğer @ formatları için olduğu gibi döndür
  if (jid.includes('@')) {
    return jid;
  }
  
  // Eğer hiç @ yoksa, @s.whatsapp.net ekle
  const suffix = jid.includes('-') ? '@g.us' : '@s.whatsapp.net';
  return `${jid}${suffix}`;
};

/**
 * JID'yi standart formata getir (chat ve mesaj listesi için)
 * @param {string} jid - Dönüştürülecek JID
 * @param {'turkish' | 'international' | 'auto'} targetFormat - Hedef format
 * @returns {string} Normalize edilmiş JID
 */
const standardizeJid = (jid, targetFormat = 'auto') => {
  if (!jid || typeof jid !== 'string') return jid;
  
  // Önce JID'i normalize et
  const normalized = normalizeJid(jid);
  
  // Grup chat'leri için format değişikliği yapma
  if (normalized.includes('@g.us')) {
    return normalized;
  }
  
  // Telefon numarasını çıkar
  const phone = extractPhoneFromJid(normalized);
  if (!phone) return normalized;
  
  // Format tespiti
  const format = detectPhoneFormat(phone);
  
  // Eğer auto ise, mevcut formatı koru
  if (targetFormat === 'auto') {
    return normalized;
  }
  
  // Format dönüşümü
  let convertedPhone = phone;
  if (targetFormat === 'turkish' && format === 'international') {
    convertedPhone = convertInternationalToTurkish(phone);
  } else if (targetFormat === 'international' && format === 'turkish') {
    convertedPhone = convertTurkishToInternational(phone);
  }
  
  // JID'i yeniden oluştur
  const suffix = normalized.includes('@g.us') ? '@g.us' : '@s.whatsapp.net';
  return `${convertedPhone}${suffix}`;
};

/**
 * İki JID'nin aynı kişiye ait olup olmadığını kontrol et
 * @param {string} jid1 - İlk JID
 * @param {string} jid2 - İkinci JID
 * @returns {boolean} Aynı kişiye ait mi?
 */
const areJidsSamePerson = (jid1, jid2) => {
  if (!jid1 || !jid2) return false;
  
  // Grup chat'leri için tam eşleşme gerekli
  if (jid1.includes('@g.us') || jid2.includes('@g.us')) {
    return jid1 === jid2;
  }
  
  // Telefon numaralarını çıkar
  const phone1Raw = extractPhoneFromJid(jid1);
  const phone2Raw = extractPhoneFromJid(jid2);
  
  // Önce RAW karşılaştırma
  if (phone1Raw && phone2Raw && phone1Raw === phone2Raw) {
    return true;
  }
  
  // Normalize edilmiş telefon numaralarını karşılaştır
  const phone1Normalized = normalizePhoneNumber(phone1Raw);
  const phone2Normalized = normalizePhoneNumber(phone2Raw);
  
  if (phone1Normalized && phone2Normalized && phone1Normalized === phone2Normalized) {
    return true;
  }
  
  // Format dönüşümü ile karşılaştır
  const phone1Turkish = convertInternationalToTurkish(phone1Raw);
  const phone2Turkish = convertInternationalToTurkish(phone2Raw);
  
  if (phone1Turkish && phone2Turkish && phone1Turkish === phone2Turkish) {
    return true;
  }
  
  const phone1International = convertTurkishToInternational(phone1Raw);
  const phone2International = convertTurkishToInternational(phone2Raw);
  
  if (phone1International && phone2International && phone1International === phone2International) {
    return true;
  }
  
  // Normalize edilmiş JID'leri karşılaştır (fallback)
  const normalized1 = normalizeJid(jid1);
  const normalized2 = normalizeJid(jid2);
  
  return normalized1 === normalized2;
};

/**
 * Chat ID'yi standart formata getir (chat listesi için)
 * @param {string} chatId - Chat ID
 * @returns {string} Standart formata getirilmiş Chat ID
 */
const standardizeChatId = (chatId) => {
  return standardizeJid(chatId, 'auto');
};

/**
 * Message ID'yi standart formata getir (mesaj listesi için)
 * @param {string} jid - JID
 * @returns {string} Standart formata getirilmiş JID
 */
const standardizeMessageJid = (jid) => {
  return standardizeJid(jid, 'auto');
};

/**
 * JID tipini tespit et
 * @param {string} jid - JID
 * @returns {'user' | 'group' | 'newsletter' | 'broadcast' | 'lid' | 'unknown'}
 */
const detectJidType = (jid) => {
  if (!jid || typeof jid !== 'string') return 'unknown';
  
  if (jid.includes('@g.us')) return 'group';
  if (jid.includes('@newsletter')) return 'newsletter';
  if (jid.includes('@broadcast') || jid.includes('@status')) return 'broadcast';
  if (jid.includes('@lid')) return 'lid';
  if (jid.includes('@s.whatsapp.net')) return 'user';
  
  return 'unknown';
};

/**
 * JID'in geçerli olup olmadığını kontrol et
 * @param {string} jid - JID
 * @returns {boolean} Geçerli mi?
 */
const isValidJid = (jid) => {
  if (!jid || typeof jid !== 'string') return false;
  
  // Temel format kontrolü
  const validPatterns = [
    /^\d+@s\.whatsapp\.net$/,           // Kullanıcı: 905335989539@s.whatsapp.net
    /^[\d\-]+@g\.us$/,                  // Grup: 120363123456789012@g.us
    /^\d+@newsletter$/,                 // Newsletter
    /^\d+@broadcast$/,                  // Broadcast
    /^\d+@status$/,                     // Status
    /^\d+@lid$/,                        // LID
  ];
  
  return validPatterns.some(pattern => pattern.test(jid));
};

/**
 * Participant JID'ini normalize et (grup mesajlarında kullanılır)
 * @param {string} participantJid - Participant JID
 * @param {string} [groupJid] - Grup JID (opsiyonel)
 * @returns {string} Normalize edilmiş participant JID
 */
const normalizeParticipantJid = (participantJid, groupJid) => {
  if (!participantJid || typeof participantJid !== 'string') return participantJid;
  
  // Önce normal JID normalizasyonu yap
  let normalized = normalizeJid(participantJid);
  
  // Eğer grup JID'i verilmişse ve participant grup içindeyse kontrol et
  if (groupJid && groupJid.includes('@g.us')) {
    // Participant'ın grup içinde olduğundan emin ol
    // (Grup JID'leri için özel bir işlem gerekmez, sadece normalize et)
  }
  
  return normalized;
};

/**
 * Grup mesajı için remoteJid ve participant'ı normalize et
 * @param {string} remoteJid - Remote JID
 * @param {string} [participant] - Participant JID (opsiyonel)
 * @returns {{remoteJid: string, participant?: string}}
 */
const normalizeGroupMessageJids = (remoteJid, participant) => {
  const normalizedRemoteJid = standardizeJid(remoteJid, 'auto');
  
  if (participant) {
    const normalizedParticipant = normalizeParticipantJid(participant, normalizedRemoteJid);
    return {
      remoteJid: normalizedRemoteJid,
      participant: normalizedParticipant,
    };
  }
  
  return {
    remoteJid: normalizedRemoteJid,
  };
};

/**
 * Birden fazla JID'i aynı anda normalize et (batch işlem)
 * @param {string[]} jids - JID listesi
 * @returns {string[]} Normalize edilmiş JID listesi
 */
const normalizeJidsBatch = (jids) => {
  if (!Array.isArray(jids)) return [];
  
  return jids.map(jid => normalizeJid(jid)).filter(jid => jid !== '');
};

/**
 * Birden fazla JID'i standart formata getir (batch işlem)
 * @param {string[]} jids - JID listesi
 * @param {'turkish' | 'international' | 'auto'} [targetFormat='auto'] - Hedef format
 * @returns {string[]} Standart formata getirilmiş JID listesi
 */
const standardizeJidsBatch = (jids, targetFormat = 'auto') => {
  if (!Array.isArray(jids)) return [];
  
  return jids.map(jid => standardizeJid(jid, targetFormat)).filter(jid => jid !== '');
};

/**
 * JID'den display formatına çevir (gösterim için)
 * @param {string} jid - JID
 * @param {'phone' | 'full'} [format='phone'] - Format tipi
 * @returns {string} Formatlanmış JID
 */
const formatJidForDisplay = (jid, format = 'phone') => {
  if (!jid || typeof jid !== 'string') return jid;
  
  if (format === 'full') {
    return jid;
  }
  
  // Telefon numarasını çıkar
  const phone = extractPhoneFromJid(jid);
  if (!phone) return jid;
  
  // Türkiye formatı için: 905335989539 -> 905 335 98 95 39
  if (phone.startsWith('90') && phone.length === 12) {
    return `${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6, 8)} ${phone.substring(8, 10)} ${phone.substring(10)}`;
  }
  
  // Diğer formatlar için sadece numarayı döndür
  return phone;
};

/**
 * Grup JID'inden participant listesi için JID'leri normalize et
 * @param {string[]} participants - Participant listesi
 * @param {string} groupJid - Grup JID
 * @returns {string[]} Normalize edilmiş participant listesi
 */
const normalizeGroupParticipants = (participants, groupJid) => {
  if (!Array.isArray(participants)) return [];
  if (!groupJid || !groupJid.includes('@g.us')) return participants.map(p => normalizeJid(p));
  
  return participants.map(participant => normalizeParticipantJid(participant, groupJid));
};

/**
 * JID'leri karşılaştır ve eşleştir (daha gelişmiş)
 * @param {string} jid1 - İlk JID
 * @param {string} jid2 - İkinci JID
 * @returns {boolean} Eşleşiyor mu?
 */
const matchJids = (jid1, jid2) => {
  return areJidsSamePerson(jid1, jid2);
};

/**
 * JID listesinden benzersiz JID'leri çıkar (duplicate'leri kaldır)
 * @param {string[]} jids - JID listesi
 * @returns {string[]} Benzersiz JID listesi
 */
const getUniqueJids = (jids) => {
  if (!Array.isArray(jids)) return [];
  
  const seen = new Set();
  const unique = [];
  
  for (const jid of jids) {
    const normalized = normalizeJid(jid);
    
    // Normalize edilmiş JID'i kontrol et
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    } else {
      // Aynı kişi kontrolü yap (farklı formatlar)
      const isDuplicate = unique.some(existingJid => areJidsSamePerson(existingJid, normalized));
      if (!isDuplicate) {
        seen.add(normalized);
        unique.push(normalized);
      }
    }
  }
  
  return unique;
};

export {
  detectPhoneFormat,
  convertTurkishToInternational,
  convertInternationalToTurkish,
  extractPhoneFromJid,
  normalizePhoneNumber,
  normalizeJid,
  standardizeJid,
  areJidsSamePerson,
  standardizeChatId,
  standardizeMessageJid,
  detectJidType,
  isValidJid,
  normalizeParticipantJid,
  normalizeGroupMessageJids,
  normalizeJidsBatch,
  standardizeJidsBatch,
  formatJidForDisplay,
  normalizeGroupParticipants,
  matchJids,
  getUniqueJids,
};

