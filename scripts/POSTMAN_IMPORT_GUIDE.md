# Руководство по импорту Postman Collection

## Быстрый старт

### 1. Импорт коллекции

**Способ 1: Через интерфейс Postman**
1. Откройте Postman
2. Нажмите **Import** (кнопка в левом верхнем углу)
3. Выберите вкладку **File**
4. Нажмите **Upload Files**
5. Выберите файл `POSTMAN_COLLECTION.json`
6. Нажмите **Import**

**Способ 2: Перетаскивание**
1. Откройте Postman
2. Перетащите файл `POSTMAN_COLLECTION.json` в окно Postman
3. Нажмите **Import**

**Способ 3: Через File меню**
1. File → Import
2. Выберите файл `POSTMAN_COLLECTION.json`
3. Нажмите **Import**

### 2. Создание Environment

1. В правом верхнем углу нажмите на выпадающий список **Environments** (или на иконку шестеренки ⚙️)
2. Нажмите **+** или **Create Environment**
3. Введите название: `CIERTA-LOCAL`
4. Добавьте переменные:

#### Обязательные переменные:

| Variable | Initial Value | Current Value | Описание |
|----------|---------------|---------------|----------|
| `baseUrl` | `http://localhost:5000` | `http://localhost:5000` | Базовый URL API |
| `token` | (пусто) | (пусто) | JWT токен (заполняется автоматически после логина) |

#### Опциональные переменные (для тестов):

| Variable | Initial Value | Описание |
|----------|---------------|----------|
| `tz` | `America/New_York` | Часовой пояс |
| `customerId` | (ваш customer ID) | ID customer для тестов |
| `otherCustomerId` | (другой customer ID) | ID другого customer для RBAC тестов |
| `carrierId` | (ваш carrier ID) | ID carrier для тестов |
| `userId` | (ваш user ID) | ID user для тестов |

5. Нажмите **Save**
6. Выберите созданный environment из выпадающего списка в правом верхнем углу

### 3. Первый запрос

1. Откройте коллекцию **"Cierta Statistics API"** в левой панели
2. Разверните папку **Auth**
3. Выберите запрос **Login**
4. Убедитесь, что выбран environment `CIERTA-LOCAL`
5. В Body обновите email и password на реальные данные:
   ```json
   {
     "email": "your-email@example.com",
     "password": "your-password"
   }
   ```
6. Нажмите **Send**
7. Проверьте, что:
   - Статус ответа: `200 OK`
   - В Tests автоматически сохранился токен в переменную `token`

### 4. Проверка работы

1. Откройте запрос **Smoke Tests → Stats Day System (Today)**
2. Нажмите **Send**
3. Должен вернуться ответ со статистикой
4. Если получаете `401 Unauthorized` - проверьте, что токен сохранился после логина

## Структура коллекции

```
Cierta Statistics API
├── Auth
│   └── Login
├── Test Users
│   ├── Create Test FreightBroker
│   ├── Create Test AccountingIn
│   ├── Create Test AccountingOut
│   ├── Create Test SalesAgent
│   ├── Login as FreightBroker
│   ├── Login as AccountingIn
│   └── Update FreightBroker AllowedCustomers
├── Smoke Tests
│   ├── Stats Day System (Today)
│   └── Stats Month System (Current Month)
├── Period Tests
│   ├── Day Period
│   ├── Week Period
│   └── Month Period
├── Filter Tests (Loads)
│   ├── Status Filter - Delivered
│   └── Status Filter - Expired
├── Filter Tests (Payments)
│   └── Profit Calculation Check
├── RBAC / Access Tests
│   ├── FreightBroker - System Stats (Should Fail)
│   ├── FreightBroker - Allowed Customer Stats (Should Pass)
│   ├── FreightBroker - Other Customer Stats (Should Fail)
│   └── AccountingIn - Loads Stats (Should Fail)
├── Email Filter Tests
│   └── Search Customer by Email
├── Validation Tests
│   ├── Missing Required Params
│   ├── Invalid Date Format
│   └── Missing EntityId for Non-System
└── Export Tests
    └── Export Excel
```

## Порядок тестирования

### Базовое тестирование:
1. **Auth → Login** - получить токен
2. **Smoke Tests** - проверить базовую функциональность
3. **Period Tests** - проверить разные периоды
4. **Filter Tests** - проверить фильтры

### Тестирование RBAC:
1. **Test Users → Create Test FreightBroker** - создать тестового пользователя
2. **Test Users → Login as FreightBroker** - войти под ним
3. **RBAC / Access Tests** - проверить ограничения доступа

## Полезные советы

### Просмотр переменных
- После выполнения запроса нажмите на **Environment Quick Look** (глаз 👁️) в правом верхнем углу
- Вы увидите все переменные и их текущие значения

### Отладка
- Если запрос не работает, проверьте:
  1. Правильно ли выбран environment
  2. Заполнен ли `baseUrl`
  3. Сохранен ли `token` после логина
  4. Правильный ли формат дат (YYYY-MM-DD)

### Автоматическое сохранение переменных
Многие запросы автоматически сохраняют значения в environment:
- `token` - после логина
- `testFreightBrokerId`, `testFreightBrokerEmail` - после создания тестового пользователя
- `freightBrokerToken` - после логина как freightBroker
- И т.д.

### Экспорт Environment
Чтобы сохранить environment для команды:
1. Нажмите на шестеренку ⚙️ рядом с Environments
2. Нажмите на три точки рядом с вашим environment
3. Выберите **Export**
4. Сохраните файл (например, `CIERTA-LOCAL.postman_environment.json`)

## Troubleshooting

### Проблема: "Invalid token" или 401
**Решение**: 
1. Запустите запрос **Auth → Login** заново
2. Проверьте, что токен сохранился в environment

### Проблема: "Cannot read property 'data' of undefined"
**Решение**: 
1. Проверьте, что сервер запущен на `baseUrl`
2. Проверьте правильность URL в запросе

### Проблема: Переменные не подставляются
**Решение**:
1. Убедитесь, что выбран правильный environment
2. Проверьте синтаксис: `{{variableName}}` (с двойными фигурными скобками)

### Проблема: Тестовые пользователи не создаются
**Решение**:
1. Убедитесь, что вы вошли как admin/manager
2. Проверьте, что endpoint `/users` доступен
3. Проверьте логи сервера на ошибки

## Дополнительные ресурсы

- [Postman Documentation](https://learning.postman.com/docs/getting-started/introduction/)
- [Postman Variables](https://learning.postman.com/docs/sending-requests/variables/)
- [Postman Environments](https://learning.postman.com/docs/sending-requests/managing-environments/)
