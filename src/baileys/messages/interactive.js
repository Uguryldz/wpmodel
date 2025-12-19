// Interactive message functions (Buttons, Lists, Templates)
// BaileyTipREADME.md'deki örneklere göre güncellendi
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Butonlu mesaj gönder
 * BaileyTipREADME.md ve Baileys dokümantasyonuna göre format:
 * - En fazla 3 buton gönderilebilir
 * - Button formatı: { buttonId, buttonText: { displayText }, type }
 * - type: 1 = Quick Reply, 2 = URL, 3 = Call
 * 
 * @param {string} accountId - Hesap ID
 * @param {string} to - Alıcı JID
 * @param {string} text - Mesaj metni (body)
 * @param {Array} buttons - Buton listesi [{buttonId, buttonText: {displayText}, type}]
 * @param {string} footer - Alt bilgi (opsiyonel)
 * @param {Object} header - Header (opsiyonel) {type: 1|2|3|4, text|image|video|document}
 * @returns {Promise<Object>}
 */
export const sendButtonMessage = async (accountId, to, text, buttons, footer, header) => {
  if (!to || !text || !buttons || buttons.length === 0) {
    throw new Error("to, text ve buttons alanları zorunludur");
  }

  if (buttons.length > 3) {
    throw new Error("En fazla 3 buton gönderilebilir");
  }

  const jid = normalizeJid(to);
  const sock = ensureSocket(accountId);

  // Baileys formatına göre button mesajı oluştur
  // BaileyTipREADME.md ve web araması sonuçlarına göre format
  const content = {
    text: text,
    footer: footer || undefined,
    buttons: buttons.map(btn => {
      // Farklı formatları destekle
      const buttonId = btn.buttonId || btn.id || `btn_${Math.random().toString(36).substr(2, 9)}`;
      const displayText = btn.buttonText?.displayText || btn.displayText || btn.title || btn.text || btn.reply?.title;
      const type = btn.type || btn.reply?.type || 1; // 1 = Quick Reply (default)
      
      return {
        buttonId,
        buttonText: {
          displayText
        },
        type
      };
    })
  };

  // Header ekle (eğer varsa)
  if (header) {
    if (header.type === 2 && header.image) {
      content.image = header.image;
      content.headerType = 2;
    } else if (header.type === 3 && header.video) {
      content.video = header.video;
      content.headerType = 3;
    } else if (header.type === 4 && header.document) {
      content.document = header.document;
      content.headerType = 4;
    } else if (header.type === 1 && header.text) {
      content.text = header.text + "\n\n" + text;
      content.headerType = 1;
    }
  } else {
    content.headerType = 1; // Default: text header
  }

  try {
    await sock.sendMessage(jid, content);
    logger.info({ accountId, jid, buttonCount: buttons.length }, "Button mesajı gönderildi");
  } catch (error) {
    logger.error({ error, accountId, jid, content }, "Button mesajı gönderilemedi");
    throw error;
  }

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

/**
 * Liste mesajı gönder
 * BaileyTipREADME.md ve Baileys dokümantasyonuna göre format:
 * - Toplamda en fazla 10 satır gönderilebilir
 * - Format: { text, title, buttonText, sections: [{title, rows: [{title, description, rowId}]}], footer }
 * 
 * @param {string} accountId - Hesap ID
 * @param {string} to - Alıcı JID
 * @param {string} text - Mesaj metni (body)
 * @param {string} title - Liste başlığı (bold)
 * @param {string} buttonText - Liste butonu metni (liste görüntülemek için buton)
 * @param {Array} sections - Bölüm listesi [{title, rows: [{title, description, rowId}]}]
 * @param {string} footer - Alt bilgi (opsiyonel)
 * @returns {Promise<Object>}
 */
export const sendListMessage = async (accountId, to, text, title, buttonText, sections, footer) => {
  if (!to || !text || !title || !buttonText || !sections || sections.length === 0) {
    throw new Error("to, text, title, buttonText ve sections alanları zorunludur");
  }

  // Toplam satır sayısını kontrol et (max 10)
  const totalRows = sections.reduce((sum, section) => sum + (section.rows?.length || 0), 0);
  if (totalRows > 10) {
    throw new Error("Toplamda en fazla 10 seçenek gönderilebilir");
  }

  const jid = normalizeJid(to);
  const sock = ensureSocket(accountId);

  // Baileys formatına göre list mesajı oluştur
  // BaileyTipREADME.md ve web araması sonuçlarına göre format
  const content = {
    text: text,
    footer: footer || undefined,
    title: title,
    buttonText: buttonText,
    sections: sections.map(section => ({
      title: section.title || "",
      rows: section.rows.map(row => {
        // Farklı formatları destekle
        const rowId = row.rowId || row.id || `row_${Math.random().toString(36).substr(2, 9)}`;
        const rowTitle = row.title;
        const description = row.description || undefined;
        
        return {
          title: rowTitle,
          description,
          rowId
        };
      })
    }))
  };

  try {
    await sock.sendMessage(jid, content);
    logger.info({ accountId, jid, sectionCount: sections.length, totalRows }, "List mesajı gönderildi");
  } catch (error) {
    logger.error({ error, accountId, jid, content }, "List mesajı gönderilemedi");
    throw error;
  }

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

/**
 * Şablon mesajı gönder
 * @param {string} accountId - Hesap ID
 * @param {string} to - Alıcı JID
 * @param {string} templateName - Şablon adı (onaylanmış olmalı)
 * @param {string} languageCode - Dil kodu (örn: "tr", "en")
 * @param {Array} components - Şablon bileşenleri (opsiyonel)
 * @returns {Promise<Object>}
 */
export const sendTemplateMessage = async (accountId, to, templateName, languageCode = "tr", components = []) => {
  if (!to || !templateName) {
    throw new Error("to ve templateName alanları zorunludur");
  }

  const jid = normalizeJid(to);
  const sock = ensureSocket(accountId);

  const content = {
    template: {
      name: templateName,
      language: {
        code: languageCode,
        policy: "deterministic"
      },
      components: components.length > 0 ? components : undefined
    }
  };

  await sock.sendMessage(jid, content);

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};

/**
 * Ürün mesajı gönder
 * @param {string} accountId - Hesap ID
 * @param {string} to - Alıcı JID
 * @param {string} text - Mesaj metni
 * @param {string} footer - Alt bilgi (opsiyonel)
 * @param {Array} productList - Ürün listesi [{title, products: [{productId}]}]
 * @param {string} businessOwnerJid - Business sahibi JID
 * @param {string} thumbnail - Thumbnail URL (opsiyonel)
 * @returns {Promise<Object>}
 */
export const sendProductMessage = async (accountId, to, text, productList, businessOwnerJid, footer, thumbnail) => {
  if (!to || !text || !productList || !businessOwnerJid) {
    throw new Error("to, text, productList ve businessOwnerJid alanları zorunludur");
  }

  const jid = normalizeJid(to);
  const sock = ensureSocket(accountId);

  const content = {
    text: text,
    footer: footer || undefined,
    productList: productList.map(list => ({
      title: list.title,
      products: list.products.map(p => ({
        productId: p.productId
      }))
    })),
    businessOwnerJid: normalizeJid(businessOwnerJid),
    thumbnail: thumbnail ? { url: thumbnail } : undefined
  };

  await sock.sendMessage(jid, content);

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};
