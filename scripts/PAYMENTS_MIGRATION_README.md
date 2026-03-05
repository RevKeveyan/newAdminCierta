# Payments Migration - Инструкция

## Шаг 0: Фикс индекса (обязательно)

### Проблема
Duplicate index warning на `loadId` в PaymentReceivable и PaymentPayable.

### Решение

В моделях `PaymentReceivable` и `PaymentPayable` поле `loadId` имеет `sparse: true` в определении, но это НЕ создает индекс. Индекс создается только через `schema.index()`.

**Проверка:** В коде уже есть только один индекс:
```javascript
paymentReceivableSchema.index({ loadId: 1 }, { unique: true, sparse: true });
paymentPayableSchema.index({ loadId: 1 }, { unique: true, sparse: true });
```

**Действие:** Запустите синхронизацию индексов:

```bash
cd "cierta full/server"
node scripts/sync-payment-indexes.js
```

Это проверит и синхронизирует все индексы. Если warning останется, он покажет какие индексы дублируются.

## Шаг 1: Backfill дат в Loads (String → Date)

**Уже готово:** Скрипт `migrate_load_dates.js`

```bash
node scripts/migrate_load_dates.js --dry-run
node scripts/migrate_load_dates.js
```

## Шаг 2: Backfill Payments (createdBy + confirmedAmount + invoiceAt)

### Скрипт: `migrate_payments.js`

**Что делает:**
1. **createdBy:** Подтягивает из Load по loadId
2. **confirmedAmount:** Вычисляет на основе статуса (received/partially received для Receivable, paid/partially paid для Payable)
3. **invoiceAt:** Заполняет по логике (см. ниже)
4. **totalAmount:** Нормализует в Number если нужно

### Логика invoiceAt

**Вариант 1: invoiceAt = createdAt (быстрый и безопасный)**
```bash
node scripts/migrate_payments.js --dry-run --invoice-from-created
node scripts/migrate_payments.js --invoice-from-created
```

**Вариант 2: invoiceAt из Load.dates (реальная invoice дата)**
```bash
node scripts/migrate_payments.js --dry-run
node scripts/migrate_payments.js
```

Логика для варианта 2:
- **PaymentReceivable:** 
  - Если Load.status = 'Delivered' → `invoiceAt = Load.dates.deliveryAt`
  - Если Load.status = 'Picked Up' → `invoiceAt = Load.dates.pickupAt`
  - Иначе → `invoiceAt = Load.dates.deliveryAt` или `pickupAt` или `createdAt`
- **PaymentPayable:**
  - Если Load.status = 'Delivered' → `invoiceAt = Load.dates.deliveryAt`
  - Иначе → `invoiceAt = Load.dates.deliveryAt` или `pickupAt` или `createdAt`

### Использование

**Dry Run:**
```bash
node scripts/migrate_payments.js --dry-run
```

**Реальная миграция (invoiceAt из createdAt):**
```bash
node scripts/migrate_payments.js --invoice-from-created
```

**Реальная миграция (invoiceAt из Load.dates):**
```bash
node scripts/migrate_payments.js
```

## Шаг 3: Повторный pre-migration-check

После миграции проверьте результаты:

```bash
node scripts/pre-migration-check.js
```

**Ожидаемые результаты:**
- PaymentReceivable:
  - `confirmedAmount exists: N` (где N = количество с confirmed статусами)
  - `createdBy exists: N` (где N = количество с loadId)
  - `invoiceAt exists: N` (все или большинство)
- PaymentPayable: аналогично

## Важно: Выбор логики invoiceAt

**Вопрос:** "invoiceAt должен быть реальной датой invoice или достаточно createdAt?"

**Ответьте одним предложением:**
- Если "достаточно createdAt" → используйте `--invoice-from-created` (быстрее и безопаснее)
- Если "должна быть реальная invoice" → используйте вариант без флага (invoiceAt из Load.dates)

## Проверка после миграции

После выполнения всех шагов проверьте:

1. ✅ Индексы синхронизированы (нет warnings)
2. ✅ Loads: часть *At полей заполнилась
3. ✅ Payments: createdBy заполнен для записей с loadId
4. ✅ Payments: confirmedAmount заполнен для confirmed статусов
5. ✅ Payments: invoiceAt заполнен (все или большинство)
