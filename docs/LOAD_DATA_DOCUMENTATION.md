# Load Data Documentation

## Обзор

Модель Load - центральная сущность системы управления грузоперевозками. Она хранит всю информацию о заказах на перевозку, связи с customer и carrier, а также ссылки на платежные записи.

---

## Структура данных Load (API Response)

### Полный объект Load

```typescript
interface Load {
  // Идентификаторы
  id: string;                    // MongoDB ObjectId
  orderId: string;               // Уникальный номер заказа (например: "17339847561234")
  
  // Customer информация
  customer: Customer | null;     // Данные customer (populated)
  customerEmails: string[];      // Дополнительные email адреса customer
  customerRate: string;          // Ставка для customer (например: "5000")
  
  // Carrier информация
  carrier: Carrier | null;       // Данные carrier (populated)
  carrierEmails: string[];       // Дополнительные email адреса carrier
  carrierRate: string;           // Ставка для carrier (например: "4000")
  carrierPhotos: string[];       // Фото от carrier
  
  // Тип груза
  type: {
    freight: boolean;            // true если freight shipment
    vehicle: boolean;            // true если vehicle shipment
  };
  
  // Данные груза (в зависимости от type)
  vehicle: Vehicle | null;       // Данные vehicle shipment
  freight: Freight | null;       // Данные freight shipment
  
  // Локации
  pickup: Location | null;       // Место погрузки
  delivery: Location | null;     // Место доставки
  
  // Страхование
  insurance: {
    type: string;                // Тип страхования
    customAmount: string;        // Сумма страхования
  };
  
  // Статус и даты
  status: LoadStatus;            // Текущий статус
  dates: {
    assignedDate: string;        // Дата назначения
    pickupDate: string;          // Дата погрузки
    deliveryDate: string;        // Дата доставки
    aging: string;               // Возраст заказа
  };
  
  // Документы и отслеживание
  tracking: string;              // Номер отслеживания
  documents: string[];           // Список документов (URLs/paths)
  bolPdfPath: string;            // Путь к BOL PDF
  rateConfirmationPdfPath: string; // Путь к Rate Confirmation PDF
  
  // Платежные записи (создаются при статусе "Delivered")
  paymentReceivable: PaymentReceivableSummary | null;  // Платеж от customer
  paymentPayable: PaymentPayableSummary | null;        // Платеж carrier
  
  // Служебные поля
  lastEmailSent: string;         // Дата последней отправки email
  createdBy: User;               // Кто создал
  createdAt: string;             // Дата создания
  updatedAt: string;             // Дата обновления
}
```

---

## Вложенные типы

### Customer

```typescript
interface Customer {
  id: string;
  companyName: string;           // Название компании
  customerAddress: Address;      // Адрес
  emails: string[];              // Email адреса
  phoneNumber: string;           // Телефон
  // Платежная информация
  paymentMethod: PaymentMethod;  // Метод оплаты
  paymentTerms: string;          // Условия оплаты
  creditLimit: number;           // Кредитный лимит
}

type PaymentMethod = 
  | 'ACH' 
  | 'Wire' 
  | 'Check' 
  | 'Credit Card' 
  | 'Net 30' 
  | 'Net 60' 
  | 'Net 90' 
  | 'COD' 
  | 'Factoring' 
  | 'Other';
```

### Carrier

```typescript
interface Carrier {
  id: string;
  name: string;                  // Имя/название
  companyName: string;           // Название компании
  phoneNumber: string;           // Телефон
  email: string;                 // Основной email
  emails: string[];              // Дополнительные email
  mcNumber: string;              // MC номер
  dotNumber: string;             // DOT номер
  address: Address;              // Адрес
  photos: string[];              // Фото
  equipmentType: string;         // Тип оборудования
  size: string;                  // Размер
  capabilities: string[];        // Возможности
  certifications: string[];      // Сертификации
  // Банковские реквизиты
  routing: string;               // Routing number
  bankAccount: string;           // Название банка
  accountNumber: string;         // Номер счета
}
```

### Address

```typescript
interface Address {
  address: string;               // Улица, дом
  city: string;                  // Город
  state: string;                 // Штат
  zipCode: string;               // Почтовый индекс
  zip: number;                   // ZIP (числовой)
  name: string;                  // Название локации
  loc: {                         // Геолокация
    type: string;
    coordinates: [number, number];
  };
  contactPhone: string;          // Контактный телефон
}
```

### Location (Pickup/Delivery)

```typescript
interface Location {
  locationName: string;          // Название локации
  address: Address;              // Адрес
  contactPhone: string;          // Контактный телефон
  notes: string;                 // Примечания
  date: string;                  // Дата
  images: string[];              // Фото
}
```

### Vehicle (для type.vehicle = true)

```typescript
interface Vehicle {
  shipment: VehicleShipment[];   // Список транспортных средств
  specialRequirements: string;   // Особые требования
  vehicleImages: string[];       // Фото транспортных средств
}

interface VehicleShipment {
  vin: string;                   // VIN номер (уникальный)
  make: string;                  // Марка
  model: string;                 // Модель
  year: string;                  // Год выпуска
  value: string;                 // Стоимость
}
```

### Freight (для type.freight = true)

```typescript
interface Freight {
  shipment: FreightShipment[];   // Список грузов
  freightImages: string[];       // Фото грузов
}

interface FreightShipment {
  commodity: string;             // Тип товара
  dimensionsLength: string;      // Длина
  dimensionsWidth: string;       // Ширина
  dimensionsHeight: string;      // Высота
  weight: string;                // Вес
  poNumber: string;              // PO номер
  pickupNumber: string;          // Pickup номер
}
```

### PaymentReceivableSummary (в Load)

```typescript
interface PaymentReceivableSummary {
  id: string;                    // ID платежа
  status: ReceivableStatus;      // Статус
  amount: number;                // Базовая сумма
  totalAmount: number;           // Итоговая сумма (с доп. сборами)
  paidAmount: number;            // Оплачено
  invoiceNumber: string | null;  // Номер инвойса
  dueDate: string | null;        // Срок оплаты
}

type ReceivableStatus = 
  | 'Pending' 
  | 'Invoiced' 
  | 'Partial' 
  | 'Paid' 
  | 'Overdue' 
  | 'Cancelled';
```

### PaymentPayableSummary (в Load)

```typescript
interface PaymentPayableSummary {
  id: string;                    // ID платежа
  status: PayableStatus;         // Статус
  amount: number;                // Базовая сумма
  grossAmount: number;           // Gross (с доп. выплатами)
  netAmount: number;             // Net (минус удержания)
  paidAmount: number;            // Выплачено
  scheduledDate: string | null;  // Запланированная дата выплаты
}

type PayableStatus = 
  | 'Pending' 
  | 'Scheduled' 
  | 'Partial' 
  | 'Paid' 
  | 'On Hold' 
  | 'Cancelled';
```

### LoadStatus

```typescript
type LoadStatus = 
  | 'Listed'      // Создан, ожидает назначения
  | 'Dispatched'  // Назначен carrier
  | 'Picked up'   // Груз забран
  | 'Delivered'   // Доставлен (создаются платежи)
  | 'On Hold'     // Приостановлен
  | 'Cancelled';  // Отменен
```

---

## Пример полного JSON Response

```json
{
  "success": true,
  "data": {
    "id": "674abc123def456789012345",
    "orderId": "17339847561234",
    
    "customer": {
      "id": "674abc123def456789012346",
      "companyName": "ABC Logistics Inc.",
      "customerAddress": {
        "address": "123 Main Street",
        "city": "Los Angeles",
        "state": "CA",
        "zipCode": "90001",
        "zip": 90001
      },
      "emails": ["billing@abc-logistics.com", "dispatch@abc-logistics.com"],
      "phoneNumber": "+1 (555) 123-4567",
      "paymentMethod": "Net 30",
      "paymentTerms": "Payment due within 30 days of invoice",
      "creditLimit": 50000
    },
    "customerEmails": ["load-updates@abc-logistics.com"],
    "customerRate": "5500",
    
    "carrier": {
      "id": "674abc123def456789012347",
      "name": "John Smith",
      "companyName": "Fast Transport LLC",
      "phoneNumber": "+1 (555) 987-6543",
      "email": "john@fasttransport.com",
      "emails": ["dispatch@fasttransport.com"],
      "mcNumber": "MC-123456",
      "dotNumber": "DOT-789012",
      "address": {
        "address": "456 Trucking Blvd",
        "city": "Phoenix",
        "state": "AZ",
        "zipCode": "85001"
      },
      "photos": [],
      "equipmentType": "Flatbed",
      "size": "53ft",
      "capabilities": ["Heavy Haul", "Oversized"],
      "certifications": ["HAZMAT", "TWIC"],
      "routing": "123456789",
      "bankAccount": "Wells Fargo",
      "accountNumber": "9876543210"
    },
    "carrierEmails": [],
    "carrierRate": "4200",
    "carrierPhotos": [],
    
    "type": {
      "freight": false,
      "vehicle": true
    },
    
    "vehicle": {
      "shipment": [
        {
          "vin": "1HGCM82633A123456",
          "make": "Honda",
          "model": "Accord",
          "year": "2023",
          "value": "32000"
        },
        {
          "vin": "5YJSA1E28MF123456",
          "make": "Tesla",
          "model": "Model S",
          "year": "2024",
          "value": "85000"
        }
      ],
      "specialRequirements": "Enclosed trailer required for Tesla",
      "vehicleImages": []
    },
    
    "freight": null,
    
    "pickup": {
      "locationName": "Honda Dealership LA",
      "address": {
        "address": "789 Auto Row",
        "city": "Los Angeles",
        "state": "CA",
        "zipCode": "90015"
      },
      "contactPhone": "+1 (555) 111-2222",
      "notes": "Call 30 minutes before arrival",
      "date": "2024-12-10",
      "images": []
    },
    
    "delivery": {
      "locationName": "Customer Warehouse Phoenix",
      "address": {
        "address": "321 Delivery Lane",
        "city": "Phoenix",
        "state": "AZ",
        "zipCode": "85004"
      },
      "contactPhone": "+1 (555) 333-4444",
      "notes": "Dock 5, appointment required",
      "date": "2024-12-12",
      "images": []
    },
    
    "insurance": {
      "type": "Full Coverage",
      "customAmount": "150000"
    },
    
    "status": "Delivered",
    
    "dates": {
      "assignedDate": "2024-12-08",
      "pickupDate": "2024-12-10",
      "deliveryDate": "2024-12-12",
      "aging": "4"
    },
    
    "tracking": "TRACK-2024-1210-001",
    "documents": [
      "https://s3.amazonaws.com/docs/bol-674abc123.pdf",
      "https://s3.amazonaws.com/docs/pod-674abc123.pdf"
    ],
    "bolPdfPath": "generated-pdfs/BOL-17339847561234.pdf",
    "rateConfirmationPdfPath": "generated-pdfs/RC-17339847561234.pdf",
    
    "paymentReceivable": {
      "id": "674abc123def456789012348",
      "status": "Invoiced",
      "amount": 5500,
      "totalAmount": 5750,
      "paidAmount": 0,
      "invoiceNumber": "INV-202412-00001",
      "dueDate": "2025-01-12T00:00:00.000Z"
    },
    
    "paymentPayable": {
      "id": "674abc123def456789012349",
      "status": "Pending",
      "amount": 4200,
      "grossAmount": 4450,
      "netAmount": 4350,
      "paidAmount": 0,
      "scheduledDate": null
    },
    
    "lastEmailSent": "2024-12-12T15:30:00.000Z",
    
    "createdBy": {
      "id": "674abc123def456789012350",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    },
    
    "createdAt": "2024-12-08T10:00:00.000Z",
    "updatedAt": "2024-12-12T16:00:00.000Z"
  }
}
```

---

## API Endpoints для Load

### GET Endpoints

| Endpoint | Описание |
|----------|----------|
| `GET /loads` | Все loads с пагинацией и фильтрами |
| `GET /loads/:id` | Load по ID |
| `GET /loads/search` | Расширенный поиск |
| `GET /loads/status/:status` | Loads по статусу |
| `GET /loads/carrier/:carrierId` | Loads по carrier |
| `GET /loads/customer/:customerId` | Loads по customer |
| `GET /loads/:id/history` | История изменений load |

### POST/PUT/DELETE Endpoints

| Endpoint | Описание |
|----------|----------|
| `POST /loads` | Создать load |
| `PUT /loads/:id` | Обновить load (базовое) |
| `PUT /loads/:id/full` | Обновить load (с файлами) |
| `PUT /loads/:id/status` | Обновить статус |
| `DELETE /loads/:id` | Удалить load |

---

## Примеры запросов

### Получение всех loads с фильтрами

```javascript
// GET /loads?page=1&limit=10&status=Delivered&sortBy=createdAt&sortOrder=desc

const response = await fetch('/loads?page=1&limit=10&status=Delivered', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Response:
{
  "success": true,
  "data": [...loads],
  "pagination": {
    "total": 150,
    "totalPages": 15,
    "currentPage": 1,
    "limit": 10
  }
}
```

### Создание нового Load

```javascript
// POST /loads

const newLoad = {
  customer: {
    companyName: "ABC Corp",
    customerAddress: {
      address: "123 Main St",
      city: "Los Angeles",
      state: "CA",
      zip: 90001
    },
    emails: ["billing@abc.com"]
  },
  customerRate: "5000",
  carrierRate: "4000",
  type: { vehicle: true, freight: false },
  vehicle: {
    shipment: [
      { vin: "1HGCM82633A123456", make: "Honda", model: "Accord", year: "2023" }
    ]
  },
  pickup: {
    locationName: "Pickup Location",
    address: { city: "Los Angeles", state: "CA" },
    date: "2024-12-15"
  },
  delivery: {
    locationName: "Delivery Location",
    address: { city: "Phoenix", state: "AZ" },
    date: "2024-12-17"
  }
};

const response = await fetch('/loads', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(newLoad)
});
```

### Обновление статуса Load

```javascript
// PUT /loads/:id/status

const response = await fetch(`/loads/${loadId}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'Delivered' })
});

// При переходе в "Delivered" автоматически создаются:
// - PaymentReceivable (если есть customer и customerRate)
// - PaymentPayable (если есть carrier и carrierRate)
```

---

## Жизненный цикл Load и Payments

```
┌─────────────┐
│   Listed    │  ← Load создан, ожидает назначения carrier
└─────┬───────┘
      │ Назначен carrier
      ▼
┌─────────────┐
│ Dispatched  │  ← Carrier назначен, готов к pickup
└─────┬───────┘
      │ Груз забран
      ▼
┌─────────────┐
│  Picked up  │  ← Груз у carrier, в пути
└─────┬───────┘
      │ Груз доставлен
      ▼
┌─────────────┐     ┌─────────────────────────────────────────────┐
│  Delivered  │ ──► │ Автоматически создаются:                    │
└─────────────┘     │ • PaymentReceivable (от customer)           │
                    │ • PaymentPayable (для carrier)              │
                    │ • Ссылки сохраняются в Load                 │
                    └─────────────────────────────────────────────┘
```

---

## Формулы расчета платежей

### PaymentReceivable (Customer → Company)

```
amount = customerRate
additionalCharges = tonu + detention + layover + other
totalAmount = amount + additionalCharges
remainingAmount = totalAmount - paidAmount
```

### PaymentPayable (Company → Carrier)

```
amount = carrierRate
additionalPayments = tonu + detention + layover + other
grossAmount = amount + additionalPayments
deductions = quickPayFee + factoringFee + otherDeductions
netAmount = grossAmount - deductions
remainingAmount = netAmount - paidAmount
```

---

## TypeScript Types (Полные)

```typescript
// types/load.ts

export type LoadStatus = 
  | 'Listed' 
  | 'Dispatched' 
  | 'Picked up' 
  | 'Delivered' 
  | 'On Hold' 
  | 'Cancelled';

export type CustomerPaymentMethod = 
  | 'ACH' 
  | 'Wire' 
  | 'Check' 
  | 'Credit Card' 
  | 'Net 30' 
  | 'Net 60' 
  | 'Net 90' 
  | 'COD' 
  | 'Factoring' 
  | 'Other';

export interface Address {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  zip?: number;
  name?: string;
  loc?: {
    type: string;
    coordinates: [number, number];
  };
  contactPhone?: string;
}

export interface Customer {
  id: string;
  companyName: string;
  customerAddress?: Address;
  emails: string[];
  phoneNumber?: string;
  paymentMethod?: CustomerPaymentMethod;
  paymentTerms?: string;
  creditLimit?: number;
}

export interface Carrier {
  id: string;
  name: string;
  companyName?: string;
  phoneNumber?: string;
  email?: string;
  emails: string[];
  mcNumber?: string;
  dotNumber?: string;
  address?: Address;
  photos: string[];
  equipmentType?: string;
  size?: string;
  capabilities: string[];
  certifications: string[];
  routing?: string;
  bankAccount?: string;
  accountNumber?: string;
}

export interface VehicleShipment {
  vin: string;
  make?: string;
  model?: string;
  year?: string;
  value?: string;
}

export interface Vehicle {
  shipment: VehicleShipment[];
  specialRequirements?: string;
  vehicleImages: string[];
}

export interface FreightShipment {
  commodity?: string;
  dimensionsLength?: string;
  dimensionsWidth?: string;
  dimensionsHeight?: string;
  weight?: string;
  poNumber?: string;
  pickupNumber?: string;
}

export interface Freight {
  shipment: FreightShipment[];
  freightImages: string[];
}

export interface Location {
  locationName?: string;
  address?: Address;
  contactPhone?: string;
  notes?: string;
  date?: string;
  images: string[];
}

export interface Insurance {
  type?: string;
  customAmount?: string;
}

export interface LoadDates {
  assignedDate?: string;
  pickupDate?: string;
  deliveryDate?: string;
  aging?: string;
}

export interface PaymentReceivableSummary {
  id: string;
  status: 'Pending' | 'Invoiced' | 'Partial' | 'Paid' | 'Overdue' | 'Cancelled';
  amount: number;
  totalAmount: number;
  paidAmount: number;
  invoiceNumber?: string;
  dueDate?: string;
}

export interface PaymentPayableSummary {
  id: string;
  status: 'Pending' | 'Scheduled' | 'Partial' | 'Paid' | 'On Hold' | 'Cancelled';
  amount: number;
  grossAmount: number;
  netAmount: number;
  paidAmount: number;
  scheduledDate?: string;
}

export interface Load {
  id: string;
  orderId: string;
  customer?: Customer;
  customerEmails: string[];
  customerRate?: string;
  carrierRate?: string;
  type: {
    freight: boolean;
    vehicle: boolean;
  };
  vehicle?: Vehicle;
  freight?: Freight;
  pickup?: Location;
  delivery?: Location;
  carrier?: Carrier;
  carrierEmails: string[];
  carrierPhotos: string[];
  insurance?: Insurance;
  status: LoadStatus;
  dates?: LoadDates;
  tracking?: string;
  documents: string[];
  bolPdfPath?: string;
  rateConfirmationPdfPath?: string;
  paymentReceivable?: PaymentReceivableSummary;
  paymentPayable?: PaymentPayableSummary;
  lastEmailSent?: string;
  createdBy?: any;
  createdAt: string;
  updatedAt: string;
}

// Request types
export interface CreateLoadRequest {
  customer?: Partial<Customer> | string;
  customerEmails?: string[];
  customerRate?: string;
  carrierRate?: string;
  carrier?: Partial<Carrier> | string;
  carrierEmails?: string[];
  type?: { freight?: boolean; vehicle?: boolean };
  vehicle?: Partial<Vehicle>;
  freight?: Partial<Freight>;
  pickup?: Partial<Location>;
  delivery?: Partial<Location>;
  insurance?: Insurance;
  status?: LoadStatus;
  dates?: LoadDates;
  tracking?: string;
  documents?: string[];
}

export interface UpdateLoadRequest extends Partial<CreateLoadRequest> {}

export interface UpdateStatusRequest {
  status: LoadStatus;
}
```

---

## Changelog

### December 2024 - Payment System Integration

**Удалены из Load:**
- `carrierPaymentStatus`
- `customerPaymentStatus`
- `tonuPaidToCarrier`, `detentionPaidToCarrier`, `layoverPaidToCarrier`
- `tonuReceivedFromCustomer`, `detentionReceivedFromCustomer`, `layoverReceivedFromCustomer`

**Добавлены в Load:**
- `paymentReceivable` - ссылка на PaymentReceivable
- `paymentPayable` - ссылка на PaymentPayable
- `carrierRate` в DTO

**Обновлены связанные модели:**
- `Customer` - добавлены: `paymentMethod`, `paymentTerms`, `creditLimit`
- `Carrier` - добавлены: `routing`, `bankAccount`, `accountNumber`

**Автоматизация:**
- При переходе Load в статус "Delivered" автоматически создаются PaymentReceivable и PaymentPayable

