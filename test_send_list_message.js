// Test script: Liste mesajı gönder
// Kullanım: node test_send_list_message.js

import { listSessions } from './src/baileys/core/session.js';
import { sendListMessage } from './src/baileys/messages/interactive.js';

const targetNumber = '905538490699';
const jid = `${targetNumber}@s.whatsapp.net`;

// Aktif session'ları bul
const sessions = listSessions();
console.log('Mevcut session\'lar:', sessions);

if (sessions.length === 0) {
  console.error('❌ Aktif session bulunamadı!');
  process.exit(1);
}

// İlk açık session'ı kullan (veya ilk session'ı)
const sessionId = sessions[0].id;
console.log(`📤 Liste mesajı gönderiliyor...`);
console.log(`   Session ID: ${sessionId}`);
console.log(`   Hedef: ${jid}`);

const messageData = {
  text: "Bir seçenek seç",
  footer: "Test",
  title: "Liste Testi",
  buttonText: "Seçenekler",
  sections: [
    {
      title: "Menü",
      rows: [
        { title: "Ürün", rowId: "urun" },
        { title: "Fiyat", rowId: "fiyat" },
        { title: "Destek", rowId: "destek" }
      ]
    }
  ]
};

try {
  const result = await sendListMessage(
    sessionId,
    jid,
    messageData.text,
    messageData.title,
    messageData.buttonText,
    messageData.sections,
    messageData.footer
  );
  
  console.log('✅ Liste mesajı başarıyla gönderildi!');
  console.log('   Sonuç:', result);
} catch (error) {
  console.error('❌ Liste mesajı gönderilemedi:', error);
  console.error('   Hata detayı:', error.message);
  process.exit(1);
}
