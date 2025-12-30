// Datastore modülü - PostgreSQL ile tüm veri işlemleri
// Baileys'in makeInMemoryStore yerine kullanılacak
import { prisma, logger } from "../shared.js";
import { jidNormalizedUser } from "baileys";
import {
  normalizeJid,
  standardizeJid,
  extractPhoneFromJid,
  normalizePhoneNumber,
  detectPhoneFormat,
  detectJidType,
} from "../utils/jidConverter.js";

/**
 * Datastore - PostgreSQL tabanlı veri deposu
 * Baileys'in makeInMemoryStore yerine kullanılır
 */
export class DataStore {
  constructor(sessionId) {
    this.sessionId = sessionId;
    
    // Non-blocking DB write queue'ları
    this.chatQueue = [];
    this.contactQueue = [];
    this.messageQueue = [];
    
    // Batch processor interval'ı (cleanup için)
    this.batchProcessorInterval = null;
    
    // Batch processor başlat
    this.startBatchProcessor();
  }
  
  /**
   * Batch processor - Arka planda queue'daki verileri PostgreSQL'e yazar
   * Her 50ms'de bir batch olarak yazar (non-blocking)
   * ✅ DOĞRU MODEL: DB yazma arka planda, cevap göndermeyi bloklamaz
   */
  startBatchProcessor() {
    this.batchProcessorInterval = setInterval(async () => {
      // Chat batch
      if (this.chatQueue.length > 0) {
        const batch = this.chatQueue.splice(0, 100);
        try {
          await this.saveChatsBatch(batch);
        } catch (error) {
          logger.error({ error, sessionId: this.sessionId }, "Chat batch kaydedilemedi");
        }
      }
      
      // Contact batch
      if (this.contactQueue.length > 0) {
        const batch = this.contactQueue.splice(0, 100);
        try {
          await this.saveContactsBatch(batch);
        } catch (error) {
          logger.error({ error, sessionId: this.sessionId }, "Contact batch kaydedilemedi");
        }
      }
      
      // Message batch
      if (this.messageQueue.length > 0) {
        const batch = this.messageQueue.splice(0, 100);
        try {
          await this.saveMessagesBatch(batch);
        } catch (error) {
          logger.error({ error, sessionId: this.sessionId }, "Message batch kaydedilemedi");
        }
      }
    }, 50); // 50ms interval - non-blocking
  }
  
  /**
   * Batch processor'ı durdur (cleanup için)
   */
  stopBatchProcessor() {
    if (this.batchProcessorInterval) {
      clearInterval(this.batchProcessorInterval);
      this.batchProcessorInterval = null;
    }
  }
  
  /**
   * Chat'i queue'ya ekle (non-blocking)
   */
  queueChat(chat) {
    this.chatQueue.push(chat);
  }
  
  /**
   * Contact'ı queue'ya ekle (non-blocking)
   */
  queueContact(contact) {
    this.contactQueue.push(contact);
  }
  
  /**
   * Mesajı queue'ya ekle (non-blocking)
   */
  queueMessage(msg) {
    this.messageQueue.push(msg);
  }

  /**
   * Mesaj getir (Baileys getMessage config için)
   * @param {string} remoteJid - Chat JID
   * @param {string} messageId - Mesaj ID
   * @returns {Promise<WAMessage|null>}
   */
  async loadMessage(remoteJid, messageId) {
    try {
      // @lid formatını normalize et
      const normalizedJid = normalizeJid(remoteJid);
      const normalizedJidForQuery = jidNormalizedUser(normalizedJid);
      const isLidFormat = remoteJid && remoteJid.includes('@lid');
      
      // @lid formatındaysa, hem normalize edilmiş hem de phoneRaw ile ara
      const dbMessage = await prisma.message.findFirst({
        where: {
          sessionId: this.sessionId,
          id: messageId,
          OR: [
            { remoteJid: normalizedJidForQuery },
            // @lid formatındaysa, phoneRaw ile de ara
            ...(isLidFormat ? [
              { remoteJidPhoneRaw: extractPhoneFromJid(remoteJid) },
              { remoteJidNormalized: normalizedJid },
            ] : []),
          ],
        },
      });

      if (!dbMessage) {
        return null;
      }

      // Prisma'dan gelen veriyi Baileys formatına çevir
      return {
        key: typeof dbMessage.key === "string" 
          ? JSON.parse(dbMessage.key) 
          : dbMessage.key,
        message: dbMessage.message 
          ? (typeof dbMessage.message === "string" 
              ? JSON.parse(dbMessage.message) 
              : dbMessage.message)
          : null,
        messageTimestamp: dbMessage.messageTimestamp 
          ? Number(dbMessage.messageTimestamp) 
          : null,
        messageC2STimestamp: dbMessage.messageC2STimestamp 
          ? Number(dbMessage.messageC2STimestamp) 
          : null,
        pushName: dbMessage.pushName || null,
        participant: dbMessage.participant || null,
        broadcast: dbMessage.broadcast || false,
        multicast: dbMessage.multicast || false,
        status: dbMessage.status || null,
        starred: dbMessage.starred || false,
        reactions: dbMessage.reactions 
          ? (typeof dbMessage.reactions === "string" 
              ? JSON.parse(dbMessage.reactions) 
              : dbMessage.reactions)
          : null,
        messageStubType: dbMessage.messageStubType || null,
        messageStubParameters: dbMessage.messageStubParameters 
          ? (typeof dbMessage.messageStubParameters === "string" 
              ? JSON.parse(dbMessage.messageStubParameters) 
              : dbMessage.messageStubParameters)
          : null,
        isForwarded: dbMessage.isForwarded || false, // Mesaj iletildi mi?
      };
    } catch (error) {
      logger.error({ 
        error, 
        sessionId: this.sessionId, 
        remoteJid, 
        messageId 
      }, "Datastore: Mesaj getirilemedi");
      return null;
    }
  }

  /**
   * JID format bilgilerini hesapla (jidConverter.ts için)
   * @param {string} jid - JID
   * @returns {object} JID format bilgileri
   */
  calculateJidFields(jid) {
    if (!jid) return {};
    
    try {
      const phoneRaw = extractPhoneFromJid(jid);
      const phoneNormalized = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;
      const phoneFormat = phoneRaw ? detectPhoneFormat(phoneRaw) : null;
      
      return {
        jidNormalized: normalizeJid(jid),
        jidStandardized: standardizeJid(jid, 'auto'),
        phoneRaw: phoneRaw || null,
        phoneNormalized: phoneNormalized || null,
        phoneFormat: phoneFormat || null,
        jidType: detectJidType(jid),
      };
    } catch (error) {
      logger.warn({ error, jid }, "JID format hesaplanamadı");
      return {};
    }
  }

  /**
   * Chat kaydet/güncelle
   * @param {object} chat - Chat objesi
   */
  async saveChat(chat) {
    try {
      // @lid formatını kontrol et ve düzenle
      const isLidFormat = chat.id && chat.id.includes('@lid');
      let chatId = chat.id;
      let lidJidValue = chat.lidJid || null;
      
      // Eğer chat.id @lid formatındaysa
      if (isLidFormat) {
        lidJidValue = chat.id; // Orijinal @lid formatını sakla
        chatId = normalizeJid(chat.id); // Normalize et (@s.whatsapp.net'e çevir)
      }
      
      const normalizedChatId = jidNormalizedUser(chatId);
      const jidFields = this.calculateJidFields(chatId);
      
      // Duplicate kontrolü: @lid ve @s.whatsapp.net formatlarını kontrol et
      // Önce normalize edilmiş ID ile ara
      let existingChat = await prisma.chat.findFirst({
        where: {
          sessionId: this.sessionId,
          OR: [
            { id: normalizedChatId },
            // @lid formatı kontrolü
            ...(isLidFormat ? [
              { lidJid: chat.id }, // Orijinal @lid formatı
              { lidJid: normalizedChatId }, // Normalize edilmiş ID lidJid'de olabilir
            ] : []),
            // phoneRaw ile de ara (aynı numara farklı formatlarda olabilir)
            ...(jidFields.phoneRaw ? [{ phoneRaw: jidFields.phoneRaw }] : []),
            ...(jidFields.phoneNormalized ? [{ phoneNormalized: jidFields.phoneNormalized }] : []),
            // jidNormalized ile de ara (farklı formatlar aynı normalize edilmiş JID'ye sahip olabilir)
            ...(jidFields.jidNormalized ? [{ jidNormalized: jidFields.jidNormalized }] : []),
          ],
        },
      });
      
      // Eğer mevcut chat bulunduysa, onun ID'sini kullan
      const finalChatId = existingChat ? existingChat.id : normalizedChatId;
      
      // Eğer mevcut chat'te lidJid yoksa ve yeni chat @lid formatındaysa, lidJid'yi güncelle
      if (existingChat && isLidFormat && !existingChat.lidJid) {
        // Mevcut chat'i lidJid ile güncelle (ayrı bir update gerekebilir)
        await prisma.chat.update({
          where: {
            sessionId_id: {
              sessionId: this.sessionId,
              id: finalChatId,
            },
          },
          data: {
            lidJid: lidJidValue,
          },
        });
      }
      
      await prisma.chat.upsert({
        where: {
          sessionId_id: {
            sessionId: this.sessionId,
            id: finalChatId,
          },
        },
        create: {
          sessionId: this.sessionId,
          id: finalChatId,
          name: chat.name || null,
          displayName: chat.displayName || null,
          subject: chat.subject || null,
          unreadCount: chat.unreadCount || 0,
          conversationTimestamp: chat.conversationTimestamp
            ? BigInt(chat.conversationTimestamp)
            : null,
          lastMsgTimestamp: chat.lastMsgTimestamp 
            ? BigInt(chat.lastMsgTimestamp) 
            : null,
          archived: chat.archived || false,
          pinned: chat.pinned ? BigInt(chat.pinned) : null,
          participant: chat.participants || null,
          creation: chat.creation ? BigInt(chat.creation) : null,
          desc: chat.desc || null,
          descOwner: chat.descOwner || null,
          descId: chat.descId || null,
          restrict: chat.restrict || null,
          announce: chat.announce || null,
          size: chat.size || null,
          ephemeralDuration: chat.ephemeralExpiration || chat.ephemeralDuration || null,
          inviteCode: chat.inviteCode || null,
          imgUrl: chat.imgUrl || null,
          lidJid: lidJidValue || chat.lidJid || null, // @lid formatını koru
          newJid: chat.newJid || null,
          oldJid: chat.oldJid || null,
          muteEndTime: chat.muteEndTime ? BigInt(chat.muteEndTime) : null,
          disappearingMode: chat.disappearingMode || null,
          readOnly: chat.readOnly || null,
          endOfHistoryTransfer: chat.endOfHistoryTransfer || null,
          endOfHistoryTransferType: chat.endOfHistoryTransferType || null,
          markedAsUnread: chat.markedAsUnread || null,
          createdAt: chat.createdAt ? BigInt(chat.createdAt) : null,
          createdBy: chat.createdBy || null,
          wallpaper: chat.wallpaper || null,
          lastMessageRecvTimestamp: chat.lastMessageRecvTimestamp 
            ? BigInt(chat.lastMessageRecvTimestamp) 
            : null,
          // JID format alanları (jidConverter.ts için)
          ...jidFields,
        },
        update: {
          name: chat.name !== undefined ? chat.name : undefined,
          displayName: chat.displayName !== undefined ? chat.displayName : undefined,
          subject: chat.subject !== undefined ? chat.subject : undefined,
          unreadCount: chat.unreadCount !== undefined ? chat.unreadCount : undefined,
          conversationTimestamp: chat.conversationTimestamp
            ? BigInt(chat.conversationTimestamp)
            : undefined,
          lastMsgTimestamp: chat.lastMsgTimestamp 
            ? BigInt(chat.lastMsgTimestamp) 
            : undefined,
          archived: chat.archived !== undefined ? chat.archived : undefined,
          pinned: chat.pinned !== undefined ? (chat.pinned ? BigInt(chat.pinned) : null) : undefined,
          participant: chat.participants !== undefined ? chat.participants : undefined,
          creation: chat.creation !== undefined ? (chat.creation ? BigInt(chat.creation) : null) : undefined,
          desc: chat.desc !== undefined ? chat.desc : undefined,
          descOwner: chat.descOwner !== undefined ? chat.descOwner : undefined,
          descId: chat.descId !== undefined ? chat.descId : undefined,
          restrict: chat.restrict !== undefined ? chat.restrict : undefined,
          announce: chat.announce !== undefined ? chat.announce : undefined,
          size: chat.size !== undefined ? chat.size : undefined,
          ephemeralDuration: chat.ephemeralExpiration !== undefined 
            ? (chat.ephemeralExpiration || chat.ephemeralDuration || null)
            : undefined,
          inviteCode: chat.inviteCode !== undefined ? chat.inviteCode : undefined,
          imgUrl: chat.imgUrl !== undefined ? chat.imgUrl : undefined,
          lidJid: lidJidValue !== undefined ? lidJidValue : (chat.lidJid !== undefined ? chat.lidJid : undefined),
          newJid: chat.newJid !== undefined ? chat.newJid : undefined,
          oldJid: chat.oldJid !== undefined ? chat.oldJid : undefined,
          muteEndTime: chat.muteEndTime !== undefined 
            ? (chat.muteEndTime ? BigInt(chat.muteEndTime) : null)
            : undefined,
          disappearingMode: chat.disappearingMode !== undefined ? chat.disappearingMode : undefined,
          readOnly: chat.readOnly !== undefined ? chat.readOnly : undefined,
          endOfHistoryTransfer: chat.endOfHistoryTransfer !== undefined 
            ? chat.endOfHistoryTransfer 
            : undefined,
          endOfHistoryTransferType: chat.endOfHistoryTransferType !== undefined 
            ? chat.endOfHistoryTransferType 
            : undefined,
          markedAsUnread: chat.markedAsUnread !== undefined ? chat.markedAsUnread : undefined,
          createdAt: chat.createdAt !== undefined 
            ? (chat.createdAt ? BigInt(chat.createdAt) : null)
            : undefined,
          createdBy: chat.createdBy !== undefined ? chat.createdBy : undefined,
          wallpaper: chat.wallpaper !== undefined ? chat.wallpaper : undefined,
          lastMessageRecvTimestamp: chat.lastMessageRecvTimestamp !== undefined 
            ? (chat.lastMessageRecvTimestamp ? BigInt(chat.lastMessageRecvTimestamp) : null)
            : undefined,
          // JID format alanları (jidConverter.ts için)
          ...Object.fromEntries(
            Object.entries(jidFields).map(([key, value]) => [key, value !== undefined ? value : undefined])
          ),
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, chatId: chat.id }, "Datastore: Chat kaydedilemedi");
    }
  }

  /**
   * Contact kaydet/güncelle
   * @param {object} contact - Contact objesi
   */
  async saveContact(contact) {
    try {
      // @lid formatını kontrol et ve düzenle
      const isLidFormat = contact.id && contact.id.includes('@lid');
      let contactId = contact.id;
      
      // Eğer contact.id @lid formatındaysa
      if (isLidFormat) {
        contactId = normalizeJid(contact.id); // Normalize et (@s.whatsapp.net'e çevir)
      }
      
      const normalizedContactId = jidNormalizedUser(contactId);
      const jidFields = this.calculateJidFields(contactId);
      
      // Duplicate kontrolü: @lid ve @s.whatsapp.net formatlarını kontrol et
      let existingContact = await prisma.contact.findFirst({
        where: {
          sessionId: this.sessionId,
          OR: [
            { id: normalizedContactId },
            // phoneRaw ile de ara (aynı numara farklı formatlarda olabilir)
            ...(jidFields.phoneRaw ? [{ phoneRaw: jidFields.phoneRaw }] : []),
            ...(jidFields.phoneNormalized ? [{ phoneNormalized: jidFields.phoneNormalized }] : []),
            // jidNormalized ile de ara
            ...(jidFields.jidNormalized ? [{ jidNormalized: jidFields.jidNormalized }] : []),
          ],
        },
      });
      
      // Eğer mevcut contact bulunduysa, onun ID'sini kullan
      const finalContactId = existingContact ? existingContact.id : normalizedContactId;
      
      await prisma.contact.upsert({
        where: {
          sessionId_id: {
            sessionId: this.sessionId,
            id: finalContactId,
          },
        },
        create: {
          sessionId: this.sessionId,
          id: finalContactId,
          name: contact.name || null,
          notify: contact.notify || null,
          verifiedName: contact.verifiedName || null,
          imgUrl: contact.imgUrl || null,
          status: contact.status || null,
          vcard: contact.vcard || null,
          businessProfile: contact.businessProfile || null,
          labels: contact.labels || null,
          // JID format alanları (jidConverter.ts için)
          ...jidFields,
        },
        update: {
          name: contact.name !== undefined ? contact.name : undefined,
          notify: contact.notify !== undefined ? contact.notify : undefined,
          verifiedName: contact.verifiedName !== undefined ? contact.verifiedName : undefined,
          imgUrl: contact.imgUrl !== undefined ? contact.imgUrl : undefined,
          status: contact.status !== undefined ? contact.status : undefined,
          vcard: contact.vcard !== undefined ? contact.vcard : undefined,
          businessProfile: contact.businessProfile !== undefined ? contact.businessProfile : undefined,
          labels: contact.labels !== undefined ? contact.labels : undefined,
          // JID format alanları (jidConverter.ts için)
          ...Object.fromEntries(
            Object.entries(jidFields).map(([key, value]) => [key, value !== undefined ? value : undefined])
          ),
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, contactId: contact.id }, "Datastore: Contact kaydedilemedi");
    }
  }

  /**
   * Mesaj kaydet/güncelle
   * @param {object} msg - Mesaj objesi
   */
  async saveMessage(msg) {
    try {
      const remoteJid = jidNormalizedUser(msg.key.remoteJid);
      const messageId = msg.key.id;
      
      // RemoteJid için JID format alanları
      const remoteJidFields = this.calculateJidFields(msg.key.remoteJid);
      const remoteJidFieldsPrefixed = Object.fromEntries(
        Object.entries(remoteJidFields).map(([key, value]) => [`remoteJid${key.charAt(0).toUpperCase() + key.slice(1)}`, value])
      );
      
      // Participant için JID format alanları (varsa)
      const participant = msg.key.participant || msg.participant;
      const participantFields = participant ? this.calculateJidFields(participant) : {};
      const participantFieldsPrefixed = Object.fromEntries(
        Object.entries(participantFields).map(([key, value]) => [`participant${key.charAt(0).toUpperCase() + key.slice(1)}`, value])
      );
      
      // isForwarded bilgisini çıkar (formatMessage'daki mantıkla aynı)
      const isForwarded = msg.message?.extendedTextMessage?.contextInfo?.isForwarded ||
                         msg.message?.imageMessage?.contextInfo?.isForwarded ||
                         msg.message?.videoMessage?.contextInfo?.isForwarded ||
                         msg.message?.audioMessage?.contextInfo?.isForwarded ||
                         msg.message?.documentMessage?.contextInfo?.isForwarded ||
                         msg.message?.forwardedMessage ||
                         msg.isForwarded ||
                         false;
      
      await prisma.message.upsert({
        where: {
          sessionId_remoteJid_id: {
            sessionId: this.sessionId,
            remoteJid,
            id: messageId,
          },
        },
        create: {
          sessionId: this.sessionId,
          remoteJid,
          id: messageId,
          key: msg.key,
          message: msg.message || null,
          messageTimestamp: msg.messageTimestamp 
            ? BigInt(msg.messageTimestamp) 
            : null,
          messageC2STimestamp: msg.messageC2STimestamp 
            ? BigInt(msg.messageC2STimestamp) 
            : null,
          pushName: msg.pushName || null,
          participant: msg.key.participant || msg.participant || null,
          broadcast: msg.broadcast || false,
          multicast: msg.multicast || false,
          status: msg.status || null,
          starred: msg.starred || false,
          reactions: msg.reactions || null,
          messageStubType: msg.messageStubType || null,
          messageStubParameters: msg.messageStubParameters || null,
          isForwarded: isForwarded || false, // Mesaj iletildi mi?
          // JID format alanları (jidConverter.ts için)
          ...remoteJidFieldsPrefixed,
          ...participantFieldsPrefixed,
        },
        update: {
          key: msg.key !== undefined ? msg.key : undefined,
          message: msg.message !== undefined ? msg.message : undefined,
          messageTimestamp: msg.messageTimestamp !== undefined 
            ? (msg.messageTimestamp ? BigInt(msg.messageTimestamp) : null)
            : undefined,
          messageC2STimestamp: msg.messageC2STimestamp !== undefined 
            ? (msg.messageC2STimestamp ? BigInt(msg.messageC2STimestamp) : null)
            : undefined,
          pushName: msg.pushName !== undefined ? msg.pushName : undefined,
          participant: (msg.key?.participant || msg.participant) !== undefined 
            ? (msg.key?.participant || msg.participant || null)
            : undefined,
          broadcast: msg.broadcast !== undefined ? msg.broadcast : undefined,
          multicast: msg.multicast !== undefined ? msg.multicast : undefined,
          status: msg.status !== undefined ? msg.status : undefined,
          starred: msg.starred !== undefined ? msg.starred : undefined,
          reactions: msg.reactions !== undefined ? msg.reactions : undefined,
          messageStubType: msg.messageStubType !== undefined ? msg.messageStubType : undefined,
          messageStubParameters: msg.messageStubParameters !== undefined 
            ? msg.messageStubParameters 
            : undefined,
          isForwarded: isForwarded !== undefined ? isForwarded : undefined, // Mesaj iletildi mi?
          // JID format alanları (jidConverter.ts için)
          ...Object.fromEntries(
            Object.entries(remoteJidFieldsPrefixed).map(([key, value]) => [key, value !== undefined ? value : undefined])
          ),
          ...Object.fromEntries(
            Object.entries(participantFieldsPrefixed).map(([key, value]) => [key, value !== undefined ? value : undefined])
          ),
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, messageId: msg.key?.id }, "Datastore: Mesaj kaydedilemedi");
    }
  }

  /**
   * Tüm chat'leri getir
   * @returns {Promise<Array>}
   */
  async getAllChats() {
    try {
      const chats = await prisma.chat.findMany({
        where: { sessionId: this.sessionId },
        orderBy: { conversationTimestamp: 'desc' },
      });

      return chats.map(chat => ({
        id: chat.id,
        name: chat.name,
        displayName: chat.displayName,
        subject: chat.subject,
        unreadCount: chat.unreadCount,
        conversationTimestamp: chat.conversationTimestamp 
          ? Number(chat.conversationTimestamp) 
          : null,
        lastMsgTimestamp: chat.lastMsgTimestamp 
          ? Number(chat.lastMsgTimestamp) 
          : null,
        archived: chat.archived,
        pinned: chat.pinned ? Number(chat.pinned) : null,
        participants: chat.participant,
        creation: chat.creation ? Number(chat.creation) : null,
        desc: chat.desc,
        descOwner: chat.descOwner,
        descId: chat.descId,
        restrict: chat.restrict,
        announce: chat.announce,
        size: chat.size,
        ephemeralDuration: chat.ephemeralDuration,
        inviteCode: chat.inviteCode,
        imgUrl: chat.imgUrl,
        lidJid: chat.lidJid,
        newJid: chat.newJid,
        oldJid: chat.oldJid,
        muteEndTime: chat.muteEndTime ? Number(chat.muteEndTime) : null,
        disappearingMode: chat.disappearingMode,
        readOnly: chat.readOnly,
        endOfHistoryTransfer: chat.endOfHistoryTransfer,
        endOfHistoryTransferType: chat.endOfHistoryTransferType,
        markedAsUnread: chat.markedAsUnread,
        createdAt: chat.createdAt ? Number(chat.createdAt) : null,
        createdBy: chat.createdBy,
        wallpaper: chat.wallpaper,
        lastMessageRecvTimestamp: chat.lastMessageRecvTimestamp 
          ? Number(chat.lastMessageRecvTimestamp) 
          : null,
      }));
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, "Datastore: Chat'ler getirilemedi");
      return [];
    }
  }

  /**
   * Tüm contact'ları getir
   * @returns {Promise<Array>}
   */
  async getAllContacts() {
    try {
      const contacts = await prisma.contact.findMany({
        where: { sessionId: this.sessionId },
      });

      return contacts.map(contact => ({
        id: contact.id,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        imgUrl: contact.imgUrl,
        status: contact.status,
        vcard: contact.vcard,
        businessProfile: contact.businessProfile,
        labels: contact.labels,
      }));
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, "Datastore: Contact'lar getirilemedi");
      return [];
    }
  }

  /**
   * Chat'e göre mesajları getir
   * @param {string} remoteJid - Chat JID
   * @param {number} limit - Limit
   * @returns {Promise<Array>}
   */
  async getMessages(remoteJid, limit = 100) {
    try {
      // @lid formatını normalize et
      const normalizedJid = normalizeJid(remoteJid);
      const normalizedJidForQuery = jidNormalizedUser(normalizedJid);
      
      // @lid formatındaysa, hem normalize edilmiş hem de @lid formatını kontrol et
      const isLidFormat = remoteJid && remoteJid.includes('@lid');
      
      const messages = await prisma.message.findMany({
        where: {
          sessionId: this.sessionId,
          OR: [
            { remoteJid: normalizedJidForQuery },
            // @lid formatındaysa, lidJid ile de ara
            ...(isLidFormat ? [{ remoteJidPhoneRaw: extractPhoneFromJid(remoteJid) }] : []),
          ],
        },
        orderBy: { messageTimestamp: 'desc' },
        take: limit,
      });

      return messages.map(msg => ({
        key: typeof msg.key === "string" ? JSON.parse(msg.key) : msg.key,
        message: msg.message 
          ? (typeof msg.message === "string" ? JSON.parse(msg.message) : msg.message)
          : null,
        messageTimestamp: msg.messageTimestamp 
          ? Number(msg.messageTimestamp) 
          : null,
        messageC2STimestamp: msg.messageC2STimestamp 
          ? Number(msg.messageC2STimestamp) 
          : null,
        pushName: msg.pushName || null,
        participant: msg.participant || null,
        broadcast: msg.broadcast || false,
        multicast: msg.multicast || false,
        status: msg.status || null,
        starred: msg.starred || false,
        reactions: msg.reactions 
          ? (typeof msg.reactions === "string" ? JSON.parse(msg.reactions) : msg.reactions)
          : null,
        messageStubType: msg.messageStubType || null,
        messageStubParameters: msg.messageStubParameters 
          ? (typeof msg.messageStubParameters === "string" 
              ? JSON.parse(msg.messageStubParameters) 
              : msg.messageStubParameters)
          : null,
        isForwarded: msg.isForwarded || false, // Mesaj iletildi mi?
      }));
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, remoteJid }, "Datastore: Mesajlar getirilemedi");
      return [];
    }
  }
  
  /**
   * Batch olarak chat'leri kaydet (arka planda kullanılır)
   */
  async saveChatsBatch(chats) {
    if (chats.length === 0) return;
    
    try {
      await prisma.$transaction(
        chats.map(chat => {
          // @lid formatını kontrol et ve düzenle
          const isLidFormat = chat.id && chat.id.includes('@lid');
          let chatId = chat.id;
          let lidJidValue = chat.lidJid || null;
          
          if (isLidFormat) {
            lidJidValue = chat.id; // Orijinal @lid formatını sakla
            chatId = normalizeJid(chat.id); // Normalize et
          }
          
          const normalizedChatId = jidNormalizedUser(chatId);
          
          return prisma.chat.upsert({
            where: {
              sessionId_id: {
                sessionId: this.sessionId,
                id: normalizedChatId,
              },
            },
            create: {
              sessionId: this.sessionId,
              id: normalizedChatId,
              name: chat.name || null,
              displayName: chat.displayName || null,
              subject: chat.subject || null,
              unreadCount: chat.unreadCount || 0,
              conversationTimestamp: chat.conversationTimestamp
                ? BigInt(chat.conversationTimestamp)
                : null,
              lastMsgTimestamp: chat.lastMsgTimestamp 
                ? BigInt(chat.lastMsgTimestamp) 
                : null,
              archived: chat.archived || false,
              pinned: chat.pinned ? BigInt(chat.pinned) : null,
              participant: chat.participants || null,
              creation: chat.creation ? BigInt(chat.creation) : null,
              desc: chat.desc || null,
              descOwner: chat.descOwner || null,
              descId: chat.descId || null,
              restrict: chat.restrict || null,
              announce: chat.announce || null,
              size: chat.size || null,
              ephemeralDuration: chat.ephemeralExpiration || chat.ephemeralDuration || null,
              inviteCode: chat.inviteCode || null,
              imgUrl: chat.imgUrl || null,
              lidJid: lidJidValue || chat.lidJid || null, // @lid formatını koru
              newJid: chat.newJid || null,
              oldJid: chat.oldJid || null,
              muteEndTime: chat.muteEndTime ? BigInt(chat.muteEndTime) : null,
              disappearingMode: chat.disappearingMode || null,
              readOnly: chat.readOnly || null,
              endOfHistoryTransfer: chat.endOfHistoryTransfer || null,
              endOfHistoryTransferType: chat.endOfHistoryTransferType || null,
              markedAsUnread: chat.markedAsUnread || null,
              createdAt: chat.createdAt ? BigInt(chat.createdAt) : null,
              createdBy: chat.createdBy || null,
              wallpaper: chat.wallpaper || null,
              lastMessageRecvTimestamp: chat.lastMessageRecvTimestamp 
                ? BigInt(chat.lastMessageRecvTimestamp) 
                : null,
            },
            update: {
              name: chat.name !== undefined ? chat.name : undefined,
              displayName: chat.displayName !== undefined ? chat.displayName : undefined,
              subject: chat.subject !== undefined ? chat.subject : undefined,
              unreadCount: chat.unreadCount !== undefined ? chat.unreadCount : undefined,
              conversationTimestamp: chat.conversationTimestamp
                ? BigInt(chat.conversationTimestamp)
                : undefined,
              lastMsgTimestamp: chat.lastMsgTimestamp 
                ? BigInt(chat.lastMsgTimestamp) 
                : undefined,
              archived: chat.archived !== undefined ? chat.archived : undefined,
              pinned: chat.pinned !== undefined ? (chat.pinned ? BigInt(chat.pinned) : null) : undefined,
              participant: chat.participants !== undefined ? chat.participants : undefined,
            },
          });
        })
      );
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, batchSize: chats.length }, "Chat batch kaydedilemedi");
    }
  }
  
  /**
   * Batch olarak contact'ları kaydet (arka planda kullanılır)
   */
  async saveContactsBatch(contacts) {
    if (contacts.length === 0) return;
    
    try {
      await prisma.$transaction(
        contacts.map(contact => {
          const normalizedContactId = jidNormalizedUser(contact.id);
          return prisma.contact.upsert({
            where: {
              sessionId_id: {
                sessionId: this.sessionId,
                id: normalizedContactId,
              },
            },
            create: {
              sessionId: this.sessionId,
              id: normalizedContactId,
              name: contact.name || null,
              notify: contact.notify || null,
              verifiedName: contact.verifiedName || null,
              imgUrl: contact.imgUrl || null,
              status: contact.status || null,
              vcard: contact.vcard || null,
              businessProfile: contact.businessProfile || null,
              labels: contact.labels || null,
            },
            update: {
              name: contact.name !== undefined ? contact.name : undefined,
              notify: contact.notify !== undefined ? contact.notify : undefined,
              verifiedName: contact.verifiedName !== undefined ? contact.verifiedName : undefined,
              imgUrl: contact.imgUrl !== undefined ? contact.imgUrl : undefined,
              status: contact.status !== undefined ? contact.status : undefined,
              vcard: contact.vcard !== undefined ? contact.vcard : undefined,
              businessProfile: contact.businessProfile !== undefined ? contact.businessProfile : undefined,
              labels: contact.labels !== undefined ? contact.labels : undefined,
            },
          });
        })
      );
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, batchSize: contacts.length }, "Contact batch kaydedilemedi");
    }
  }
  
  /**
   * Batch olarak mesajları kaydet (arka planda kullanılır)
   */
  async saveMessagesBatch(messages) {
    if (messages.length === 0) return;
    
    try {
      await prisma.$transaction(
        messages.map(msg => {
          const remoteJid = jidNormalizedUser(msg.key.remoteJid);
          const messageId = msg.key.id;
          
          // isForwarded bilgisini çıkar
          const isForwarded = msg.message?.extendedTextMessage?.contextInfo?.isForwarded ||
                             msg.message?.imageMessage?.contextInfo?.isForwarded ||
                             msg.message?.videoMessage?.contextInfo?.isForwarded ||
                             msg.message?.audioMessage?.contextInfo?.isForwarded ||
                             msg.message?.documentMessage?.contextInfo?.isForwarded ||
                             msg.message?.forwardedMessage ||
                             msg.isForwarded ||
                             false;
          
          return prisma.message.upsert({
            where: {
              sessionId_remoteJid_id: {
                sessionId: this.sessionId,
                remoteJid,
                id: messageId,
              },
            },
            create: {
              sessionId: this.sessionId,
              remoteJid,
              id: messageId,
              key: msg.key,
              message: msg.message || null,
              messageTimestamp: msg.messageTimestamp 
                ? BigInt(msg.messageTimestamp) 
                : null,
              messageC2STimestamp: msg.messageC2STimestamp 
                ? BigInt(msg.messageC2STimestamp) 
                : null,
              pushName: msg.pushName || null,
              participant: msg.key.participant || msg.participant || null,
              broadcast: msg.broadcast || false,
              multicast: msg.multicast || false,
              status: msg.status || null,
              starred: msg.starred || false,
              reactions: msg.reactions || null,
              messageStubType: msg.messageStubType || null,
              messageStubParameters: msg.messageStubParameters || null,
              isForwarded: isForwarded || false, // Mesaj iletildi mi?
            },
            update: {
              key: msg.key !== undefined ? msg.key : undefined,
              message: msg.message !== undefined ? msg.message : undefined,
              messageTimestamp: msg.messageTimestamp !== undefined 
                ? (msg.messageTimestamp ? BigInt(msg.messageTimestamp) : null)
                : undefined,
              messageC2STimestamp: msg.messageC2STimestamp !== undefined 
                ? (msg.messageC2STimestamp ? BigInt(msg.messageC2STimestamp) : null)
                : undefined,
              pushName: msg.pushName !== undefined ? msg.pushName : undefined,
              participant: (msg.key?.participant || msg.participant) !== undefined 
                ? (msg.key?.participant || msg.participant || null)
                : undefined,
              broadcast: msg.broadcast !== undefined ? msg.broadcast : undefined,
              multicast: msg.multicast !== undefined ? msg.multicast : undefined,
              status: msg.status !== undefined ? msg.status : undefined,
              starred: msg.starred !== undefined ? msg.starred : undefined,
              reactions: msg.reactions !== undefined ? msg.reactions : undefined,
              messageStubType: msg.messageStubType !== undefined ? msg.messageStubType : undefined,
              messageStubParameters: msg.messageStubParameters !== undefined 
                ? msg.messageStubParameters 
                : undefined,
              isForwarded: isForwarded !== undefined ? isForwarded : undefined, // Mesaj iletildi mi?
            },
          });
        })
      );
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, batchSize: messages.length }, "Message batch kaydedilemedi");
    }
  }
}

