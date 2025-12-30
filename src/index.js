import express from "express";
import swaggerUi from "swagger-ui-express";
import { WebSocketServer } from "ws";
import { createServer } from "http";

import swaggerSpec from "./swagger.js";
import { safeStringify } from "./utils.js";
import {
  blockContact,
  createGroup,
  deleteSession,
  getConnectionState,
  getLastQr,
  initBaileys,
  startConnection,
  listChats,
  listContacts,
  fetchDeviceContacts,
  listGroups,
  getGroupMetadata,
  listMessages,
  listMessagesWithCursor,
  listBlockedNumbers,
  performLogout,
  listSessions,
  sessionExists,
  checkNumber,
  getProfilePicture,
  sendBulkMessages,
  sendRawMessage,
  downloadMessageMedia,
  sendMediaMessage,
  sendTextMessage,
  updateGroupParticipants,
  markMessagesAsRead,
  deleteMessage,
  replyToMessage,
  forwardMessage,
  editMessage,
  starMessage,
  sendReaction,
  removeReaction,
  sendTyping,
  stopTyping,
  updatePresence,
  updateGroupSettings,
  getGroupInviteLink,
  resetGroupInviteLink,
  updateGroupDescription,
  updateGroupSubject,
  updateGroupPicture,
  archiveChat,
  pinChat,
  muteChat,
  markChatRead,
  deleteMessageForMe,
  deleteChat,
  setDisappearingMessages,
  queryChatHistory,
  subscribeToPresence,
  searchMessages,
  sendLocation,
  sendContactCard,
  createPoll,
  sendButtonMessage,
  sendListMessage,
  sendTemplateMessage,
  sendProductMessage,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  setWebSocketBroadcast,
  restoreSessions,
  refreshContacts,
  syncChats,
  getStatus,
  setStatus,
  setDisappearingMode,
  getDisappearingMode,
  getPrivacySettings,
  updatePrivacySettings,
  getLinkPreview,
  sendMessageWithPreview,
  downloadMediaMessageAdvanced,
  proxyMediaUrl,
  getAudioDuration,
  generateThumbnailForMedia,
  extractImageThumbnail,
  groupLeave,
  checkIsGroup,
  downloadChatHistory,
  getBusinessProfile,
  getCatalog,
  getOrderDetails,
  getProduct,
  generateWAMessageUtil,
  generateWAMessageContentUtil,
  generateWAMessageFromContentUtil,
  decodeJid,
  encodeJid,
  checkIsNewsletter,
  checkIsStatusBroadcast,
  checkIsBot,
  extractChatId,
  prepareMediaMessage,
  getMediaDecryptionKeys,
  calculateMediaHash,
  getMediaExtension,
  getAudioWaveformUtil,
  decryptPollVoteUtil,
  groupUpdate,
  getNewsletterMetadata,
  subscribeToNewsletter,
  unsubscribeFromNewsletter,
  getNewsletterSubscriptions,
  transferDevice,
  configureSuccessfulPairingUtil,
  downloadAndProcessHistorySyncNotificationUtil,
  checkAreJidsSameUser,
  extractUrlFromTextUtil,
  cleanMessageUtil,
  normalizeMessageContentUtil,
  extractMessageContentUtil,
  getMessageContentType,
  checkIsRealMessage,
  checkIsMetaAI,
  checkIsLidUser,
  checkIsPnUser,
  checkIsHostedLidUser,
  checkIsHostedPnUser,
  checkIsWABusinessPlatform,
  addTransactionCapabilityUtil,
  extractDeviceJidsUtil,
  getDeviceUtil,
  getPlatformIdUtil,
  getDecryptionJidUtil,
  getHistoryMessageUtil,
  getCallStatusUtil,
  getAggregateResponsesUtil,
  getAggregateVotesUtil,
  updateMessageWithReactionUtil,
  updateMessageWithReceiptUtil,
  updateMessageWithPollUpdateUtil,
  updateMessageWithEventResponseUtil,
  checkShouldIncrementChatUnread,
  processHistoryMessageUtil,
  processSyncActionUtil,
  prepareDisappearingMessageSettingContentUtil,
  encodeNewsletterMessageUtil,
  downloadExternalBlobUtil,
  downloadExternalPatchUtil,
  downloadEncryptedContentUtil,
  fetchLatestWaWebVersionUtil,
  generateMessageIDUtil,
  generateMessageIDV2Util,
  chatModificationToAppPatchUtil,
  rejectCall,
  pinMessage,
  sendMessageWithMention,
  updateMediaMessage,
  requestPairingCode,
} from "./baileysClient.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

// HTTP server oluştur (WebSocket için gerekli)
const server = createServer(app);

// WebSocket server oluştur
// clientTracking: true - bağlantıları otomatik takip et
// perMessageDeflate: false - performans için sıkıştırmayı kapat
const wss = new WebSocketServer({ 
  server, 
  path: "/ws",
  clientTracking: true,
  perMessageDeflate: false,
  // WebSocket bağlantısını sürekli açık tutmak için timeout'ları artır
  maxPayload: 100 * 1024 * 1024, // 100MB max payload
});

// WebSocket bağlantılarını sakla
const wsClients = new Set();

wss.on("connection", (ws, req) => {
  wsClients.add(ws);

  // WebSocket bağlantısını sürekli açık tutmak için ping-pong mekanizması
  let pingInterval = null;
  let pongTimeout = null;
  let isAlive = true;

  // Ping gönder (her 30 saniyede bir)
  pingInterval = setInterval(() => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        isAlive = false;
        ws.ping();
        
        // Pong gelmezse bağlantıyı kapat
        pongTimeout = setTimeout(() => {
          if (!isAlive) {
            console.warn("[WebSocket] ⚠️ Pong alınamadı, bağlantı kapatılıyor");
            ws.terminate();
          }
        }, 10000); // 10 saniye içinde pong gelmezse kapat
      } catch (error) {
        console.error("[WebSocket] Ping gönderme hatası:", error);
      }
    }
  }, 30000); // 30 saniyede bir ping gönder

  // Pong alındığında isAlive'i true yap
  ws.on("pong", () => {
    isAlive = true;
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      pongTimeout = null;
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
    
    // Interval'leri temizle
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      pongTimeout = null;
    }
  });

  ws.on("error", (error) => {
    console.error("[WebSocket] ❌ Hata:", error);
    
    // Interval'leri temizle
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      pongTimeout = null;
    }
  });

  // WebSocket mesaj handler - request/response mekanizması için
  ws.on("message", async (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());
      
      // Request mesajı mı kontrol et
      if (data.type === 'request' && data.requestId && data.requestType) {
        try {
          let responseData = null;
          
          switch (data.requestType) {
            case 'getSessions':
              // Session listesi gönder
              responseData = listSessions();
              break;
              
            case 'getMessages':
              // Mesaj listesi gönder
              const { sessionId: reqSessionId, chatId, limit: msgLimit = 50, cursor } = data.payload || {};
              if (reqSessionId && chatId) {
                const { listMessages } = await import("./baileys/chats/messages.js");
                const messagesResult = await listMessages(reqSessionId, chatId, cursor, msgLimit);
                responseData = messagesResult.data || [];
              } else {
                throw new Error('sessionId ve chatId gerekli');
              }
              break;
              
            case 'getChats':
              // Chat listesi gönder
              const { sessionId: chatSessionId, limit: chatLimit = 50 } = data.payload || {};
              if (chatSessionId) {
                const chatsResult = await listChats(chatSessionId, null, chatLimit);
                responseData = chatsResult.data || [];
              } else {
                throw new Error('sessionId gerekli');
              }
              break;
              
            case 'getContacts':
              // Contact listesi gönder
              const { sessionId: contactSessionId } = data.payload || {};
              if (contactSessionId) {
                const { listContacts } = await import("./baileys/contacts/list.js");
                const contactsResult = await listContacts(contactSessionId);
                responseData = contactsResult.data || [];
              } else {
                throw new Error('sessionId gerekli');
              }
              break;

            case 'sendReaction':
              // Mesaja reaksiyon gönder
              const { sessionId: reactionSessionId, jid: reactionJid, messageId: reactionMessageId, emoji: reactionEmoji } = data.payload || {};
              if (reactionSessionId && reactionJid && reactionMessageId) {
                const { sendReaction } = await import("./baileys/messages/reactions.js");
                responseData = await sendReaction(reactionSessionId, reactionJid, reactionMessageId, reactionEmoji || "👍");
              } else {
                throw new Error('sessionId, jid ve messageId gerekli');
              }
              break;

            case 'pinMessage':
              // Mesajı sabitle/kaldır
              const { sessionId: pinSessionId, jid: pinJid, messageKey: pinMessageKey, type: pinType, time: pinTime } = data.payload || {};
              if (pinSessionId && pinJid && pinMessageKey) {
                const { pinMessage } = await import("./baileys/messages/special.js");
                responseData = await pinMessage(pinSessionId, pinJid, pinMessageKey, pinType || 1, pinTime || 86400);
              } else {
                throw new Error('sessionId, jid ve messageKey gerekli');
              }
              break;

            case 'starMessage':
              // Mesajı yıldızla/yıldızı kaldır
              const { sessionId: starSessionId, jid: starJid, messageId: starMessageId, star: starValue, fromMe: starFromMe } = data.payload || {};
              if (starSessionId && starJid && starMessageId) {
                const { starMessage } = await import("./baileys/messages/manage.js");
                responseData = await starMessage(starSessionId, starJid, starMessageId, starValue !== false, starFromMe);
              } else {
                throw new Error('sessionId, jid ve messageId gerekli');
              }
              break;

            case 'sendMessage':
              // Mesaj gönder (quoted desteği ile)
              const { sessionId: sendSessionId, jid: sendJid, message: sendMessageText, options: sendOptions } = data.payload || {};
              if (sendSessionId && sendJid && sendMessageText) {
                const { sendTextMessage } = await import("./baileys/messages/send.js");
                responseData = await sendTextMessage({
                  accountId: sendSessionId,
                  to: sendJid,
                  message: sendMessageText,
                  options: sendOptions || {},
                });
              } else {
                throw new Error('sessionId, jid ve message gerekli');
              }
              break;

            case 'replyToMessage':
              // Mesaja yanıt gönder
              const { sessionId: replySessionId, jid: replyJid, messageId: replyMessageId, text: replyText } = data.payload || {};
              if (replySessionId && replyJid && replyMessageId && replyText) {
                const { replyToMessage } = await import("./baileys/messages/edit.js");
                responseData = await replyToMessage(replySessionId, replyJid, replyMessageId, replyText);
              } else {
                throw new Error('sessionId, jid, messageId ve text gerekli');
              }
              break;
              
            default:
              throw new Error(`Bilinmeyen request type: ${data.requestType}`);
          }
          
          // Response gönder
          ws.send(safeStringify({
            type: 'response',
            requestId: data.requestId,
            success: true,
            data: responseData,
          }));
        } catch (error) {
          console.error("[WebSocket] ❌ Request hatası:", error);
          // Hata response gönder
          ws.send(safeStringify({
            type: 'response',
            requestId: data.requestId,
            success: false,
            error: error.message || 'Request failed',
          }));
        }
        return;
      }
    } catch (error) {
      console.error("[WebSocket] ❌ Mesaj parse hatası:", error);
    }
  });

  // İlk bağlantıda mevcut session'ları ve initial data'yı gönder
  const sendInitialData = async () => {
    try {
      // Bağlantı onayı
      ws.send(safeStringify({
        type: "connected",
        message: "WebSocket bağlantısı kuruldu"
      }));

      // Session listesi gönder (temp session'ları filtrele)
      const allSessions = listSessions();
      const validSessions = allSessions.filter(session => !session.id?.startsWith('temp-'));
      ws.send(safeStringify({
        type: "sessions.update",
        sessions: validSessions,
      }));
      
      // Her açık session için chats ve contacts gönder
      for (const session of validSessions) {
        if (session.status === 'open') {
          try {
            // Chats gönder
            const chatsResult = await listChats(session.id, null, 50);
            if (chatsResult.data && chatsResult.data.length > 0) {
              ws.send(safeStringify({
                type: "chats.set",
                sessionId: session.id,
                chats: chatsResult.data,
              }));
            }
            
            // Contacts gönder
            const { listContacts } = await import("./baileys/contacts/list.js");
            const contactsResult = await listContacts(session.id);
            if (contactsResult.data && contactsResult.data.length > 0) {
              ws.send(safeStringify({
                type: "contacts.set",
                sessionId: session.id,
                contacts: contactsResult.data,
              }));
            }
          } catch (error) {
            console.error(`[WebSocket] ❌ Initial data gönderme hatası (${session.id}):`, error);
          }
        }
      }
    } catch (error) {
      console.error("[WebSocket] ❌ Initial data gönderme hatası:", error);
    }
  };

  // Bağlantı açıldığında initial data'yı gönder
  sendInitialData();
});

// WebSocket'e mesaj gönderme fonksiyonu
const broadcastToWebSocket = (data) => {
  const message = safeStringify(data);
  wsClients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error("[WebSocket] Mesaj gönderilemedi:", error);
      }
    }
  });
};

// Baileys'e WebSocket broadcast fonksiyonunu set et
setWebSocketBroadcast(broadcastToWebSocket);

// CORS middleware - Tüm route'lardan önce
app.use((req, res, next) => {
  // Tüm origin'lere izin ver
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // OPTIONS isteği için hemen cevap ver
  if (req.method === 'OPTIONS') {
    res.header('Content-Length', '0');
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json({ limit: "20mb" }));

const asyncHandler =
  (handler) =>
  async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      // Eğer response zaten gönderilmişse, sadece log'la
      if (res.headersSent) {
        console.error('[asyncHandler] Response zaten gönderilmiş, hata loglanıyor:', error);
        return;
      }
      // Response gönderilmemişse, error handler'a gönder
      next(error);
    }
  };

const waitForQrOrStatus = async (sessionId, { timeoutMs = 20000, intervalMs = 200 } = {}) => {
  const started = Date.now();
  let lastState = null;
  
  while (Date.now() - started < timeoutMs) {
    const state = getConnectionState(sessionId);
    if (!state) {
      // State yoksa biraz bekle ve tekrar dene
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    
    lastState = state;
    
    // QR kod geldiyse veya bağlantı açıldıysa döndür
    if (state.lastQr || state.status === "open") {
      return state;
    }
    
    // Hata durumu varsa döndür
    if (state.status === "close" && state.lastError) {
      console.warn(`[waitForQrOrStatus] Bağlantı hatası: ${sessionId}`, state.lastError);
      return state;
    }
    
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  
  // Timeout sonrası mevcut state'i döndür (QR kod gelmemiş olsa bile)
  const finalState = getConnectionState(sessionId) || lastState;
  if (finalState) {
    console.log(`[waitForQrOrStatus] Timeout: ${sessionId}, durum: ${finalState.status}, QR: ${!!finalState.lastQr}`);
  }
  return finalState;
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get(
  "/sessions",
  asyncHandler((_req, res) => {
    const sessions = listSessions();
    res.json(sessions);
  })
);

app.get(
  "/sessions/:sessionId",
  asyncHandler((req, res) => {
    const { sessionId } = req.params;
    if (!sessionExists(sessionId)) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ message: "Session found" });
  })
);

app.get(
  "/sessions/:sessionId/status",
  asyncHandler((req, res) => {
    const { sessionId } = req.params;
    if (!sessionExists(sessionId)) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(getConnectionState(sessionId));
  })
);

app.post(
  "/sessions/add",
  asyncHandler(async (req, res) => {
    let sessionId = null;
    try {
      sessionId = req.body?.sessionId;
      console.log(`[POST /sessions/add] İstek alındı:`, { sessionId, body: req.body });
      
      if (!sessionId) {
        console.error(`[POST /sessions/add] sessionId eksik`);
        return res.status(400).json({ error: "sessionId zorunludur", status: "error" });
      }

      if (sessionExists(sessionId)) {
        console.warn(`[POST /sessions/add] Session zaten var: ${sessionId}`);
        return res.status(400).json({ error: "Session already exists", status: "error" });
      }

      console.log(`[POST /sessions/add] Session oluşturuluyor: ${sessionId}`);
      
      // Session'ı hazırla ve socket'i başlat (QR üretimi için)
      try {
        await initBaileys(sessionId);
        console.log(`[POST /sessions/add] initBaileys tamamlandı: ${sessionId}`);
      } catch (initError) {
        console.error(`[POST /sessions/add] initBaileys hatası: ${sessionId}`, initError);
        return res.status(500).json({ 
          error: `initBaileys hatası: ${initError.message || initError.toString()}`,
          status: "error"
        });
      }
      
      try {
        await startConnection(sessionId);
        console.log(`[POST /sessions/add] startConnection tamamlandı: ${sessionId}`);
      } catch (startError) {
        console.error(`[POST /sessions/add] startConnection hatası: ${sessionId}`, startError);
        return res.status(500).json({ 
          error: `startConnection hatası: ${startError.message || startError.toString()}`,
          status: "error"
        });
      }
      
      // QR kodun gelmesi için bekle (maksimum 20 saniye - artırıldı)
      // QR kod Baileys'in connection.update event'inde gelir
      let state;
      try {
        state = await waitForQrOrStatus(sessionId, { timeoutMs: 20000, intervalMs: 200 });
      } catch (waitError) {
        console.error(`[POST /sessions/add] waitForQrOrStatus hatası: ${sessionId}`, waitError);
        return res.status(500).json({ 
          error: `QR kod beklenirken hata: ${waitError.message || waitError.toString()}`,
          status: "error"
        });
      }
      
      if (!state) {
        console.error(`[POST /sessions/add] State alınamadı: ${sessionId}`);
        return res.status(500).json({ 
          error: "Session state alınamadı",
          status: "error"
        });
      }
      
      // QR kod gelmediyse ama bağlantı açıldıysa, başarılı say
      if (state.status === "open") {
        console.log(`[POST /sessions/add] Bağlantı açıldı: ${sessionId}`);
        return res.json({
          ...state,
          qr: null,
          status: "open"
        });
      }
      
      // QR kod varsa döndür
      if (state.lastQr) {
        console.log(`[POST /sessions/add] QR kod oluşturuldu: ${sessionId}`);
        return res.json({
          ...state,
          qr: state.lastQr,
          status: state.status || "connecting"
        });
      }
      
      // QR kod gelmediyse ama connecting durumundaysa, SSE ile takip etmesi için bilgi ver
      console.warn(`[POST /sessions/add] QR kod henüz gelmedi, SSE ile takip edilmeli: ${sessionId}`);
      return res.json({
        ...state,
        qr: null,
        status: state.status || "connecting",
        message: "QR kod oluşturuluyor, lütfen SSE endpoint'ini kullanarak takip edin"
      });
      
    } catch (error) {
      console.error(`[POST /sessions/add] Beklenmeyen hata: ${sessionId}`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        fullError: error
      });
      
      // Response zaten gönderilmişse, sadece log'la
      if (res.headersSent) {
        console.error(`[POST /sessions/add] Response zaten gönderilmiş, hata loglanıyor`);
        return;
      }
      
      return res.status(500).json({ 
        error: error.message || error.toString() || "Session oluşturulamadı",
        status: "error",
        ...(process.env.NODE_ENV === 'development' && { 
          details: error.stack,
          name: error.name
        })
      });
    }
  })
);

// QR üretimi için bağlantıyı başlat
app.post(
  "/sessions/:sessionId/start",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionExists(sessionId)) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Socket'i başlat (QR üretimi burada tetiklenecek)
    await startConnection(sessionId);
    const state = await waitForQrOrStatus(sessionId);
    res.json(state || { error: "Connection could not be started" });
  })
);

// === REST tarzı Chats API (/api/chats) ===
// DİKKAT: Bunu dinamik "/:sessionId/chats" rotasından ÖNCE tanımlıyoruz ki
// "/api/chats" isteği yanlışlıkla sessionId="api" olarak eşleşmesin.
app.get(
  "/api/chats",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    const limit = Number(req.query.limit) || 50;

    const result = await listChats(accountId, null, limit);
    
    // Sadece hata durumunda log (boş sonuç veya hata varsa)
    if (!result || !result.data || result.data.length === 0 || result.error) {
      console.log(`[GET /api/chats] ⚠️ Hata veya boş sonuç:`, safeStringify(result, 2));
    }
    
    res.json(result);
  })
);

// === REST tarzı Contacts API (/api/contacts) ===
// DİKKAT: Bunu dinamik "/:sessionId/contacts" rotasından ÖNCE tanımlıyoruz ki
// "/api/contacts" isteği yanlışlıkla sessionId="api" olarak eşleşmesin.
app.get(
  "/api/contacts",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    const limit = Number(req.query.limit) || 50;

    const result = await listContacts(accountId, null, limit);
    if (result === null) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    // Sadece hata durumunda log (boş sonuç veya hata varsa)
    if (!result || !result.data || result.data.length === 0 || result.error) {
      console.log(`[GET /api/contacts] ⚠️ Hata veya boş sonuç:`, safeStringify(result, 2));
    }
    
    res.json(result);
  })
);

// SSE ile oturum ekleme (baileys-api-master uyumlu)
// NOT: Bu endpoint artık socket'i otomatik başlatmıyor
// QR üretimi için önce /sessions/:sessionId/start endpoint'ini çağırın
app.get(
  "/sessions/:sessionId/add-sse",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Socket yoksa, önce başlat
    const state = getConnectionState(sessionId);
    if (!state || !state.socketReady) {
      console.log(`[SSE] Socket başlatılıyor: ${sessionId}`);
      await startConnection(sessionId);
      console.log(`[SSE] Socket başlatıldı, QR üretimi bekleniyor...`);
    }

    let updateCount = 0;
    const sendUpdate = () => {
      const state = getConnectionState(sessionId);
      const qr = getLastQr(sessionId);
      const payload = { 
        ...state, 
        qr: qr || state.lastQr || null  // Hem qr hem de lastQr field'larını gönder
      };
      
      // QR kod varsa log'la
      if (qr || state.lastQr) {
        const qrValue = qr || state.lastQr;
        console.log(`[SSE] QR kod gönderiliyor: ${sessionId}, QR uzunluğu: ${qrValue?.length}, updateCount: ${updateCount}`);
      }
      
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        updateCount++;
      } catch (error) {
        console.error(`[SSE] Yazma hatası: ${error.message}`);
        clearInterval(interval);
        res.end();
        return;
      }

      if (state.status === "open") {
        console.log(`[SSE] Bağlantı açıldı, SSE kapatılıyor: ${sessionId}`);
        clearInterval(interval);
        res.end();
      }
    };

    // İlk güncellemeyi hemen gönder
    sendUpdate();
    
    // Daha sık güncelleme gönder (QR'un hemen gelmesi için)
    const interval = setInterval(sendUpdate, 500);

    req.on("close", () => {
      clearInterval(interval);
    });
  })
);

// Oturumu silme
app.delete(
  "/sessions/:sessionId",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionExists(sessionId)) {
      return res.status(404).json({ error: "Session not found" });
    }

    await deleteSession(sessionId);
    
    // WebSocket'e session listesi güncellemesi gönder (temp session'ları filtrele)
    const allSessions = listSessions();
    const validSessions = allSessions.filter(session => !session.id?.startsWith('temp-'));
    broadcastToWebSocket({
      type: "sessions.update",
      sessions: validSessions,
    });
    
    res.json({ status: "deleted" });
  })
);

// === Chats (baileys-api-master yapısına yakın) ===
app.get(
  "/:sessionId/chats",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { cursor, limit } = req.query;

    const result = await listChats(sessionId, cursor, Number(limit) || 25);
    
    // Sadece hata durumunda log (boş sonuç veya hata varsa)
    if (!result || !result.data || result.data.length === 0 || result.error) {
      console.log(`[GET /${sessionId}/chats] ⚠️ Hata veya boş sonuç:`, safeStringify(result, 2));
    }
    
    res.json(result);
  })
);

app.get(
  "/:sessionId/chats/:jid",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { cursor, limit } = req.query;

    const result = await listMessagesWithCursor(
      sessionId,
      jid,
      cursor,
      Number(limit) || 20
    );
    res.json(result);
  })
);

// === Contacts ===
app.get(
  "/:sessionId/contacts",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { cursor, limit } = req.query;
    // Limit belirtilmediyse çok yüksek bir limit kullan (tüm contact'ları çekmek için)
    const contactLimit = limit ? Number(limit) : 100000;
    const result = await listContacts(sessionId, cursor, contactLimit);
    if (result === null) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    // Sadece hata durumunda log (boş sonuç veya hata varsa)
    if (!result || !result.data || result.data.length === 0 || result.error) {
      console.log(`[GET /${sessionId}/contacts] ⚠️ Hata veya boş sonuç:`, safeStringify(result, 2));
    }
    
    res.json(result);
  })
);

// DİKKAT: /contacts/device route'u /contacts/:jid route'undan ÖNCE tanımlanmalı
// yoksa "device" bir jid olarak algılanır ve "Number not found" hatası alınır
app.get(
  "/:sessionId/contacts/device",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    try {
      const result = await fetchDeviceContacts(sessionId);
      
      // Sadece hata durumunda log (boş sonuç veya hata varsa)
      if (!result || !result.data || result.data.length === 0 || result.error) {
        console.log(`[GET /${sessionId}/contacts/device] ⚠️ Hata veya boş sonuç:`, safeStringify(result, 2));
      }
      
      res.json(result);
    } catch (error) {
      console.error(`[GET /${sessionId}/contacts/device] ❌ Hata:`, error);
      res.status(500).json({ 
        data: [], 
        error: error.message || "Cihazdan contact'lar çekilemedi" 
      });
    }
  })
);

app.get(
  "/:sessionId/contacts/blocklist",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const list = await listBlockedNumbers(sessionId);
    res.json({ data: list });
  })
);

app.post(
  "/:sessionId/contacts/blocklist/update",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, action } = req.body;
    if (!jid) {
      return res.status(400).json({ error: "jid zorunludur" });
    }

    const result = await blockContact(
      sessionId,
      jid,
      (action || "block") !== "unblock"
    );
    res.json(result);
  })
);

app.get(
  "/:sessionId/contacts/:jid",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const info = await checkNumber(sessionId, jid);
    if (!info) {
      return res.status(404).json({ error: "Number not found" });
    }

    res.json(info);
  })
);

app.get(
  "/:sessionId/contacts/:jid/photo",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const url = await getProfilePicture(sessionId, jid);
    if (!url) {
      return res.status(404).json({ error: "Profile picture not found" });
    }

    res.json({ url });
  })
);

app.post(
  "/:sessionId/contacts/refresh",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { clearDb } = req.query;
    const result = await refreshContacts(sessionId, { clearDb: clearDb !== "false" });
    res.json(result);
  })
);

// === Chat Sync ===
app.post(
  "/:sessionId/chats/sync",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    console.log(`[POST /${sessionId}/chats/sync] Chat eşitleme başlatılıyor...`);
    try {
      const result = await syncChats(sessionId);
      console.log(`[POST /${sessionId}/chats/sync] ✅ Chat eşitleme tamamlandı:`, result);
      res.json(result);
    } catch (error) {
      console.error(`[POST /${sessionId}/chats/sync] ❌ Chat eşitleme hatası:`, error);
      res.status(500).json({ error: error.message || "Chat eşitleme başarısız oldu" });
    }
  })
);

// === Groups ===
app.get(
  "/:sessionId/groups",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { cursor, limit } = req.query;
    
    try {
      const result = await listGroups(sessionId, cursor, Number(limit) || 50);
      
      // Sadece hata durumunda log (boş sonuç veya hata varsa)
      if (!result || !result.data || result.data.length === 0 || result.error) {
        console.log(`[GET /${sessionId}/groups] ⚠️ Hata veya boş sonuç:`, safeStringify(result, 2));
      }
      
      res.json(result);
    } catch (error) {
      console.error(`[GET /${sessionId}/groups] ❌ Hata:`, error.message);
      console.error(`[GET /${sessionId}/groups] Stack:`, error.stack);
      throw error;
    }
  })
);

app.get(
  "/:sessionId/groups/:jid",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    
    try {
      const group = await getGroupMetadata(sessionId, jid);
      res.json(group);
    } catch (error) {
      if (error.message?.includes("not found") || error?.output?.statusCode === 404) {
        return res.status(404).json({ error: "Group not found" });
      }
      throw error;
    }
  })
);

app.get(
  "/:sessionId/groups/:jid/photo",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const url = await getProfilePicture(sessionId, jid);
    if (!url) {
      return res.status(404).json({ error: "Group profile picture not found" });
    }

    res.json({ url });
  })
);

// === Messages (baileys-api-master benzeri) ===
app.get(
  "/:sessionId/messages",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, cursor, limit } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid zorunludur" });
    }

    const result = await listMessagesWithCursor(
      sessionId,
      jid,
      cursor,
      Number(limit) || 20
    );
    res.json(result);
  })
);

app.post(
  "/:sessionId/messages/send",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, type, message, options } = req.body || {};

    if (!jid || !message) {
      return res
        .status(400)
        .json({ error: "jid ve message alanları zorunludur" });
    }

    let result;
    if (type === "text" && typeof message === "string") {
      result = await sendTextMessage({
        accountId: sessionId,
        to: jid,
        message,
        options,
      });
    } else if (type === "media" && message.media && message.mimetype) {
      // Medya mesajı gönder
      const { media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt } = message;
      result = await sendMediaMessage({
        accountId: sessionId,
        to: jid,
        media,
        mimetype,
        caption,
        viewOnce,
        gifPlayback,
        ptv,
        ptt,
      });
    } else {
      result = await sendRawMessage(sessionId, jid, message, options);
    }

    res.status(202).json(result);
  })
);

app.post(
  "/:sessionId/messages/send/bulk",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const items = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Gönderilecek mesaj listesi boş" });
    }

    const result = await sendBulkMessages(sessionId, items);
    res.status(202).json({ data: result });
  })
);

// ========== INTERACTIVE MESSAGES (Business Features) ==========

// Butonlu mesaj gönder
app.post(
  "/:sessionId/messages/send/button",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, text, buttons, footer, header } = req.body || {};

    if (!jid || !text || !buttons || buttons.length === 0) {
      return res.status(400).json({ 
        error: "jid, text ve buttons alanları zorunludur" 
      });
    }

    const result = await sendButtonMessage(
      sessionId,
      jid,
      text,
      buttons,
      footer,
      header
    );
    res.status(202).json(result);
  })
);

// Liste mesajı gönder
app.post(
  "/:sessionId/messages/send/list",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, text, title, buttonText, sections, footer } = req.body || {};

    if (!jid || !text || !buttonText || !sections || sections.length === 0) {
      return res.status(400).json({ 
        error: "jid, text, buttonText ve sections alanları zorunludur" 
      });
    }
    
    // Title opsiyonel ama genellikle kullanılır
    if (!title || !title.trim()) {
      // Title yoksa varsayılan bir title kullan
      title = "Seçenekler";
    }

    const result = await sendListMessage(
      sessionId,
      jid,
      text,
      title,
      buttonText,
      sections,
      footer
    );
    res.status(202).json(result);
  })
);

// Şablon mesajı gönder
app.post(
  "/:sessionId/messages/send/template",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, templateName, languageCode = "tr", components = [] } = req.body || {};

    if (!jid || !templateName) {
      return res.status(400).json({ 
        error: "jid ve templateName alanları zorunludur" 
      });
    }

    const result = await sendTemplateMessage(
      sessionId,
      jid,
      templateName,
      languageCode,
      components
    );
    res.status(202).json(result);
  })
);

// Ürün mesajı gönder
app.post(
  "/:sessionId/messages/send/product",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, text, productList, businessOwnerJid, footer, thumbnail } = req.body || {};

    if (!jid || !text || !productList || !businessOwnerJid) {
      return res.status(400).json({ 
        error: "jid, text, productList ve businessOwnerJid alanları zorunludur" 
      });
    }

    const result = await sendProductMessage(
      sessionId,
      jid,
      text,
      productList,
      businessOwnerJid,
      footer,
      thumbnail
    );
    res.status(202).json(result);
  })
);

// ========== MESSAGE TEMPLATES (CRUD) ==========

// Tüm şablonları listele
app.get(
  "/:sessionId/templates",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const templates = await listTemplates(sessionId);
    res.json({ data: templates });
  })
);

// Global şablonları listele (tüm session'lar için)
app.get(
  "/api/templates",
  asyncHandler(async (req, res) => {
    const templates = await listTemplates(null);
    res.json({ data: templates });
  })
);

// Şablon oluştur
app.post(
  "/:sessionId/templates",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { name, type, data } = req.body || {};

    if (!name || !type || !data) {
      return res.status(400).json({ 
        error: "name, type ve data alanları zorunludur" 
      });
    }

    const template = await createTemplate(sessionId, name, type, data);
    res.status(201).json({ data: template });
  })
);

// Şablon güncelle
app.put(
  "/:sessionId/templates/:templateId",
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const updates = req.body || {};

    const template = await updateTemplate(templateId, updates);
    res.json(template);
  })
);

// Şablon sil
app.delete(
  "/:sessionId/templates/:templateId",
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    await deleteTemplate(templateId);
    res.json({ success: true });
  })
);

// Şablon getir
app.get(
  "/:sessionId/templates/:templateId",
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const template = await getTemplate(templateId);
    res.json(template);
  })
);

app.post(
  "/:sessionId/messages/download",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { message, mediaType } = req.body || {};

    if (!message || !mediaType) {
      return res
        .status(400)
        .json({ error: "message ve mediaType alanları zorunludur" });
    }

    const base64 = await downloadMessageMedia(sessionId, message, mediaType);
    res.json({ data: base64 });
  })
);

app.get(
  "/api/status",
  asyncHandler((req, res) => {
    const accountId = req.query.accountId;
    const state = getConnectionState(accountId);
    if (!state) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(state);
  })
);

app.get(
  "/api/qr",
  asyncHandler((req, res) => {
    // Güvenlik/istek gereği devre dışı
    return res.status(410).json({ error: "QR endpoint devre dışı bırakıldı." });
  })
);

app.get(
  "/api/messages/:jid",
  asyncHandler(async (req, res) => {
    const { jid } = req.params;
    const limit = Number(req.query.limit) || 20;
    const accountId = req.query.accountId;
    const result = await listMessages(accountId, jid, null, limit);
    res.json(result);
  })
);

app.post(
  "/api/messages/text",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    const { to, message, options } = req.body;
    const result = await sendTextMessage({ accountId, to, message, options });
    res.status(202).json(result);
  })
);

app.post(
  "/api/messages/media",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    const { to, media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt } = req.body;
    const result = await sendMediaMessage({ accountId, to, media, mimetype, caption, viewOnce, gifPlayback, ptv, ptt });
    res.status(202).json(result);
  })
);

app.post(
  "/api/groups",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    const { subject, participants } = req.body;
    const result = await createGroup(accountId, subject, participants);
    res.status(201).json(result);
  })
);

app.patch(
  "/api/groups/:jid/participants",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    const { jid } = req.params;
    const { participants, action } = req.body;
    const result = await updateGroupParticipants(accountId, jid, participants, action);
    res.json(result);
  })
);

// ========== MESAJ YÖNETİMİ ==========

// Mesajları okundu olarak işaretle
app.post(
  "/:sessionId/messages/read",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, messageIds } = req.body;

    if (!jid) {
      return res.status(400).json({ error: "jid zorunludur" });
    }

    const result = await markMessagesAsRead(sessionId, jid, messageIds || []);
    res.json(result);
  })
);

// Mesaj sil
app.delete(
  "/:sessionId/messages/:jid/:messageId",
  asyncHandler(async (req, res) => {
    const { sessionId, jid, messageId } = req.params;
    const { deleteForEveryone } = req.query;

    const result = await deleteMessage(
      sessionId,
      jid,
      messageId,
      deleteForEveryone === "true"
    );
    res.json(result);
  })
);

// Mesaj yanıtla
app.post(
  "/:sessionId/messages/reply",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, messageId, message } = req.body;

    if (!jid || !messageId || !message) {
      return res.status(400).json({ error: "jid, messageId ve message zorunludur" });
    }

    const result = await replyToMessage(sessionId, jid, messageId, message);
    res.status(202).json(result);
  })
);

// Mesaj ilet
app.post(
  "/:sessionId/messages/forward",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { fromJid, toJid, messageId } = req.body;

    if (!fromJid || !toJid || !messageId) {
      return res.status(400).json({ error: "fromJid, toJid ve messageId zorunludur" });
    }

    const result = await forwardMessage(sessionId, fromJid, toJid, messageId);
    res.status(202).json(result);
  })
);

// Mesaj düzenle
app.patch(
  "/:sessionId/messages/:jid/:messageId",
  asyncHandler(async (req, res) => {
    const { sessionId, jid, messageId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message zorunludur" });
    }

    try {
      const result = await editMessage(sessionId, jid, messageId, message);
      
      // Result objesini güvenli şekilde serialize et (BigInt sorunlarını önle)
      const safeResult = {
        status: result.status || "edited",
        messageId: result.messageId || messageId,
        jid: result.jid || jid,
        // result.key gibi BigInt içerebilecek objeleri stringify et
        ...(result.result && { result: JSON.parse(JSON.stringify(result.result, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        ))})
      };
      
      res.json(safeResult);
    } catch (error) {
      console.error('[PATCH /:sessionId/messages/:jid/:messageId] Hata:', error);
      throw error; // asyncHandler yakalayacak
    }
  })
);

// ========== REAKSİYONLAR ==========

// Mesaja reaksiyon gönder
app.post(
  "/:sessionId/messages/reaction",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, messageId, emoji } = req.body;

    if (!jid || !messageId) {
      return res.status(400).json({ error: "jid ve messageId zorunludur" });
    }

    const result = await sendReaction(sessionId, jid, messageId, emoji || "👍");
    res.status(202).json(result);
  })
);

// Reaksiyonu kaldır
app.delete(
  "/:sessionId/messages/reaction",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, messageId } = req.query;

    if (!jid || !messageId) {
      return res.status(400).json({ error: "jid ve messageId zorunludur" });
    }

    const result = await removeReaction(sessionId, jid, messageId);
    res.json(result);
  })
);

// Mesaj yıldızla/yıldızı kaldır
app.post(
  "/:sessionId/messages/star",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, messageId, star } = req.body;

    if (!jid || !messageId) {
      return res.status(400).json({ error: "jid ve messageId zorunludur" });
    }

    const result = await starMessage(sessionId, jid, messageId, star !== false);
    res.json(result);
  })
);

// ========== DURUM GÖSTERGELERİ ==========

// Yazıyor göstergesi gönder
app.post(
  "/:sessionId/presence/typing",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, duration } = req.body;

    if (!jid) {
      return res.status(400).json({ error: "jid zorunludur" });
    }

    const result = await sendTyping(sessionId, jid, duration || 5000);
    res.json(result);
  })
);

// Yazmayı durdur
app.post(
  "/:sessionId/presence/stop-typing",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid } = req.body;

    if (!jid) {
      return res.status(400).json({ error: "jid zorunludur" });
    }

    const result = await stopTyping(sessionId, jid);
    res.json(result);
  })
);

// Durum güncelle
app.post(
  "/:sessionId/presence",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, presence } = req.body;

    if (!presence) {
      return res.status(400).json({ error: "presence zorunludur (available, unavailable, composing, recording)" });
    }

    const result = await updatePresence(sessionId, jid, presence);
    res.json(result);
  })
);

// ========== GRUP YÖNETİMİ ==========

// Grup ayarlarını güncelle
app.patch(
  "/:sessionId/groups/:jid/settings",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { restrict, announce } = req.body;

    const result = await updateGroupSettings(sessionId, jid, { restrict, announce });
    res.json(result);
  })
);

// Grup davet linki al
app.get(
  "/:sessionId/groups/:jid/invite-link",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { reset } = req.query;

    const result = await getGroupInviteLink(sessionId, jid, reset === "true");
    res.json(result);
  })
);

// Grup davet linkini sıfırla
app.post(
  "/:sessionId/groups/:jid/invite-link/reset",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;

    const result = await resetGroupInviteLink(sessionId, jid);
    res.json(result);
  })
);

// Grup açıklamasını güncelle
app.patch(
  "/:sessionId/groups/:jid/description",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: "description zorunludur" });
    }

    const result = await updateGroupDescription(sessionId, jid, description);
    res.json(result);
  })
);

// Grup adını güncelle
app.patch(
  "/:sessionId/groups/:jid/subject",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { subject } = req.body;

    if (!subject) {
      return res.status(400).json({ error: "subject zorunludur" });
    }

    const result = await updateGroupSubject(sessionId, jid, subject);
    res.json(result);
  })
);

// Grup fotoğrafını güncelle
app.post(
  "/:sessionId/groups/:jid/picture",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "image (base64) zorunludur" });
    }

    const result = await updateGroupPicture(sessionId, jid, image);
    res.json(result);
  })
);

// ========== SOHBET YÖNETİMİ ==========

// Sohbeti arşivle/kaldır (README'ye göre - lastMessage gereklidir)
app.post(
  "/:sessionId/chats/:jid/archive",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { archive, lastMessage } = req.body;

    const result = await archiveChat(sessionId, jid, archive !== false, lastMessage || null);
    res.json(result);
  })
);

// Sohbeti sabitle/kaldır
app.post(
  "/:sessionId/chats/:jid/pin",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { pin } = req.body;

    const result = await pinChat(sessionId, jid, pin !== false);
    res.json(result);
  })
);

// Sohbeti sessize al/kaldır (README'ye göre - milliseconds cinsinden)
app.post(
  "/:sessionId/chats/:jid/mute",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { durationMs } = req.body; // milliseconds cinsinden (8h: 86400000, 7d: 604800000), null ise sessizliği kaldır

    const result = await muteChat(sessionId, jid, durationMs || null);
    res.json(result);
  })
);

// Sohbeti okundu/okunmadı olarak işaretle (Mark Chat Read/Unread) - README'ye göre
app.post(
  "/:sessionId/chats/:jid/mark-read",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { markRead, lastMessage } = req.body;

    const result = await markChatRead(sessionId, jid, markRead !== false, lastMessage || null);
    res.json(result);
  })
);

// Mesajı sadece benim için sil (Delete Message for Me) - README'ye göre
app.post(
  "/:sessionId/chats/:jid/messages/:messageId/delete-for-me",
  asyncHandler(async (req, res) => {
    const { sessionId, jid, messageId } = req.params;
    const { fromMe } = req.body;

    const result = await deleteMessageForMe(sessionId, jid, messageId, fromMe);
    res.json(result);
  })
);

// Sohbeti sil (Delete a Chat) - README'ye göre
app.delete(
  "/:sessionId/chats/:jid",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { lastMessage } = req.body;

    const result = await deleteChat(sessionId, jid, lastMessage || null);
    res.json(result);
  })
);

// Disappearing Messages ayarla (Geçici Mesajlar) - README'ye göre
app.post(
  "/:sessionId/chats/:jid/disappearing-messages",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { duration } = req.body; // seconds cinsinden (0 = kapalı, 86400 = 24h, 604800 = 7d, 7776000 = 90d)

    const result = await setDisappearingMessages(sessionId, jid, duration !== undefined ? duration : 0);
    res.json(result);
  })
);

// Chat geçmişi sorgula (Query Chat History) - README'ye göre
app.post(
  "/:sessionId/chats/:jid/history/query",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { quantity, oldestMessage } = req.body;

    const result = await queryChatHistory(sessionId, jid, quantity || 50, oldestMessage || null);
    res.json(result);
  })
);

// Presence dinle (Fetch Someone's Presence) - README'ye göre
app.post(
  "/:sessionId/presence/subscribe",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid } = req.body;

    if (!jid) {
      return res.status(400).json({ error: "jid zorunludur" });
    }

    const result = await subscribeToPresence(sessionId, jid);
    res.json(result);
  })
);

// ========== MESAJ ARAMA ==========

// Mesaj ara
app.get(
  "/:sessionId/messages/search",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { query, jid, limit, fromDate, toDate } = req.query;

    const result = await searchMessages(sessionId, query, {
      jid,
      limit: limit ? Number(limit) : 50,
      fromDate,
      toDate,
    });
    res.json(result);
  })
);

// ========== DİĞER ÖZELLİKLER ==========

// Konum gönder
app.post(
  "/:sessionId/messages/location",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, latitude, longitude, name } = req.body;

    if (!jid || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "jid, latitude ve longitude zorunludur" });
    }

    const result = await sendLocation(sessionId, jid, latitude, longitude, name);
    res.status(202).json(result);
  })
);

// Kişi kartı gönder
app.post(
  "/:sessionId/messages/contact",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, contact } = req.body;

    if (!jid || !contact) {
      return res.status(400).json({ error: "jid ve contact zorunludur" });
    }

    const result = await sendContactCard(sessionId, jid, contact);
    res.status(202).json(result);
  })
);

// Anket oluştur
app.post(
  "/:sessionId/messages/poll",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, question, options, selectableCount, toAnnouncementGroup } = req.body;

    if (!jid || !question || !options || !Array.isArray(options)) {
      return res.status(400).json({ error: "jid, question ve options (array) zorunludur" });
    }

    const result = await createPoll(sessionId, jid, question, options, selectableCount, toAnnouncementGroup);
    res.status(202).json(result);
  })
);

// Mesaj pin/unpin (README'ye göre)
app.post(
  "/:sessionId/messages/pin",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, messageKey, type, time } = req.body;

    if (!jid || !messageKey) {
      return res.status(400).json({ error: "jid ve messageKey zorunludur" });
    }

    const result = await pinMessage(sessionId, jid, messageKey, type || 1, time || 86400);
    res.status(202).json(result);
  })
);

// Mention ile mesaj gönder (README'ye göre)
app.post(
  "/:sessionId/messages/mention",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, text, mentions } = req.body;

    if (!jid || !text) {
      return res.status(400).json({ error: "jid ve text zorunludur" });
    }

    const result = await sendMessageWithMention(sessionId, jid, text, mentions || []);
    res.status(202).json(result);
  })
);

// Arama reddet (Reject Call) - README'ye göre
app.post(
  "/:sessionId/calls/reject",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { callId, callFrom } = req.body;

    if (!callId || !callFrom) {
      return res.status(400).json({ error: "callId ve callFrom zorunludur" });
    }

    const result = await rejectCall(sessionId, callId, callFrom);
    res.json(result);
  })
);

// Medya mesajını yeniden yükle (Re-upload Media Message) - README'ye göre
app.post(
  "/:sessionId/messages/media/reupload",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = await updateMediaMessage(sessionId, message);
    res.json(result);
  })
);

// Pairing Code iste (README'ye göre)
app.post(
  "/:sessionId/pairing-code",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber zorunludur (sadece rakamlar, + veya () veya - olmadan)" });
    }

    const result = await requestPairingCode(sessionId, phoneNumber);
    res.json(result);
  })
);

// ========== STATUS (STORY) ÖZELLİKLERİ ==========

// Status mesajlarını çekme
app.get(
  "/:sessionId/status",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const result = await getStatus(sessionId);
    res.json(result);
  })
);

// Status mesajı gönderme
app.post(
  "/:sessionId/status",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { statusContent } = req.body;

    if (!statusContent) {
      return res.status(400).json({ error: "statusContent zorunludur" });
    }

    const result = await setStatus(sessionId, statusContent);
    res.status(202).json(result);
  })
);

// ========== DISAPPEARING MESSAGES ==========

// Geçici mesaj modunu ayarlama
app.post(
  "/:sessionId/chats/:jid/disappearing",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { duration } = req.body;

    if (duration === undefined) {
      return res.status(400).json({ error: "duration zorunludur (0, 86400, 604800, 7776000)" });
    }

    const result = await setDisappearingMode(sessionId, jid, duration);
    res.json(result);
  })
);

// Mevcut disappearing mode'u çekme
app.get(
  "/:sessionId/chats/:jid/disappearing",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const result = await getDisappearingMode(sessionId, jid);
    res.json(result);
  })
);

// ========== PRIVACY SETTINGS ==========

// Gizlilik ayarlarını çekme
app.get(
  "/:sessionId/privacy",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const result = await getPrivacySettings(sessionId);
    res.json(result);
  })
);

// Gizlilik ayarlarını güncelleme
app.patch(
  "/:sessionId/privacy",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { settings } = req.body;

    if (!settings) {
      return res.status(400).json({ error: "settings objesi zorunludur" });
    }

    const result = await updatePrivacySettings(sessionId, settings);
    res.json(result);
  })
);

// ========== LINK PREVIEW ==========

// URL bilgilerini çekme
app.get(
  "/api/link-preview",
  asyncHandler(async (req, res) => {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "url query parametresi zorunludur" });
    }

    const result = await getLinkPreview(url);
    res.json(result);
  })
);

// Mesaj gönderirken link preview ekleme
app.post(
  "/:sessionId/messages/send-with-preview",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, text } = req.body;

    if (!jid || !text) {
      return res.status(400).json({ error: "jid ve text zorunludur" });
    }

    const result = await sendMessageWithPreview(sessionId, jid, text);
    res.status(202).json(result);
  })
);

// ========== MEDYA İYİLEŞTİRMELERİ ==========

// Gelişmiş medya indirme
app.post(
  "/:sessionId/messages/download-advanced",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    let { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    // Mesaj yapısını kontrol et ve düzelt (Baileys'in beklediği formata çevir)
    const messageType = message.type || (message.message ? Object.keys(message.message)[0] : null);
    
    // Eğer message.message yoksa ve sadece type varsa, message.message yapısını oluştur
    if (!message.message && messageType) {
      // Frontend'den gelen mesaj yapısını Baileys formatına çevir
      if (messageType === 'audioMessage' || messageType === 'audio' || messageType === 'ptt') {
        // Eğer audioMessage objesi varsa onu kullan, yoksa boş obje oluştur
        message.message = {
          audioMessage: message.message?.audioMessage || message.audioMessage || {}
        };
      } else if (messageType === 'imageMessage' || messageType === 'image') {
        message.message = {
          imageMessage: message.message?.imageMessage || message.imageMessage || {}
        };
      } else if (messageType === 'videoMessage' || messageType === 'video') {
        message.message = {
          videoMessage: message.message?.videoMessage || message.videoMessage || {}
        };
      } else if (messageType === 'documentMessage' || messageType === 'document') {
        message.message = {
          documentMessage: message.message?.documentMessage || message.documentMessage || {}
        };
      } else if (messageType === 'stickerMessage' || messageType === 'sticker') {
        message.message = {
          stickerMessage: message.message?.stickerMessage || message.stickerMessage || {}
        };
      }
    }

    const result = await downloadMediaMessageAdvanced(sessionId, message);
    res.json(result);
  })
);

// Medya URL proxy - .enc sorununu kalıcı çözer, direkt görsel döner
app.post(
  "/:sessionId/media/proxy",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { message, mimetype } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = await proxyMediaUrl(sessionId, message, mimetype);
    
    // Direkt görsel olarak döndür (Content-Type ile)
    res.setHeader('Content-Type', result.mimetype);
    res.setHeader('Content-Disposition', 'inline'); // Download değil, görüntüle
    res.send(result.buffer);
  })
);

// Ses dosyası süresi
app.post(
  "/api/audio/duration",
  asyncHandler(async (req, res) => {
    const { audioBuffer } = req.body;

    if (!audioBuffer) {
      return res.status(400).json({ error: "audioBuffer (base64) zorunludur" });
    }

    const buffer = Buffer.from(audioBuffer, "base64");
    const result = await getAudioDuration(buffer);
    res.json(result);
  })
);

// Thumbnail oluşturma
app.post(
  "/api/media/thumbnail",
  asyncHandler(async (req, res) => {
    const { mediaBuffer, mediaType } = req.body;

    if (!mediaBuffer || !mediaType) {
      return res.status(400).json({ error: "mediaBuffer (base64) ve mediaType zorunludur" });
    }

    const buffer = Buffer.from(mediaBuffer, "base64");
    const result = await generateThumbnailForMedia(buffer, mediaType);
    res.json(result);
  })
);

// Image thumbnail çıkarma
app.post(
  "/api/image/thumbnail",
  asyncHandler(async (req, res) => {
    const { imageBuffer } = req.body;

    if (!imageBuffer) {
      return res.status(400).json({ error: "imageBuffer (base64) zorunludur" });
    }

    const buffer = Buffer.from(imageBuffer, "base64");
    const result = await extractImageThumbnail(buffer);
    res.json(result);
  })
);

// ========== GRUP İYİLEŞTİRMELERİ ==========

// Gruptan ayrılma
app.post(
  "/:sessionId/groups/:jid/leave",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const result = await groupLeave(sessionId, jid);
    res.json(result);
  })
);

// Grup kontrolü
app.get(
  "/api/check-group",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isGroup = checkIsGroup(jid);
    res.json({ isGroup, jid });
  })
);

// ========== CHAT BACKUP ==========

// Chat geçmişi indirme (History Sync Notification işleme)
app.post(
  "/:sessionId/chats/history",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { historySyncNotification, options } = req.body;

    if (!historySyncNotification) {
      return res.status(400).json({ error: "historySyncNotification objesi zorunludur" });
    }

    const result = await downloadChatHistory(sessionId, historySyncNotification, options || {});
    res.json(result);
  })
);

// ========== BUSINESS ÖZELLİKLERİ ==========

// Business profil bilgilerini çekme
app.get(
  "/:sessionId/business/:jid/profile",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const result = await getBusinessProfile(sessionId, jid);
    res.json(result);
  })
);

// Business katalog çekme
app.get(
  "/:sessionId/business/:jid/catalog",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const result = await getCatalog(sessionId, jid);
    res.json(result);
  })
);

// Sipariş detaylarını çekme
app.get(
  "/:sessionId/business/orders/:orderId",
  asyncHandler(async (req, res) => {
    const { sessionId, orderId } = req.params;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "token query parametresi zorunludur" });
    }

    const result = await getOrderDetails(sessionId, orderId, token);
    res.json(result);
  })
);

// Ürün bilgilerini çekme
app.get(
  "/:sessionId/business/:jid/products",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { productIds } = req.query;

    if (!productIds) {
      return res.status(400).json({ error: "productIds query parametresi zorunludur (comma-separated)" });
    }

    const ids = productIds.split(",").map(id => id.trim());
    const result = await getProduct(sessionId, jid, ids);
    res.json(result);
  })
);

// ========== UTILITY FUNCTIONS (WAMessage) ==========

// WAMessage oluşturma
app.post(
  "/:sessionId/utils/wamessage/generate",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, content, options } = req.body;

    if (!jid || !content) {
      return res.status(400).json({ error: "jid ve content zorunludur" });
    }

    const result = await generateWAMessageUtil(sessionId, jid, content, options || {});
    res.json(result);
  })
);

// WAMessage içeriği oluşturma
app.post(
  "/api/utils/wamessage/content",
  asyncHandler(async (req, res) => {
    const { message, options } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message zorunludur" });
    }

    const result = await generateWAMessageContentUtil(message, options || {});
    res.json(result);
  })
);

// İçerikten WAMessage oluşturma
app.post(
  "/api/utils/wamessage/from-content",
  asyncHandler(async (req, res) => {
    const { jid, message, options } = req.body;

    if (!jid || !message) {
      return res.status(400).json({ error: "jid ve message zorunludur" });
    }

    const result = generateWAMessageFromContentUtil(jid, message, options || {});
    res.json(result);
  })
);

// ========== JID UTILITIES ==========

// JID decode etme
app.get(
  "/api/utils/jid/decode",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const result = decodeJid(jid);
    res.json(result);
  })
);

// JID encode etme
app.get(
  "/api/utils/jid/encode",
  asyncHandler(async (req, res) => {
    const { user, server, device } = req.query;

    if (!user || !server) {
      return res.status(400).json({ error: "user ve server query parametreleri zorunludur" });
    }

    const result = encodeJid(user, server, device);
    res.json(result);
  })
);

// Newsletter JID kontrolü
app.get(
  "/api/utils/jid/check-newsletter",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isNewsletter = checkIsNewsletter(jid);
    res.json({ isNewsletter, jid });
  })
);

// Status broadcast JID kontrolü
app.get(
  "/api/utils/jid/check-status-broadcast",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isStatusBroadcast = checkIsStatusBroadcast(jid);
    res.json({ isStatusBroadcast, jid });
  })
);

// Bot JID kontrolü
app.get(
  "/api/utils/jid/check-bot",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isBot = checkIsBot(jid);
    res.json({ isBot, jid });
  })
);

// Chat ID çıkarma
app.get(
  "/api/utils/jid/extract-chat-id",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const result = extractChatId(jid);
    res.json(result);
  })
);

// ========== MEDIA UTILITIES ==========

// Medya mesajı hazırlama
app.post(
  "/:sessionId/utils/media/prepare",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { media, mediaType, options } = req.body;

    if (!media || !mediaType) {
      return res.status(400).json({ error: "media ve mediaType zorunludur" });
    }

    const result = await prepareMediaMessage(sessionId, media, mediaType, options || {});
    res.json(result);
  })
);

// Medya şifreleme anahtarları
app.post(
  "/api/utils/media/keys",
  asyncHandler(async (req, res) => {
    const { buffer, mediaType } = req.body;

    if (!buffer || !mediaType) {
      return res.status(400).json({ error: "buffer (base64) ve mediaType zorunludur" });
    }

    const bufferObj = Buffer.from(buffer, "base64");
    const result = await getMediaDecryptionKeys(bufferObj, mediaType);
    res.json(result);
  })
);

// Medya hash hesaplama
app.post(
  "/api/utils/media/hash",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = calculateMediaHash(message);
    res.json(result);
  })
);

// Medya uzantısı belirleme
app.post(
  "/api/utils/media/extension",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = getMediaExtension(message);
    res.json(result);
  })
);

// Ses dalga formu
app.post(
  "/api/utils/audio/waveform",
  asyncHandler(async (req, res) => {
    const { audioBuffer } = req.body;

    if (!audioBuffer) {
      return res.status(400).json({ error: "audioBuffer (base64) zorunludur" });
    }

    const buffer = Buffer.from(audioBuffer, "base64");
    const result = await getAudioWaveformUtil(buffer);
    res.json(result);
  })
);

// ========== POLL UTILITIES ==========

// Anket oyu decrypt etme
app.post(
  "/api/utils/poll/decrypt-vote",
  asyncHandler(async (req, res) => {
    const { vote, ctx } = req.body;

    if (!vote || !ctx) {
      return res.status(400).json({ error: "vote ve ctx objeleri zorunludur" });
    }

    const result = decryptPollVoteUtil(vote, ctx);
    res.json(result);
  })
);

// ========== GRUP GÜNCELLEMELERİ ==========

// Grup güncelleme (genel)
app.patch(
  "/:sessionId/groups/:jid/update",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { updates } = req.body;

    if (!updates) {
      return res.status(400).json({ error: "updates objesi zorunludur" });
    }

    const result = await groupUpdate(sessionId, jid, updates);
    res.json(result);
  })
);

// ========== NEWSLETTER OPERATIONS ==========

// Newsletter metadata çekme
app.get(
  "/:sessionId/newsletters/:jid/metadata",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const result = await getNewsletterMetadata(sessionId, jid);
    res.json(result);
  })
);

// Newsletter'a abone olma
app.post(
  "/:sessionId/newsletters/:jid/subscribe",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const result = await subscribeToNewsletter(sessionId, jid);
    res.json(result);
  })
);

// Newsletter aboneliğini iptal etme
app.post(
  "/:sessionId/newsletters/:jid/unsubscribe",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const result = await unsubscribeFromNewsletter(sessionId, jid);
    res.json(result);
  })
);

// Newsletter aboneliklerini listeleme
app.get(
  "/:sessionId/newsletters/subscriptions",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const result = await getNewsletterSubscriptions(sessionId);
    res.json(result);
  })
);

// ========== ADVANCED FEATURES ==========

// Cihaz transferi
app.post(
  "/:sessionId/device/transfer",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { targetJid, options } = req.body;

    const result = await transferDevice(sessionId, targetJid, options || {});
    res.json(result);
  })
);

// Pairing yapılandırması
app.post(
  "/:sessionId/device/pairing/configure",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { pairingData } = req.body;

    if (!pairingData) {
      return res.status(400).json({ error: "pairingData objesi zorunludur" });
    }

    const result = await configureSuccessfulPairingUtil(sessionId, pairingData);
    res.json(result);
  })
);

// History sync notification işleme
app.post(
  "/:sessionId/history/process-notification",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { notification, options } = req.body;

    if (!notification) {
      return res.status(400).json({ error: "notification objesi zorunludur" });
    }

    const result = await downloadAndProcessHistorySyncNotificationUtil(sessionId, notification, options || {});
    res.json(result);
  })
);

// ========== MESSAGE UTILITIES ==========

// İki JID'in aynı kullanıcıya ait olup olmadığını kontrol etme
app.get(
  "/api/utils/jid/same-user",
  asyncHandler(async (req, res) => {
    const { jid1, jid2 } = req.query;

    if (!jid1 || !jid2) {
      return res.status(400).json({ error: "jid1 ve jid2 query parametreleri zorunludur" });
    }

    const result = checkAreJidsSameUser(jid1, jid2);
    res.json(result);
  })
);

// Metinden URL çıkarma
app.get(
  "/api/utils/text/extract-url",
  asyncHandler(async (req, res) => {
    const { text } = req.query;

    if (!text) {
      return res.status(400).json({ error: "text query parametresi zorunludur" });
    }

    const result = extractUrlFromTextUtil(text);
    res.json(result);
  })
);

// Mesaj temizleme
app.post(
  "/:sessionId/utils/message/clean",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { message, meId, meLid } = req.body;

    if (!message || !meId || !meLid) {
      return res.status(400).json({ error: "message, meId ve meLid zorunludur" });
    }

    const result = cleanMessageUtil(sessionId, message, meId, meLid);
    res.json(result);
  })
);

// Mesaj içeriğini normalize etme
app.post(
  "/api/utils/message/normalize-content",
  asyncHandler(async (req, res) => {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: "content objesi zorunludur" });
    }

    const result = normalizeMessageContentUtil(content);
    res.json(result);
  })
);

// Mesaj içeriğini çıkarma
app.post(
  "/api/utils/message/extract-content",
  asyncHandler(async (req, res) => {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: "content objesi zorunludur" });
    }

    const result = extractMessageContentUtil(content);
    res.json(result);
  })
);

// Mesaj tipini belirleme
app.post(
  "/api/utils/message/content-type",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = getMessageContentType(message);
    res.json(result);
  })
);

// Gerçek mesaj kontrolü
app.post(
  "/api/utils/message/is-real",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = checkIsRealMessage(message);
    res.json(result);
  })
);

// ========== JID UTILITIES (Ek) ==========

// Meta AI JID kontrolü
app.get(
  "/api/utils/jid/check-meta-ai",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isMetaAI = checkIsMetaAI(jid);
    res.json({ isMetaAI, jid });
  })
);

// LID kullanıcı kontrolü
app.get(
  "/api/utils/jid/check-lid-user",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isLidUser = checkIsLidUser(jid);
    res.json({ isLidUser, jid });
  })
);

// Pn kullanıcı kontrolü
app.get(
  "/api/utils/jid/check-pn-user",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isPnUser = checkIsPnUser(jid);
    res.json({ isPnUser, jid });
  })
);

// Hosted LID kullanıcı kontrolü
app.get(
  "/api/utils/jid/check-hosted-lid-user",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isHostedLidUser = checkIsHostedLidUser(jid);
    res.json({ isHostedLidUser, jid });
  })
);

// Hosted Pn kullanıcı kontrolü
app.get(
  "/api/utils/jid/check-hosted-pn-user",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isHostedPnUser = checkIsHostedPnUser(jid);
    res.json({ isHostedPnUser, jid });
  })
);

// Business platform kontrolü
app.get(
  "/api/utils/jid/check-business-platform",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const isBusinessPlatform = checkIsWABusinessPlatform(jid);
    res.json({ isBusinessPlatform, jid });
  })
);

// ========== DEVICE UTILITIES ==========

// Transaction capability ekleme
app.post(
  "/:sessionId/device/transaction-capability",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { options } = req.body;

    const result = await addTransactionCapabilityUtil(sessionId, options || {});
    res.json(result);
  })
);

// Device JID'leri çıkarma
app.get(
  "/api/utils/device/extract-jids",
  asyncHandler(async (req, res) => {
    const { jid, includeSelf } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const result = extractDeviceJidsUtil(jid, includeSelf === "true");
    res.json(result);
  })
);

// Device bilgisi
app.get(
  "/api/utils/device/info",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const result = getDeviceUtil(jid);
    res.json(result);
  })
);

// Platform ID
app.get(
  "/api/utils/device/platform-id",
  asyncHandler(async (req, res) => {
    const { jid } = req.query;

    if (!jid) {
      return res.status(400).json({ error: "jid query parametresi zorunludur" });
    }

    const result = getPlatformIdUtil(jid);
    res.json(result);
  })
);

// Decryption JID
app.post(
  "/api/utils/message/decryption-jid",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = getDecryptionJidUtil(message);
    res.json(result);
  })
);

// History mesajı
app.post(
  "/api/utils/message/history",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = getHistoryMessageUtil(message);
    res.json(result);
  })
);

// Call status
app.post(
  "/api/utils/call/status",
  asyncHandler(async (req, res) => {
    const { node } = req.body;

    if (!node) {
      return res.status(400).json({ error: "node objesi zorunludur" });
    }

    const result = getCallStatusUtil(node);
    res.json(result);
  })
);

// ========== MESSAGE UPDATE UTILITIES ==========

// Event mesajındaki aggregate responses
app.post(
  "/api/utils/message/aggregate-responses",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = getAggregateResponsesUtil(message);
    res.json(result);
  })
);

// Poll mesajındaki aggregate votes
app.post(
  "/api/utils/message/aggregate-votes",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = getAggregateVotesUtil(message);
    res.json(result);
  })
);

// Mesajı reaksiyonla güncelleme
app.post(
  "/api/utils/message/update-with-reaction",
  asyncHandler(async (req, res) => {
    const { message, reaction } = req.body;

    if (!message || !reaction) {
      return res.status(400).json({ error: "message ve reaction objeleri zorunludur" });
    }

    const result = updateMessageWithReactionUtil(message, reaction);
    res.json(result);
  })
);

// Mesajı receipt ile güncelleme
app.post(
  "/api/utils/message/update-with-receipt",
  asyncHandler(async (req, res) => {
    const { message, receipt } = req.body;

    if (!message || !receipt) {
      return res.status(400).json({ error: "message ve receipt objeleri zorunludur" });
    }

    const result = updateMessageWithReceiptUtil(message, receipt);
    res.json(result);
  })
);

// Mesajı poll update ile güncelleme
app.post(
  "/api/utils/message/update-with-poll-update",
  asyncHandler(async (req, res) => {
    const { message, pollUpdate } = req.body;

    if (!message || !pollUpdate) {
      return res.status(400).json({ error: "message ve pollUpdate objeleri zorunludur" });
    }

    const result = updateMessageWithPollUpdateUtil(message, pollUpdate);
    res.json(result);
  })
);

// Mesajı event response ile güncelleme
app.post(
  "/api/utils/message/update-with-event-response",
  asyncHandler(async (req, res) => {
    const { message, eventResponse } = req.body;

    if (!message || !eventResponse) {
      return res.status(400).json({ error: "message ve eventResponse objeleri zorunludur" });
    }

    const result = updateMessageWithEventResponseUtil(message, eventResponse);
    res.json(result);
  })
);

// Chat unread artırılmalı mı kontrolü
app.post(
  "/api/utils/message/should-increment-unread",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = checkShouldIncrementChatUnread(message);
    res.json(result);
  })
);

// ========== PROCESSING UTILITIES ==========

// History mesajı işleme
app.post(
  "/api/utils/message/process-history",
  asyncHandler(async (req, res) => {
    const { message, meId } = req.body;

    if (!message || !meId) {
      return res.status(400).json({ error: "message ve meId zorunludur" });
    }

    const result = processHistoryMessageUtil(message, meId);
    res.json(result);
  })
);

// Sync action işleme
app.post(
  "/api/utils/sync/process-action",
  asyncHandler(async (req, res) => {
    const { action, meId } = req.body;

    if (!action || !meId) {
      return res.status(400).json({ error: "action ve meId zorunludur" });
    }

    const result = processSyncActionUtil(action, meId);
    res.json(result);
  })
);

// Disappearing message setting içeriği hazırlama
app.post(
  "/api/utils/disappearing/prepare-content",
  asyncHandler(async (req, res) => {
    const { duration } = req.body;

    if (duration === undefined) {
      return res.status(400).json({ error: "duration zorunludur" });
    }

    const result = prepareDisappearingMessageSettingContentUtil(duration);
    res.json(result);
  })
);

// Newsletter mesajı encode etme
app.post(
  "/api/utils/newsletter/encode-message",
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message objesi zorunludur" });
    }

    const result = encodeNewsletterMessageUtil(message);
    res.json(result);
  })
);

// ========== DOWNLOAD UTILITIES ==========

// External blob indirme
app.post(
  "/api/utils/download/external-blob",
  asyncHandler(async (req, res) => {
    const { blob, options } = req.body;

    if (!blob) {
      return res.status(400).json({ error: "blob objesi zorunludur" });
    }

    const result = await downloadExternalBlobUtil(blob, options || {});
    res.json(result);
  })
);

// External patch indirme
app.post(
  "/api/utils/download/external-patch",
  asyncHandler(async (req, res) => {
    const { patch, options } = req.body;

    if (!patch) {
      return res.status(400).json({ error: "patch objesi zorunludur" });
    }

    const result = await downloadExternalPatchUtil(patch, options || {});
    res.json(result);
  })
);

// Encrypted content indirme
app.post(
  "/api/utils/download/encrypted-content",
  asyncHandler(async (req, res) => {
    const { content, options } = req.body;

    if (!content) {
      return res.status(400).json({ error: "content objesi zorunludur" });
    }

    const result = await downloadEncryptedContentUtil(content, options || {});
    res.json(result);
  })
);

// ========== ÖNEMLİ UTILITY METODLAR ==========

// WhatsApp Web versiyonunu çekme
app.get(
  "/api/utils/wa-web-version",
  asyncHandler(async (req, res) => {
    const result = await fetchLatestWaWebVersionUtil();
    res.json(result);
  })
);

// Mesaj ID oluşturma
app.get(
  "/api/utils/message/generate-id",
  asyncHandler(async (req, res) => {
    const result = generateMessageIDUtil();
    res.json(result);
  })
);

// Mesaj ID oluşturma (V2)
app.post(
  "/api/utils/message/generate-id-v2",
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const result = generateMessageIDV2Util(userId);
    res.json(result);
  })
);

// Chat modification'ı app patch'e çevirme
app.post(
  "/api/utils/chat/modification-to-patch",
  asyncHandler(async (req, res) => {
    const { modification } = req.body;

    if (!modification) {
      return res.status(400).json({ error: "modification objesi zorunludur" });
    }

    const result = chatModificationToAppPatchUtil(modification);
    res.json(result);
  })
);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use((err, _req, res, _next) => {
  // CORS header'larını error response'a da ekle
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  
  console.error('[Error Handler] Hata yakalandı:', {
    message: err.message,
    stack: err.stack,
    status: err.status,
    name: err.name,
    code: err.code,
    fullError: err
  });
  
  const status = err.status || err.statusCode || 500;
  const errorMessage = err.message || err.toString() || "Beklenmeyen bir hata oluştu.";
  
  res.status(status).json({
    error: errorMessage,
    status: "error",
    ...(process.env.NODE_ENV === 'development' && { 
      details: err.stack,
      name: err.name,
      code: err.code
    })
  });
});

const start = async () => {
  // Mevcut session'ları restore et (backend restart sonrası)
  console.log("[start] Mevcut session'lar restore ediliyor...");
  await restoreSessions();
  
  // Uygulama başlatılırken varsayılan session oluşturulmaz
  // Session'lar kullanıcı tarafından POST /sessions/add ile oluşturulur
  server.listen(PORT, () => {
    console.log(`API hazır: http://localhost:${PORT}`);
    console.log(`Swagger dokümanı: http://localhost:${PORT}/docs`);
    console.log(`WebSocket hazır: ws://localhost:${PORT}/ws`);
  });
};

start().catch((err) => {
  console.error("Uygulama başlatılamadı:", err);
  process.exitCode = 1;
});

