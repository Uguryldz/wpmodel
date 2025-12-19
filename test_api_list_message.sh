#!/bin/bash

# Test script: Liste mesajı API ile gönder
# Kullanım: ./test_api_list_message.sh <sessionId> <jid>

SESSION_ID=${1:-"temp-1766151374158"}
JID=${2:-"905538490699@s.whatsapp.net"}
API_URL="http://localhost:3000"

echo "📤 Liste mesajı API ile gönderiliyor..."
echo "   Session ID: $SESSION_ID"
echo "   Hedef: $JID"
echo "   API URL: $API_URL"

curl -X POST "${API_URL}/${SESSION_ID}/messages/send/list" \
  -H "Content-Type: application/json" \
  -d '{
    "jid": "'"$JID"'",
    "text": "Sipariş durumunuzu öğrenmek için lütfen bir seçenek seçin:",
    "title": "Sipariş Durumu",
    "buttonText": "Seçenekleri Görüntüle",
    "footer": "Test",
    "sections": [
      {
        "title": "Sipariş İşlemleri",
        "rows": [
          {
            "title": "Sipariş Durumu",
            "description": "Siparişinizin durumunu öğrenin",
            "rowId": "siparis_durumu"
          },
          {
            "title": "Kargo Takibi",
            "description": "Kargo durumunu takip edin",
            "rowId": "kargo_takibi"
          },
          {
            "title": "İade/Değişim",
            "description": "İade veya değişim işlemleri",
            "rowId": "iade_degisim"
          }
        ]
      },
      {
        "title": "Destek",
        "rows": [
          {
            "title": "Müşteri Hizmetleri",
            "description": "Bizimle iletişime geçin",
            "rowId": "musteri_hizmetleri"
          },
          {
            "title": "Sık Sorulan Sorular",
            "description": "SSS sayfasına gidin",
            "rowId": "sss"
          }
        ]
      }
    ]
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -v

echo ""
echo "✅ Test tamamlandı!"
