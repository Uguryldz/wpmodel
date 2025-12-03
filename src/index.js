import express from "express";
import swaggerUi from "swagger-ui-express";

import swaggerSpec from "./swagger.js";
import {
  blockContact,
  createGroup,
  deleteSession,
  getConnectionState,
  getLastQr,
  initBaileys,
  listChats,
  listContacts,
  listGroups,
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
  searchMessages,
  sendLocation,
  sendContactCard,
  createPoll,
} from "./baileysClient.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

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
      next(error);
    }
  };

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get(
  "/sessions",
  asyncHandler((_req, res) => {
    const sessions = listSessions();
    console.log('[GET /sessions] Sessions:', JSON.stringify(sessions, null, 2));
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
    const { sessionId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId zorunludur" });
    }

    if (sessionExists(sessionId)) {
      return res.status(400).json({ error: "Session already exists" });
    }

    await initBaileys(sessionId);
    res.json(getConnectionState(sessionId));
  })
);

// SSE ile oturum ekleme (baileys-api-master uyumlu)
app.get(
  "/sessions/:sessionId/add-sse",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    await initBaileys(sessionId);

    const sendUpdate = () => {
      const state = getConnectionState(sessionId);
      const qr = getLastQr(sessionId);
      const payload = { ...state, qr };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);

      if (state.status === "open") {
        clearInterval(interval);
        res.end();
      }
    };

    const interval = setInterval(sendUpdate, 2000);
    sendUpdate();

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
    res.json({ status: "deleted" });
  })
);

// === Chats (baileys-api-master yapısına yakın) ===
app.get(
  "/:sessionId/chats",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { cursor, limit } = req.query;

    console.log(`[GET /${sessionId}/chats] SessionId: ${sessionId}, Cursor: ${cursor}, Limit: ${limit}`);
    const result = await listChats(sessionId, cursor, Number(limit) || 25);
    console.log(`[GET /${sessionId}/chats] Result:`, JSON.stringify(result, null, 2));
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
    const result = await listContacts(sessionId, cursor, Number(limit) || 50);
    res.json(result);
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

// === Groups ===
app.get(
  "/:sessionId/groups",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { cursor, limit } = req.query;
    const result = await listGroups(sessionId, cursor, Number(limit) || 50);
    res.json(result);
  })
);

app.get(
  "/:sessionId/groups/:jid",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const groups = await listGroups(sessionId, null, 500);
    const found =
      groups.data.find((g) => String(g.id) === String(jid)) || null;

    if (!found) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json(found);
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
    res.json(getConnectionState(accountId));
  })
);

app.get(
  "/api/qr",
  asyncHandler((req, res) => {
    const accountId = req.query.accountId;
    const qr = getLastQr(accountId);
    if (!qr) {
      return res.status(404).json({
        error: "Aktif bir QR kodu yok. Cihaz zaten bağlı olabilir veya henüz QR üretilmemiştir.",
      });
    }

    res.json({
      qr,
      message: "Bu QR'ı WhatsApp uygulamasından tarayarak oturum açabilirsiniz.",
    });
  })
);

app.get(
  "/api/chats",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    console.log(`[GET /api/chats] AccountId: ${accountId}`);
    const result = await listChats(accountId, null, 100);
    console.log(`[GET /api/chats] Result:`, JSON.stringify(result, null, 2));
    res.json(result);
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
    const { to, media, mimetype, caption } = req.body;
    const result = await sendMediaMessage({ accountId, to, media, mimetype, caption });
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

app.post(
  "/api/contacts/block",
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId;
    const { jid, action } = req.body;
    const result = await blockContact(accountId, jid, action !== "unblock");
    res.json(result);
  })
);

app.post(
  "/api/logout",
  asyncHandler(async (_req, res) => {
    const accountId = _req.query.accountId;
    await performLogout(accountId);
    res.json({ status: "logged_out" });
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

    const result = await editMessage(sessionId, jid, messageId, message);
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

// Sohbeti arşivle/kaldır
app.post(
  "/:sessionId/chats/:jid/archive",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { archive } = req.body;

    const result = await archiveChat(sessionId, jid, archive !== false);
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

// Sohbeti sessize al/kaldır
app.post(
  "/:sessionId/chats/:jid/mute",
  asyncHandler(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { duration } = req.body; // saniye cinsinden, null ise sessizliği kaldır

    const result = await muteChat(sessionId, jid, duration || null);
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
    const { jid, question, options } = req.body;

    if (!jid || !question || !options || !Array.isArray(options)) {
      return res.status(400).json({ error: "jid, question ve options (array) zorunludur" });
    }

    const result = await createPoll(sessionId, jid, question, options);
    res.status(202).json(result);
  })
);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use((err, _req, res, _next) => {
  // CORS header'larını error response'a da ekle
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Beklenmeyen bir hata oluştu.",
  });
});

const start = async () => {
  // Uygulama başlatılırken varsayılan session oluşturulmaz
  // Session'lar kullanıcı tarafından POST /sessions/add ile oluşturulur
  app.listen(PORT, () => {
    console.log(`API hazır: http://localhost:${PORT}`);
    console.log(`Swagger dokümanı: http://localhost:${PORT}/docs`);
  });
};

start().catch((err) => {
  console.error("Uygulama başlatılamadı:", err);
  process.exitCode = 1;
});

