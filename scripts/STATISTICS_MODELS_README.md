# Statistics Models - StatsSnapshot и StatsDirty

## Описание

Модели для хранения предвычисленной статистики и очереди пересчёта.

## StatsSnapshot

Хранит готовые агрегаты статистики для конкретного периода и сущности.

### Поля

- **grain**: `day` | `week` | `month` | `year` - Гранулярность периода
- **dateKey**: String - Ключ периода (например, "2026-02-12" для day)
- **rangeStart**: Date - Начало периода
- **rangeEnd**: Date - Конец периода
- **entityType**: `system` | `customer` | `carrier` | `user` - Тип сущности
- **entityId**: ObjectId | null - ID сущности (null для system)

**Метрики:**
- **loads.total**: Number - Всего грузов
- **loads.byStatus**: Object - По статусам (listed, dispatched, pickedUp, delivered, onHold, cancelled, expired)
- **receivable.totalCount**: Number - Всего receivable
- **receivable.money.total**: Number - Общая сумма
- **receivable.money.confirmed**: Number - Подтверждённая сумма
- **receivable.money.outstanding**: Number - Неоплаченная сумма
- **payable.totalCount**: Number - Всего payable
- **payable.money.total**: Number - Общая сумма
- **payable.money.confirmed**: Number - Подтверждённая сумма
- **payable.money.outstanding**: Number - Неоплаченная сумма
- **finance.profitConfirmed**: Number - Подтверждённая прибыль (receivable.confirmed - payable.confirmed)

**Метаданные:**
- **computedAt**: Date - Когда был вычислен snapshot
- **version**: Number - Версия данных
- **createdAt**, **updatedAt**: Date - Timestamps

### Индексы

- Уникальный: `(grain, dateKey, entityType, entityId)`
- `entityType + entityId`
- `rangeStart + rangeEnd`
- `computedAt` (desc)

## StatsDirty

Очередь задач на пересчёт статистики.

### Поля

- **grain**: `day` | `week` | `month` | `year` - Гранулярность (по умолчанию `day`)
- **dateKey**: String - Ключ периода
- **rangeStart**: Date - Начало периода
- **rangeEnd**: Date - Конец периода
- **entityType**: `system` | `customer` | `carrier` | `user` - Тип сущности
- **entityId**: ObjectId | null - ID сущности
- **sources**: Array<String> - Источники изменений: `['loads']`, `['receivable']`, `['payable']` или комбинации
- **lock.locked**: Boolean - Заблокирована ли задача
- **lock.lockedAt**: Date - Когда заблокирована
- **lock.lockedBy**: String - Кто заблокировал (worker ID)
- **attempts**: Number - Количество попыток обработки
- **priority**: Number - Приоритет (чем выше, тем раньше обрабатывается)
- **lastAttemptAt**: Date - Последняя попытка обработки
- **error.message**: String - Сообщение об ошибке (если была)
- **error.occurredAt**: Date - Когда произошла ошибка
- **createdAt**: Date - Когда создана задача

### Индексы

- Уникальный: `(grain, dateKey, entityType, entityId)`
- `lock.locked + priority + createdAt` - Для выборки незаблокированных задач
- `entityType + entityId`
- `rangeStart + rangeEnd`

## Использование

### Создание snapshot

```javascript
const StatsSnapshot = require('../models/subModels/StatsSnapshot');

const snapshot = new StatsSnapshot({
  grain: 'day',
  dateKey: '2026-02-12',
  rangeStart: new Date('2026-02-12T00:00:00Z'),
  rangeEnd: new Date('2026-02-12T23:59:59Z'),
  entityType: 'system',
  entityId: null,
  loads: {
    total: 100,
    byStatus: {
      listed: 10,
      dispatched: 20,
      pickedUp: 15,
      delivered: 50,
      onHold: 3,
      cancelled: 2,
      expired: 0
    }
  },
  receivable: {
    totalCount: 50,
    money: {
      total: 50000,
      confirmed: 30000,
      outstanding: 20000
    }
  },
  payable: {
    totalCount: 50,
    money: {
      total: 40000,
      confirmed: 25000,
      outstanding: 15000
    }
  },
  finance: {
    profitConfirmed: 5000
  }
});

await snapshot.save();
```

### Создание dirty задачи

```javascript
const StatsDirty = require('../models/subModels/StatsDirty');

const dirty = new StatsDirty({
  grain: 'day',
  dateKey: '2026-02-12',
  rangeStart: new Date('2026-02-12T00:00:00Z'),
  rangeEnd: new Date('2026-02-12T23:59:59Z'),
  entityType: 'system',
  entityId: null,
  sources: ['loads', 'receivable'],
  priority: 1
});

await dirty.save();
```

### Поиск snapshot

```javascript
const snapshot = await StatsSnapshot.findOne({
  grain: 'day',
  dateKey: '2026-02-12',
  entityType: 'system',
  entityId: null
});
```

### Поиск незаблокированных dirty задач

```javascript
const dirtyTasks = await StatsDirty.find({
  'lock.locked': false
})
.sort({ priority: -1, createdAt: 1 })
.limit(10);
```
