# WhatsApp Business Özellikleri - Baileys Desteği

Bu dokümantasyon, Baileys kütüphanesi ile WhatsApp Business özelliklerinin nasıl kullanılabileceğini açıklar.

## Desteklenen Özellikler

Baileys aşağıdaki WhatsApp Business özelliklerini destekler:

### 1. Butonlu Mesajlar (Button Messages)
Kullanıcılara hızlı yanıt seçenekleri sunar. En fazla 3 buton gönderilebilir.

**Özellikler:**
- Quick Reply Buttons (Hızlı Yanıt Butonları)
- Call-to-Action (CTA) Buttons (URL veya telefon araması)

**Format:**
```typescript
{
  text: "Mesaj metni",
  footer: "Alt bilgi (opsiyonel)",
  buttons: [
    {
      buttonId: 'btn1',
      buttonText: { displayText: 'Buton 1' },
      type: 1  // 1 = Quick Reply, 2 = URL, 3 = Call
    },
    {
      buttonId: 'btn2',
      buttonText: { displayText: 'Buton 2' },
      type: 1
    }
  ],
  headerType: 1  // 1 = Text, 2 = Image, 3 = Video, 4 = Document
}
```

### 2. Liste Mesajları (List Messages)
Kullanıcılara menü seçenekleri sunar. En fazla 10 seçenek gösterilebilir.

**Özellikler:**
- Başlık ve açıklama
- Bölümler (sections) ile gruplandırma
- Her bölümde birden fazla satır (row)

**Format:**
```typescript
{
  text: "Mesaj metni",
  footer: "Alt bilgi",
  title: "Liste Başlığı",
  buttonText: "Listeyi Görüntüle",
  sections: [
    {
      title: "Bölüm 1",
      rows: [
        {
          title: "Seçenek 1",
          description: "Açıklama 1",
          rowId: "option1"
        },
        {
          title: "Seçenek 2",
          description: "Açıklama 2",
          rowId: "option2"
        }
      ]
    },
    {
      title: "Bölüm 2",
      rows: [
        {
          title: "Seçenek 3",
          description: "Açıklama 3",
          rowId: "option3"
        }
      ]
    }
  ]
}
```

### 3. Şablon Mesajları (Template Messages)
WhatsApp Business API ile onaylanmış şablonlar kullanılır.

**Özellikler:**
- Onaylanmış şablonlar kullanılmalı
- 24 saatlik oturum dışında gönderilebilir
- Değişkenler (variables) kullanılabilir

**Format:**
```typescript
{
  template: {
    name: "template_name",
    language: {
      code: "tr",
      policy: "deterministic"
    },
    components: [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            text: "Değişken değeri"
          }
        ]
      }
    ]
  }
}
```

### 4. Ürün Mesajları (Product Messages)
Katalogdan ürün gösterimi.

**Format:**
```typescript
{
  text: "Ürün açıklaması",
  footer: "Alt bilgi",
  productList: [
    {
      title: "Kategori",
      products: [
        { productId: "1234" },
        { productId: "5678" }
      ]
    }
  ],
  businessOwnerJid: "905551234567@s.whatsapp.net",
  thumbnail: "https://example.com/product.jpg"
}
```

### 5. İnteraktif Formlar (Interactive Flows)
Çok adımlı formlar ve interaktif deneyimler.

**Not:** Bu özellik daha gelişmiş bir yapılandırma gerektirir.

## Önemli Notlar

1. **24 Saatlik Oturum:** Butonlu ve liste mesajları genellikle 24 saatlik kullanıcı başlatılmış oturum içinde gönderilebilir. Oturum dışında göndermek için onaylanmış şablon kullanılmalıdır.

2. **Şablon Onayı:** Şablonlar WhatsApp Business API üzerinden onaylanmalıdır (genellikle 24-72 saat sürer).

3. **Platform Desteği:** Tüm interaktif mesajlar iOS, Android ve Web platformlarında desteklenir.

4. **Buton Sınırları:**
   - En fazla 3 buton
   - Her buton en fazla 20 karakter
   - Footer en fazla 60 karakter

5. **Liste Sınırları:**
   - En fazla 10 seçenek
   - Başlık en fazla 24 karakter
   - Açıklama en fazla 72 karakter

## Kullanım Senaryoları

- **Müşteri Desteği:** Hızlı yanıt butonları ile sık sorulan sorular
- **Sipariş Takibi:** Liste mesajları ile sipariş durumu seçenekleri
- **Randevu Sistemi:** Butonlu mesajlar ile randevu onayı/iptali
- **E-ticaret:** Ürün mesajları ile katalog gösterimi
- **Anketler:** Liste mesajları ile çoktan seçmeli sorular
