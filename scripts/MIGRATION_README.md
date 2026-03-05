# Миграция Load Dates - Инструкция

## Описание

Миграционный скрипт для конвертации строковых дат в Date поля в модели Load.

## Подготовка

### 1. Создать бэкап базы данных

```bash
cd "cierta full/server"
node scripts/backup-mongodb.js
```

Убедитесь, что бэкап создан и размер не нулевой.

### 2. Проверить текущее состояние данных

```bash
node scripts/pre-migration-check.js
```

## Миграция

### Шаг 1: Dry Run (проверка без изменений)

**ВАЖНО:** Всегда запускайте сначала с флагом `--dry-run`!

```bash
node scripts/migrate_load_dates.js --dry-run
```

Это покажет:
- Сколько документов будет обновлено
- Какие поля будут изменены
- Без реальных изменений в базе

### Шаг 2: Запуск в Staging

После успешного dry run:

```bash
node scripts/migrate_load_dates.js
```

Скрипт:
- Обрабатывает Loads батчами по 2000 документов
- Парсит строковые даты в Date поля
- Использует bulkWrite для эффективности
- Логирует прогресс и ошибки

### Шаг 3: Верификация в Staging

После миграции проверьте результаты:

```bash
node scripts/verify_load_dates_migration.js
```

Скрипт проверяет:
- ✅ Что deadlineAt реально Date (не Invalid Date)
- ✅ Что пустые строки не стали "Invalid Date" (должны быть null)
- ✅ Что estimate диапазоны заполнились правильно
- ✅ Что start <= end для estimate диапазонов

**Выборочная проверка вручную:**

```javascript
// В MongoDB shell или через MongoDB Compass
db.loads.find({ "dates.deadlineAt": { $type: "date" } }).limit(10)
db.loads.find({ "dates.deadlineAt": { $type: "null" } }).limit(10)
db.loads.find({ "dates.pickupDateType": "Estimate", "dates.pickupStartAt": { $exists: true } }).limit(10)
```

### Шаг 4: Запуск в Production

**ТОЛЬКО после успешной проверки в Staging!**

1. Создайте бэкап production базы
2. Запустите dry run:
   ```bash
   node scripts/migrate_load_dates.js --dry-run
   ```
3. Запустите миграцию:
   ```bash
   node scripts/migrate_load_dates.js
   ```
4. Проверьте результаты:
   ```bash
   node scripts/verify_load_dates_migration.js
   ```

## Что делает миграция

### Поля, которые мигрируются:

1. **deadline** (string) → **deadlineAt** (Date)
2. **assignedDate** (string) → **assignedAt** (Date)

3. **Pickup dates:**
   - Если `pickupDateType = 'Exact'`:
     - `pickupDate` (string) → `pickupAt` (Date)
   - Если `pickupDateType = 'Estimate'`:
     - `pickupDateStart` (string) → `pickupStartAt` (Date)
     - `pickupDateEnd` (string) → `pickupEndAt` (Date)

4. **Delivery dates:**
   - Если `deliveryDateType = 'Exact'`:
     - `deliveryDate` (string) → `deliveryAt` (Date)
   - Если `deliveryDateType = 'Estimate'`:
     - `deliveryDateStart` (string) → `deliveryStartAt` (Date)
     - `deliveryDateEnd` (string) → `deliveryEndAt` (Date)

### Правила парсинга:

- Пустые строки → `null` (не "Invalid Date")
- Невалидные даты → `null` (не "Invalid Date")
- Все даты конвертируются в UTC-5 для хранения

### Старые поля сохраняются:

Миграция **НЕ удаляет** старые строковые поля для обратной совместимости:
- `dates.deadline` остается
- `dates.assignedDate` остается
- `dates.pickupDate`, `dates.pickupDateStart`, `dates.pickupDateEnd` остаются
- `dates.deliveryDate`, `dates.deliveryDateStart`, `dates.deliveryDateEnd` остаются

## Обработка ошибок

Скрипт:
- Продолжает работу при ошибках отдельных документов
- Логирует все ошибки в консоль
- Выводит итоговую статистику в конце

Если возникли ошибки:
1. Проверьте логи скрипта
2. Проверьте проблемные документы вручную
3. При необходимости исправьте данные и запустите миграцию снова (она идемпотентна)

## Откат изменений

Если что-то пошло не так:

```bash
mongorestore --uri="<MONGO_URI>" --db="<DB_NAME>" "<backup_path>/<DB_NAME>"
```

## Производительность

- Батчи по 2000 документов
- Использует `bulkWrite` для эффективности
- Обрабатывает ~2000-5000 документов в секунду (зависит от сервера)

Для больших баз (100k+ документов) миграция может занять несколько минут.
