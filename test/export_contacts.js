import { prisma } from '../src/shared.js';
import { writeFileSync } from 'fs';

async function exportContacts() {
  try {
    console.log('Kişi listesi export ediliyor...');
    
    const contacts = await prisma.contact.findMany({
      orderBy: [
        { sessionId: 'asc' },
        { name: 'asc' }
      ]
    });

    console.log(`Toplam ${contacts.length} kişi bulundu`);

    // CSV formatında export
    const csvHeader = 'sessionId,id,name,notify,verifiedName,imgUrl,status\n';
    const csvRows = contacts.map(c => {
      const escape = (str) => {
        if (!str) return '';
        return String(str).replace(/"/g, '""');
      };
      return `"${escape(c.sessionId)}","${escape(c.id)}","${escape(c.name)}","${escape(c.notify)}","${escape(c.verifiedName)}","${escape(c.imgUrl)}","${escape(c.status)}"`;
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    writeFileSync('test/kisiler_export.csv', csvContent, 'utf8');
    console.log('✅ CSV dosyası oluşturuldu: test/kisiler_export.csv');

    // JSON formatında da export
    writeFileSync('test/kisiler_export.json', JSON.stringify(contacts, null, 2), 'utf8');
    console.log('✅ JSON dosyası oluşturuldu: test/kisiler_export.json');

    // SessionId'ye göre gruplama
    const bySession = {};
    contacts.forEach(c => {
      if (!bySession[c.sessionId]) {
        bySession[c.sessionId] = [];
      }
      bySession[c.sessionId].push(c);
    });

    console.log('\nSessionId\'ye göre dağılım:');
    Object.keys(bySession).forEach(sessionId => {
      console.log(`  ${sessionId}: ${bySession[sessionId].length} kişi`);
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('Hata:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

exportContacts();


