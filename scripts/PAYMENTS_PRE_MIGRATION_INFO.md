# Payments Pre-Migration Information

## 1. Вывод scripts/pre-migration-check.js по Payments

**Запустите скрипт для получения актуальных данных:**
```bash
cd "cierta full/server"
node scripts/pre-migration-check.js
```

**Структура вывода (пример):**

```
📊 Проверка PaymentReceivable...

Всего PaymentReceivable: N
invoiceAt exists: N / missing: N
invoiceAt type Date: N / String: N
totalAmount exists: N / missing: N
totalAmount type Number: N / String: N / null: N
confirmedAmount exists: N / missing: N
confirmedAmount type Number: N
loadId exists: N
customer exists: N
createdBy exists: N

Распределение статусов PaymentReceivable:
   pending: N
   invoiced: N
   received: N
   partially received: N
   ...

📊 Проверка PaymentPayable...

Всего PaymentPayable: N
invoiceAt exists: N / missing: N
invoiceAt type Date: N / String: N
totalAmount exists: N / missing: N
totalAmount type Number: N / String: N / null: N
confirmedAmount exists: N / missing: N
confirmedAmount type Number: N
loadId exists: N
carrier exists: N
createdBy exists: N

Распределение статусов PaymentPayable:
   pending: N
   invoiced: N
   paid: N
   partially paid: N
   ...
```

## 2. Enum статусов Payments

### PaymentReceivable статусы

Из модели: `models/subModels/PaymentReceivable.js`

```javascript
enum: ["pending", "invoiced", "withheld", "canceled", "on Hold", "received", "partially received", "pay today"]
```

**Подтверждающие статусы для confirmedAmount:**
- `"received"` ✅
- `"partially received"` ✅

**Логика confirmedAmount:**
```javascript
const confirmedStatuses = ['received', 'partially received'];
if (!confirmedStatuses.includes(payment.status)) {
  return 0;
}
return normalizeAmount(payment.totalAmount);
```

### PaymentPayable статусы

Из модели: `models/subModels/PaymentPayable.js`

```javascript
enum: ["pending", "invoiced", "withheld", "canceled", "on Hold", "paid", "partially paid", "pay today"]
```

**Подтверждающие статусы для confirmedAmount:**
- `"paid"` ✅
- `"partially paid"` ✅

**Логика confirmedAmount:**
```javascript
const confirmedStatuses = ['paid', 'partially paid'];
if (!confirmedStatuses.includes(payment.status)) {
  return 0;
}
return normalizeAmount(payment.totalAmount);
```

## 3. Примеры документов из Mongo

**Запустите скрипт для получения реальных примеров:**
```bash
node scripts/get-payment-examples.js
```

**Структура примеров:**

### PaymentReceivable со статусом "received"

```json
{
  "_id": "ObjectId(...)",
  "status": "received",
  "invoiceAt": ISODate("2026-01-15T10:30:00.000Z"),
  "createdAt": ISODate("2026-01-10T08:00:00.000Z"),
  "totalAmount": 5000.00,
  "confirmedAmount": 5000.00,
  "loadId": ObjectId("..."),
  "customer": ObjectId("..."),
  "createdBy": ObjectId("...")
}
```

### PaymentReceivable со статусом "partially received"

```json
{
  "_id": "ObjectId(...)",
  "status": "partially received",
  "invoiceAt": ISODate("2026-01-20T14:00:00.000Z"),
  "createdAt": ISODate("2026-01-15T09:00:00.000Z"),
  "totalAmount": 7500.00,
  "confirmedAmount": 7500.00,
  "loadId": ObjectId("..."),
  "customer": ObjectId("..."),
  "createdBy": ObjectId("...")
}
```

### PaymentPayable со статусом "paid"

```json
{
  "_id": "ObjectId(...)",
  "status": "paid",
  "invoiceAt": ISODate("2026-01-18T12:00:00.000Z"),
  "createdAt": ISODate("2026-01-10T08:00:00.000Z"),
  "totalAmount": 4500.00,
  "confirmedAmount": 4500.00,
  "loadId": ObjectId("..."),
  "carrier": ObjectId("..."),
  "createdBy": ObjectId("...")
}
```

### PaymentPayable со статусом "partially paid"

```json
{
  "_id": "ObjectId(...)",
  "status": "partially paid",
  "invoiceAt": ISODate("2026-01-22T16:00:00.000Z"),
  "createdAt": ISODate("2026-01-15T09:00:00.000Z"),
  "totalAmount": 6000.00,
  "confirmedAmount": 6000.00,
  "loadId": ObjectId("..."),
  "carrier": ObjectId("..."),
  "createdBy": ObjectId("...")
}
```

## 4. Логика выбора даты для фильтрации Payments

**Из констант:** `config/statisticsDateConstants.js`

```javascript
PAYMENTS: {
  PRIMARY_DATE: 'invoiceAt',
  FALLBACK_DATE: 'createdAt',
  DESCRIPTION: 'Payment.invoiceAt (если есть), иначе Payment.createdAt'
}
```

**Helper функция:** `config/statisticsDateConstants.js`

```javascript
getPaymentDate(payment) {
  return payment.invoiceAt || payment.createdAt;
}
```

**Логика:**
- **Всегда используется `invoiceAt` если он существует**
- **Fallback на `createdAt` если `invoiceAt` пустой/null**

Это означает, что для статистики и фильтрации:
- Если `invoiceAt` заполнен → используется `invoiceAt`
- Если `invoiceAt` пустой → используется `createdAt`

**Важно для backfill:** При миграции нужно убедиться, что `invoiceAt` заполняется правильно, иначе статистика может "сдвинуться" по времени.

## 5. Индексы для Payments

### PaymentReceivable индексы

Из модели: `models/subModels/PaymentReceivable.js`

```javascript
paymentReceivableSchema.index({ customer: 1 });
paymentReceivableSchema.index({ status: 1 });
paymentReceivableSchema.index({ createdAt: -1 });
paymentReceivableSchema.index({ invoiceAt: 1 });
paymentReceivableSchema.index({ status: 1, invoiceAt: 1 }); // Композитный
paymentReceivableSchema.index({ status: 1, createdAt: -1 }); // Композитный
paymentReceivableSchema.index({ createdBy: 1 });
paymentReceivableSchema.index({ loadId: 1 }, { unique: true, sparse: true });
```

### PaymentPayable индексы

Из модели: `models/subModels/PaymentPayable.js`

```javascript
paymentPayableSchema.index({ carrier: 1 });
paymentPayableSchema.index({ status: 1 });
paymentPayableSchema.index({ createdAt: -1 });
paymentPayableSchema.index({ invoiceAt: 1 });
paymentPayableSchema.index({ status: 1, invoiceAt: 1 }); // Композитный
paymentPayableSchema.index({ status: 1, createdAt: -1 }); // Композитный
paymentPayableSchema.index({ createdBy: 1 });
paymentPayableSchema.index({ loadId: 1 }, { unique: true, sparse: true });
```

## Проверка перед backfill

Перед запуском backfill Payments убедитесь:

1. ✅ `invoiceAt` в большинстве документов есть и это Date (или есть понятный fallback на `createdAt`)
2. ✅ `totalAmount` приводится к Number без NaN
3. ✅ `confirmedAmount` считается строго на confirmed-статусах (`received`/`partially received` для Receivable, `paid`/`partially paid` для Payable)
4. ✅ Нет статусов/полей, которые сломают агрегирование (статусы точно соответствуют enum)
5. ✅ Индексы подходят под фильтры (`status+invoiceAt`, `createdBy`, `customer`/`carrier`/`loadId`)
