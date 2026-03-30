# Statistics API - Документация

## Описание

API для получения статистики из готовых snapshots `StatsSnapshot`. Быстрый доступ к агрегированным данным статистики.

## Расположение

- **Контроллер**: `server/controllers/StatsController.js`
- **Роуты**: `server/routes/statsRoutes.js`
- **Базовый путь**: `/stats`

## Endpoints

### GET /stats/loads

Получить статистику по loads за период.

**Параметры запроса:**

- `from` (обязательный) - Начальная дата (ISO format: YYYY-MM-DD)
- `to` (обязательный) - Конечная дата (ISO format: YYYY-MM-DD)
- `grain` (опционально) - Гранулярность: `day` | `week` | `month` | `year` (по умолчанию: `day`)
- `entityType` (опционально) - Тип сущности: `system` | `customer` | `carrier` | `user` (по умолчанию: `system`)
- `entityId` (опционально) - ID сущности (обязателен для non-system entityType)
- `status` (опционально) - Фильтр по статусу loads (listed, dispatched, pickedUp, delivered, onHold, cancelled, expired)
- `email` (опционально) - Email для поиска сущности (вместо entityId)

**Примеры запросов:**

```bash
# Статистика за последний месяц (system)
GET /stats/loads?from=2026-01-01&to=2026-01-31&grain=day

# Статистика по конкретному customer
GET /stats/loads?from=2026-01-01&to=2026-01-31&grain=day&entityType=customer&entityId=507f1f77bcf86cd799439011

# Статистика по email (автоматически определяет тип сущности)
GET /stats/loads?from=2026-01-01&to=2026-01-31&grain=day&email=customer@example.com

# Статистика только по delivered loads
GET /stats/loads?from=2026-01-01&to=2026-01-31&grain=day&status=delivered

# Месячная статистика
GET /stats/loads?from=2026-01-01&to=2026-12-31&grain=month
```

**Ответ:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2026-01-01",
      "total": 10,
      "byStatus": {
        "listed": 2,
        "dispatched": 3,
        "pickedUp": 1,
        "delivered": 4,
        "onHold": 0,
        "cancelled": 0,
        "expired": 0
      },
      "receivable": {
        "totalCount": 4,
        "money": {
          "total": 5000,
          "confirmed": 3000,
          "outstanding": 2000
        }
      },
      "payable": {
        "totalCount": 4,
        "money": {
          "total": 4000,
          "confirmed": 2500,
          "outstanding": 1500
        }
      },
      "finance": {
        "profitConfirmed": 500
      }
    }
  ],
  "meta": {
    "grain": "day",
    "entityType": "system",
    "entityId": null,
    "from": "2026-01-01T00:00:00.000Z",
    "to": "2026-01-31T23:59:59.999Z",
    "count": 31
  }
}
```

### GET /stats/export

Экспорт статистики в Excel.

**Параметры запроса:**

- `from` (обязательный) - Начальная дата (ISO format: YYYY-MM-DD)
- `to` (обязательный) - Конечная дата (ISO format: YYYY-MM-DD)
- `grain` (опционально) - Гранулярность: `day` | `week` | `month` | `year` (по умолчанию: `day`)
- `entityType` (опционально) - Тип сущности: `system` | `customer` | `carrier` | `user` (по умолчанию: `system`)
- `entityId` (опционально) - ID сущности
- `format` (опционально) - Формат экспорта: `xlsx` (по умолчанию: `xlsx`)

**Примеры запросов:**

```bash
# Экспорт статистики за месяц
GET /stats/export?from=2026-01-01&to=2026-01-31&grain=day

# Экспорт статистики по customer
GET /stats/export?from=2026-01-01&to=2026-01-31&grain=day&entityType=customer&entityId=507f1f77bcf86cd799439011
```

**Ответ:**

Возвращает Excel файл (.xlsx) с данными статистики.

**Структура Excel файла:**

| Date/Period | Loads Total | Listed | Dispatched | Picked Up | Delivered | On Hold | Cancelled | Expired | Receivable Total | Receivable Confirmed | Receivable Outstanding | Payable Total | Payable Confirmed | Payable Outstanding | Profit Confirmed |
|-------------|-------------|--------|------------|-----------|-----------|---------|-----------|---------|------------------|---------------------|------------------------|---------------|-------------------|---------------------|------------------|
| 2026-01-01  | 10          | 2      | 3          | 1         | 4         | 0       | 0         | 0       | 5000             | 3000                | 2000                   | 4000          | 2500              | 1500                | 500              |

## RBAC (Проверка доступа)

Все endpoints проверяют права доступа через `getStatsScope()`:

- **admin/manager**: Полный доступ ко всем типам сущностей
- **accountingManager**: Только payments статистика (system уровень)
- **accountingIn**: Только receivable статистика (system уровень)
- **accountingOut**: Только payable статистика (system уровень)
- **freightBroker/dispatcher/Pre-dispatcher/bidAgent**: Только customers из `allowedCustomers`, только loads статистика
- **salesAgent**: Только platform customers из `allowedCustomers`, только loads статистика
- **partner**: Нет доступа к статистике

## Фильтр по email

API поддерживает фильтрацию по email вместо прямого указания `entityId`:

1. Ищет сущность по email в порядке: Customer → Carrier → User
2. Определяет `entityType` автоматически
3. Проверяет права доступа к найденной сущности
4. Возвращает статистику для найденной сущности

**Важно:** Email НЕ хранится в статистике. Поиск происходит в реальном времени при запросе.

## Производительность

- Использует готовые snapshots из `StatsSnapshot` (быстро)
- Поддерживает фильтрацию по диапазону дат через индексы
- Возвращает пустые snapshots для отсутствующих периодов (для консистентности графиков)

## Зависимости

Для экспорта в Excel требуется библиотека `exceljs`:

```bash
npm install exceljs
```

Если библиотека не установлена, экспорт вернёт ошибку с инструкцией по установке.

## Ошибки

### 403 Forbidden
- Нет доступа к статистике (проверка RBAC)
- Нет доступа к конкретной сущности

### 400 Bad Request
- Отсутствуют обязательные параметры (`from`, `to`)
- Неверный формат даты
- `entityId` отсутствует для non-system `entityType`

### 404 Not Found
- Сущность не найдена по email

### 500 Internal Server Error
- Ошибка при получении данных
- Ошибка при экспорте в Excel
