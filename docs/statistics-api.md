# Statistics API Documentation

## Обзор
API для получения статистики по пользователям и грузам. Поддерживает получение статистики за различные периоды (день, месяц, год) и детальную аналитику.

## Endpoints

### 1. Получить общую статистику
**GET** `/api/stats/general`

Получает общую статистику по всем грузам и пользователям.

**Query Parameters:**
- `period` (optional): `day` | `month` | `year` (default: `month`)
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {...},
    "totalLoads": 150,
    "totalRevenue": 250000,
    "loadsByStatus": {
      "listed": 20,
      "dispatched": 30,
      "pickedUp": 25,
      "delivered": 60,
      "onHold": 10,
      "cancelled": 5
    },
    "historicalData": [...]
  }
}
```

### 2. Получить статистику пользователя
**GET** `/api/stats/user/:userId`

Получает статистику для конкретного пользователя.

**Path Parameters:**
- `userId`: ObjectId пользователя

**Query Parameters:**
- `period` (optional): `day` | `month` | `year` (default: `month`)
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "dispatcher"
    },
    "period": "month",
    "totalLoads": 25,
    "totalRevenue": 45000,
    "loadsByStatus": {...},
    "loadsByType": {
      "Cars": 15,
      "Boats": 5,
      "Motorcycles": 3,
      "RVs": 2
    },
    "historicalData": [...]
  }
}
```

### 3. Получить статистику всех пользователей
**GET** `/api/stats/users`

Получает статистику всех пользователей (только для admin/manager).

**Query Parameters:**
- `period` (optional): `day` | `month` | `year` (default: `month`)
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "usersStats": [...],
    "topUsers": [
      {
        "user": {
          "id": "507f1f77bcf86cd799439011",
          "name": "John Doe",
          "email": "john@example.com",
          "role": "dispatcher"
        },
        "loadsAdded": 25,
        "totalRevenue": 45000
      }
    ]
  }
}
```

### 4. Получить детальную статистику
**GET** `/api/stats/detailed`

Получает детальную статистику по дням с возможностью фильтрации по пользователю.

**Query Parameters:**
- `userId` (optional): ObjectId пользователя
- `startDate` (required): ISO date string
- `endDate` (required): ISO date string

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15",
      "loadsAdded": 5,
      "totalRevenue": 12000,
      "loadsByStatus": {...},
      "loadsByType": {...}
    }
  ]
}
```

### 5. Обновить статистику
**POST** `/api/stats/update`

Принудительно обновляет статистику (только для admin).

**Request Body:**
```json
{
  "force": false
}
```

**Response:**
```json
{
  "message": "Statistics updated successfully"
}
```

## Автоматическое обновление

Статистика автоматически обновляется каждый день в 6:00 утра через cron job.

## Роли и разрешения

- **Все пользователи**: могут получать общую статистику и свою личную статистику
- **Admin/Manager**: могут получать статистику всех пользователей
- **Admin**: может принудительно обновлять статистику

## Примеры использования

### Получить статистику за сегодня
```bash
GET /api/stats/general?period=day
```

### Получить статистику пользователя за последний месяц
```bash
GET /api/stats/user/507f1f77bcf86cd799439011?period=month
```

### Получить детальную статистику за период
```bash
GET /api/stats/detailed?startDate=2024-01-01&endDate=2024-01-31
```

### Получить статистику конкретного пользователя за период
```bash
GET /api/stats/detailed?userId=507f1f77bcf86cd799439011&startDate=2024-01-01&endDate=2024-01-31
```

