// Interactive message functions (Buttons, Lists, Templates)
// BaileyTipREADME.md'deki örneklere göre güncellendi
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { logger } from "../../shared.js";
import { generateWAMessageFromContent } from "baileys";

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
  // Web araması sonuçlarına göre headerType eklenmeli
  const content = {
    text: text,
    footer: footer || undefined,
    buttons: buttons.map(btn => {
      // Farklı formatları destekle
      const buttonId = btn.buttonId || btn.id || `btn_${Math.random().toString(36).substr(2, 9)}`;
      const displayText = btn.buttonText?.displayText || btn.displayText || btn.title || btn.text || btn.reply?.title;
      const type = btn.type || btn.reply?.type || 1; // 1 = Quick Reply, 2 = URL, 3 = Call
      
      const buttonObj = {
        buttonId,
        buttonText: {
          displayText
        },
        type
      };
      
      // URL butonu için URL ekle
      if (type === 2 && btn.url) {
        buttonObj.url = btn.url;
      }
      
      // Call butonu için telefon numarası ekle
      if (type === 3 && btn.phoneNumber) {
        buttonObj.phoneNumber = btn.phoneNumber;
      }
      
      return buttonObj;
    }),
    // headerType ekle (Baileys'in güncel formatına göre gerekli)
    // 1 = Text, 2 = Image, 3 = Video, 4 = Document
    headerType: header ? header.type : 1
  };

  // Header ekle (eğer varsa)
  if (header) {
    if (header.type === 2 && header.image) {
      // Image header için image ekle
      content.image = typeof header.image === 'string' 
        ? { url: header.image } 
        : header.image;
    } else if (header.type === 3 && header.video) {
      // Video header için video ekle
      content.video = typeof header.video === 'string' 
        ? { url: header.video } 
        : header.video;
    } else if (header.type === 4 && header.document) {
      // Document header için document ekle
      content.document = typeof header.document === 'string' 
        ? { url: header.document } 
        : header.document;
    } else if (header.type === 1 && header.text) {
      // Text header için text'i birleştir
      content.text = header.text + "\n\n" + text;
    }
  }

  try {
    logger.info({ accountId, jid, content: JSON.stringify(content, null, 2) }, "Button mesajı gönderiliyor");
    await sock.sendMessage(jid, content);
    logger.info({ accountId, jid, buttonCount: buttons.length }, "Button mesajı gönderildi");
  } catch (error) {
    logger.error({ error, accountId, jid, content: JSON.stringify(content, null, 2) }, "Button mesajı gönderilemedi");
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
  if (!to || !text || !buttonText || !sections || sections.length === 0) {
    throw new Error("to, text, buttonText ve sections alanları zorunludur");
  }
  
  // Title zorunlu - Baileys list mesajları için title gerekiyor
  if (!title || !title.trim()) {
    throw new Error("List mesajı için title zorunludur");
  }

  // Toplam satır sayısını kontrol et (max 10)
  const totalRows = sections.reduce((sum, section) => sum + (section.rows?.length || 0), 0);
  if (totalRows > 10) {
    throw new Error("Toplamda en fazla 10 seçenek gönderilebilir");
  }

  const jid = normalizeJid(to);
  const sock = ensureSocket(accountId);

  // Baileys formatına göre list mesajı oluştur
  // Web araması sonuçlarına göre format - rowId kullanılmalı
  // Tüm alanların dolu olduğundan emin ol
  // Baileys'in beklediği format: { text, title?, buttonText, sections: [{title, rows: [{title, description?, rowId}]}], footer? }
  // NOT: Baileys'te liste mesajları için text, buttonText ve sections zorunludur
  // title opsiyonel olabilir ama genellikle kullanılır
  // listType GEREKSIZ - web araması sonuçlarında yok
  const content = {
    text: text.trim(),
    buttonText: buttonText.trim(),
    sections: sections.map(section => {
      // Section title boş olamaz, en azından boş string olmalı
      const sectionTitle = (section.title || "").trim();
      
      // Rows'ları düzenle
      const sectionRows = (section.rows || []).map(row => {
        // Farklı formatları destekle - id veya rowId kullanılabilir
        const rowId = row.rowId || row.id || `row_${Math.random().toString(36).substr(2, 9)}`;
        const rowTitle = (row.title || "").trim();
        
        // Title boş olamaz
        if (!rowTitle) {
          throw new Error("Her satır için title zorunludur");
        }
        
        // Baileys'in güncel formatına göre rowId kullan
        // Format: { title: string, rowId: string, description?: string }
        const rowObj = {
          title: rowTitle,
          rowId: String(rowId) // rowId string olmalı
        };
        
        // Description varsa ekle (opsiyonel, ama boş string değilse)
        if (row.description && row.description.trim()) {
          rowObj.description = row.description.trim();
        }
        
        return rowObj;
      });
      
      // En az bir row olmalı
      if (sectionRows.length === 0) {
        throw new Error("Her bölüm için en az bir satır olmalıdır");
      }
      
      // Section formatı: { title: string, rows: Array<{title, rowId, description?}> }
      return {
        title: sectionTitle,
        rows: sectionRows
        };
      })
  };
  
  // Title zorunlu - her zaman ekle
  content.title = title.trim();
  
  // Footer varsa ekle (opsiyonel)
  if (footer && footer.trim()) {
    content.footer = footer.trim();
  }
  
  // Baileys'in beklediği formatı doğrula
  // Tüm zorunlu alanların dolu olduğundan emin ol
  if (!content.text || !content.buttonText || !content.sections || content.sections.length === 0) {
    throw new Error("List mesajı için text, buttonText ve sections alanları zorunludur");
  }
  
  // Her section'ın en az bir row'u olmalı
  for (const section of content.sections) {
    if (!section.rows || section.rows.length === 0) {
      throw new Error("Her bölüm için en az bir satır olmalıdır");
    }
    for (const row of section.rows) {
      if (!row.title || !row.rowId) {
        throw new Error("Her satır için title ve rowId zorunludur");
      }
    }
  }
  
  // Debug: Content formatını kontrol et
  logger.debug({ 
    accountId, 
    jid, 
    contentStructure: {
      hasText: !!content.text,
      hasTitle: !!content.title,
      hasButtonText: !!content.buttonText,
      sectionsCount: content.sections.length,
      sectionsStructure: content.sections.map(s => ({
        hasTitle: !!s.title,
        rowsCount: s.rows.length,
        rowsStructure: s.rows.map(r => ({
          hasTitle: !!r.title,
          hasRowId: !!r.rowId,
          hasDescription: !!r.description
        }))
      }))
    }
  }, "List mesajı format kontrolü");

  try {
    logger.info({ 
      accountId, 
      jid, 
      content: JSON.stringify(content, null, 2),
      sectionCount: sections.length,
      totalRows: sections.reduce((sum, s) => sum + (s.rows?.length || 0), 0)
    }, "List mesajı gönderiliyor");
    
    // Baileys'in beklediği formatı kullan
    // generateWAMessageFromContent ile formatı doğrula ve gönder
    // Bu fonksiyon Baileys'in beklediği formata çevirir
    
    // Final content'i hazırla - tüm alanların doğru formatta olduğundan emin ol
    const finalContent = {
      ...content
    };
    
    // Content'i logla (debug için)
    logger.debug({ 
      accountId, 
      jid, 
      finalContent: JSON.stringify(finalContent, null, 2),
      contentKeys: Object.keys(finalContent),
      sectionsCount: finalContent.sections?.length,
      firstSection: finalContent.sections?.[0],
      firstRow: finalContent.sections?.[0]?.rows?.[0]
    }, "List mesajı final content");
    
    // Baileys'in beklediği format: listMessage wrapper'ı ile gönder
    // Format: { listMessage: { text, title, buttonText, sections, footer? } }
    const listMessageContent = {
      listMessage: finalContent
    };
    
    logger.debug({ 
      accountId, 
      jid, 
      listMessageContent: JSON.stringify(listMessageContent, null, 2),
      contentKeys: Object.keys(finalContent),
      sectionsCount: finalContent.sections?.length
    }, "List mesajı listMessage wrapper ile gönderiliyor");
    
    // Direkt sendMessage ile listMessage wrapper'ı ile gönder
    const result = await sock.sendMessage(jid, listMessageContent);
    
    logger.info({ 
      accountId, 
      jid, 
      sectionCount: sections.length, 
      totalRows: sections.reduce((sum, s) => sum + (s.rows?.length || 0), 0),
      messageId: result?.key?.id,
      resultKeys: result ? Object.keys(result) : []
    }, "List mesajı gönderildi");
    
    return result;
  } catch (error) {
    logger.error({ 
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error?.code,
        status: error?.status
      }, 
      accountId, 
      jid, 
      content: JSON.stringify(content, null, 2) 
    }, "List mesajı gönderilemedi");
    throw new Error(`List mesajı gönderilemedi: ${error.message}`);
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

  // WhatsApp Business API şablon formatı
  // Components formatı: [{ type: "body"|"header"|"footer"|"button", parameters: [...] }]
  const templateContent = {
      name: templateName,
      language: {
        code: languageCode,
        policy: "deterministic"
    }
  };

  // Components varsa ekle (boş array değilse ve geçerliyse)
  if (components && Array.isArray(components) && components.length > 0) {
    // Components formatını doğrula ve düzenle
    templateContent.components = components.map(comp => {
      const component = {
        type: comp.type // "body", "header", "footer", "button"
      };
      
      // Parameters varsa ekle
      if (comp.parameters && comp.parameters.length > 0) {
        component.parameters = comp.parameters.map(param => {
          const paramObj = {
            type: param.type // "text", "image", "video", "document", "payload"
          };
          
          // Type'a göre uygun alanı ekle
          if (param.type === "text" && param.text) {
            paramObj.text = param.text;
          } else if (param.type === "image" && param.image) {
            // Image formatı: { url: string } veya direkt image objesi
            paramObj.image = typeof param.image === 'string' 
              ? { url: param.image } 
              : param.image;
          } else if (param.type === "video" && param.video) {
            // Video formatı: { url: string } veya direkt video objesi
            paramObj.video = typeof param.video === 'string' 
              ? { url: param.video } 
              : param.video;
          } else if (param.type === "document" && param.document) {
            // Document formatı: { url: string, filename?: string } veya direkt document objesi
            paramObj.document = typeof param.document === 'string' 
              ? { url: param.document } 
              : param.document;
          } else if (param.type === "payload" && param.payload) {
            paramObj.payload = param.payload;
          }
          
          return paramObj;
        });
      }
      
      // Button için sub_type ve index ekle
      if (comp.type === "button" && comp.sub_type) {
        component.sub_type = comp.sub_type; // "quick_reply" veya "url"
      }
      if (comp.type === "button" && comp.index !== undefined) {
        component.index = comp.index; // Button index (0, 1, 2)
      }
      
      return component;
    });
  }

  // Baileys'in beklediği format: template wrapper'ı ile gönder
  // Format: { template: { name, language: { code, policy }, components?: [...] } }
  const content = {
    template: templateContent
  };

  try {
    logger.info({ accountId, jid, content: JSON.stringify(content, null, 2) }, "Template mesajı gönderiliyor");
    await sock.sendMessage(jid, content);
    logger.info({ accountId, jid }, "Template mesajı gönderildi");
  } catch (error) {
    logger.error({ 
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }, 
      accountId, 
      jid, 
      content: JSON.stringify(content, null, 2) 
    }, "Template mesajı gönderilemedi");
    throw new Error(`Template mesajı gönderilemedi: ${error.message}`);
  }

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

  try {
    logger.info({ accountId, jid, content: JSON.stringify(content, null, 2) }, "Product mesajı gönderiliyor");
    await sock.sendMessage(jid, content);
    logger.info({ accountId, jid }, "Product mesajı gönderildi");
  } catch (error) {
    logger.error({ error, accountId, jid, content: JSON.stringify(content, null, 2) }, "Product mesajı gönderilemedi");
    throw error;
  }

  return { accountId: getAccountId(accountId), jid, status: "queued" };
};
