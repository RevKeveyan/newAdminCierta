# Statistics Quality Tests - Тесты качества статистики

## Описание

Минимальный набор тестов для контроля качества системы статистики. Проверяет корректность работы основных функций статистики.

## Расположение

`server/scripts/test_stats_quality.js`

## Запуск

```bash
cd "cierta full/server"
node scripts/test_stats_quality.js
```

## Тесты

### 1. Load created → вырос total

**Проверяет:**
- При создании нового Load статистика `loads.total` увеличивается
- `markDirtyForLoad` корректно помечает день как dirty
- Воркер обрабатывает задачу и обновляет snapshot

**Ожидаемый результат:**
- `afterTotal > beforeTotal`

### 2. Статус меняется → rebuild корректен

**Проверяет:**
- При изменении статуса Load статистика пересчитывается корректно
- Старый статус уменьшается, новый увеличивается

**Ожидаемый результат:**
- `deliveredCount > 0` после изменения статуса на "Delivered"

### 3. deadline прошёл → expired растёт

**Проверяет:**
- Load с прошедшим deadline учитывается в expired статистике
- Expired вычисляется относительно текущего времени (`now`)

**Ожидаемый результат:**
- `expiredCount > 0` для Load с deadline в прошлом

### 4. receivable received → confirmedReceived растёт

**Проверяет:**
- При статусе `received` у PaymentReceivable `confirmedAmount` учитывается в статистике
- `receivable.money.confirmed` увеличивается

**Ожидаемый результат:**
- `confirmed >= 1000` (сумма тестового payment)

### 5. payable paid → confirmedPaid растёт → profit меняется

**Проверяет:**
- При статусе `paid` у PaymentPayable `confirmedAmount` учитывается в статистике
- `payable.money.confirmed` увеличивается
- `finance.profitConfirmed` изменяется (receivable.confirmed - payable.confirmed)

**Ожидаемый результат:**
- `confirmed >= 500` (сумма тестового payment)
- `afterProfit !== beforeProfit`

### 6. freightBroker видит только allowedCustomers

**Проверяет:**
- `freightBroker` имеет доступ только к `customer` entityType
- Нет доступа к `system` статистике
- Видит только customers из `allowedCustomers`

**Ожидаемый результат:**
- `hasCustomerAccess = true`
- `hasSystemAccess = false`
- `hasCorrectCustomerIds = true`

### 7. accountingIn видит только receivable stats

**Проверяет:**
- `accountingIn` имеет доступ только к `payments` секции
- Нет доступа к `loads` статистике
- Видит только `receivable` paymentType (не `payable`)

**Ожидаемый результат:**
- `hasPaymentsAccess = true`
- `hasLoadsAccess = false`
- `hasReceivableAccess = true`
- `hasPayableAccess = false`

## Структура тестов

Каждый тест:
1. Создаёт необходимые тестовые данные
2. Выполняет действие (create/update)
3. Помечает dirty через `markDirtyForLoad`/`markDirtyForPayment`
4. Обрабатывает задачу через `processTask` (воркер)
5. Проверяет результат в `StatsSnapshot`
6. Очищает тестовые данные

## Очистка

После выполнения всех тестов скрипт автоматически:
- Удаляет созданные тестовые Load/Payment/Customer/Carrier/User
- Удаляет тестовые snapshots за сегодня
- Удаляет тестовые dirty задачи

## Результаты

Скрипт выводит:
- Статус каждого теста (✅/❌)
- Сообщения об ошибках (если есть)
- Итоговую статистику: сколько тестов прошло/провалилось

**Пример вывода:**

```
🧪 Запуск тестов качества статистики...

✅ Load created increases total: Before: 10, After: 11
✅ Status change rebuild: Delivered: 1, Listed: 0
✅ Deadline expired increases count: Expired: 1
✅ Receivable received increases confirmed: Confirmed: 1000
✅ Payable paid increases confirmed: Confirmed: 500
✅ Payable paid changes profit: Before: 500, After: 500
✅ FreightBroker sees only allowedCustomers: Customer IDs: 1
✅ AccountingIn sees only receivable stats: Payment types: receivable

📊 РЕЗУЛЬТАТЫ ТЕСТОВ:

✅ Load created increases total - Before: 10, After: 11
✅ Status change rebuild - Delivered: 1, Listed: 0
✅ Deadline expired increases count - Expired: 1
✅ Receivable received increases confirmed - Confirmed: 1000
✅ Payable paid increases confirmed - Confirmed: 500
✅ Payable paid changes profit - Before: 500, After: 500
✅ FreightBroker sees only allowedCustomers - Customer IDs: 1
✅ AccountingIn sees only receivable stats - Payment types: receivable

📈 Итого: 8 прошло, 0 провалено из 8

✅ Все тесты прошли успешно!
```

## Troubleshooting

### Тесты падают с ошибками подключения

Убедитесь, что:
- MongoDB запущен и доступен
- `MONGO_URI` и `MONGO_DB_NAME` правильно настроены в `.env`

### Тесты не находят snapshot

Возможные причины:
- Воркер не обработал задачу (проверьте логи)
- Дата не совпадает (snapshot создаётся для конкретного dateKey)
- Задача не была помечена как dirty

### RBAC тесты проваливаются

Проверьте:
- Правильность ролей в `User` модели
- Корректность логики в `getStatsScope()`

## Интеграция в CI/CD

Для автоматического запуска тестов в CI/CD:

```bash
# В package.json добавить:
"test:stats": "node scripts/test_stats_quality.js"

# Запуск:
npm run test:stats
```

## Важные замечания

1. **Тесты изменяют базу данных** - создают и удаляют тестовые данные
2. **Требуется чистая среда** - лучше запускать на тестовой БД
3. **Асинхронность** - тесты используют `setTimeout` для ожидания обработки воркером
4. **Зависимости** - тесты требуют работающий воркер (или вызывают `processTask` напрямую)
