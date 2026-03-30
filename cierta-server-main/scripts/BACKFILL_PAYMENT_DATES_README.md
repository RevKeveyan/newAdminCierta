# Backfill Payment Dates - Исправление invoiceAt: null и расчет dueAt

## Проблема

После миграции Payments некоторые документы имеют `invoiceAt: null`, хотя в Load уже есть `deliveryAt`/`pickupAt`. Это происходит потому что:

1. Миграционные скрипты проверяют наличие поля через `if ("invoiceAt" in doc)` или `if (doc.invoiceAt !== undefined)`
2. `null` считается "поле существует", поэтому скрипт пропускает такие документы
3. После миграции Load dates (String → Date) у Load появились Date поля, но Payments уже были "пропущены"

Также `dueAt` не рассчитывается автоматически для старых записей.

## Решение

Скрипт `backfill_payment_dates.js` исправляет эту проблему:

1. **Находит Payments с `invoiceAt: null` или отсутствующим**
2. **Подтягивает Load и устанавливает `invoiceAt` по правилу:**
   - Receivable: `deliveryAt → pickupAt → createdAt`
   - Payable: `deliveryAt → pickupAt → createdAt`
3. **Вычисляет `dueAt = invoiceAt + deadlineDays`**
   - Если `deadlineDays` уже заполнен - использует его
   - Если нет - берет из `customer.paymentTerms` (Receivable) или `load.paymentTerms` (Payable)

## Использование

### Dry-run (проверка без изменений)
```bash
node scripts/backfill_payment_dates.js --dry-run
```

### Реальная миграция
```bash
node scripts/backfill_payment_dates.js
```

## Логика выбора invoiceAt

### PaymentReceivable
1. `Load.dates.deliveryAt` (приоритет)
2. `Load.dates.pickupAt` (fallback)
3. `Payment.createdAt` (если Load не найден или даты отсутствуют)

### PaymentPayable
1. `Load.dates.deliveryAt` (приоритет)
2. `Load.dates.pickupAt` (fallback)
3. `Payment.createdAt` (если Load не найден или даты отсутствуют)

## Логика расчета dueAt

1. Если `deadlineDays` уже заполнен → `dueAt = invoiceAt + deadlineDays`
2. Если `deadlineDays` отсутствует:
   - **Receivable**: берет из `Customer.paymentTerms` (парсит число из строки типа "Net 30")
   - **Payable**: берет из `Load.paymentTerms` (парсит число из строки типа "Net 30")
3. Fallback: `deadlineDays = 30` (если не удалось получить из paymentTerms)

## Исправление в migrate_payments.js

Также исправлена проверка в `migrate_payments.js`:

**Было:**
```javascript
if (!receivable.invoiceAt || (typeof receivable.invoiceAt === 'string' && receivable.invoiceAt.trim() !== '')) {
  // обрабатывает, но пропускает null
}
```

**Стало:**
```javascript
const hasInvoiceAt = receivable.invoiceAt instanceof Date && !isNaN(receivable.invoiceAt.getTime());
if (!hasInvoiceAt) {
  // обрабатывает только если invoiceAt не является валидным Date
}
```

Теперь `null` правильно обрабатывается как "не заполнено".

## Проверка после миграции

```bash
# Проверить статус
node scripts/check-migration-status.js

# Проверить в MongoDB
db.paymentreceivables.countDocuments({ invoiceAt: null })
db.paymentpayables.countDocuments({ invoiceAt: null })
db.paymentreceivables.countDocuments({ dueAt: null })
db.paymentpayables.countDocuments({ dueAt: null })
```

## Важные замечания

1. **deadlineDays не перезаписывается** - если уже заполнен, используется как есть
2. **dueAt пересчитывается** только если `invoiceAt` был обновлен
3. **Порядок дат**: deliveryAt имеет приоритет над pickupAt (оплата после доставки)
4. **Батчинг**: обрабатывает по 2000 документов за раз для производительности
