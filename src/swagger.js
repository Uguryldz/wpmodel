const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Baileys WhatsApp Gateway",
    version: "1.0.0",
    description:
      "Baileys tabanlı WhatsApp Web entegrasyonu için HTTP arabirimi. Tüm endpointler JSON gövde kabul eder ve JWT vb. ek doğrulama içermez.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Yerel geliştirme sunucusu",
    },
  ],
  tags: [
    { name: "Status", description: "Bağlantı ve QR bilgileri" },
    { name: "Sessions", description: "Oturum yönetimi" },
    { name: "Messages", description: "Mesaj gönderme ve listeleme" },
    { name: "Groups", description: "Grup yönetimi" },
    { name: "Contacts", description: "Kişi yönetimi" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Status"],
        summary: "Servis sağlık kontrolü",
        responses: {
          200: {
            description: "Servis çalışıyor",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/status": {
      get: {
        tags: ["Status"],
        summary: "Bağlantı durumunu getir",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
            description: "Hesap kimliği (varsayılan: default)",
          },
        ],
        responses: {
          200: {
            description: "Bağlantı bilgisi",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusResponse" },
              },
            },
          },
        },
      },
    },
    "/api/qr": {
      get: {
        tags: ["Status"],
        summary: "Güncel QR kodunu getir",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
            description: "Hesap kimliği (varsayılan: default)",
          },
        ],
        description:
          "Baileys tarafından en son üretilen oturum açma QR kodunu döner. Aktif QR yoksa 404 döner.",
        responses: {
          200: {
            description: "Aktif QR bulundu",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QrResponse" },
              },
            },
          },
          404: {
            description: "Aktif QR yok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/chats": {
      get: {
        tags: ["Messages"],
        summary: "Sohbet listesini getir",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        responses: {
          200: {
            description: "Sohbetler",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Chat" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/messages/{jid}": {
      get: {
        tags: ["Messages"],
        summary: "Belirli bir sohbetin son mesajlarını getir",
        parameters: [
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Kişi veya grup JID değeri",
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 20, maximum: 100 },
          },
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        responses: {
          200: {
            description: "Mesaj listesi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Message" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/messages/text": {
      post: {
        tags: ["Messages"],
        summary: "Metin mesajı gönder",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendTextRequest" },
            },
          },
        },
        responses: {
          202: {
            description: "Mesaj kuyruğa alındı",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
        },
      },
    },
    "/api/messages/media": {
      post: {
        tags: ["Messages"],
        summary: "Medya mesajı gönder",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendMediaRequest" },
            },
          },
        },
        responses: {
          202: {
            description: "Medya kuyruğa alındı",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
        },
      },
    },
    "/api/groups": {
      post: {
        tags: ["Groups"],
        summary: "Yeni grup oluştur",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateGroupRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Grup oluşturuldu",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    subject: { type: "string" },
                  },
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
    "/api/groups/{jid}/participants": {
      patch: {
        tags: ["Groups"],
        summary: "Grup katılımcılarını güncelle",
        parameters: [
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GroupParticipantRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "İşlem sonucu",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                  },
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
    "/api/contacts/block": {
      post: {
        tags: ["Contacts"],
        summary: "Kişiyi engelle veya engeli kaldır",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BlockContactRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "İşlem sonucu",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                  },
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
    "/api/logout": {
      post: {
        tags: ["Status"],
        summary: "WhatsApp oturumunu kapat",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
          },
        ],
        responses: {
          200: {
            description: "Oturum kapatıldı",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "logged_out" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // === Sessions (baileys-api-master benzeri) ===
    "/sessions": {
      get: {
        tags: ["Sessions"],
        summary: "Tüm oturumları listele",
        responses: {
          200: {
            description: "Oturum listesi",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SessionItem" },
                },
              },
            },
          },
        },
      },
    },
    "/sessions/add": {
      post: {
        tags: ["Sessions"],
        summary: "Yeni oturum oluştur",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AddSessionRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Oturum oluşturuldu veya durum döndü",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusResponse" },
              },
            },
          },
        },
      },
    },
    "/sessions/{sessionId}": {
      get: {
        tags: ["Sessions"],
        summary: "Belirli bir oturumu bul",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Oturum bulundu",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Session found" },
                  },
                },
              },
            },
          },
          404: {
            description: "Oturum bulunamadı",
          },
        },
      },
      delete: {
        tags: ["Sessions"],
        summary: "Oturumu sil",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Oturum silindi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "deleted" },
                  },
                },
              },
            },
          },
          404: { description: "Oturum bulunamadı" },
        },
      },
    },
    "/sessions/{sessionId}/status": {
      get: {
        tags: ["Sessions"],
        summary: "Belirli bir oturumun bağlantı durumunu getir",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Durum bilgisi",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusResponse" },
              },
            },
          },
          404: { description: "Oturum bulunamadı" },
        },
      },
    },
    "/sessions/{sessionId}/add-sse": {
      get: {
        tags: ["Sessions"],
        summary: "SSE ile QR ve bağlantı güncellemeleri al",
        description:
          "Server-Sent Events ile belirli bir session için QR ve bağlantı durumunu akış halinde döner.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Event-stream başlatıldı",
          },
        },
      },
    },

    // === Chats ===
    "/{sessionId}/chats": {
      get: {
        tags: ["Messages"],
        summary: "Oturuma ait sohbetleri listele",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "cursor",
            schema: { type: "string", nullable: true },
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", nullable: true },
          },
        ],
        responses: {
          200: {
            description: "Sohbet listesi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Chat" },
                    },
                    cursor: { type: "string", nullable: true },
                    limit: { type: "integer", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/chats/{jid}": {
      get: {
        tags: ["Messages"],
        summary: "Belirli bir sohbetin mesajlarını getir",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "cursor",
            schema: { type: "string", nullable: true },
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 20 },
          },
        ],
        responses: {
          200: {
            description: "Mesaj listesi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Message" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // === Contacts ===
    "/{sessionId}/contacts": {
      get: {
        tags: ["Contacts"],
        summary: "Kişi listesini getir",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "cursor",
            schema: { type: "string", nullable: true },
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 50 },
          },
        ],
        responses: {
          200: {
            description: "Kişi listesi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Chat" },
                    },
                    nextCursor: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/contacts/blocklist": {
      get: {
        tags: ["Contacts"],
        summary: "Engelli numara listesini getir",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Engelli liste",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/contacts/blocklist/update": {
      post: {
        tags: ["Contacts"],
        summary: "Bir numarayı engelle veya engeli kaldır",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BlockContactRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "İşlem sonucu",
          },
        },
      },
    },
    "/{sessionId}/contacts/{jid}": {
      get: {
        tags: ["Contacts"],
        summary: "Numaranın WhatsApp hesabını kontrol et",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Numara bilgisi",
          },
          404: {
            description: "Numara bulunamadı",
          },
        },
      },
    },
    "/{sessionId}/contacts/{jid}/photo": {
      get: {
        tags: ["Contacts"],
        summary: "Kullanıcı profil fotoğrafı",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Profil fotoğrafı URL'i",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                  },
                },
              },
            },
          },
          404: { description: "Fotoğraf bulunamadı" },
        },
      },
    },

    // === Groups ===
    "/{sessionId}/groups": {
      get: {
        tags: ["Groups"],
        summary: "Grup listesini getir",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "cursor",
            schema: { type: "string", nullable: true },
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 50 },
          },
        ],
        responses: {
          200: {
            description: "Grup listesi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/GroupItem" },
                    },
                    nextCursor: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/groups/{jid}": {
      get: {
        tags: ["Groups"],
        summary: "Belirli bir grubun bilgisini getir",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Grup bilgisi",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GroupItem" },
              },
            },
          },
          404: { description: "Grup bulunamadı" },
        },
      },
    },
    "/{sessionId}/groups/{jid}/photo": {
      get: {
        tags: ["Groups"],
        summary: "Grup profil fotoğrafı",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Grup profil fotoğrafı URL'i",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                  },
                },
              },
            },
          },
          404: { description: "Fotoğraf bulunamadı" },
        },
      },
    },

    // === Messages ===
    "/{sessionId}/messages": {
      get: {
        tags: ["Messages"],
        summary: "Belirli bir sohbetin mesajlarını listele",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "jid",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "cursor",
            schema: { type: "string", nullable: true },
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 20 },
          },
        ],
        responses: {
          200: {
            description: "Mesaj listesi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Message" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/messages/send": {
      post: {
        tags: ["Messages"],
        summary: "Mesaj gönder",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendMessageRequest" },
            },
          },
        },
        responses: {
          202: {
            description: "Mesaj kuyruğa alındı",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/messages/send/bulk": {
      post: {
        tags: ["Messages"],
        summary: "Toplu mesaj gönder",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/SendMessageRequest" },
              },
            },
          },
        },
        responses: {
          202: {
            description: "Toplu mesaj kuyruğa alındı",
          },
        },
      },
    },
    "/{sessionId}/messages/download": {
      post: {
        tags: ["Messages"],
        summary: "Mesaj medyasını indir",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DownloadMediaRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Base64 medya çıktısı",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "string", description: "Base64 içerik" },
                  },
                },
              },
            },
          },
        },
      },
    "/{sessionId}/messages/read": {
      post: {
        tags: ["Messages"],
        summary: "Mesajları okundu olarak işaretle",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid"],
                properties: {
                  jid: { type: "string" },
                  messageIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Boş ise tüm mesajlar okundu işaretlenir",
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Mesajlar okundu işaretlendi" } },
      },
    },
    "/{sessionId}/messages/{jid}/{messageId}": {
      delete: {
        tags: ["Messages"],
        summary: "Mesaj sil",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
          { in: "path", name: "messageId", required: true, schema: { type: "string" } },
          { in: "query", name: "deleteForEveryone", schema: { type: "boolean" } },
        ],
        responses: { 200: { description: "Mesaj silindi" } },
      },
      patch: {
        tags: ["Messages"],
        summary: "Mesaj düzenle",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
          { in: "path", name: "messageId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { description: "Yeni mesaj içeriği (string veya object)" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Mesaj düzenlendi" } },
      },
    },
    "/{sessionId}/messages/reply": {
      post: {
        tags: ["Messages"],
        summary: "Mesaj yanıtla",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid", "messageId", "message"],
                properties: {
                  jid: { type: "string" },
                  messageId: { type: "string" },
                  message: { description: "Yanıt mesajı (string veya object)" },
                },
              },
            },
          },
        },
        responses: { 202: { description: "Mesaj yanıtlandı" } },
      },
    },
    "/{sessionId}/messages/forward": {
      post: {
        tags: ["Messages"],
        summary: "Mesaj ilet",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fromJid", "toJid", "messageId"],
                properties: {
                  fromJid: { type: "string" },
                  toJid: { type: "string" },
                  messageId: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 202: { description: "Mesaj iletildi" } },
      },
    },
    "/{sessionId}/messages/star": {
      post: {
        tags: ["Messages"],
        summary: "Mesaj yıldızla/yıldızı kaldır",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid", "messageId"],
                properties: {
                  jid: { type: "string" },
                  messageId: { type: "string" },
                  star: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Mesaj yıldızlandı/yıldızı kaldırıldı" } },
      },
    },
    "/{sessionId}/messages/reaction": {
      post: {
        tags: ["Messages"],
        summary: "Mesaja reaksiyon gönder",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid", "messageId"],
                properties: {
                  jid: { type: "string" },
                  messageId: { type: "string" },
                  emoji: { type: "string", default: "👍", description: "Emoji reaksiyonu" },
                },
              },
            },
          },
        },
        responses: { 202: { description: "Reaksiyon gönderildi" } },
      },
      delete: {
        tags: ["Messages"],
        summary: "Reaksiyonu kaldır",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "query", name: "jid", required: true, schema: { type: "string" } },
          { in: "query", name: "messageId", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Reaksiyon kaldırıldı" } },
      },
    },
    "/{sessionId}/presence/typing": {
      post: {
        tags: ["Messages"],
        summary: "Yazıyor göstergesi gönder",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid"],
                properties: {
                  jid: { type: "string" },
                  duration: { type: "integer", default: 5000, description: "Milisaniye" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Yazıyor göstergesi gönderildi" } },
      },
    },
    "/{sessionId}/presence/stop-typing": {
      post: {
        tags: ["Messages"],
        summary: "Yazmayı durdur",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid"],
                properties: {
                  jid: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Yazma durduruldu" } },
      },
    },
    "/{sessionId}/presence": {
      post: {
        tags: ["Messages"],
        summary: "Durum güncelle",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["presence"],
                properties: {
                  jid: { type: "string", description: "Opsiyonel, belirtilmezse genel durum" },
                  presence: {
                    type: "string",
                    enum: ["available", "unavailable", "composing", "recording"],
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Durum güncellendi" } },
      },
    },
    "/{sessionId}/groups/{jid}/settings": {
      patch: {
        tags: ["Groups"],
        summary: "Grup ayarlarını güncelle",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  restrict: { type: "boolean", description: "Sadece adminler mesaj gönderebilir" },
                  announce: { type: "boolean", description: "Sadece adminler duyuru yapabilir" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Grup ayarları güncellendi" } },
      },
    },
    "/{sessionId}/groups/{jid}/invite-link": {
      get: {
        tags: ["Groups"],
        summary: "Grup davet linki al",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
          { in: "query", name: "reset", schema: { type: "boolean" } },
        ],
        responses: {
          200: {
            description: "Davet linki",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    inviteLink: { type: "string" },
                    code: { type: "string" },
                    groupJid: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/groups/{jid}/invite-link/reset": {
      post: {
        tags: ["Groups"],
        summary: "Grup davet linkini sıfırla",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Davet linki sıfırlandı" } },
      },
    },
    "/{sessionId}/groups/{jid}/description": {
      patch: {
        tags: ["Groups"],
        summary: "Grup açıklamasını güncelle",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["description"],
                properties: {
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Grup açıklaması güncellendi" } },
      },
    },
    "/{sessionId}/groups/{jid}/subject": {
      patch: {
        tags: ["Groups"],
        summary: "Grup adını güncelle",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["subject"],
                properties: {
                  subject: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Grup adı güncellendi" } },
      },
    },
    "/{sessionId}/groups/{jid}/picture": {
      post: {
        tags: ["Groups"],
        summary: "Grup fotoğrafını güncelle",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: { type: "string", description: "Base64 kodlanmış resim" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Grup fotoğrafı güncellendi" } },
      },
    },
    "/{sessionId}/chats/{jid}/archive": {
      post: {
        tags: ["Messages"],
        summary: "Sohbeti arşivle/kaldır",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  archive: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Sohbet arşivlendi/kaldırıldı" } },
      },
    },
    "/{sessionId}/chats/{jid}/pin": {
      post: {
        tags: ["Messages"],
        summary: "Sohbeti sabitle/kaldır",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  pin: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Sohbet sabitlendi/kaldırıldı" } },
      },
    },
    "/{sessionId}/chats/{jid}/mute": {
      post: {
        tags: ["Messages"],
        summary: "Sohbeti sessize al/kaldır",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "path", name: "jid", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  duration: {
                    type: "integer",
                    nullable: true,
                    description: "Saniye cinsinden, null ise sessizliği kaldır",
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Sohbet sessize alındı/kaldırıldı" } },
      },
    },
    "/{sessionId}/messages/search": {
      get: {
        tags: ["Messages"],
        summary: "Mesaj ara",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
          { in: "query", name: "query", schema: { type: "string" } },
          { in: "query", name: "jid", schema: { type: "string" } },
          { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
          { in: "query", name: "fromDate", schema: { type: "string", format: "date-time" } },
          { in: "query", name: "toDate", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          200: {
            description: "Arama sonuçları",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Message" },
                    },
                    count: { type: "integer" },
                    query: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ========== DİĞER ÖZELLİKLER ==========
    "/{sessionId}/messages/location": {
      post: {
        tags: ["Messages"],
        summary: "Konum gönder",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid", "latitude", "longitude"],
                properties: {
                  jid: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 202: { description: "Konum gönderildi" } },
      },
    },
    "/{sessionId}/messages/contact": {
      post: {
        tags: ["Messages"],
        summary: "Kişi kartı gönder",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid", "contact"],
                properties: {
                  jid: { type: "string" },
                  contact: {
                    type: "object",
                    required: ["displayName"],
                    properties: {
                      displayName: { type: "string" },
                      phone: { type: "string" },
                      vcard: { type: "string", description: "Opsiyonel, otomatik oluşturulur" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 202: { description: "Kişi kartı gönderildi" } },
      },
    },
    "/{sessionId}/messages/poll": {
      post: {
        tags: ["Messages"],
        summary: "Anket oluştur",
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["jid", "question", "options"],
                properties: {
                  jid: { type: "string" },
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 2,
                    description: "En az 2 seçenek gereklidir",
                  },
                },
              },
            },
          },
        },
        responses: { 202: { description: "Anket oluşturuldu" } },
      },
    },
  },
  components: {
    schemas: {
      SessionItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", example: "open" },
        },
      },
      StatusResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "open" },
          version: { type: "string", example: "2.3000.1027934701" },
          isLatest: { type: "boolean" },
          lastError: { type: "string", nullable: true },
          lastQr: { type: "string", nullable: true },
          qrGeneratedAt: { type: "string", format: "date-time", nullable: true },
          startedAt: { type: "string", format: "date-time" },
          socketReady: { type: "boolean" },
        },
      },
      QrResponse: {
        type: "object",
        properties: {
          qr: {
            type: "string",
            description: "WhatsApp tarafından üretilen QR string'i. İsterseniz kendi QR render'ınızı yapabilirsiniz.",
          },
          message: { type: "string" },
        },
      },
      Chat: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          unreadCount: { type: "integer" },
          conversationTimestamp: { type: "number", nullable: true },
          isMuted: { type: "boolean" },
        },
      },
      Message: {
        type: "object",
        properties: {
          id: { type: "string" },
          from: { type: "string" },
          fromMe: { type: "boolean" },
          participant: { type: "string", nullable: true },
          timestamp: { type: "number" },
          type: { type: "string" },
          text: { type: "string", nullable: true },
        },
      },
      SendTextRequest: {
        type: "object",
        required: ["to", "message"],
        properties: {
          to: {
            type: "string",
            description: "Telefon numarası (örn: 90555...) veya tam JID",
          },
          message: { type: "string" },
          options: {
            type: "object",
            description: "Baileys sendMessage opsiyonları",
            nullable: true,
            additionalProperties: true,
          },
        },
      },
      SendMediaRequest: {
        type: "object",
        required: ["to", "media", "mimetype"],
        properties: {
          to: { type: "string" },
          media: {
            type: "string",
            description: "Base64 kodlanmış dosya içeriği",
          },
          mimetype: { type: "string", example: "image/png" },
          caption: { type: "string", nullable: true },
        },
      },
      CreateGroupRequest: {
        type: "object",
        required: ["subject"],
        properties: {
          subject: { type: "string", description: "Grup adı" },
          participants: {
            type: "array",
            items: { type: "string" },
            description: "İlk katılımcılar",
          },
        },
      },
      GroupParticipantRequest: {
        type: "object",
        required: ["participants", "action"],
        properties: {
          participants: {
            type: "array",
            items: { type: "string" },
            description: "Güncellenecek katılımcılar",
          },
          action: {
            type: "string",
            enum: ["add", "remove", "promote", "demote"],
            default: "add",
          },
        },
      },
      BlockContactRequest: {
        type: "object",
        required: ["jid", "action"],
        properties: {
          jid: { type: "string" },
          action: {
            type: "string",
            enum: ["block", "unblock"],
            default: "block",
          },
        },
      },
      MessageResponse: {
        type: "object",
        properties: {
          jid: { type: "string" },
          status: { type: "string", example: "queued" },
        },
      },
      AddSessionRequest: {
        type: "object",
        required: ["sessionId"],
        properties: {
          sessionId: { type: "string" },
        },
      },
      GroupItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          subject: { type: "string" },
          size: { type: "integer" },
          creation: { type: "integer" },
        },
      },
      SendMessageRequest: {
        type: "object",
        required: ["jid", "message"],
        properties: {
          jid: { type: "string" },
          type: {
            type: "string",
            description: 'Mesaj tipi, "text" ise message alanı string olmalıdır',
          },
          message: {
            description: "Metin veya ham Baileys message içeriği",
          },
          options: {
            type: "object",
            additionalProperties: true,
            nullable: true,
          },
        },
      },
      DownloadMediaRequest: {
        type: "object",
        required: ["message", "mediaType"],
        properties: {
          message: {
            description: "Baileys message nesnesi",
          },
          mediaType: {
            type: "string",
            description: "image, video, audio, document vb.",
          },
        },
      },
    },
  },
  },
};

export default swaggerSpec;

