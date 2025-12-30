import { Client } from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
config();

/**
 * Prisma migration'larını çalıştırır
 */
async function runMigrations() {
  console.log('📦 Prisma migration\'larını çalıştırılıyor...\n');
  
  try {
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy');
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
    console.log('✅ Migration\'lar başarıyla uygulandı\n');
    return true;
  } catch (error) {
    console.error('❌ Migration hatası:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return false;
  }
}

/**
 * PostgreSQL ek index'lerini uygular
 */
async function applyIndexes() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Veritabanına bağlandı\n');

    const sql = readFileSync('prisma/migrations/postgresql_indexes.sql', 'utf8');
    
    // SQL dosyasını statement'lara böl (yorumları ve boş satırları atla)
    const statements = sql
      .split(';')
      .map(s => {
        // Yorum satırlarını temizle
        const lines = s.split('\n')
          .map(line => {
            const commentIndex = line.indexOf('--');
            return commentIndex >= 0 ? line.substring(0, commentIndex) : line;
          })
          .join('\n');
        return lines.trim();
      })
      .filter(s => s.length > 0 && !s.match(/^\s*$/));

    console.log(`${statements.length} index komutu bulundu\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      try {
        await client.query(statement);
        console.log(`✅ Index ${i + 1}/${statements.length} uygulandı`);
        successCount++;
      } catch (error) {
        // Index zaten varsa devam et
        if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
          console.log(`ℹ️  Index ${i + 1}/${statements.length} zaten mevcut`);
          skipCount++;
        } else {
          console.error(`❌ Index ${i + 1}/${statements.length} hatası:`, error.message);
          errorCount++;
          // Hatalı index'i atla ve devam et
        }
      }
    }

    console.log(`\n📊 Özet:`);
    console.log(`   ✅ Başarılı: ${successCount}`);
    console.log(`   ℹ️  Zaten mevcut: ${skipCount}`);
    if (errorCount > 0) {
      console.log(`   ❌ Hatalı: ${errorCount}`);
    }
    console.log('');

    await client.end();
    return errorCount === 0;
  } catch (error) {
    console.error('❌ Veritabanı hatası:', error.message);
    await client.end();
    return false;
  }
}

/**
 * Ana fonksiyon
 */
async function main() {
  console.log('🚀 Prisma Migration ve Index Uygulama Script\'i\n');
  console.log('=' .repeat(50) + '\n');

  // 1. Migration'ları çalıştır
  const migrationSuccess = await runMigrations();
  
  if (!migrationSuccess) {
    console.error('❌ Migration\'lar başarısız oldu. Index\'ler uygulanmayacak.');
    process.exit(1);
  }

  console.log('=' .repeat(50) + '\n');

  // 2. Index'leri uygula
  const indexSuccess = await applyIndexes();
  
  console.log('=' .repeat(50) + '\n');
  
  if (indexSuccess) {
    console.log('🎉 Tüm işlemler başarıyla tamamlandı!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Index\'ler uygulanırken bazı hatalar oluştu.\n');
    process.exit(1);
  }
}

// Script'i çalıştır
main();

