# Полная документация API для фронтенда

## Содержание
1. [Архитектура базы данных](#архитектура-базы-данных)
2. [API для Load (Грузы)](#api-для-load-грузы)
3. [API для Carrier (Перевозчики)](#api-для-carrier-перевозчики)
4. [API для Customer (Клиенты)](#api-для-customer-клиенты)
5. [Логика создания Load с Carrier и Customer](#логика-создания-load-с-carrier-и-customer)
6. [Загрузка файлов](#загрузка-файлов)
7. [Примеры запросов](#примеры-запросов)

---

## Архитектура базы данных

### Модель Load (Груз)

```javascript
{
  orderId: String (unique, required),           // Уникальный номер заказа
  customer: ObjectId (ref: 'Customer'),         // Ссылка на клиента
  customerEmails: [String],                      // Email адреса клиента
  customerRate: String,                          // Ставка клиента
  
  type: {
    freight: Boolean,                            // Тип: груз
    vehicle: Boolean                             // Тип: транспортное средство
  },
  
  vehicle: {                                      // Данные для vehicle shipment
    shipment: [{
      vin: String,
      make: String,
      model: String,
      year: String,
      value: String
    }],
    specialRequirements: String,
    vehicleImages: [String]
  },
  
  freight: {                                     // Данные для freight shipment
    shipment: [{
      commodity: String,
      dimensionsLength: String,
      dimensionsWidth: String,
      dimensionsHeight: String,
      weight: String,
      poNumber: String,
      pickupNumber: String
    }],
    freightImages: [String]
  },
  
  pickup: {                                      // Место подбора
    locationName: String,
    address: Address,
    contactPhone: String,
    notes: String,
    date: String,
    images: [String]
  },
  
  delivery: {                                    // Место доставки
    locationName: String,
    address: Address,
    contactPhone: String,
    notes: String,
    date: String,
    images: [String]
  },
  
  carrier: ObjectId (ref: 'Carrier'),           // Ссылка на перевозчика
  carrierEmails: [String],                      // Email адреса перевозчика
  carrierPhotos: [String],                       // Фото перевозчика
  
  insurance: {
    type: String,
    customAmount: String
  },
  
  status: String,                                // Статус: "Listed", "Dispatched", "Picked up", "Delivered", "On Hold", "Cancelled"
  
  dates: {
    assignedDate: String,
    pickupDate: String,
    deliveryDate: String,
    aging: String
  },
  
  tracking: String,                              // Номер отслеживания
  documents: [String],                           // Пути к документам
  
  billOfLadingNumber: String (unique),          // Номер накладной (автогенерация)
  bolPdfPath: String,                           // Путь к PDF BOL
  rateConfirmationPdfPath: String,               // Путь к PDF Rate Confirmation
  
  carrierPaymentStatus: {
    status: String,                              // "Invoiced", "Paid", "On Hold", "Withheld", "Charges applied"
    date: Date
  },
  
  customerPaymentStatus: {
    status: String,
    date: Date
  },
  
  // Дополнительные флаги
  tonuPaidToCarrier: Boolean,
  detentionPaidToCarrier: Boolean,
  layoverPaidToCarrier: Boolean,
  tonuReceivedFromCustomer: Boolean,
  detentionReceivedFromCustomer: Boolean,
  layoverReceivedFromCustomer: Boolean,
  
  createdBy: ObjectId (ref: 'User', required),
  createdAt: Date,
  updatedAt: Date
}
```

### Модель Carrier (Перевозчик)

```javascript
{
  name: String (required),                       // Имя перевозчика
  phoneNumber: String,                           // Телефон
  email: String,                                // Email
  companyName: String,                          // Название компании
  mcNumber: String,                             // MC номер
  dotNumber: String,                            // DOT номер
  address: Address,                             // Адрес
  emails: [String],                             // Дополнительные email
  photos: [String],                            // Фото
  loads: [ObjectId] (ref: 'Load'),             // Связанные грузы
  createdAt: Date,
  updatedAt: Date
}
```

### Модель Customer (Клиент)

```javascript
{
  companyName: String (required),              // Название компании
  customerAddress: Address (required),           // Адрес клиента
  emails: [String],                             // Email адреса
  phoneNumber: String,                          // Телефон
  loads: [ObjectId] (ref: 'Load'),             // Связанные грузы
  createdAt: Date,
  updatedAt: Date
}
```

### Модель Address (Адрес)

```javascript
{
  address: String,                              // Улица и номер
  city: String,                                // Город
  state: String,                               // Штат
  zipCode: String,                             // Почтовый индекс
  name: String,                                // Название места (опционально)
  zip: Number,                                 // Числовой индекс (для совместимости)
  loc: String,                                 // Локация (опционально)
  contactPhone: String                         // Контактный телефон
}
```

---

## API для Load (Грузы)

### Базовый URL
```
/loads
```

### 1. Создание Load (POST)

**Endpoint:** `POST /loads`

**Content-Type:** `multipart/form-data` (для загрузки файлов)

**Важно:** При создании Load система автоматически:
- Создает новый Carrier, если он не существует (поиск по mcNumber, dotNumber, name)
- Создает новый Customer, если он не существует (поиск по companyName)
- Генерирует уникальный `orderId`, если не передан
- Генерирует уникальный `billOfLadingNumber` (формат: CC-XXXX)
- Устанавливает `createdBy` из токена авторизации (автоматически из `req.user.id`)
- Устанавливает `createdAt` и `updatedAt` автоматически (через timestamps)

**Формат запроса:**

```javascript
// Форма данных (FormData)
{
  // Основные данные Load
  orderId: "1234567890",                    // Опционально, автогенерация если не указан
  
  // Customer данные (можно передать ID существующего или новые данные)
  customer: JSON.stringify({
    id: "507f1f77bcf86cd799439011",        // Опционально: ID существующего customer
    companyName: "ABC Company",             // Обязательно для нового customer
    customerAddress: {
      address: "123 Main St",
      city: "New York",
      state: "NY",
      zipCode: "10001"
    },
    emails: ["customer@example.com"],
    phoneNumber: "+1234567890"
  }),
  
  customerEmails: ["customer@example.com"],
  customerRate: "1500",
  
  // Тип груза
  type: JSON.stringify({
    freight: true,                          // или vehicle: true
    vehicle: false
  }),
  
  // Vehicle shipment (если type.vehicle = true)
  vehicle: JSON.stringify({
    shipment: [{
      vin: "1HGBH41JXMN109186",
      make: "Honda",
      model: "Civic",
      year: "2020",
      value: "25000"
    }],
    specialRequirements: "No smoking",
    vehicleImages: []                       // URL изображений (после загрузки)
  }),
  
  // Freight shipment (если type.freight = true)
  freight: JSON.stringify({
    shipment: [{
      commodity: "Electronics",
      dimensionsLength: "10",
      dimensionsWidth: "5",
      dimensionsHeight: "3",
      weight: "500",
      poNumber: "PO-12345",
      pickupNumber: "PU-67890"
    }],
    freightImages: []
  }),
  
  // Pickup location
  pickup: JSON.stringify({
    locationName: "Warehouse A",
    address: {
      address: "456 Pickup St",
      city: "Los Angeles",
      state: "CA",
      zipCode: "90001"
    },
    contactPhone: "+1987654321",
    notes: "Call before arrival",
    date: "2024-01-15",
    images: []
  }),
  
  // Delivery location
  delivery: JSON.stringify({
    locationName: "Store B",
    address: {
      address: "789 Delivery Ave",
      city: "Chicago",
      state: "IL",
      zipCode: "60601"
    },
    contactPhone: "+1555555555",
    notes: "Loading dock #3",
    date: "2024-01-20",
    images: []
  }),
  
  // Carrier данные (можно передать ID существующего или новые данные)
  carrier: JSON.stringify({
    id: "507f1f77bcf86cd799439012",        // Опционально: ID существующего carrier
    name: "John Doe",                      // Обязательно для нового carrier (или companyName)
    phoneNumber: "+1122334455",
    email: "carrier@example.com",
    companyName: "Doe Transport",
    mcNumber: "MC123456",                 // Уникальный идентификатор
    dotNumber: "DOT789012",               // Уникальный идентификатор
    address: {
      address: "321 Carrier Blvd",
      city: "Dallas",
      state: "TX",
      zipCode: "75201"
    },
    emails: ["carrier@example.com"],
    photos: []
  }),
  
  carrierEmails: ["carrier@example.com"],
  carrierPhotos: [],
  
  // Insurance
  insurance: JSON.stringify({
    type: "Standard",
    customAmount: "100000"
  }),
  
  status: "Listed",                        // По умолчанию: "Listed"
  
  dates: JSON.stringify({
    assignedDate: "2024-01-10",
    pickupDate: "2024-01-15",
    deliveryDate: "2024-01-20",
    aging: "10"
  }),
  
  tracking: "TRACK123456",
  
  // Файлы (загружаются через FormData)
  files: [File, File, ...]                 // Массив файлов (изображения, документы)
}
```

**Пример с использованием fetch (JavaScript):**

```javascript
const formData = new FormData();

// Основные данные
formData.append('orderId', '1234567890');

// Customer (новый или существующий)
const customerData = {
  // id: "507f1f77bcf86cd799439011",  // Раскомментировать для существующего
  companyName: "ABC Company",
  customerAddress: {
    address: "123 Main St",
    city: "New York",
    state: "NY",
    zipCode: "10001"
  },
  emails: ["customer@example.com"],
  phoneNumber: "+1234567890"
};
formData.append('customer', JSON.stringify(customerData));

// Carrier (новый или существующий)
const carrierData = {
  // id: "507f1f77bcf86cd799439012",  // Раскомментировать для существующего
  name: "John Doe",
  companyName: "Doe Transport",
  mcNumber: "MC123456",
  phoneNumber: "+1122334455",
  email: "carrier@example.com",
  address: {
    address: "321 Carrier Blvd",
    city: "Dallas",
    state: "TX",
    zipCode: "75201"
  }
};
formData.append('carrier', JSON.stringify(carrierData));

// Тип груза
formData.append('type', JSON.stringify({ freight: true, vehicle: false }));

// Freight данные
const freightData = {
  shipment: [{
    commodity: "Electronics",
    dimensionsLength: "10",
    dimensionsWidth: "5",
    dimensionsHeight: "3",
    weight: "500",
    poNumber: "PO-12345"
  }]
};
formData.append('freight', JSON.stringify(freightData));

// Pickup
const pickupData = {
  locationName: "Warehouse A",
  address: {
    address: "456 Pickup St",
    city: "Los Angeles",
    state: "CA",
    zipCode: "90001"
  },
  contactPhone: "+1987654321",
  date: "2024-01-15"
};
formData.append('pickup', JSON.stringify(pickupData));

// Delivery
const deliveryData = {
  locationName: "Store B",
  address: {
    address: "789 Delivery Ave",
    city: "Chicago",
    state: "IL",
    zipCode: "60601"
  },
  contactPhone: "+1555555555",
  date: "2024-01-20"
};
formData.append('delivery', JSON.stringify(deliveryData));

// Файлы
const fileInput = document.querySelector('input[type="file"]');
for (let file of fileInput.files) {
  formData.append('files', file);
}

// Отправка запроса
fetch('/loads', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`  // Если используется авторизация
  },
  body: formData
})
  .then(res => res.json())
  .then(data => {
    console.log('Load created:', data);
  });
```

**Ответ сервера:**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439013",
    "orderId": "1234567890",
    "billOfLadingNumber": "CC-0001",
    "customer": {
      "id": "507f1f77bcf86cd799439011",
      "companyName": "ABC Company",
      "customerAddress": {
        "address": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zipCode": "10001"
      },
      "emails": ["customer@example.com"],
      "phoneNumber": "+1234567890"
    },
    "carrier": {
      "id": "507f1f77bcf86cd799439012",
      "name": "John Doe",
      "companyName": "Doe Transport",
      "mcNumber": "MC123456",
      "phoneNumber": "+1122334455",
      "email": "carrier@example.com"
    },
    "type": {
      "freight": true,
      "vehicle": false
    },
    "freight": {
      "shipment": [{
        "commodity": "Electronics",
        "dimensionsLength": "10",
        "dimensionsWidth": "5",
        "dimensionsHeight": "3",
        "weight": "500",
        "poNumber": "PO-12345"
      }]
    },
    "pickup": {
      "locationName": "Warehouse A",
      "address": {
        "address": "456 Pickup St",
        "city": "Los Angeles",
        "state": "CA",
        "zipCode": "90001"
      },
      "contactPhone": "+1987654321",
      "date": "2024-01-15"
    },
    "delivery": {
      "locationName": "Store B",
      "address": {
        "address": "789 Delivery Ave",
        "city": "Chicago",
        "state": "IL",
        "zipCode": "60601"
      },
      "contactPhone": "+1555555555",
      "date": "2024-01-20"
    },
    "status": "Listed",
    "bolPdfPath": "BOL_CC-0001.pdf",
    "createdAt": "2024-01-10T10:00:00.000Z",
    "updatedAt": "2024-01-10T10:00:00.000Z"
  },
  "message": "Load created successfully"
}
```

### 2. Получение всех Loads (GET)

**Endpoint:** `GET /loads`

**Query параметры:**
- `page` (default: 1) - номер страницы
- `limit` (default: 10) - количество записей на странице
- `sortBy` (default: 'createdAt') - поле для сортировки
- `sortOrder` (default: 'desc') - порядок сортировки ('asc' или 'desc')
- `search` - поиск по полям (orderId, status, tracking)
- `status` - фильтр по статусу
- `customer` - фильтр по ID клиента
- `carrier` - фильтр по ID перевозчика

**Пример запроса:**

```javascript
fetch('/loads?page=1&limit=20&status=Listed&sortBy=createdAt&sortOrder=desc')
  .then(res => res.json())
  .then(data => {
    console.log('Loads:', data.data);
    console.log('Total:', data.pagination.total);
  });
```

**Ответ:**

```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439013",
      "orderId": "1234567890",
      "status": "Listed",
      "customer": {
        "id": "507f1f77bcf86cd799439011",
        "companyName": "ABC Company"
      },
      "carrier": {
        "id": "507f1f77bcf86cd799439012",
        "name": "John Doe"
      },
      "pickup": { ... },
      "delivery": { ... },
      "createdAt": "2024-01-10T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "totalPages": 5,
    "currentPage": 1,
    "limit": 20
  }
}
```

### 3. Получение Load по ID (GET)

**Endpoint:** `GET /loads/:id`

**Пример:**

```javascript
fetch('/loads/507f1f77bcf86cd799439013')
  .then(res => res.json())
  .then(data => {
    console.log('Load:', data.data);
  });
```

### 4. Обновление Load (PUT)

**Endpoint:** `PUT /loads/:id` (базовое обновление)
**Endpoint:** `PUT /loads/:id/full` (полное обновление с файлами)

**Важно:** При обновлении Load с новыми данными Carrier или Customer:
- Если передан `id` существующего Carrier/Customer - используется существующий
- Если переданы новые данные без `id` - система ищет существующего по уникальным полям
- Если не найден - создается новый Carrier/Customer

**Пример запроса:**

```javascript
const updateData = {
  status: "Dispatched",
  carrier: {
    id: "507f1f77bcf86cd799439012"  // Использовать существующего
  },
  dates: {
    assignedDate: "2024-01-12",
    pickupDate: "2024-01-15"
  }
};

fetch('/loads/507f1f77bcf86cd799439013', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(updateData)
})
  .then(res => res.json())
  .then(data => {
    console.log('Load updated:', data);
  });
```

### 5. Обновление статуса Load (PUT)

**Endpoint:** `PUT /loads/:id/status`

**Пример:**

```javascript
fetch('/loads/507f1f77bcf86cd799439013/status', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: "Picked up"
  })
})
  .then(res => res.json())
  .then(data => {
    console.log('Status updated:', data);
  });
```

### 6. Удаление Load (DELETE)

**Endpoint:** `DELETE /loads/:id`

### 7. Поиск Loads (GET)

**Endpoint:** `GET /loads/search?q=searchTerm&page=1&limit=10`

### 8. Получение Loads по статусу (GET)

**Endpoint:** `GET /loads/status/:status`

**Пример:**

```javascript
fetch('/loads/status/Listed?page=1&limit=10')
  .then(res => res.json())
  .then(data => {
    console.log('Listed loads:', data.data);
  });
```

### 9. Получение Loads по Carrier (GET)

**Endpoint:** `GET /loads/carrier/:carrierId`

### 10. Получение Loads по Customer (GET)

**Endpoint:** `GET /loads/customer/:customerId`

### 11. История изменений Load (GET)

**Endpoint:** `GET /loads/:id/history`

**Ответ:**

```json
{
  "success": true,
  "data": [
    {
      "action": "created",
      "changedBy": {
        "id": "507f1f77bcf86cd799439014",
        "firstName": "John",
        "lastName": "Admin"
      },
      "changes": [],
      "createdAt": "2024-01-10T10:00:00.000Z"
    },
    {
      "action": "updated",
      "changedBy": {
        "id": "507f1f77bcf86cd799439014",
        "firstName": "John",
        "lastName": "Admin"
      },
      "changes": [
        {
          "field": "status",
          "oldValue": "Listed",
          "newValue": "Dispatched"
        }
      ],
      "createdAt": "2024-01-11T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "totalPages": 1,
    "currentPage": 1,
    "limit": 10
  }
}
```

### 12. Генерация PDF документов

**BOL (Bill of Lading):**
- `GET /loads/:id/bol`

**Rate Confirmation:**
- `GET /loads/:id/rate-confirmation`

**Все документы:**
- `GET /loads/:id/documents`

**Скачать PDF:**
- `GET /loads/download/:filename`

---

## API для Carrier (Перевозчики)

### Базовый URL
```
/carriers
```

### 1. Создание Carrier (POST)

**Endpoint:** `POST /carriers`

**Формат запроса:**

```json
{
  "name": "John Doe",
  "phoneNumber": "+1122334455",
  "email": "carrier@example.com",
  "companyName": "Doe Transport",
  "mcNumber": "MC123456",
  "dotNumber": "DOT789012",
  "address": {
    "address": "321 Carrier Blvd",
    "city": "Dallas",
    "state": "TX",
    "zipCode": "75201"
  },
  "emails": ["carrier@example.com", "info@doetransport.com"],
  "photos": []
}
```

**Обязательные поля:**
- `name` (required)

**Ответ:**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439012",
    "name": "John Doe",
    "companyName": "Doe Transport",
    "mcNumber": "MC123456",
    "phoneNumber": "+1122334455",
    "email": "carrier@example.com",
    "address": { ... },
    "emails": ["carrier@example.com"],
    "photos": [],
    "createdAt": "2024-01-10T10:00:00.000Z"
  },
  "message": "Carrier created successfully"
}
```

### 2. Получение всех Carriers (GET)

**Endpoint:** `GET /carriers?page=1&limit=10&search=John`

### 3. Получение Carrier по ID (GET)

**Endpoint:** `GET /carriers/:id`

### 4. Обновление Carrier (PUT)

**Endpoint:** `PUT /carriers/:id`

### 5. Удаление Carrier (DELETE)

**Endpoint:** `DELETE /carriers/:id`

### 6. Получение Loads для Carrier (GET)

**Endpoint:** `GET /carriers/:id/loads?page=1&limit=10`

**Ответ:**

```json
{
  "success": true,
  "data": {
    "carrier": {
      "id": "507f1f77bcf86cd799439012",
      "name": "John Doe",
      ...
    },
    "loads": [
      {
        "id": "507f1f77bcf86cd799439013",
        "orderId": "1234567890",
        "status": "Listed",
        ...
      }
    ]
  },
  "pagination": {
    "total": 5,
    "totalPages": 1,
    "currentPage": 1,
    "limit": 10
  }
}
```

### 7. Поиск Carriers (GET)

**Endpoint:** `GET /carriers/search?q=John&page=1&limit=10`

**Поиск выполняется по полям:** name, companyName, mcNumber, dotNumber

---

## API для Customer (Клиенты)

### Базовый URL
```
/customers
```

### 1. Создание Customer (POST)

**Endpoint:** `POST /customers`

**Формат запроса:**

```json
{
  "companyName": "ABC Company",
  "customerAddress": {
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001"
  },
  "emails": ["customer@example.com", "info@abccompany.com"],
  "phoneNumber": "+1234567890"
}
```

**Обязательные поля:**
- `companyName` (required)
- `customerAddress` (required)

**Ответ:**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "companyName": "ABC Company",
    "customerAddress": {
      "address": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001"
    },
    "emails": ["customer@example.com"],
    "phoneNumber": "+1234567890",
    "createdAt": "2024-01-10T10:00:00.000Z"
  },
  "message": "Customer created successfully"
}
```

### 2. Получение всех Customers (GET)

**Endpoint:** `GET /customers?page=1&limit=10&search=ABC`

### 3. Получение Customer по ID (GET)

**Endpoint:** `GET /customers/:id`

### 4. Обновление Customer (PUT)

**Endpoint:** `PUT /customers/:id`

### 5. Удаление Customer (DELETE)

**Endpoint:** `DELETE /customers/:id`

### 6. Получение Loads для Customer (GET)

**Endpoint:** `GET /customers/:id/loads?page=1&limit=10`

### 7. Поиск Customers (GET)

**Endpoint:** `GET /customers/search?q=ABC&page=1&limit=10`

**Поиск выполняется по полям:** companyName, customerAddress.city, customerAddress.state

---

## Логика создания Load с Carrier и Customer

### Как работает автоматическое создание Carrier и Customer

При создании Load система автоматически обрабатывает данные Carrier и Customer:

#### 1. Обработка Customer

**Логика поиска:**
1. Если передан `customer.id` (существующий ID) → используется существующий Customer, обновляются данные при необходимости
2. Если передан `customer.companyName` → поиск по `companyName` (case-insensitive)
3. Если найден → обновляется существующий Customer новыми данными
4. Если не найден → создается новый Customer

**Примеры:**

```javascript
// Вариант 1: Использовать существующего Customer
{
  customer: {
    id: "507f1f77bcf86cd799439011"  // ID существующего
  }
}

// Вариант 2: Создать новый или найти существующего по companyName
{
  customer: {
    companyName: "ABC Company",      // Обязательно для нового
    customerAddress: { ... },
    emails: ["customer@example.com"]
  }
}
```

#### 2. Обработка Carrier

**Логика поиска (по приоритету):**
1. Если передан `carrier.id` (существующий ID) → используется существующий Carrier, обновляются данные
2. Если передан `carrier.mcNumber` → поиск по `mcNumber`
3. Если передан `carrier.dotNumber` → поиск по `dotNumber`
4. Если передан `carrier.name` + `carrier.companyName` → поиск по комбинации
5. Если передан только `carrier.name` → поиск по `name` (case-insensitive)
6. Если не найден → создается новый Carrier (требуется хотя бы `name` или `companyName`)

**Примеры:**

```javascript
// Вариант 1: Использовать существующего Carrier
{
  carrier: {
    id: "507f1f77bcf86cd799439012"  // ID существующего
  }
}

// Вариант 2: Создать новый или найти по mcNumber
{
  carrier: {
    name: "John Doe",
    mcNumber: "MC123456",           // Уникальный идентификатор
    phoneNumber: "+1122334455"
  }
}

// Вариант 3: Создать новый или найти по name
{
  carrier: {
    name: "John Doe",               // Минимум name или companyName
    companyName: "Doe Transport",
    phoneNumber: "+1122334455"
  }
}
```

### Рекомендации для фронтенда

1. **При создании Load:**
   - Если пользователь выбирает существующего Carrier/Customer из списка → передавайте только `id`
   - Если пользователь вводит новые данные → передавайте полный объект без `id`
   - Система сама определит, нужно ли создавать новую запись или использовать существующую

2. **Поиск существующих Carrier/Customer:**
   - Используйте API поиска перед созданием Load
   - Показывайте пользователю список найденных записей
   - Позволяйте выбрать существующую или создать новую

3. **Пример UI flow:**

```javascript
// Шаг 1: Пользователь вводит данные Carrier
const carrierName = "John Doe";
const carrierMC = "MC123456";

// Шаг 2: Поиск существующих Carriers
const searchResults = await fetch(`/carriers/search?q=${carrierName}`)
  .then(res => res.json());

// Шаг 3: Если найден - показать пользователю для выбора
if (searchResults.data.length > 0) {
  // Показать модальное окно: "Найден существующий Carrier. Использовать его?"
  // Если да - использовать searchResults.data[0].id
  // Если нет - создать новый
}

// Шаг 4: При создании Load
const loadData = {
  carrier: existingCarrierId 
    ? { id: existingCarrierId }  // Использовать существующего
    : {                           // Создать нового
        name: carrierName,
        mcNumber: carrierMC,
        ...
      }
};
```

---

## Загрузка файлов

### Поддержка файлов при создании/обновлении Load

**Endpoint:** `POST /loads` или `PUT /loads/:id/full`

**Content-Type:** `multipart/form-data`

**Поле для файлов:** `files` (массив файлов)

**Пример с FormData:**

```javascript
const formData = new FormData();

// Данные Load
formData.append('orderId', '1234567890');
formData.append('customer', JSON.stringify(customerData));
formData.append('carrier', JSON.stringify(carrierData));

// Файлы (изображения, документы)
const fileInput = document.querySelector('input[type="file"]');
for (let file of fileInput.files) {
  formData.append('files', file);
}

// Отправка
fetch('/loads', {
  method: 'POST',
  body: formData
});
```

**Поддерживаемые типы файлов:**
- Изображения: jpeg, jpg, png, gif, webp
- Документы: pdf, doc, docx

**Максимальный размер:** 10MB на файл
**Максимальное количество:** 10 файлов

**Обработка файлов:**
- Файлы загружаются в S3 (или локальное хранилище)
- URL файлов сохраняются в поле `documents` Load
- Файлы также могут быть привязаны к `pickup.images`, `delivery.images`, `vehicle.vehicleImages`, `freight.freightImages`

---

## Примеры запросов

### Полный пример создания Load с новым Carrier и Customer

```javascript
async function createLoadWithNewCarrierAndCustomer() {
  const formData = new FormData();
  
  // Customer (новый)
  const customerData = {
    companyName: "New Customer Inc",
    customerAddress: {
      address: "100 Customer St",
      city: "Miami",
      state: "FL",
      zipCode: "33101"
    },
    emails: ["info@newcustomer.com"],
    phoneNumber: "+13055551234"
  };
  formData.append('customer', JSON.stringify(customerData));
  formData.append('customerEmails', 'info@newcustomer.com');
  formData.append('customerRate', '2000');
  
  // Carrier (новый)
  const carrierData = {
    name: "New Carrier Driver",
    companyName: "New Carrier LLC",
    mcNumber: "MC999999",
    dotNumber: "DOT888888",
    phoneNumber: "+13055555678",
    email: "driver@newcarrier.com",
    address: {
      address: "200 Carrier Ave",
      city: "Tampa",
      state: "FL",
      zipCode: "33601"
    },
    emails: ["driver@newcarrier.com"]
  };
  formData.append('carrier', JSON.stringify(carrierData));
  formData.append('carrierEmails', 'driver@newcarrier.com');
  
  // Тип груза
  formData.append('type', JSON.stringify({ freight: true, vehicle: false }));
  
  // Freight данные
  const freightData = {
    shipment: [{
      commodity: "Furniture",
      dimensionsLength: "12",
      dimensionsWidth: "8",
      dimensionsHeight: "6",
      weight: "1000",
      poNumber: "PO-99999"
    }]
  };
  formData.append('freight', JSON.stringify(freightData));
  
  // Pickup
  const pickupData = {
    locationName: "Warehouse",
    address: {
      address: "300 Pickup Rd",
      city: "Orlando",
      state: "FL",
      zipCode: "32801"
    },
    contactPhone: "+13055551111",
    date: "2024-02-01"
  };
  formData.append('pickup', JSON.stringify(pickupData));
  
  // Delivery
  const deliveryData = {
    locationName: "Store",
    address: {
      address: "400 Delivery Blvd",
      city: "Jacksonville",
      state: "FL",
      zipCode: "32201"
    },
    contactPhone: "+13055552222",
    date: "2024-02-05"
  };
  formData.append('delivery', JSON.stringify(deliveryData));
  
  // Статус
  formData.append('status', 'Listed');
  
  // Файлы
  const files = document.querySelector('#fileInput').files;
  for (let file of files) {
    formData.append('files', file);
  }
  
  // Отправка
  try {
    const response = await fetch('/loads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('Load created:', result.data);
      console.log('Customer ID:', result.data.customer.id);
      console.log('Carrier ID:', result.data.carrier.id);
      console.log('BOL Number:', result.data.billOfLadingNumber);
    } else {
      console.error('Error:', result.error);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}
```

### Пример использования существующего Carrier и Customer

```javascript
async function createLoadWithExistingCarrierAndCustomer() {
  const formData = new FormData();
  
  // Использовать существующего Customer
  formData.append('customer', JSON.stringify({
    id: "507f1f77bcf86cd799439011"  // ID существующего
  }));
  
  // Использовать существующего Carrier
  formData.append('carrier', JSON.stringify({
    id: "507f1f77bcf86cd799439012"  // ID существующего
  }));
  
  // Остальные данные...
  formData.append('type', JSON.stringify({ freight: true, vehicle: false }));
  formData.append('freight', JSON.stringify({ shipment: [...] }));
  formData.append('pickup', JSON.stringify({ ... }));
  formData.append('delivery', JSON.stringify({ ... }));
  formData.append('status', 'Listed');
  
  const response = await fetch('/loads', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  console.log('Load created with existing Carrier and Customer:', result);
}
```

### Пример поиска и выбора Carrier перед созданием Load

```javascript
async function searchAndSelectCarrier() {
  const searchTerm = document.querySelector('#carrierSearch').value;
  
  // Поиск Carriers
  const searchResponse = await fetch(`/carriers/search?q=${searchTerm}`);
  const searchResult = await searchResponse.json();
  
  if (searchResult.data.length > 0) {
    // Показать список найденных Carriers
    const carrierList = searchResult.data.map(carrier => ({
      id: carrier.id,
      name: carrier.name,
      companyName: carrier.companyName,
      mcNumber: carrier.mcNumber
    }));
    
    // Пользователь выбирает Carrier из списка
    const selectedCarrierId = await showCarrierSelectionModal(carrierList);
    
    // Использовать выбранного Carrier при создании Load
    return { id: selectedCarrierId };
  } else {
    // Carrier не найден - пользователь вводит новые данные
    return {
      name: searchTerm,
      // Другие поля, которые ввел пользователь
    };
  }
}
```

### Пример создания Load с фильтрацией null значений

**Важно:** Система автоматически фильтрует null значения из `freight.shipment` и `vehicle.shipment`:

```javascript
// Пример: freight с null значениями
const freightData = {
  shipment: [
    {
      commodity: "Electronics",
      dimensionsLength: "10",
      dimensionsWidth: null,  // null значение
      dimensionsHeight: null, // null значение
      weight: "500",
      poNumber: null,         // null значение
      pickupNumber: null      // null значение
    },
    {
      commodity: null,        // все поля null - будет удалено
      dimensionsLength: null,
      dimensionsWidth: null,
      dimensionsHeight: null,
      weight: null,
      poNumber: null,
      pickupNumber: null
    },
    {
      commodity: "Furniture",
      dimensionsLength: "12",
      dimensionsWidth: "8",
      dimensionsHeight: "6",
      weight: "1000",
      poNumber: "PO-12345",
      pickupNumber: null      // null значение - будет удалено из объекта
    }
  ]
};

// После обработки на сервере останется:
// shipment: [
//   {
//     commodity: "Electronics",
//     dimensionsLength: "10",
//     weight: "500"
//   },
//   {
//     commodity: "Furniture",
//     dimensionsLength: "12",
//     dimensionsWidth: "8",
//     dimensionsHeight: "6",
//     weight: "1000",
//     poNumber: "PO-12345"
//   }
// ]
// Второй элемент (полностью null) будет удален
```

**VIN может повторяться:**
```javascript
// VIN может быть null и повторяться
const vehicleData = {
  shipment: [
    { vin: null, make: "Honda", model: "Civic" },      // VIN = null - OK
    { vin: null, make: "Toyota", model: "Camry" },    // VIN = null - OK (может повторяться)
    { vin: "1HGBH41JXMN109186", make: "Ford", model: "F150" }
  ]
};
```

---

## Статусы Load

Доступные статусы:
- `"Listed"` - Опубликован (по умолчанию)
- `"Dispatched"` - Назначен
- `"Picked up"` - Забран
- `"Delivered"` - Доставлен
- `"On Hold"` - На удержании
- `"Cancelled"` - Отменен

---

## Обработка ошибок

Все API возвращают стандартный формат ошибок:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information (в development режиме)"
}
```

**Коды статусов:**
- `200` - Успешно
- `201` - Создано успешно
- `400` - Ошибка валидации
- `404` - Не найдено
- `500` - Внутренняя ошибка сервера

**Примеры ошибок:**

```json
// Ошибка валидации
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "customer.companyName",
      "message": "companyName is required"
    }
  ]
}

// Дубликат
{
  "success": false,
  "error": "Duplicate entry",
  "details": {
    "orderId": "1234567890"
  }
}

// Не найдено
{
  "success": false,
  "error": "Load not found"
}
```

---

## Важные замечания

1. **Автоматическое создание Carrier/Customer:**
   - Система автоматически создает новые записи Carrier и Customer, если они не найдены
   - Все созданные записи сохраняются в базе данных для повторного использования
   - При обновлении Load можно изменить Carrier/Customer, передав новые данные или ID

2. **Автоматическое назначение createdBy:**
   - Поле `createdBy` автоматически устанавливается из токена авторизации (`req.user.id`)
   - Если пользователь авторизован - используется его ID из токена
   - Если не авторизован, но передан `createdBy` в body - используется он (для тестирования)
   - Поля `createdAt` и `updatedAt` устанавливаются автоматически через timestamps
   - **Не нужно передавать `createdBy` в запросе** - он устанавливается автоматически на сервере

3. **Фильтрация null значений:**
   - Если тип `freight` (и нет `vehicle`) - автоматически фильтруются null значения из `freight.shipment`
   - Если тип `vehicle` (и нет `freight`) - автоматически фильтруются null значения из `vehicle.shipment`
   - Элементы с полностью null значениями удаляются из массива `shipment`
   - Пустые объекты `vehicle` или `freight` не сохраняются в базу данных
   - **VIN может иметь одинаковые значения** (включая null) - уникальность не требуется

4. **Уникальные идентификаторы:**
   - `orderId` - уникальный, автогенерация если не указан
   - `billOfLadingNumber` - уникальный, автогенерация (формат: CC-XXXX)
   - `mcNumber` и `dotNumber` - используются для поиска существующих Carriers

5. **DTO (Data Transfer Object):**
   - Все ответы API форматируются через DTO для единообразия
   - DTO преобразует внутреннюю структуру данных в удобный формат для фронтенда

6. **Пагинация:**
   - Все списковые запросы поддерживают пагинацию
   - По умолчанию: page=1, limit=10

7. **Поиск:**
   - Поиск выполняется по нескольким полям одновременно
   - Регистр не важен (case-insensitive)
   - Поддерживается частичное совпадение

---

## Дополнительные ресурсы

- Postman коллекция: `docs/Cierta_Admin_API.postman_collection.json`
- Postman окружение: `docs/Cierta_Admin_API.postman_environment.json`
- Руководство по тестированию: `docs/postman-testing-guide.md`

