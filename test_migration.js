const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testMigration() {
  try {
    console.log('🔍 Mevcut durumu kontrol ediliyor...\n');
    
    // Session'ları kontrol et
    const sessions = await prisma.session.findMany({
      take: 5,
      select: {
        sessionId: true,
        id: true,
        phoneMapId: true,
      },
    });
    console.log('📋 Sessions (ilk 5):', JSON.stringify(sessions, null, 2));
    
    // SessionPhoneMap kontrolü
    const phoneMaps = await prisma.sessionPhoneMap.findMany({
      take: 5,
    });
    console.log('\n📱 SessionPhoneMap (ilk 5):', JSON.stringify(phoneMaps, null, 2));
    
    // Tablo sayılarını kontrol et
    const chatCount = await prisma.chat.count();
    const contactCount = await prisma.contact.count();
    const messageCount = await prisma.message.count();
    const groupCount = await prisma.groupMetadata.count();
    const templateCount = await prisma.messageTemplate.count();
    
    console.log('\n📊 Tablo sayıları:');
    console.log('  - Chats:', chatCount);
    console.log('  - Contacts:', contactCount);
    console.log('  - Messages:', messageCount);
    console.log('  - GroupMetadata:', groupCount);
    console.log('  - MessageTemplates:', templateCount);
    
    // SessionId kullanan örnek kayıtlar
    if (chatCount > 0) {
      const sampleChat = await prisma.chat.findFirst({
        select: {
          pkId: true,
          id: true,
          // sessionId alanı varsa göster
        },
      });
      console.log('\n💬 Örnek Chat:', JSON.stringify(sampleChat, null, 2));
    }
    
    console.log('\n✅ Kontrol tamamlandı');
  } catch (error) {
    console.error('❌ Hata:', error.message);
    if (error.code) {
      console.error('   Kod:', error.code);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testMigration();
