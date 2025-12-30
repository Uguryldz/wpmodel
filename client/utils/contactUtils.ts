/**
 * JID ve telefon numarası yardımcı fonksiyonları
 * 
 * Bu dosya, geriye dönük uyumluluk için mevcut fonksiyonları export eder.
 * Yeni geliştirmeler için jidConverter.ts modülünü kullanın.
 */

// Merkezi JID converter modülünden fonksiyonları import et
import {
  extractPhoneFromJid as extractPhoneFromJidCore,
  normalizePhoneNumber as normalizePhoneNumberCore,
  normalizeJid as normalizeJidCore,
  areJidsSamePerson as areJidsSamePersonCore,
  standardizeJid,
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
} from './jidConverter';

// Geriye dönük uyumluluk için mevcut fonksiyonları export et
export const extractPhoneFromJid = extractPhoneFromJidCore;
export const normalizePhoneNumber = normalizePhoneNumberCore;
export const normalizeJid = normalizeJidCore;
export const areJidsSamePerson = areJidsSamePersonCore;

// Tüm fonksiyonları export et
export {
  standardizeJid,
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
