import { prisma } from '../src/shared.js';
import { getOrCreateInstance, getAccountId } from '../src/baileysClient.js';

const sessionId = 'account-1765362104362'; // Session ID'yi buraya yaz

async function syncAllContacts() {
  try {
    console.log('Tüm contact\'lar WhatsApp\'tan çekiliyor ve database\'e kaydediliyor...');
    
    const accountId = getAccountId(sessionId);
    const instance = getOrCreateInstance(accountId);
    
    if (instance.connectionState.status !== 'open') {
      console.error('❌ Bağlantı açık değil! Status:', instance.connectionState.status);
      console.log('Lütfen önce WhatsApp bağlantısını açın.');
      await prisma.$disconnect();
      return;
    }
    
    console.log('✅ Bağlantı açık, contact\'lar çekiliyor...');
    
    // Memory store'dan tüm contact'ları al
    const memoryContacts = Array.from(instance.contactsStore.values()).filter(
      (c) => c.id && !c.id.endsWith("@g.us")
    );
    
    console.log(`Memory store'da ${memoryContacts.length} contact bulundu`);
    
    // Chats'ten de contact'ları al (eğer memory store'da yoksa)
    const chatContacts = Array.from(instance.chatsStore.values()).filter(
      (c) => c.id && !c.id.endsWith("@g.us")
    );
    
    // Tüm contact'ları birleştir (duplicate kontrolü ile)
    const allContacts = new Map();
    
    memoryContacts.forEach(c => {
      allContacts.set(c.id, c);
    });
    
    chatContacts.forEach(c => {
      if (!allContacts.has(c.id)) {
        allContacts.set(c.id, {
          id: c.id,
          name: c.name || c.displayName || null,
          notify: null,
          verifiedName: null,
          imgUrl: null,
          status: null,
        });
      }
    });
    
    console.log(`Toplam ${allContacts.size} unique contact bulundu`);
    
    // Veritabanına kaydet
    let saved = 0;
    let updated = 0;
    let errors = 0;
    
    for (const [id, contact] of allContacts) {
      try {
        await prisma.contact.upsert({
          where: {
            sessionId_id: {
              sessionId,
              id: contact.id,
            },
          },
          create: {
            sessionId,
            id: contact.id,
            name: contact.name || null,
            notify: contact.notify || null,
            verifiedName: contact.verifiedName || null,
            imgUrl: contact.imgUrl || null,
            status: contact.status || null,
          },
          update: {
            name: contact.name || undefined,
            notify: contact.notify || undefined,
            verifiedName: contact.verifiedName || undefined,
            imgUrl: contact.imgUrl || undefined,
            status: contact.status || undefined,
          },
        });
        
        saved++;
      } catch (error) {
        console.error(`Contact kaydedilemedi (${contact.id}):`, error.message);
        errors++;
      }
    }
    
    console.log('\n✅ Senkronizasyon tamamlandı!');
    console.log(`  - Kaydedilen/Güncellenen: ${saved}`);
    console.log(`  - Hata: ${errors}`);
    console.log(`  - Toplam: ${allContacts.size}`);
    
    // Veritabanındaki toplam sayıyı kontrol et
    const dbCount = await prisma.contact.count({
      where: { sessionId },
    });
    console.log(`\nVeritabanında toplam ${dbCount} contact var`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Hata:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

syncAllContacts();
