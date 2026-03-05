# Postman Collection для Statistics API

## Как импортировать в Postman

### Шаг 1: Импорт коллекции

1. Откройте Postman (Desktop App или Web версия)
2. Нажмите **Import** (кнопка в левом верхнем углу или File → Import)
3. Выберите один из способов:
   - **Upload Files**: Выберите файл `POSTMAN_COLLECTION.json`
   - **Link**: Или перетащите файл в окно импорта
4. Нажмите **Import**
5. Коллекция "Cierta Statistics API" появится в левой панели

### Шаг 2: Создание Environment

1. В правом верхнем углу нажмите на выпадающий список **Environments** (или нажмите на шестеренку ⚙️)
2. Нажмите **+** или **Create Environment**
3. Назовите environment: `CIERTA-LOCAL` (или `CIERTA-STAGING`)
4. Добавьте следующие переменные:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `baseUrl` | `http://localhost:5000` | `http://localhost:5000` |
| `token` | (оставьте пустым) | (оставьте пустым) |
| `tz` | `America/New_York` | `America/New_York` |

**Опционально** (для тестов, будут заполняться автоматически):
- `testFreightBrokerEmail` - (оставьте пустым)
- `testFreightBrokerId` - (оставьте пустым)
- `freightBrokerToken` - (оставьте пустым)
- `testAccountingInEmail` - (оставьте пустым)
- `testAccountingInId` - (оставьте пустым)
- `accountingInToken` - (оставьте пустым)
- `testAccountingOutEmail` - (оставьте пустым)
- `testAccountingOutId` - (оставьте пустым)
- `testSalesAgentEmail` - (оставьте пустым)
- `testSalesAgentId` - (оставьте пустым)
- `customerId` - (ID реального customer для тестов)
- `otherCustomerId` - (ID другого customer для тестов)
- `carrierId` - (ID carrier для тестов)
- `userId` - (ID user для тестов)

5. Нажмите **Save**
6. Выберите созданный environment из выпадающего списка в правом верхнем углу

### Шаг 3: Первый запрос (Login)

1. Откройте коллекцию "Cierta Statistics API"
2. Перейдите в папку **Auth → Login**
3. Убедитесь, что выбран правильный environment (`CIERTA-LOCAL`)
4. Проверьте URL: должен быть `{{baseUrl}}/api/auth/login`
5. Обновите email и password в Body на реальные данные
6. Нажмите **Send**
7. После успешного логина токен автоматически сохранится в переменную `token`

### Шаг 4: Использование коллекции

Теперь вы можете:
- Запускать любые запросы из коллекции
- Токен будет автоматически подставляться из environment
- Переменные `{{baseUrl}}`, `{{token}}` и другие будут заменяться автоматически

## Environment Variables

Создайте environment `CIERTA-LOCAL` (или `CIERTA-STAGING`) со следующими переменными:

```
baseUrl = http://localhost:5000
token = (будет установлен после логина)
tz = America/New_York

# Test Users (автоматически устанавливаются при создании)
testFreightBrokerEmail = (автоматически)
testFreightBrokerId = (автоматически)
freightBrokerToken = (автоматически после логина)
testAccountingInEmail = (автоматически)
testAccountingInId = (автоматически)
accountingInToken = (автоматически после логина)
testAccountingOutEmail = (автоматически)
testAccountingOutId = (автоматически)
testSalesAgentEmail = (автоматически)
testSalesAgentId = (автоматически)

# Для тестов (замените на реальные ID)
customerId = (ID customer для тестов)
otherCustomerId = (ID другого customer для тестов)
carrierId = (ID carrier для тестов)
userId = (ID user для тестов)
```

## Главный Stats Endpoint

**GET** `{{baseUrl}}/stats/loads`

### Query Parameters

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `from` | string (YYYY-MM-DD) | ✅ Да | Начальная дата диапазона |
| `to` | string (YYYY-MM-DD) | ✅ Да | Конечная дата диапазона |
| `grain` | string | ❌ Нет | Гранулярность: `day`, `week`, `month`, `year` (default: `day`) |
| `entityType` | string | ❌ Нет | Тип сущности: `system`, `customer`, `carrier`, `user` (default: `system`) |
| `entityId` | string | ⚠️ Условно | ID сущности (обязателен если `entityType != 'system'`) |
| `status` | string | ❌ Нет | Фильтр по статусу Load: `Listed`, `Delivered`, `Expired`, etc. |
| `email` | string | ❌ Нет | Поиск entity по email (customer/carrier/user) |

### Пример запроса

```
GET {{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system
```

### Пример ответа (grain=day)

```json
{
  "success": true,
  "data": [
    {
      "date": "2026-02-01",
      "total": 10,
      "byStatus": {
        "listed": 3,
        "dispatched": 2,
        "pickedUp": 1,
        "delivered": 4,
        "onHold": 0,
        "cancelled": 0,
        "expired": 0
      },
      "receivable": {
        "totalCount": 5,
        "money": {
          "total": 15000,
          "confirmed": 10000,
          "outstanding": 5000
        }
      },
      "payable": {
        "totalCount": 4,
        "money": {
          "total": 8000,
          "confirmed": 6000,
          "outstanding": 2000
        }
      },
      "finance": {
        "profitConfirmed": 4000
      }
    }
  ],
  "meta": {
    "grain": "day",
    "entityType": "system",
    "entityId": null,
    "from": "2026-02-01T00:00:00.000Z",
    "to": "2026-02-12T23:59:59.999Z",
    "count": 12
  }
}
```

## Структура Postman Collection

### Folder 0: "Test Users" (ВАЖНО: Запустите перед RBAC тестами)

Эта папка содержит запросы для создания тестовых пользователей с разными ролями для тестирования RBAC.

#### 0.1 Create Test FreightBroker
- **Method**: POST
- **URL**: `{{baseUrl}}/users`
- **Body**:
  ```json
  {
    "firstName": "Test",
    "lastName": "FreightBroker",
    "email": "test-freightbroker-{{timestamp}}@test.com",
    "password": "test123",
    "role": "freightBroker",
    "allowedCustomers": []
  }
  ```
- **Tests**: Автоматически сохраняет `testFreightBrokerId` и `testFreightBrokerEmail` в environment

#### 0.2 Create Test AccountingIn
- **Method**: POST
- **URL**: `{{baseUrl}}/users`
- **Body**:
  ```json
  {
    "firstName": "Test",
    "lastName": "AccountingIn",
    "email": "test-accountingin-{{timestamp}}@test.com",
    "password": "test123",
    "role": "accountingIn"
  }
  ```
- **Tests**: Автоматически сохраняет `testAccountingInId` и `testAccountingInEmail` в environment

#### 0.3 Create Test AccountingOut
- **Method**: POST
- **URL**: `{{baseUrl}}/users`
- **Body**:
  ```json
  {
    "firstName": "Test",
    "lastName": "AccountingOut",
    "email": "test-accountingout-{{timestamp}}@test.com",
    "password": "test123",
    "role": "accountingOut"
  }
  ```

#### 0.4 Create Test SalesAgent
- **Method**: POST
- **URL**: `{{baseUrl}}/users`
- **Body**:
  ```json
  {
    "firstName": "Test",
    "lastName": "SalesAgent",
    "email": "test-salesagent-{{timestamp}}@test.com",
    "password": "test123",
    "role": "salesAgent",
    "allowedCustomers": []
  }
  ```

#### 0.5 Login as FreightBroker
- **Method**: POST
- **URL**: `{{baseUrl}}/api/auth/login`
- **Body**:
  ```json
  {
    "email": "{{testFreightBrokerEmail}}",
    "password": "test123"
  }
  ```
- **Tests**: Автоматически сохраняет `freightBrokerToken` в environment

#### 0.6 Login as AccountingIn
- **Method**: POST
- **URL**: `{{baseUrl}}/api/auth/login`
- **Body**:
  ```json
  {
    "email": "{{testAccountingInEmail}}",
    "password": "test123"
  }
  ```
- **Tests**: Автоматически сохраняет `accountingInToken` в environment

#### 0.7 Update FreightBroker AllowedCustomers
- **Method**: PUT
- **URL**: `{{baseUrl}}/users/{{testFreightBrokerId}}`
- **Body**:
  ```json
  {
    "allowedCustomers": ["{{customerId}}"]
  }
  ```
- **Note**: Замените `{{customerId}}` на реальный ID customer перед запуском

**Порядок использования:**
1. Создайте тестовых пользователей (0.1-0.4)
2. Войдите как каждый пользователь (0.5-0.6)
3. Обновите allowedCustomers для freightBroker (0.7)
4. Запустите RBAC тесты из папки "RBAC / Access Tests"

### Folder 0.5: "Test Load Data"

Эта папка содержит запросы для создания тестовых Load данных со статусом "Listed" для тестирования статистики.

#### 0.5.1 Create Test Load (Listed Status)
- **Method**: POST
- **URL**: `{{baseUrl}}/loads`
- **Headers**: `Authorization: Bearer {{token}}`
- **Body**:
  ```json
  {
    "load": {
      "orderId": "TEST-LOAD-{{timestamp}}",
      "status": "Listed",
      "customer": {
        "companyName": "Test Customer",
        "email": "test-customer@example.com",
        "type": "customer"
      },
      "type": {
        "freight": true,
        "vehicle": false
      },
      "freight": {
        "shipment": []
      },
      "pickup": {
        "locationName": "Test Pickup Location",
        "address": {
          "address": "123 Test St",
          "city": "Test City",
          "state": "CA",
          "zipCode": "12345"
        },
        "contactPhone": "+1234567890"
      },
      "delivery": {
        "locationName": "Test Delivery Location",
        "address": {
          "address": "456 Test Ave",
          "city": "Test City",
          "state": "CA",
          "zipCode": "54321"
        },
        "contactPhone": "+1234567890"
      },
      "paymentTerms": "15",
      "customerRate": "1000",
      "carrierRate": "800"
    }
  }
  ```
- **Tests**: Автоматически сохраняет `testLoadId` и `testLoadOrderId` в environment

#### 0.5.2 Create Test Load with Customer ID
- **Method**: POST
- **URL**: `{{baseUrl}}/loads`
- **Headers**: `Authorization: Bearer {{token}}`
- **Body**: Использует существующий `{{customerId}}` из environment
- **Description**: Создает Load используя существующий customer ID

#### 0.5.3 Get Test Load
- **Method**: GET
- **URL**: `{{baseUrl}}/loads/{{testLoadId}}`
- **Description**: Получить созданный тестовый Load по ID

#### 0.5.4 List Loads with Listed Status
- **Method**: GET
- **URL**: `{{baseUrl}}/loads/status/Listed`
- **Description**: Получить список всех Loads со статусом 'Listed'

**Порядок использования:**
1. Убедитесь, что вы вошли (токен сохранен в `{{token}}`)
2. Создайте тестовый Load через "Create Test Load (Listed Status)"
3. Проверьте статистику через "Smoke Tests → Stats Day System (Today)"
4. Load должен появиться в статистике со статусом "Listed"

### Folder 1: "Auth"

#### Login
- **Method**: POST
- **URL**: `{{baseUrl}}/api/auth/login`
- **Body** (JSON):
  ```json
  {
    "email": "admin@example.com",
    "password": "password123"
  }
  ```
- **Tests**:
  ```javascript
  if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("token", jsonData.token);
  }
  ```

### Folder 2: "Smoke Tests"

#### 1. Stats Day System (Today)
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from={{$isoTimestamp}}&to={{$isoTimestamp}}&grain=day&entityType=system`
- **Pre-request Script**:
  ```javascript
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  pm.environment.set("today", todayStr);
  ```
- **URL**: `{{baseUrl}}/stats/loads?from={{today}}&to={{today}}&grain=day&entityType=system`
- **Tests**: Проверка структуры ответа

#### 2. Stats Month System (Current Month)
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-28&grain=month&entityType=system`
- **Tests**: Проверка агрегации

#### 3. Stats Customer Day
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from={{today}}&to={{today}}&grain=day&entityType=customer&entityId={{customerId}}`
- **Note**: Замените `{{customerId}}` на реальный ID

#### 4. Stats User Day
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from={{today}}&to={{today}}&grain=day&entityType=user&entityId={{userId}}`
- **Note**: Замените `{{userId}}` на реальный ID

### Folder 3: "Period Tests"

#### 3.1 Day Period
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-12&to=2026-02-12&grain=day&entityType=system`
- **Tests**:
  ```javascript
  pm.test("Returns single day snapshot", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.data).to.have.lengthOf(1);
    pm.expect(jsonData.data[0].date).to.equal("2026-02-12");
  });
  ```

#### 3.2 Week Period
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-07&grain=week&entityType=system`
- **Tests**: Проверка агрегации за неделю

#### 3.3 Month Period
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-28&grain=month&entityType=system`
- **Tests**: Проверка агрегации за месяц

#### 3.4 Year Period
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-01-01&to=2026-12-31&grain=year&entityType=system`
- **Tests**: Проверка агрегации за год

#### 3.5 Date Range (Multiple Days)
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system`
- **Tests**:
  ```javascript
  pm.test("Returns array of days", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.data).to.be.an('array');
    pm.expect(jsonData.meta.count).to.equal(12);
  });
  ```

#### 3.6 Month Boundaries
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-01-31&to=2026-02-01&grain=day&entityType=system`
- **Tests**: Проверка перехода между месяцами

#### 3.7 Year Boundaries
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2025-12-31&to=2026-01-01&grain=day&entityType=system`
- **Tests**: Проверка перехода между годами

### Folder 4: "Filter Tests (Loads)"

#### 4.1 Status Filter - Delivered
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system&status=Delivered`
- **Tests**:
  ```javascript
  pm.test("Only shows Delivered loads", function () {
    const jsonData = pm.response.json();
    jsonData.data.forEach(day => {
      pm.expect(day.total).to.equal(day.byStatus.delivered || 0);
    });
  });
  ```

#### 4.2 Status Filter - Listed
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system&status=Listed`

#### 4.3 Status Filter - Expired
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system&status=Expired`

#### 4.4 Customer Filter
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=customer&entityId={{customerId}}`
- **Tests**: Проверка что показываются только loads этого customer

#### 4.5 Carrier Filter
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=carrier&entityId={{carrierId}}`

#### 4.6 User Filter (createdBy)
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=user&entityId={{userId}}`

### Folder 5: "Filter Tests (Payments)"

#### 5.1 Receivable - Status Pending (confirmed=0)
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system`
- **Tests**:
  ```javascript
  pm.test("Pending receivables have confirmed=0", function () {
    // Проверка что для pending статусов confirmed = 0
    // (нужно проверить вручную или через отдельный endpoint)
  });
  ```

#### 5.2 Receivable - Status Received (confirmed>0)
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system`
- **Tests**: Проверка что `receivable.money.confirmed > 0` когда есть received payments

#### 5.3 Payable - Status Paid (confirmed>0)
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system`
- **Tests**: Проверка что `payable.money.confirmed > 0` когда есть paid payments

#### 5.4 Profit Calculation
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system`
- **Tests**:
  ```javascript
  pm.test("Profit = receivable.confirmed - payable.confirmed", function () {
    const jsonData = pm.response.json();
    jsonData.data.forEach(day => {
      const expectedProfit = day.receivable.money.confirmed - day.payable.money.confirmed;
      pm.expect(day.finance.profitConfirmed).to.equal(expectedProfit);
    });
  });
  ```

### Folder 6: "RBAC / Access Tests"

**Важно**: Перед запуском RBAC тестов создайте тестовых пользователей через папку "Test Users".

#### 6.1 FreightBroker - System Stats (Should Fail)
- **Pre-request**: 
  1. Создайте тестового freightBroker через "Test Users → Create Test FreightBroker"
  2. Войдите через "Test Users → Login as FreightBroker"
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system`
- **Headers**: `Authorization: Bearer {{freightBrokerToken}}`
- **Tests**:
  ```javascript
  pm.test("FreightBroker cannot access system stats", function () {
    pm.expect(pm.response.code).to.equal(403);
  });
  ```

#### 6.2 FreightBroker - Allowed Customer Stats (Should Pass)
- **Pre-request**: 
  1. Создайте тестового freightBroker
  2. Обновите allowedCustomers через "Test Users → Update FreightBroker AllowedCustomers"
  3. Войдите как freightBroker
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=customer&entityId={{customerId}}`
- **Headers**: `Authorization: Bearer {{freightBrokerToken}}`
- **Tests**: Проверка что доступ разрешен

#### 6.3 FreightBroker - Other Customer Stats (Should Fail)
- **Pre-request**: Login как freightBroker
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=customer&entityId={{otherCustomerId}}`
- **Headers**: `Authorization: Bearer {{freightBrokerToken}}`
- **Tests**:
  ```javascript
  pm.test("FreightBroker cannot access other customer stats", function () {
    pm.expect(pm.response.code).to.equal(403);
  });
  ```

#### 6.4 AccountingIn - Loads Stats (Should Fail)
- **Pre-request**: 
  1. Создайте тестового accountingIn через "Test Users → Create Test AccountingIn"
  2. Войдите через "Test Users → Login as AccountingIn"
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system`
- **Headers**: `Authorization: Bearer {{accountingInToken}}`
- **Tests**:
  ```javascript
  pm.test("AccountingIn cannot access loads stats", function () {
    pm.expect(pm.response.code).to.equal(403);
  });
  ```

#### 6.5 AccountingIn - Payments Stats (Should Pass)
- **Pre-request**: Login как accountingIn
- **Note**: AccountingIn имеет доступ только к payments, но endpoint `/stats/loads` возвращает и loads и payments. Нужно проверить что loads секция пустая или недоступна.

### Folder 7: "Email Filter Tests"

#### 7.1 Search Customer by Email
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&email={{customerEmail}}`
- **Tests**:
  ```javascript
  pm.test("Finds customer by email", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.meta.entityType).to.equal("customer");
    pm.expect(jsonData.meta.entityId).to.not.be.null;
  });
  ```

#### 7.2 Search Carrier by Email
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&email={{carrierEmail}}`
- **Tests**: Проверка что находит carrier

#### 7.3 Search User by Email
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&email={{userEmail}}`
- **Tests**: Проверка что находит user

### Folder 8: "Validation Tests"

#### 8.1 Missing Required Params
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads`
- **Tests**:
  ```javascript
  pm.test("Returns 400 for missing dates", function () {
    pm.expect(pm.response.code).to.equal(400);
  });
  ```

#### 8.2 Invalid Date Format
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=invalid&to=2026-02-12`
- **Tests**: Проверка валидации дат

#### 8.3 Invalid Entity Type
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&entityType=invalid`
- **Tests**: Проверка валидации entityType

#### 8.4 Missing EntityId for Non-System
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&entityType=customer`
- **Tests**:
  ```javascript
  pm.test("Returns 400 for missing entityId", function () {
    pm.expect(pm.response.code).to.equal(400);
  });
  ```

### Folder 9: "Export Tests"

#### 9.1 Export Excel
- **Method**: GET
- **URL**: `{{baseUrl}}/stats/export?from=2026-02-01&to=2026-02-12&grain=day&entityType=system&format=xlsx`
- **Tests**:
  ```javascript
  pm.test("Returns Excel file", function () {
    pm.expect(pm.response.headers.get("Content-Type")).to.include("spreadsheetml");
    pm.expect(pm.response.headers.get("Content-Disposition")).to.include(".xlsx");
  });
  ```

## Общие Tests для всех запросов

Добавьте в **Collection Tests**:

```javascript
// Проверка структуры ответа
pm.test("Response has success field", function () {
  const jsonData = pm.response.json();
  pm.expect(jsonData).to.have.property('success');
});

pm.test("Response has data array", function () {
  const jsonData = pm.response.json();
  pm.expect(jsonData.data).to.be.an('array');
});

pm.test("Response has meta object", function () {
  const jsonData = pm.response.json();
  pm.expect(jsonData).to.have.property('meta');
});

// Проверка стабильности (для критичных запросов)
pm.test("Response is stable", function () {
  // Сохранить response в переменную и сравнить при повторном запросе
});
```

## Проверка корректности данных

### Сверка с DB (для 1-2 дней)

Создайте отдельный запрос для ручной проверки:

1. Выберите конкретный день (например, 2026-02-12)
2. В MongoDB проверьте:
   ```javascript
   // Count loads by status
   db.loads.countDocuments({ 
     createdAt: { $gte: ISODate("2026-02-12T00:00:00Z"), $lt: ISODate("2026-02-13T00:00:00Z") },
     status: "Delivered"
   });
   
   // Sum confirmedAmount for received payments
   db.paymentreceivables.aggregate([
     {
       $match: {
         invoiceAt: { $gte: ISODate("2026-02-12T00:00:00Z"), $lt: ISODate("2026-02-13T00:00:00Z") },
         status: { $in: ["received", "partially received"] }
       }
     },
     {
       $group: {
         _id: null,
         total: { $sum: "$confirmedAmount" }
       }
     }
   ]);
   ```
3. Сравните с результатом из API

## Частые баги для проверки

1. **Timezone shift**: День "12 число" считает часть "11"
2. **invoiceAt null**: Фильтр по датам не работает
3. **confirmedAmount**: Считается не по статусу, а по totalAmount
4. **RBAC**: Даёт лишний доступ
5. **Month snapshot**: Считается как day (не агрегирует)
6. **createdBy filter**: Берёт updatedBy вместо createdBy

## Примеры для копирования

### Минимальный запрос (day, system)
```
GET {{baseUrl}}/stats/loads?from=2026-02-12&to=2026-02-12&grain=day&entityType=system
```

### Запрос с фильтром статуса
```
GET {{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=system&status=Delivered
```

### Запрос по email
```
GET {{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&email=customer@example.com
```

### Запрос для customer
```
GET {{baseUrl}}/stats/loads?from=2026-02-01&to=2026-02-12&grain=day&entityType=customer&entityId=507f1f77bcf86cd799439011
```
