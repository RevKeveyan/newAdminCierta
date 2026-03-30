# Statistics Worker - Воркер пересчёта статистики

## Описание

Воркер для автоматического пересчёта статистики из очереди `StatsDirty` в готовые snapshots `StatsSnapshot`.

## Расположение

- **Сервис**: `server/services/statsWorker.js`
- **Cron**: `server/cron/statsWorkerCron.js`

## Алгоритм работы

### 1. Lock задачи

Воркер ищет незаблокированные задачи в `StatsDirty`:
- `lock.locked = false` или `lock.lockedAt` старше 5 минут (timeout)
- Сортировка по `priority` (desc) и `createdAt` (asc)
- Блокирует задачу: устанавливает `lock.locked = true`, `lock.lockedAt = now`, `lock.lockedBy = workerId`

### 2. ComputeSnapshot

Вычисляет статистику для заданного диапазона и сущности:

#### Loads

**Match по createdAt:**
```javascript
createdAt: { $gte: rangeStart, $lt: rangeEnd }
```

**Match по сущности:**
- `customer`: `{ customer: entityId }`
- `carrier`: `{ carrier: entityId }`
- `user`: `{ createdBy: entityId }`
- `system`: без entity фильтра

**byStatus:**
- Агрегация по `status` через `$group`
- Маппинг статусов: `Listed` → `listed`, `Picked Up` → `pickedUp`, и т.д.

**expired:**
- Статус НЕ в `['Delivered', 'Cancelled']`
- `dates.deadlineAt < rangeEnd` (или `dates.deadline` если `deadlineAt` нет)
- Подсчёт через фильтрацию в памяти (для поддержки обоих форматов дат)

#### Payments

**Match по invoiceAt (или createdAt):**
```javascript
$or: [
  { invoiceAt: { $exists: true, $ne: null, $gte: rangeStart, $lt: rangeEnd } },
  { 
    invoiceAt: { $exists: false } или null,
    createdAt: { $gte: rangeStart, $lt: rangeEnd }
  }
]
```

**Group counts by status:**
- Агрегация по `status` через `$group`

**Sums:**
- `total`: `sum(totalAmount)`
- `confirmed`: `sum(confirmedAmount)` только по confirmed статусам:
  - Receivable: `['received', 'partially received']`
  - Payable: `['paid', 'partially paid']`
- `outstanding`: `total - confirmed`

#### Profit

```javascript
profitConfirmed = receivable.confirmed - payable.confirmed
```

### 3. Upsert в StatsSnapshot

- Upsert по уникальному ключу: `(grain, dateKey, entityType, entityId)`
- Записывает `computedAt = now`, `version = 1`

### 4. Завершить задачу

- Удаляет задачу из `StatsDirty` через `findByIdAndDelete`

### 5. Retry

Если ошибка:
- `attempts + 1`
- `lastAttemptAt = now`
- `error.message` и `error.occurredAt`
- Разблокирует задачу (`lock.locked = false`, `lock.lockedAt = null`, `lock.lockedBy = null`)
- Максимум попыток: `MAX_RETRY_ATTEMPTS = 3`

## Использование

### Автоматический запуск

Воркер запускается автоматически при старте сервера через `server/cron/statsWorkerCron.js`.

### Ручной запуск

```javascript
const { startWorker } = require('./services/statsWorker');

const stopWorker = await startWorker('my-worker-id', {
  interval: 5000,    // Проверка каждые 5 секунд
  batchSize: 10      // Обработка до 10 задач за раз
});

// Остановка воркера
stopWorker();
```

## Конфигурация

### Константы

- `MAX_RETRY_ATTEMPTS = 3` - Максимум попыток обработки задачи
- `LOCK_TIMEOUT_MS = 5 * 60 * 1000` - Таймаут блокировки (5 минут)

### Опции воркера

- `interval` - Интервал проверки задач в мс (по умолчанию 5000)
- `batchSize` - Количество задач за раз (по умолчанию 10)

## Логирование

Воркер логирует:
- Старт/остановку воркера
- Обработку каждой задачи
- Завершение задач
- Ошибки обработки

Примеры логов:
```
[StatsWorker] Starting worker stats-worker-1234567890
[StatsWorker] Processing task: 2026-02-12 system/null
[StatsWorker] Task completed: 2026-02-12 system/null
[StatsWorker] Processed 5 tasks
```

## Обработка ошибок

- Ошибки обработки задачи логируются и не останавливают воркер
- Задачи с ошибками разблокируются для retry
- После превышения `MAX_RETRY_ATTEMPTS` задача остаётся в базе с ошибкой (для ручной проверки)

## Производительность

- Использует MongoDB aggregation pipelines для эффективных запросов
- Обрабатывает задачи батчами для оптимизации
- Поддерживает параллельную обработку нескольких задач

## Мониторинг

Для мониторинга состояния воркера можно проверить:
- Количество задач в `StatsDirty` с `lock.locked = false`
- Количество задач с `attempts >= MAX_RETRY_ATTEMPTS`
- Последние `computedAt` в `StatsSnapshot`
