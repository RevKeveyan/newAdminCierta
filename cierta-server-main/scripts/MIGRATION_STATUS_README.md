# Статус миграций и следующие шаги

## Шаг 1: Исправление Duplicate Index Warnings

### Проблема
Mongoose выдает warnings о дубликатах индексов:
- `email` в Customer, Carrier, User
- `mcNumber`, `dotNumber`, `companyName` в Carrier

### Решение

1. **Проверьте текущие индексы:**
   ```bash
   node scripts/fix-duplicate-indexes.js
   ```

2. **Удалите старые индексы в MongoDB:**
   ```javascript
   // В MongoDB Compass или mongo shell:
   db.customers.dropIndex("email_1")
   db.carriers.dropIndex("email_1")
   db.carriers.dropIndex("mcNumber_1")
   db.carriers.dropIndex("dotNumber_1")
   db.carriers.dropIndex("companyName_1")
   ```

3. **Синхронизируйте индексы:**
   ```bash
   node scripts/ensure-indexes.js
   ```

### Причина
В коде используются только `schema.index()`, но в базе могут остаться старые индексы, созданные автоматически Mongoose при `unique: true` или `index: true` в полях.

## Шаг 2: Backfill Load Dates (String → Date)

### Проверка статуса
```bash
node scripts/check-migration-status.js
```

### Если требуется миграция:

1. **Dry-run (проверка без изменений):**
   ```bash
   node scripts/migrate_load_dates.js --dry-run
   ```

2. **Реальная миграция:**
   ```bash
   node scripts/migrate_load_dates.js
   ```

3. **Проверка после миграции:**
   ```bash
   node scripts/pre-migration-check.js
   node scripts/check-migration-status.js
   ```

### Ожидаемый результат
После миграции:
- `deadlineAt` заполнено > 0
- `assignedAt` заполнено > 0 (если были assignedDate)
- `pickupAt` заполнено > 0 (если были pickupDate)
- `deliveryAt` заполнено > 0 (если были deliveryDate)

## Шаг 3: Payments Backfill (уже выполнено ✅)

Миграция Payments уже выполнена:
- `deadlineDays` заполнено
- `invoiceAt` заполнено (Date)
- `confirmedAmount` заполнено

## Шаг 4: Финальный контроль качества

### 1. Тесты статистики
```bash
npm run test:stats
```
✅ Все тесты должны пройти

### 2. Ручная проверка в базе

**Проверьте один PaymentReceivable:**
```javascript
db.paymentreceivables.findOne()
// Проверьте:
// - deadlineDays: число (не null)
// - invoiceAt: Date (не null)
// - confirmedAmount: число (если статус received/partially received)
```

**Проверьте один PaymentPayable:**
```javascript
db.paymentpayables.findOne()
// Проверьте:
// - deadlineDays: число (не null)
// - invoiceAt: Date (не null)
// - confirmedAmount: число (если статус paid/partially paid)
```

**Проверьте StatsSnapshot:**
```javascript
db.statsnapshots.find({ entityType: 'system', entityId: null }).limit(1)
// Проверьте:
// - grain: 'day'
// - dateKey: строка формата YYYY-MM-DD
// - loads.total: число
// - receivable.money.confirmed: число
// - payable.money.confirmed: число
// - finance.profitConfirmed: число
```

### 3. Проверка разных entity types
```javascript
// System
db.statsnapshots.find({ entityType: 'system', entityId: null }).limit(5)

// Customer
db.statsnapshots.find({ entityType: 'customer' }).limit(5)

// Carrier
db.statsnapshots.find({ entityType: 'carrier' }).limit(5)

// User
db.statsnapshots.find({ entityType: 'user' }).limit(5)
```

## Итоговый чеклист

- [ ] Исправлены duplicate index warnings
- [ ] Load dates миграция выполнена (если требуется)
- [ ] Payments миграция выполнена ✅
- [ ] Тесты статистики проходят ✅
- [ ] Ручная проверка Payments пройдена
- [ ] Ручная проверка StatsSnapshot пройдена

## Команды для быстрой проверки

```bash
# Статус миграций
node scripts/check-migration-status.js

# Тесты статистики
npm run test:stats

# Проверка индексов
node scripts/fix-duplicate-indexes.js
```
