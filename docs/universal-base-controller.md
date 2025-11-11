# Universal Base Controller Documentation

## Обзор
Универсальный базовый контроллер (`UniversalBaseController`) предоставляет полный набор CRUD операций, пагинацию, фильтрацию, валидацию, историю изменений и DTO форматирование для всех моделей.

## Возможности

### 🚀 **Основные операции:**
- **CRUD операции** - Create, Read, Update, Delete
- **Пагинация** - автоматическая пагинация с метаданными
- **Фильтрация** - гибкая фильтрация по любым полям
- **Поиск** - полнотекстовый поиск по настраиваемым полям
- **Сортировка** - сортировка по любому полю

### 🛡️ **Безопасность и валидация:**
- **Валидация данных** - настраиваемые правила валидации
- **Аудит** - автоматическое отслеживание создателя/редактора
- **История изменений** - полная история всех изменений
- **Обработка ошибок** - унифицированная обработка ошибок

### 📊 **Форматирование и DTO:**
- **DTO поддержка** - автоматическое форматирование ответов
- **Гибкое форматирование** - разные форматы для разных случаев
- **Консистентность** - единообразные ответы API

## Использование

### Базовое наследование

```javascript
const UniversalBaseController = require('./UniversalBaseController');
const MyModel = require('../models/MyModel');

class MyController extends UniversalBaseController {
  constructor() {
    super(MyModel, {
      // Опции конфигурации
    });
  }
}
```

### Конфигурация опций

```javascript
super(MyModel, {
  // Модель истории изменений
  historyModel: MyHistoryModel,
  
  // DTO для форматирования
  dto: MyDTO,
  
  // Поля для populate
  populateFields: ['user', 'category'],
  
  // Поля для поиска
  searchFields: ['name', 'description', 'email'],
  
  // Сортировка по умолчанию
  defaultSort: { createdAt: -1 },
  
  // Мягкое удаление
  softDelete: true,
  
  // Аудит поля
  auditFields: ['createdBy', 'updatedBy'],
  
  // Правила валидации
  validationRules: {
    create: {
      name: { required: true, type: 'string' },
      email: { required: true, type: 'email' }
    },
    update: {
      name: { type: 'string' },
      status: { type: 'string' }
    }
  }
});
```

## API Endpoints

### Стандартные операции

#### GET /api/model
Получить все записи с пагинацией и фильтрацией

**Query Parameters:**
- `page` - номер страницы (default: 1)
- `limit` - количество записей на странице (default: 10)
- `sortBy` - поле для сортировки (default: createdAt)
- `sortOrder` - порядок сортировки: asc/desc (default: desc)
- `search` - поисковый запрос
- `field=value` - фильтрация по полям

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 100,
    "totalPages": 10,
    "currentPage": 1,
    "limit": 10
  }
}
```

#### GET /api/model/:id
Получить запись по ID

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

#### POST /api/model
Создать новую запись

**Request Body:**
```json
{
  "name": "Example",
  "email": "example@email.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Model created successfully"
}
```

#### PUT /api/model/:id
Обновить запись

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Model updated successfully"
}
```

#### DELETE /api/model/:id
Удалить запись

**Response:**
```json
{
  "success": true,
  "message": "Model deleted successfully"
}
```

### Дополнительные операции

#### GET /api/model/search
Поиск и фильтрация

#### GET /api/model/stats
Статистика

#### POST /api/model/bulk-update
Массовое обновление

#### POST /api/model/bulk-delete
Массовое удаление

## Специализированные контроллеры

### LoadController

```javascript
class LoadController extends UniversalBaseController {
  constructor() {
    super(Load, {
      historyModel: LoadHistory,
      dto: LoadDTO,
      populateFields: ['createdBy', 'carrier'],
      searchFields: ['vin', 'type', 'customerCompanyName'],
      validationRules: {
        create: {
          type: { required: true, type: 'string' },
          vin: { required: true, type: 'string' }
        }
      }
    });
  }

  // Специфичные методы
  getByStatus = async (req, res) => { ... };
  updateStatus = async (req, res) => { ... };
  getLoadHistory = async (req, res) => { ... };
}
```

### UserController

```javascript
class UserController extends UniversalBaseController {
  constructor() {
    super(User, {
      dto: UserDTO,
      searchFields: ['firstName', 'lastName', 'email'],
      validationRules: {
        create: {
          firstName: { required: true, type: 'string' },
          email: { required: true, type: 'email' },
          password: { required: true, type: 'string' }
        }
      }
    });
  }

  // Переопределение для обработки паролей
  create = async (req, res) => { ... };
  update = async (req, res) => { ... };

  // Специфичные методы
  getByRole = async (req, res) => { ... };
  getProfile = async (req, res) => { ... };
  updateProfile = async (req, res) => { ... };
}
```

## Валидация

### Правила валидации

```javascript
validationRules: {
  create: {
    fieldName: {
      required: true,        // Обязательное поле
      type: 'string',        // Тип данных
      minLength: 3,          // Минимальная длина
      maxLength: 50,         // Максимальная длина
      pattern: /^[A-Z]/,     // Регулярное выражение
      enum: ['value1', 'value2'] // Разрешенные значения
    }
  },
  update: {
    // Правила для обновления
  }
}
```

### Типы валидации

- `string` - строка
- `number` - число
- `email` - email адрес
- `date` - дата
- `boolean` - булево значение
- `array` - массив
- `object` - объект

## DTO Форматирование

### Создание DTO

```javascript
class MyDTO {
  static format(item) {
    return {
      id: item._id,
      name: item.name,
      email: item.email,
      createdAt: item.createdAt
    };
  }

  static formatList(items) {
    return items.map(item => this.format(item));
  }

  static formatSummary(item) {
    return {
      id: item._id,
      name: item.name
    };
  }
}
```

### Использование DTO

```javascript
// В контроллере
const formattedData = this.dto ? this.dto.format(data) : data;
```

## История изменений

### Автоматическое отслеживание

```javascript
// При создании
await this.createHistoryRecord(id, 'created', userId, data);

// При обновлении
const changes = this.getChanges(oldDoc, newData);
await this.createHistoryRecord(id, 'updated', userId, changes);

// При удалении
await this.createHistoryRecord(id, 'deleted', userId, []);
```

### Получение истории

```javascript
const history = await this.historyModel
  .find({ recordId: id })
  .populate('changedBy', 'firstName lastName')
  .sort({ createdAt: -1 });
```

## Обработка ошибок

### Типы ошибок

- **ValidationError** - ошибки валидации (400)
- **CastError** - неверный формат ID (400)
- **DuplicateKeyError** - дублирование ключей (400)
- **NotFoundError** - запись не найдена (404)
- **ServerError** - внутренние ошибки (500)

### Формат ошибок

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "email is required"
    }
  ]
}
```

## Преимущества

### 🎯 **Для разработчиков:**
- **DRY принцип** - нет дублирования кода
- **Быстрая разработка** - готовые CRUD операции
- **Консистентность** - единообразный API
- **Масштабируемость** - легко добавлять новые модели

### 🚀 **Для производительности:**
- **Оптимизированные запросы** - эффективная пагинация
- **Кэширование** - поддержка кэширования
- **Индексы** - автоматическое использование индексов

### 🛡️ **Для безопасности:**
- **Валидация** - автоматическая валидация данных
- **Аудит** - полное отслеживание изменений
- **Обработка ошибок** - безопасная обработка ошибок

## Миграция существующих контроллеров

### Шаг 1: Наследование
```javascript
// Было
class MyController {
  getAll = async (req, res) => { ... };
}

// Стало
class MyController extends UniversalBaseController {
  constructor() {
    super(MyModel, options);
  }
}
```

### Шаг 2: Удаление дублированного кода
```javascript
// Удалить стандартные CRUD методы
// getAll, getById, create, update, delete
// Оставить только специфичные методы
```

### Шаг 3: Настройка опций
```javascript
super(MyModel, {
  dto: MyDTO,
  validationRules: { ... },
  searchFields: [ ... ]
});
```

## Примеры использования

### Простой контроллер
```javascript
class ProductController extends UniversalBaseController {
  constructor() {
    super(Product, {
      searchFields: ['name', 'description']
    });
  }
}
```

### Продвинутый контроллер
```javascript
class OrderController extends UniversalBaseController {
  constructor() {
    super(Order, {
      historyModel: OrderHistory,
      dto: OrderDTO,
      populateFields: ['customer', 'items'],
      searchFields: ['orderNumber', 'customer.name'],
      validationRules: {
        create: {
          customerId: { required: true, type: 'string' },
          items: { required: true, type: 'array' }
        }
      }
    });
  }

  // Специфичные методы
  getByCustomer = async (req, res) => { ... };
  updateStatus = async (req, res) => { ... };
}
```

Универсальный базовый контроллер значительно упрощает разработку и обеспечивает консистентность API во всем приложении.




















