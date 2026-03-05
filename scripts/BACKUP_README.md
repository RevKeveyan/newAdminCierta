# MongoDB Backup Script

## Использование

### Локальная MongoDB

```bash
cd "cierta full/server"
node scripts/backup-mongodb.js
```

Бэкап будет создан в папке `backups/backup_<db_name>_<timestamp>/`

### MongoDB Atlas

Если используется MongoDB Atlas, рекомендуется использовать встроенный функционал snapshots:

1. Войдите в MongoDB Atlas Dashboard
2. Перейдите в раздел "Backups" или "Snapshots"
3. Создайте snapshot вручную перед миграцией
4. Или используйте автоматические snapshots (если включены)

### Восстановление из бэкапа

```bash
mongorestore --uri="<MONGO_URI>" --db="<DB_NAME>" "<backup_path>/<db_name>"
```

Пример:
```bash
mongorestore --uri="mongodb://admin:password123@localhost:27017/cierta_db?authSource=admin" --db="cierta_db" "backups/backup_cierta_db_2026-02-12_10-30-00/cierta_db"
```

## Требования

- Установленный `mongodump` (входит в MongoDB Database Tools)
- Доступ к базе данных через MONGO_URI из .env файла

## Примечания

- Скрипт автоматически создаёт папку `backups/` если её нет
- Имя базы данных определяется из MONGO_URI или MONGO_DB_NAME
- Бэкапы сохраняются с timestamp в имени для удобства
