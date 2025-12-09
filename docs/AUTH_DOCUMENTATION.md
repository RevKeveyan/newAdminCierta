# Документация по аутентификации и авторизации

## Содержание
1. [Общая схема](#общая-схема)
2. [Модели данных](#модели-данных)
3. [JWT токены](#jwt-токены)
4. [REST эндпоинты](#rest-эндпоинты)
   - [POST /auth/login](#post-apiauthlogin)
   - [POST /auth/forgot-password](#post-apiauthforgot-password)
   - [POST /auth/reset-password](#post-apiauthreset-password)
5. [Middleware слоя](#middleware-слоя)
6. [Интеграция на фронтенде](#интеграция-на-фронтенде)
7. [Поток восстановления пароля](#поток-восстановления-пароля)
8. [Коды ошибок и ответы](#коды-ошибок-и-ответы)
9. [Лучшие практики безопасности](#лучшие-практики-безопасности)

---

## Общая схема

```
Пользователь → (email, password) → POST /auth/login
           ← { token, user } (JWT на 7 дней)
                     │
                     ▼
   Authorization: Bearer <token>
                     │
        verifyToken middleware → req.user = { id, role }
                     │
     checkRole(['admin', ...]) при необходимости
```

- Токены формируются функцией `generateToken` в `AuthController.js`.
- Секрет берётся из `process.env.JWT_SECRET`, срок действия — 7 дней.
- Все защищённые маршруты подключают `verifyToken` (и при необходимости `checkRole`).

---

## Модели данных

### `User`
- Поля: `firstName`, `lastName`, `companyName`, `email` (unique), `password` (bcrypt hash), `role`, `status`, `profileImage`, `timestamps`.
- Допустимые роли: `admin`, `dispatcher`, `carrier`, `customer`, `accountant`, `manager`, `driver`.

### `ResetCode`
- Поля: `email`, `code`, `expiresAt`, `attempts`, `blocked`.
- Используется при восстановлении пароля. Код действителен 5 минут, максимум 3 попытки.

---

## JWT токены

```json
{
  "id": "<MongoID>",
  "role": "admin",
  "iat": 1700000000,
  "exp": 1700604800
}
```

- `iat` / `exp` — стандартные поля JWT.
- Токен передаётся в заголовке `Authorization: Bearer <token>`.
- Декодированный payload сохраняется в `req.user` (`authMiddleware.js`).

---

## REST эндпоинты

### POST /auth/login

- **Назначение:** Аутентификация пользователя и выдача JWT.
- **Тело запроса:**

```json
{
  "email": "user@example.com",
  "password": "plain-text"
}
```

- **Успешный ответ (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "role": "admin",
    "firstName": "Jane",
    "lastName": "Doe",
    "companyName": "Cierta",
    "status": "active",
    "profileImage": null,
    "createdAt": "2024-01-10T10:00:00.000Z",
    "updatedAt": "2024-01-10T10:00:00.000Z"
  }
}
```

- **Валидация/обработка:**
  - Поиск пользователя по email.
  - Сравнение `password` через `bcrypt.compare`.
  - При успехе возвращается токен и DTO пользователя (пароль отсутствует).

- **Ошибки:**  
  `404 User not found`, `401 Incorrect password`, `500 Login failed`.

---

### POST /auth/forgot-password

- **Назначение:** Отправка 6-значного кода подтверждения на email.
- **Тело запроса:**

```json
{ "email": "user@example.com" }
```

- **Успешный ответ (200):**

```json
{ "message": "Verification code sent to your email" }
```

- **Валидация/обработка:**
  - Проверка существования пользователя.
  - Генерация кода `100000-999999`, срок действия 5 минут.
  - Создание/обновление записи в `ResetCode`.
  - Отправка письма через `mailer`.

- **Ошибки:**  
  `404 User not found`, `500 Failed to send code`.

---

### POST /auth/reset-password

- **Назначение:** Подтверждение кода и установка нового пароля.
- **Тело запроса:**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewStrongPassword123"
}
```

- **Успешный ответ (200):**

```json
{ "message": "Password reset successful" }
```

- **Валидация/обработка:**
  - Поиск записи в `ResetCode` по email.
  - Проверка блокировки (`blocked`) и срока `expiresAt`.
  - Сравнение кода, инкремент попыток при ошибке, блокировка после 3 неверных.
  - Хэширование нового пароля `bcrypt.hash(newPassword, 8)`.
  - Обновление пользователя + удаление записи ResetCode.

- **Ошибки:**  
  `404 Code not found`, `403 Too many attempts`, `410 Code expired`, `400 Incorrect code`, `500 Reset failed`.

---

## Middleware слоя

### `verifyToken` (`middlewares/authMiddleware.js`)
- Извлекает Bearer-токен из заголовка.
- Валидирует JWT: `jwt.verify(token, JWT_SECRET)`.
- Добавляет `req.user = { id, role }`.
- Возвращает `401` при отсутствии или некорректности токена.

### `checkRole(roles)` (`middlewares/roleMiddleware.js`)
- Проверяет наличие `req.user` и его роль в списке разрешённых.
- Возвращает `403 Access denied`, если роль не подходит.
- Использование:

```javascript
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

router.get(
  '/secure-resource',
  verifyToken,
  checkRole(['admin', 'dispatcher']),
  Controller.secureHandler
);
```

---

## Интеграция на фронтенде

### Универсальная функция запросов

```javascript
const API_BASE_URL = 'http://localhost:5000/api';

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    },
    ...options
  };

  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}
```

### Логин

```javascript
async function login(email, password) {
  const result = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  localStorage.setItem('token', result.token);
  localStorage.setItem('user', JSON.stringify(result.user));
  return result.user;
}
```

### Добавление токена в запросы
- После логина токен хранится в `localStorage` или `cookie`.
- `apiRequest` автоматически подставляет заголовок `Authorization`.
- Для выхода: удалить токен из хранения.

---

## Поток восстановления пароля

```
[1] Пользователь вводит email → POST /auth/forgot-password
       ↓ (успех)
     Получает код на email

[2] Пользователь вводит email + код + новый пароль → POST /auth/reset-password
       ↓
  - Проверяем срок действия кода (5 мин)
  - Блокируем после 3 неверных попыток
  - Хэшируем новый пароль
  - Удаляем код
       ↓
   Ответ 200 "Password reset successful"
```

Рекомендации для UI:
- Добавлять таймер обратного отсчёта (5 минут).
- Отображать число оставшихся попыток (опционально).
- Не сообщать, существует ли email, чтобы избегать утечек (опционально скрывать детали).

---

## Коды ошибок и ответы

| Статус | Причина                       | Где возникает                |
|--------|------------------------------|------------------------------|
| 200    | Успех                         | Все эндпоинты при успехе     |
| 401    | Нет/некорректный токен        | `verifyToken`, login         |
| 403    | Недостаточно прав / блокировка| `checkRole`, reset password  |
| 404    | Пользователь/код не найден    | login, forgot/reset          |
| 410    | Просроченный код              | reset password               |
| 500    | Внутренняя ошибка             | любые try/catch              |

Структура ошибки:

```json
{
  "error": "User not found",
  "details": "Stack or message" // только в dev-режиме
}
```

---

## Лучшие практики безопасности

1. **Храните `JWT_SECRET` в .env** и не коммитьте его.
2. **Используйте HTTPS** в production, чтобы защитить токены.
3. **Минимизируйте хранение токена** (предпочтительно HttpOnly cookie, если возможно).
4. **Ограничьте срок действия токена** (уже 7 дней, можно сократить при повышенной безопасности).
5. **Следите за статусом пользователя** (`status: suspended`) перед выдачей токена (при необходимости добавить проверку).
6. **Логируйте попытки входа** (опционально) для обнаружения брутфорса.
7. **Блокируйте аккаунт** после N неудачных попыток (не реализовано, но можно добавить в `AuthController.login`).

---

## Быстрые ссылки

- Контроллер: `controllers/AuthController.js`
- Роуты: `routes/authRoutes.js`
- Middleware: `middlewares/authMiddleware.js`, `middlewares/roleMiddleware.js`
- DTO: `DTO/user.dto.js`
- Модели: `models/User.js`, `models/ResetCode.js`

Эта документация охватывает весь текущий функционал авторизации и восстановления пароля. При добавлении новых ролей, чекпоинтов MFA или refresh-токенов обновляйте соответствующие секции.






