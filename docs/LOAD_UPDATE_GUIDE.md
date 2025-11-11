# Load Update Guide

## Обзор

В LoadController добавлена полная функциональность для обновления всех данных load с поддержкой загрузки файлов.

## Новые возможности

### 1. Полное обновление Load с файлами
**Endpoint:** `PUT /api/loads/:id/full`

**Особенности:**
- Поддержка загрузки файлов (изображения, документы)
- Валидация всех полей load
- Автоматическое добавление новых файлов к существующим
- Запись в историю изменений
- Аудит полей (updatedBy, updatedAt)

**Поддерживаемые поля для обновления:**
```javascript
{
  type: "string",
  vin: "string", 
  category: "string",
  customerCompanyName: "string",
  carrier: {
    name: "string",
    mcNumber: "string", 
    contact: "string",
    email: "email",
    carrierType: "string"
  },
  customerEmails: ["array"],
  assignedDate: "date",
  deliveryDate: "date", 
  pickUpDate: "date",
  status: "string",
  carrierPaymentStatus: {
    status: "string",
    date: "date"
  },
  customerPaymentStatus: {
    status: "string", 
    date: "date"
  },
  aging: "number",
  tracking: "string",
  specialRequirements: "string",
  insurance: "boolean",
  value: "number",
  tonuPaidToCarrier: "boolean",
  detentionPaidToCarrier: "boolean", 
  layoverPaidToCarrier: "boolean",
  tonuReceivedFromCustomer: "boolean",
  detentionReceivedFromCustomer: "boolean",
  layoverReceivedFromCustomer: "boolean"
}
```

### 2. Базовое обновление Load
**Endpoint:** `PUT /api/loads/:id`

**Особенности:**
- Обновление без загрузки файлов
- Использует стандартный метод из UniversalBaseController
- Ограниченная валидация (только status и value)

### 3. Обновление статуса
**Endpoint:** `PUT /api/loads/:id/status`

**Особенности:**
- Быстрое обновление только статуса
- Минимальная валидация
- Запись в историю изменений

## Использование

### Полное обновление с файлами
```bash
PUT /api/loads/:id/full
Content-Type: multipart/form-data

# Form data:
type: "Cars"
vin: "1HGBH41JXMN109186"
customerCompanyName: "ABC Company"
carrier[name]: "XYZ Transport"
carrier[contact]: "John Doe"
carrier[email]: "john@xyz.com"
status: "Dispatched"
value: 1500
files: [file1.jpg, file2.pdf] # опционально
```

### Базовое обновление
```bash
PUT /api/loads/:id
Content-Type: application/json

{
  "status": "Picked up",
  "value": 2000
}
```

### Обновление статуса
```bash
PUT /api/loads/:id/status
Content-Type: application/json

{
  "status": "Delivered"
}
```

## Валидация

### Создание (create)
- `type` - обязательное
- `vin` - обязательное, уникальное
- `carrier.name` - обязательное
- `carrier.contact` - обязательное

### Обновление (update)
- Все поля опциональные
- Типизированная валидация (string, number, boolean, email, date, array)
- Валидация email для carrier.email
- Валидация дат для date полей

## История изменений

Все обновления автоматически записываются в LoadHistory с:
- Типом действия (updated, status_updated)
- Пользователем, внесшим изменения
- Списком измененных полей с старыми и новыми значениями
- Временной меткой

## Обработка файлов

### При полном обновлении:
- Новые файлы добавляются к существующим
- Поддержка множественной загрузки
- Автоматическая загрузка в S3
- Сохранение URL файлов в поле `images`

### Поддерживаемые типы файлов:
- Изображения (jpg, png, gif)
- Документы (pdf, doc, docx)
- Другие файлы согласно настройкам S3

## Права доступа

- **admin** - полный доступ ко всем операциям
- **dispatcher** - может создавать и обновлять loads
- **manager** - только чтение

## Примеры ответов

### Успешное обновление
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "type": "Cars",
    "vin": "1HGBH41JXMN109186",
    "status": "Dispatched",
    "updatedBy": "507f1f77bcf86cd799439012",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Load updated successfully"
}
```

### Ошибка валидации
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "carrier.email",
      "message": "carrier.email must be a valid email"
    }
  ]
}
```

## Производительность

- **Полное обновление**: ~200-500ms (в зависимости от размера файлов)
- **Базовое обновление**: ~50-200ms  
- **Обновление статуса**: ~20-100ms

Время выполнения зависит от:
- Размера загружаемых файлов
- Сложности валидации
- Нагрузки на базу данных
- Сетевого соединения с S3















