require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI не найден в .env файле');
  process.exit(1);
}

const dbNameMatch = MONGO_URI.match(/\/([^/?]+)(\?|$)/);
const dbName = dbNameMatch ? dbNameMatch[1] : MONGO_DB_NAME || 'cierta_db';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                  new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
const backupDir = path.join(__dirname, '..', 'backups');
const backupPath = path.join(backupDir, `backup_${dbName}_${timestamp}`);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

let mongoUriForDump = MONGO_URI;

if (MONGO_URI.includes('@')) {
  const uriParts = MONGO_URI.split('@');
  const authPart = uriParts[0].replace('mongodb://', '');
  const hostPart = uriParts[1];
  
  const [username, password] = authPart.split(':');
  
  const command = `mongodump --uri="${MONGO_URI}" --out="${backupPath}" --db="${dbName}"`;
  
  console.log('🔄 Создание бэкапа MongoDB...');
  console.log(`   База данных: ${dbName}`);
  console.log(`   Путь бэкапа: ${backupPath}`);
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Ошибка при создании бэкапа:', error.message);
      console.error('   Убедитесь, что mongodump установлен и доступен в PATH');
      console.error('   Или используйте MongoDB Atlas snapshot через веб-интерфейс');
      process.exit(1);
    }
    
    if (stderr && !stderr.includes('writing')) {
      console.warn('⚠️  Предупреждения:', stderr);
    }
    
    const dbBackupPath = path.join(backupPath, dbName);
    
    if (!fs.existsSync(dbBackupPath)) {
      console.error('❌ Папка бэкапа не создана!');
      process.exit(1);
    }
    
    const stats = fs.statSync(dbBackupPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    if (stats.size === 0) {
      console.error('❌ Размер бэкапа равен 0! Бэкап не создан корректно.');
      process.exit(1);
    }
    
    console.log('✅ Бэкап успешно создан!');
    console.log(`   Расположение: ${backupPath}`);
    console.log(`   Размер: ${sizeInMB} MB`);
    console.log(`\n📝 Для восстановления используйте:`);
    console.log(`   mongorestore --uri="${MONGO_URI}" --db="${dbName}" "${dbBackupPath}"`);
  });
} else {
  console.error('❌ Неверный формат MONGO_URI. Требуется формат: mongodb://username:password@host:port/database');
  process.exit(1);
}
