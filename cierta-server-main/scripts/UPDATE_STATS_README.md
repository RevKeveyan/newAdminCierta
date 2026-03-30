# Как обновить статистику сейчас

## Автоматическое обновление

Статистика обновляется автоматически:

1. **Воркер** обрабатывает задачи из очереди `StatsDirty` каждые 5 секунд
2. **Today Refresh Cron** помечает сегодняшний день как dirty каждые 3 минуты
3. **При изменениях данных** (create/update/delete Load/Payment) автоматически помечаются dirty задачи

## Ручное обновление

### Вариант 1: Обновить конкретную дату (только пометка dirty)

```bash
node scripts/update_stats_now.js --date=2026-02-12
```

Это пометит день как dirty, воркер обработает автоматически.

### Вариант 2: Обновить конкретную дату + сразу обработать

```bash
node scripts/update_stats_now.js --date=2026-02-12 --process
```

Пометит как dirty и сразу обработает задачи.

### Вариант 3: Обновить несколько дней

```bash
node scripts/update_stats_now.js --date=2026-02-01 --days=7 --process
```

Пометит 7 дней начиная с 2026-02-01 и обработает.

### Вариант 4: Обновить сегодня

```bash
node scripts/update_stats_now.js --process
```

Без `--date` используется сегодняшняя дата.

### Вариант 5: Обновить для конкретной сущности

```bash
# Для customer
node scripts/update_stats_now.js --date=2026-02-12 --entity=customer --entityId=507f1f77bcf86cd799439011 --process

# Для carrier
node scripts/update_stats_now.js --date=2026-02-12 --entity=carrier --entityId=507f1f77bcf86cd799439011 --process

# Для user
node scripts/update_stats_now.js --date=2026-02-12 --entity=user --entityId=507f1f77bcf86cd799439011 --process
```

## Параметры скрипта

| Параметр | Описание | Пример |
|----------|----------|--------|
| `--date=YYYY-MM-DD` | Дата для обновления (по умолчанию: сегодня) | `--date=2026-02-12` |
| `--days=N` | Количество дней для обновления (по умолчанию: 1) | `--days=7` |
| `--entity=type` | Тип сущности: `system`, `customer`, `carrier`, `user` (по умолчанию: `system`) | `--entity=customer` |
| `--entityId=id` | ID сущности (обязателен для non-system) | `--entityId=507f1f77bcf86cd799439011` |
| `--process` | Сразу обработать задачи воркером | `--process` |

## Примеры использования

### Обновить сегодняшний день
```bash
node scripts/update_stats_now.js --process
```

### Обновить последние 7 дней
```bash
node scripts/update_stats_now.js --days=7 --process
```

### Обновить конкретный месяц
```bash
node scripts/update_stats_now.js --date=2026-02-01 --days=28 --process
```

### Обновить для конкретного customer
```bash
node scripts/update_stats_now.js --date=2026-02-12 --entity=customer --entityId=YOUR_CUSTOMER_ID --process
```

## Проверка статуса

### Проверить очередь задач
```javascript
// В MongoDB
db.statsdirty.countDocuments({ 'lock.locked': false })
db.statsdirty.find({ 'lock.locked': false }).limit(10)
```

### Проверить snapshots
```javascript
// В MongoDB
db.statsnapshots.find({ 
  entityType: 'system', 
  entityId: null,
  dateKey: '2026-02-12'
 })
```

### Проверить через API
```bash
GET {{baseUrl}}/stats/loads?from=2026-02-12&to=2026-02-12&grain=day&entityType=system
```

## Backfill исторических данных

Для массового обновления исторических данных используйте:

```bash
# System stats за последние 3 месяца
node scripts/backfill_stats_dirty.js --months=3

# System + customers за последние 2 месяца
node scripts/backfill_stats_dirty.js --months=2 --include-customers

# Конкретный диапазон дат
node scripts/backfill_stats_dirty.js --start=2026-01-01 --end=2026-02-12
```

## Troubleshooting

### Воркер не обрабатывает задачи

1. Проверьте что воркер запущен:
   ```bash
   # Проверьте логи сервера - должны быть сообщения:
   # [StatsWorker] Starting worker...
   # [StatsWorker] Processing task: ...
   ```

2. Проверьте очередь:
   ```bash
   node scripts/update_stats_now.js --date=2026-02-12 --process
   ```

3. Если задачи застряли (locked), разблокируйте:
   ```javascript
   // В MongoDB
   db.statsdirty.updateMany(
     { 'lock.locked': true },
     { $set: { 'lock.locked': false, 'lock.lockedAt': null, 'lock.lockedBy': null } }
   )
   ```

### Статистика не обновляется

1. Убедитесь что данные помечены как dirty:
   ```bash
   node scripts/update_stats_now.js --date=2026-02-12
   ```

2. Запустите обработку вручную:
   ```bash
   node scripts/update_stats_now.js --date=2026-02-12 --process
   ```

3. Проверьте что snapshots созданы:
   ```bash
   node scripts/check-migration-status.js
   ```

## Быстрые команды

```bash
# Обновить сегодня
node scripts/update_stats_now.js --process

# Обновить последние 7 дней
node scripts/update_stats_now.js --days=7 --process

# Обновить конкретный день
node scripts/update_stats_now.js --date=2026-02-12 --process

# Проверить статус
node scripts/check-migration-status.js
```
