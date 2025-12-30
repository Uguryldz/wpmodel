import { Client } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

// .env dosyasını yükle
config();

/**
 * PostgreSQL Database Setup Script
 * 
 * Bu script:
 * 1. PostgreSQL'e bağlanır
 * 2. Database'in var olup olmadığını kontrol eder
 * 3. Yoksa oluşturur
 * 4. Başarı mesajı verir
 */

async function setupDatabase() {
  // DATABASE_URL'i .env'den oku
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ HATA: DATABASE_URL .env dosyasında tanımlı değil!');
    process.exit(1);
  }

  // PostgreSQL connection string'ini parse et
  // Format: postgresql://user:password@host:port/database
  const urlPattern = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
  const match = databaseUrl.match(urlPattern);

  if (!match) {
    console.error('❌ HATA: DATABASE_URL formatı geçersiz!');
    console.error('   Beklenen format: postgresql://user:password@host:port/database');
    process.exit(1);
  }

  const [, user, password, host, port, databaseName] = match;

  console.log('📦 PostgreSQL Database Setup Başlatılıyor...\n');
  console.log(`   Host: ${host}`);
  console.log(`   Port: ${port}`);
  console.log(`   User: ${user}`);
  console.log(`   Database: ${databaseName}\n`);

  // PostgreSQL'e bağlan (postgres database'ine, çünkü hedef database henüz yok olabilir)
  const adminClient = new Client({
    host,
    port: parseInt(port),
    user,
    password,
    database: 'postgres', // Varsayılan database'e bağlan
  });

  try {
    await adminClient.connect();
    console.log('✅ PostgreSQL sunucusuna bağlandı\n');

    // Database'in var olup olmadığını kontrol et
    const checkQuery = `
      SELECT 1 FROM pg_database WHERE datname = $1
    `;
    const result = await adminClient.query(checkQuery, [databaseName]);

    if (result.rows.length > 0) {
      console.log(`ℹ️  Database '${databaseName}' zaten mevcut\n`);
    } else {
      // Database'i oluştur
      console.log(`🔨 Database '${databaseName}' oluşturuluyor...`);
      
      // NOT: CREATE DATABASE parametreli query ile çalışmaz, string interpolation kullanmalıyız
      // Ama güvenlik için database name'i validate edelim
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
        throw new Error(`Geçersiz database adı: ${databaseName}`);
      }

      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`✅ Database '${databaseName}' başarıyla oluşturuldu\n`);
    }

    await adminClient.end();

    // Oluşturulan database'e bağlanıp test et
    const testClient = new Client({
      host,
      port: parseInt(port),
      user,
      password,
      database: databaseName,
    });

    await testClient.connect();
    console.log(`✅ Database '${databaseName}' bağlantısı test edildi\n`);
    await testClient.end();

    console.log('🎉 Database setup tamamlandı!\n');
    console.log('📝 Sonraki adımlar:');
    console.log('   1. Prisma schema\'yı kontrol edin: prisma/schema.prisma');
    console.log('   2. Migration oluşturun: npx prisma migrate dev');
    console.log('   3. Prisma client\'ı generate edin: npx prisma generate\n');

  } catch (error) {
    console.error('❌ HATA:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 PostgreSQL sunucusu çalışmıyor olabilir.');
      console.error('   Lütfen PostgreSQL servisinin başlatıldığından emin olun.\n');
    } else if (error.code === '28P01') {
      console.error('\n💡 Kullanıcı adı veya şifre hatalı.');
      console.error('   Lütfen .env dosyasındaki DATABASE_URL\'i kontrol edin.\n');
    } else if (error.code === '3D000') {
      console.error('\n💡 PostgreSQL sunucusuna bağlanılamıyor.');
      console.error('   Lütfen host, port ve kullanıcı bilgilerini kontrol edin.\n');
    }

    await adminClient.end().catch(() => {});
    process.exit(1);
  }
}

// Script'i çalıştır
setupDatabase();

