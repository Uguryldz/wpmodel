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
      url: "/",
      description: "Geçerli origin (varsayılan)",
    },
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
    "/api/groups": {
      post: {
        tags: ["Groups"],
        summary: "Yeni grup oluştur",
        description: "Yeni bir WhatsApp grubu oluşturur. İlk katılımcıları da ekleyebilirsiniz (minimum 1 kişi gerekir).",
        parameters: [
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
            description: "Session ID (accountId)",
            example: "ugur",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateGroupRequest" },
              example: {
                subject: "Yeni Proje Ekibi",
                participants: ["905551234567@s.whatsapp.net", "905559876543@s.whatsapp.net"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Grup başarıyla oluşturuldu",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "Oluşturulan grubun JID'i",
                      example: "120363123456789012@g.us",
                    },
                    subject: {
                      type: "string",
                      description: "Grup adı",
                      example: "Yeni Proje Ekibi",
                    },
                    creation: {
                      type: "integer",
                      description: "Grup oluşturulma zamanı (Unix timestamp)",
                    },
                    size: {
                      type: "integer",
                      description: "Grup üye sayısı",
                    },
                  },
                  additionalProperties: true,
                },
                example: {
                  id: "120363123456789012@g.us",
                  subject: "Yeni Proje Ekibi",
                  creation: 1234567890,
                  size: 3,
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
        summary: "Grup katılımcılarını güncelle (ekle/çıkar/yönetici yap)",
        description: "Grup katılımcılarını yönetir: ekleme, çıkarma, yönetici yapma veya yöneticilikten çıkarma. Sadece grup adminleri bu işlemi yapabilir.",
        parameters: [
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i",
            example: "120363123456789012@g.us",
          },
          {
            in: "query",
            name: "accountId",
            schema: { type: "string", default: "default" },
            description: "Session ID (accountId)",
            example: "ugur",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GroupParticipantRequest" },
              examples: {
                add: {
                  summary: "Katılımcı ekle",
                  value: {
                    participants: ["905551234567@s.whatsapp.net"],
                    action: "add",
                  },
                },
                remove: {
                  summary: "Katılımcı çıkar",
                  value: {
                    participants: ["905551234567@s.whatsapp.net"],
                    action: "remove",
                  },
                },
                promote: {
                  summary: "Yönetici yap",
                  value: {
                    participants: ["905551234567@s.whatsapp.net"],
                    action: "promote",
                  },
                },
                demote: {
                  summary: "Yöneticilikten çıkar",
                  value: {
                    participants: ["905551234567@s.whatsapp.net"],
                    action: "demote",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "İşlem başarıyla tamamlandı",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      description: "İşlem durumu",
                      example: "success",
                    },
                    participants: {
                      type: "array",
                      items: { type: "string" },
                      description: "İşlem yapılan katılımcılar",
                    },
                    action: {
                      type: "string",
                      description: "Yapılan işlem (add, remove, promote, demote)",
                    },
                  },
                  additionalProperties: true,
                },
                example: {
                  status: "success",
                  participants: ["905551234567@s.whatsapp.net"],
                  action: "add",
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
        description: "WhatsApp hesabınızdaki tüm grupları listeler. Veriler WhatsApp cihazından direkt çekilir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID (örn: 'ugur', 'default')",
            example: "ugur",
          },
          {
            in: "query",
            name: "cursor",
            schema: { type: "string", nullable: true },
            description: "Sayfalama için cursor (şu an kullanılmıyor)",
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 50 },
            description: "Maksimum döndürülecek grup sayısı",
            example: 50,
          },
        ],
        responses: {
          200: {
            description: "Grup listesi başarıyla döndürüldü",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/GroupItem" },
                      description: "Grup listesi",
                    },
                    nextCursor: { type: "string", nullable: true },
                  },
                  example: {
                    data: [
                      {
                        id: "120363123456789012@g.us",
                        subject: "Proje Ekibi",
                        owner: "905551234567@s.whatsapp.net",
                        size: 15,
                        creation: 1234567890,
                        desc: "Proje ile ilgili görüşmeler",
                        restrict: false,
                        announce: false,
                        participants: [],
                      },
                    ],
                    nextCursor: null,
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
        summary: "Belirli bir grubun detaylı bilgisini getir",
        description: "Grup JID'i ile belirli bir grubun tüm bilgilerini (katılımcılar, ayarlar, vb.) getirir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i (örn: '120363123456789012@g.us' veya sadece '120363123456789012')",
            example: "120363123456789012@g.us",
          },
        ],
        responses: {
          200: {
            description: "Grup bilgisi başarıyla döndürüldü",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GroupItem" },
                example: {
                  id: "120363123456789012@g.us",
                  subject: "Proje Ekibi",
                  owner: "905551234567@s.whatsapp.net",
                  subjectOwner: "905551234567@s.whatsapp.net",
                  subjectTime: 1234567890,
                  creation: 1234567890,
                  desc: "Proje ile ilgili görüşmeler",
                  descOwner: "905551234567@s.whatsapp.net",
                  restrict: false,
                  announce: false,
                  size: 15,
                  participants: [
                    {
                      id: "905551234567@s.whatsapp.net",
                      admin: "admin",
                    },
                  ],
                  ephemeralDuration: null,
                  inviteCode: "ABC123XYZ",
                },
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
        description: "Belirli bir kişi veya grubun mesaj geçmişini getirir. Mesajlar en yeniden eskiye doğru sıralanır.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "query",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Kişi veya grup JID'i (örn: '905551234567@s.whatsapp.net' veya '120363123456789012@g.us')",
            example: "905551234567@s.whatsapp.net",
          },
          {
            in: "query",
            name: "cursor",
            schema: { type: "string", nullable: true },
            description: "Sayfalama için cursor (şu an kullanılmıyor)",
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 20, maximum: 100 },
            description: "Maksimum döndürülecek mesaj sayısı (1-100 arası)",
            example: 20,
          },
        ],
        responses: {
          200: {
            description: "Mesaj listesi başarıyla döndürüldü",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Message" },
                      description: "Mesaj listesi (en yeniden eskiye doğru)",
                    },
                    cursor: {
                      type: "string",
                      nullable: true,
                      description: "Sayfalama için cursor (sonraki sayfa için kullanılır)",
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "3EB0123456789ABCDEF",
                      from: "905551234567@s.whatsapp.net",
                      fromMe: false,
                      participant: null,
                      timestamp: 1704067200000,
                      type: "conversation",
                      text: "Merhaba, nasılsın?",
                    },
                    {
                      id: "3EB0123456789ABCDEE",
                      from: "905551234567@s.whatsapp.net",
                      fromMe: true,
                      participant: null,
                      timestamp: 1704067100000,
                      type: "conversation",
                      text: "İyiyim, teşekkürler!",
                    },
                  ],
                  cursor: null,
                },
              },
            },
          },
          400: {
            description: "Geçersiz parametreler (jid eksik veya geçersiz)",
          },
        },
      },
    },
    "/{sessionId}/messages/send": {
      post: {
        tags: ["Messages"],
        summary: "Mesaj gönder",
        description: "Kişi veya gruba mesaj gönderir. Metin mesajı, medya, konum, kişi kartı, anket gibi farklı mesaj tiplerini destekler. Baileys API'ye göre mesaj formatı: https://baileys.wiki/docs/api/",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendMessageRequest" },
              examples: {
                textMessage: {
                  summary: "Metin mesajı gönder",
                  description: "Basit bir metin mesajı gönderir",
                  value: {
                    jid: "905551234567@s.whatsapp.net",
                    type: "text",
                    message: "Merhaba! Bu bir test mesajıdır.",
                    options: {},
                  },
                },
                mediaMessage: {
                  summary: "Medya mesajı gönder",
                  description: "Resim, video, ses veya dosya gönderir",
                  value: {
                    jid: "905551234567@s.whatsapp.net",
                    type: "image",
                    message: {
                      image: { url: "https://example.com/image.jpg" },
                      caption: "Bu bir resim",
                    },
                    options: {},
                  },
                },
                locationMessage: {
                  summary: "Konum mesajı gönder",
                  description: "Konum bilgisi gönderir",
                  value: {
                    jid: "905551234567@s.whatsapp.net",
                    message: {
                      location: {
                        degreesLatitude: 41.0082,
                        degreesLongitude: 28.9784,
                        name: "İstanbul",
                      },
                    },
                  },
                },
                contactCard: {
                  summary: "Kişi kartı gönder",
                  description: "vCard formatında kişi bilgisi gönderir",
                  value: {
                    jid: "905551234567@s.whatsapp.net",
                    message: {
                      contacts: {
                        contacts: [
                          {
                            displayName: "Ahmet Yılmaz",
                            vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:Ahmet Yılmaz\nTEL:905551234567\nEND:VCARD",
                          },
                        ],
                      },
                    },
                  },
                },
                pollMessage: {
                  summary: "Anket mesajı gönder",
                  description: "Anket oluşturur ve gönderir",
                  value: {
                    jid: "120363123456789012@g.us",
                    message: {
                      poll: {
                        name: "Hangi renk daha güzel?",
                        values: ["Kırmızı", "Mavi", "Yeşil"],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          202: {
            description: "Mesaj başarıyla kuyruğa alındı ve gönderiliyor",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
                example: {
                  accountId: "ugur",
                  jid: "905551234567@s.whatsapp.net",
                  status: "queued",
                },
              },
            },
          },
          400: {
            description: "Geçersiz istek (jid veya message eksik)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
                example: {
                  error: "jid ve message alanları zorunludur",
                },
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
        description: "Birden fazla mesajı aynı anda gönderir. Her mesaj için ayrı bir istek gönderilir. Maksimum 100 mesaj gönderilebilir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/SendMessageRequest" },
                maxItems: 100,
                description: "Gönderilecek mesajların listesi (maksimum 100)",
              },
              example: [
                {
                  jid: "905551234567@s.whatsapp.net",
                  type: "text",
                  message: "Merhaba!",
                },
                {
                  jid: "905559876543@s.whatsapp.net",
                  type: "text",
                  message: "Nasılsın?",
                },
              ],
            },
          },
        },
        responses: {
          202: {
            description: "Toplu mesajlar kuyruğa alındı",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/MessageResponse" },
                      description: "Her mesaj için gönderim sonucu",
                    },
                  },
                },
                example: {
                  data: [
                    {
                      accountId: "ugur",
                      jid: "905551234567@s.whatsapp.net",
                      status: "queued",
                    },
                    {
                      accountId: "ugur",
                      jid: "905559876543@s.whatsapp.net",
                      status: "queued",
                    },
                  ],
                },
              },
            },
          },
          400: {
            description: "Geçersiz istek (boş liste veya çok fazla mesaj)",
          },
        },
      },
    },
    "/{sessionId}/messages/download": {
      post: {
        tags: ["Messages"],
        summary: "Mesaj medyasını indir",
        description: "Mesajdaki medya içeriğini (resim, video, ses, dosya) Base64 formatında indirir. Baileys downloadContentFromMessage fonksiyonunu kullanır.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DownloadMediaRequest" },
              example: {
                message: {
                  imageMessage: {
                    url: "https://mmg.whatsapp.net/...",
                    mimetype: "image/jpeg",
                  },
                },
                mediaType: "image",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Medya başarıyla indirildi (Base64 formatında)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "string",
                      description: "Base64 kodlanmış medya içeriği",
                      example: "/9j/4AAQSkZJRgABAQAAAQ...",
                    },
                  },
                },
                example: {
                  data: "/9j/4AAQSkZJRgABAQAAAQ...",
                },
              },
            },
          },
          400: {
            description: "Geçersiz istek (message veya mediaType eksik)",
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
        description: "Grup ayarlarını (restrict, announce) günceller. Sadece grup adminleri bu işlemi yapabilir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i",
            example: "120363123456789012@g.us",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  restrict: {
                    type: "boolean",
                    description: "Mesaj gönderme kısıtlaması: true = Sadece adminler mesaj gönderebilir, false = Herkes mesaj gönderebilir. Bu ayar açıkken normal üyeler sadece mesaj okuyabilir, gönderemez.",
                    example: true,
                  },
                  announce: {
                    type: "boolean",
                    description: "Duyuru kısıtlaması: true = Sadece adminler duyuru yapabilir, false = Herkes duyuru yapabilir. Duyurular grup içinde özel bir mesaj tipidir.",
                    example: false,
                  },
                },
                example: {
                  restrict: true,
                  announce: false,
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Grup ayarları başarıyla güncellendi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      example: "settings_updated",
                      description: "İşlem durumu - 'settings_updated' = ayarlar başarıyla güncellendi",
                    },
                    groupJid: {
                      type: "string",
                      example: "120363123456789012@g.us",
                      description: "Güncellenen grubun JID'i (WhatsApp grup kimliği)",
                    },
                    updates: {
                      type: "array",
                      items: { type: "string" },
                      description: "Güncellenen ayarların listesi. Her eleman 'ayar_adı: yeni_değer' formatındadır.",
                      example: ["restrict: true", "announce: false"],
                    },
                  },
                },
                example: {
                  status: "settings_updated",
                  groupJid: "120363123456789012@g.us",
                  updates: ["restrict: true", "announce: false"],
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/groups/{jid}/invite-link": {
      get: {
        tags: ["Groups"],
        summary: "Grup davet linki al",
        description: "Grup için davet linki alır veya mevcut linki döndürür. Sadece grup adminleri bu işlemi yapabilir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i",
            example: "120363123456789012@g.us",
          },
          {
            in: "query",
            name: "reset",
            schema: { type: "boolean" },
            description: "true: Mevcut linki sıfırlayıp yeni link oluştur, false: Mevcut linki döndür",
            example: false,
          },
        ],
        responses: {
          200: {
            description: "Davet linki başarıyla döndürüldü",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    inviteLink: {
                      type: "string",
                      description: "Tam davet linki URL'i",
                      example: "https://chat.whatsapp.com/ABC123XYZ",
                    },
                    code: {
                      type: "string",
                      description: "Davet linki kodu",
                      example: "ABC123XYZ",
                    },
                    groupJid: {
                      type: "string",
                      description: "Grup JID'i",
                      example: "120363123456789012@g.us",
                    },
                  },
                },
                example: {
                  inviteLink: "https://chat.whatsapp.com/ABC123XYZ",
                  code: "ABC123XYZ",
                  groupJid: "120363123456789012@g.us",
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
        description: "Mevcut davet linkini iptal eder ve yeni bir link oluşturur. Eski link artık çalışmaz. Sadece grup adminleri bu işlemi yapabilir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i",
            example: "120363123456789012@g.us",
          },
        ],
        responses: {
          200: {
            description: "Davet linki başarıyla sıfırlandı",
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
                example: {
                  inviteLink: "https://chat.whatsapp.com/NEW123XYZ",
                  code: "NEW123XYZ",
                  groupJid: "120363123456789012@g.us",
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/groups/{jid}/description": {
      patch: {
        tags: ["Groups"],
        summary: "Grup açıklamasını güncelle",
        description: "Grup açıklamasını (description) değiştirir. Sadece grup adminleri bu işlemi yapabilir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i",
            example: "120363123456789012@g.us",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["description"],
                properties: {
                  description: {
                    type: "string",
                    description: "Yeni grup açıklaması",
                    example: "Bu grup proje ekibimiz için oluşturulmuştur.",
                  },
                },
              },
              example: {
                description: "Bu grup proje ekibimiz için oluşturulmuştur.",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Grup açıklaması başarıyla güncellendi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "description_updated" },
                    groupJid: { type: "string" },
                    description: { type: "string" },
                  },
                },
                example: {
                  status: "description_updated",
                  groupJid: "120363123456789012@g.us",
                  description: "Bu grup proje ekibimiz için oluşturulmuştur.",
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/groups/{jid}/subject": {
      patch: {
        tags: ["Groups"],
        summary: "Grup adını (başlığını) güncelle",
        description: "Grup adını değiştirir. Sadece grup adminleri bu işlemi yapabilir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i",
            example: "120363123456789012@g.us",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["subject"],
                properties: {
                  subject: {
                    type: "string",
                    description: "Yeni grup adı (maksimum 25 karakter)",
                    example: "Yeni Proje Ekibi",
                  },
                },
              },
              example: {
                subject: "Yeni Proje Ekibi",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Grup adı başarıyla güncellendi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "subject_updated" },
                    groupJid: { type: "string" },
                    subject: { type: "string" },
                  },
                },
                example: {
                  status: "subject_updated",
                  groupJid: "120363123456789012@g.us",
                  subject: "Yeni Proje Ekibi",
                },
              },
            },
          },
        },
      },
    },
    "/{sessionId}/groups/{jid}/picture": {
      post: {
        tags: ["Groups"],
        summary: "Grup fotoğrafını güncelle",
        description: "Grup profil fotoğrafını değiştirir. Sadece grup adminleri bu işlemi yapabilir. Resim Base64 formatında gönderilmelidir.",
        parameters: [
          {
            in: "path",
            name: "sessionId",
            required: true,
            schema: { type: "string" },
            description: "Session ID",
            example: "ugur",
          },
          {
            in: "path",
            name: "jid",
            required: true,
            schema: { type: "string" },
            description: "Grup JID'i",
            example: "120363123456789012@g.us",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: {
                    type: "string",
                    description: "Base64 kodlanmış resim (data:image/jpeg;base64,... formatında veya sadece base64 string)",
                    example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
                  },
                },
              },
              example: {
                image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Grup fotoğrafı başarıyla güncellendi",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "picture_updated" },
                    groupJid: { type: "string" },
                  },
                },
                example: {
                  status: "picture_updated",
                  groupJid: "120363123456789012@g.us",
                },
              },
            },
          },
        },
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
        description: "WhatsApp mesajı bilgisi",
        properties: {
          id: {
            type: "string",
            description: "Mesaj ID'si (WhatsApp tarafından oluşturulan benzersiz ID)",
            example: "3EB0123456789ABCDEF",
          },
          from: {
            type: "string",
            description: "Gönderen JID'i (kişi veya grup)",
            example: "905551234567@s.whatsapp.net",
          },
          fromMe: {
            type: "boolean",
            description: "Mesajın sizin tarafınızdan gönderilip gönderilmediği",
            example: false,
          },
          participant: {
            type: "string",
            nullable: true,
            description: "Grup mesajlarında gerçek gönderen (grup içinde kim gönderdi)",
            example: "905559876543@s.whatsapp.net",
          },
          timestamp: {
            type: "number",
            description: "Mesaj zamanı (Unix timestamp - milisaniye)",
            example: 1704067200000,
          },
          type: {
            type: "string",
            description: "Mesaj tipi (conversation, imageMessage, videoMessage, audioMessage, documentMessage, locationMessage, vb.)",
            example: "conversation",
          },
          text: {
            type: "string",
            nullable: true,
            description: "Mesaj metni (metin mesajları için). Medya mesajlarında caption olabilir",
            example: "Merhaba, nasılsın?",
          },
        },
        example: {
          id: "3EB0123456789ABCDEF",
          from: "905551234567@s.whatsapp.net",
          fromMe: false,
          participant: null,
          timestamp: 1704067200000,
          type: "conversation",
          text: "Merhaba, nasılsın?",
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
          subject: {
            type: "string",
            description: "Grup adı (maksimum 25 karakter)",
            example: "Yeni Proje Ekibi",
          },
          participants: {
            type: "array",
            items: {
              type: "string",
              description: "Katılımcı JID'i veya telefon numarası (örn: '905551234567' veya '905551234567@s.whatsapp.net')",
            },
            description: "İlk katılımcılar (en az 1 kişi gerekir, maksimum 256 kişi)",
            example: ["905551234567", "905559876543"],
            minItems: 1,
            maxItems: 256,
          },
        },
      },
      GroupParticipantRequest: {
        type: "object",
        required: ["participants", "action"],
        properties: {
          participants: {
            type: "array",
            items: {
              type: "string",
              description: "Katılımcı JID'i veya telefon numarası",
            },
            description: "Güncellenecek katılımcılar (en az 1 kişi)",
            example: ["905551234567", "905559876543"],
            minItems: 1,
          },
          action: {
            type: "string",
            enum: ["add", "remove", "promote", "demote"],
            default: "add",
            description: "Yapılacak işlem: 'add' = ekle, 'remove' = çıkar, 'promote' = yönetici yap, 'demote' = yöneticilikten çıkar",
            example: "add",
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
        description: "Mesaj gönderim sonucu",
        properties: {
          accountId: {
            type: "string",
            description: "Session ID (accountId)",
            example: "ugur",
          },
          jid: {
            type: "string",
            description: "Alıcı JID'i (mesajın gönderildiği kişi veya grup)",
            example: "905551234567@s.whatsapp.net",
          },
          status: {
            type: "string",
            description: "Mesaj durumu. 'queued' = kuyruğa alındı ve gönderiliyor",
            enum: ["queued", "sent", "delivered", "read", "error"],
            example: "queued",
          },
        },
        example: {
          accountId: "ugur",
          jid: "905551234567@s.whatsapp.net",
          status: "queued",
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
          owner: { type: "string", nullable: true },
          subjectOwner: { type: "string", nullable: true },
          subjectTime: { type: "integer", nullable: true },
          creation: { type: "integer", nullable: true },
          desc: { type: "string", nullable: true },
          descOwner: { type: "string", nullable: true },
          descId: { type: "string", nullable: true },
          restrict: { type: "boolean" },
          announce: { type: "boolean" },
          size: { type: "integer" },
          participants: {
            type: "array",
            items: { type: "object" },
            description: "Grup katılımcıları",
          },
          ephemeralDuration: { type: "integer", nullable: true },
          inviteCode: { type: "string", nullable: true },
        },
      },
      SendMessageRequest: {
        type: "object",
        required: ["jid", "message"],
        properties: {
          jid: {
            type: "string",
            description: "Alıcı JID'i (kişi veya grup). Telefon numarası veya tam JID formatında olabilir",
            example: "905551234567@s.whatsapp.net",
          },
          type: {
            type: "string",
            description: 'Mesaj tipi. "text" ise message alanı string olmalıdır. Diğer tipler için message object olmalıdır. Baileys API dokümantasyonuna bakın: https://baileys.wiki/docs/api/',
            enum: ["text", "image", "video", "audio", "document", "location", "contact", "poll", "sticker"],
            example: "text",
          },
          message: {
            description: "Mesaj içeriği. type='text' ise string, diğer durumlarda Baileys message object formatında olmalıdır. Örnekler: {text: 'Merhaba'}, {image: {url: '...'}}, {location: {...}}, {poll: {...}}",
            oneOf: [
              { type: "string", description: "Metin mesajı için", example: "Merhaba!" },
              {
                type: "object",
                description: "Diğer mesaj tipleri için Baileys message object",
                example: {
                  image: { url: "https://example.com/image.jpg" },
                  caption: "Bu bir resim",
                },
              },
            ],
          },
          options: {
            type: "object",
            additionalProperties: true,
            nullable: true,
            description: "Ek mesaj seçenekleri (Baileys sendMessage options). Örn: {quoted: {...}, mentions: [...]}",
            example: {},
          },
        },
        example: {
          jid: "905551234567@s.whatsapp.net",
          type: "text",
          message: "Merhaba! Bu bir test mesajıdır.",
          options: {},
        },
      },
      DownloadMediaRequest: {
        type: "object",
        required: ["message", "mediaType"],
        description: "Medya indirme isteği. Baileys message object ve medya tipi gereklidir.",
        properties: {
          message: {
            description: "Baileys message nesnesi (mesaj içeriği). Örn: {imageMessage: {...}}, {videoMessage: {...}}, {audioMessage: {...}}, {documentMessage: {...}}",
            example: {
              imageMessage: {
                url: "https://mmg.whatsapp.net/...",
                mimetype: "image/jpeg",
                fileLength: 12345,
              },
            },
          },
          mediaType: {
            type: "string",
            enum: ["image", "video", "audio", "document", "sticker"],
            description: "İndirilecek medya tipi. Baileys downloadContentFromMessage fonksiyonuna geçirilir.",
            example: "image",
          },
        },
        example: {
          message: {
            imageMessage: {
              url: "https://mmg.whatsapp.net/...",
              mimetype: "image/jpeg",
            },
          },
          mediaType: "image",
        },
      },
    },
  },
};

export default swaggerSpec;

