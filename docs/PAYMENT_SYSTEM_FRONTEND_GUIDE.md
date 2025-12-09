# Payment System Frontend Integration Guide

## Обзор системы платежей

Система платежей разделена на два типа:
- **PaymentReceivable** - платежи, получаемые от customers (дебиторская задолженность)
- **PaymentPayable** - платежи, выплачиваемые carriers (кредиторская задолженность)

Платежи создаются **автоматически** при переходе Load в статус "Delivered".

---

## Модели данных

### PaymentReceivable (От Customer)

```typescript
interface PaymentReceivable {
  id: string;
  loadId: string;
  load?: {
    id: string;
    orderId: string;
    status: string;
    customerRate: string;
  };
  customer: {
    id: string;
    companyName: string;
    emails: string[];
    phoneNumber: string;
    paymentMethod: string;
    paymentTerms: string;
    creditLimit: number;
    address?: Address;
  };
  amount: number;  // Базовая сумма (customerRate)
  additionalCharges: {
    tonu: number;      // TONU fee
    detention: number; // Detention fee
    layover: number;   // Layover fee
    other: number;     // Other charges
    notes: string | null;
    total: number;     // Сумма всех дополнительных сборов
  };
  totalAmount: number; // amount + additionalCharges.total
  status: 'Pending' | 'Invoiced' | 'Partial' | 'Paid' | 'Overdue' | 'Cancelled';
  invoiceDate: string | null;
  invoiceNumber: string | null;
  dueDate: string | null;
  paidDate: string | null;
  paidAmount: number;
  remainingAmount: number; // totalAmount - paidAmount
  paymentMethod: string | null;
  transactionReference: string | null;
  notes: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### PaymentPayable (Для Carrier)

```typescript
interface PaymentPayable {
  id: string;
  loadId: string;
  load?: {
    id: string;
    orderId: string;
    status: string;
    carrierRate: string;
  };
  carrier: {
    id: string;
    name: string;
    companyName: string;
    email: string;
    emails: string[];
    phoneNumber: string;
    mcNumber: string;
    dotNumber: string;
    routing: string | null;
    bankAccount: string | null;
    accountNumber: string | null;
    address?: Address;
  };
  amount: number;  // Базовая сумма (carrierRate)
  additionalPayments: {
    tonu: number;      // TONU payment to carrier
    detention: number; // Detention payment
    layover: number;   // Layover payment
    other: number;     // Other additional payments
    notes: string | null;
    total: number;     // Сумма всех дополнительных выплат
  };
  grossAmount: number; // amount + additionalPayments.total
  status: 'Pending' | 'Scheduled' | 'Partial' | 'Paid' | 'On Hold' | 'Cancelled';
  scheduledDate: string | null;
  paidDate: string | null;
  paidAmount: number;
  remainingAmount: number; // netAmount - paidAmount
  paymentMethod: 'ACH' | 'Wire' | 'Check' | 'QuickPay' | 'Factoring' | 'Other';
  bankDetails: {
    routing: string | null;
    bankAccount: string | null;
    accountNumber: string | null;
  } | null;
  transactionReference: string | null;
  deductions: {
    quickPayFee: number;
    factoringFee: number;
    otherDeductions: number;
    deductionNotes: string | null;
    totalDeductions: number;
  };
  netAmount: number; // grossAmount - deductions.totalDeductions
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Обновленная модель Load

В Load теперь хранятся ссылки на платежные записи вместо дублирующихся полей:

```typescript
interface Load {
  id: string;
  orderId: string;
  customer: Customer;
  customerEmails: string[];
  customerRate: string;  // Ставка для customer
  carrierRate: string;   // Ставка для carrier
  // ... остальные поля ...
  
  // НОВЫЕ ПОЛЯ - ссылки на платежные записи:
  paymentReceivable: {
    id: string;
    status: string;
    amount: number;
    totalAmount: number;
    paidAmount: number;
    invoiceNumber: string | null;
    dueDate: string | null;
  } | null;
  
  paymentPayable: {
    id: string;
    status: string;
    amount: number;
    grossAmount: number;
    netAmount: number;
    paidAmount: number;
    scheduledDate: string | null;
  } | null;
  
  // УДАЛЕНЫ (теперь в Payment моделях):
  // - carrierPaymentStatus
  // - customerPaymentStatus  
  // - tonuPaidToCarrier
  // - detentionPaidToCarrier
  // - layoverPaidToCarrier
  // - tonuReceivedFromCustomer
  // - detentionReceivedFromCustomer
  // - layoverReceivedFromCustomer
}
```

### Обновленная модель Customer

```typescript
interface Customer {
  id: string;
  companyName: string;
  customerAddress: Address;
  emails: string[];
  phoneNumber: string;
  // НОВЫЕ ПОЛЯ:
  paymentMethod: 'ACH' | 'Wire' | 'Check' | 'Credit Card' | 'Net 30' | 'Net 60' | 'Net 90' | 'COD' | 'Factoring' | 'Other';
  paymentTerms: string;
  creditLimit: number;
  loads: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Обновленная модель Carrier

```typescript
interface Carrier {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  companyName: string;
  mcNumber: string;
  dotNumber: string;
  address: Address;
  emails: string[];
  photos: string[];
  equipmentType: string;
  size: string;
  capabilities: string[];
  certifications: string[];
  // НОВЫЕ ПОЛЯ:
  routing: string;      // Bank routing number
  bankAccount: string;  // Bank account name
  accountNumber: string; // Bank account number
  loads: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

## API Endpoints

### PaymentReceivable Endpoints

| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/payments/receivable` | Получить все receivable с пагинацией |
| GET | `/payments/receivable/stats` | Получить статистику |
| GET | `/payments/receivable/overdue` | Получить просроченные платежи |
| GET | `/payments/receivable/status/:status` | Фильтр по статусу |
| GET | `/payments/receivable/customer/:customerId` | Платежи по customer |
| GET | `/payments/receivable/load/:loadId` | Платеж по load |
| GET | `/payments/receivable/:id` | Получить по ID |
| POST | `/payments/receivable` | Создать (обычно автоматически) |
| PUT | `/payments/receivable/:id` | Обновить |
| PUT | `/payments/receivable/:id/invoice` | Создать инвойс |
| PUT | `/payments/receivable/:id/payment` | Записать платеж |
| DELETE | `/payments/receivable/:id` | Удалить (только admin) |

### PaymentPayable Endpoints

| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/payments/payable` | Получить все payable с пагинацией |
| GET | `/payments/payable/stats` | Получить статистику |
| GET | `/payments/payable/status/:status` | Фильтр по статусу |
| GET | `/payments/payable/carrier/:carrierId` | Платежи по carrier |
| GET | `/payments/payable/load/:loadId` | Платеж по load |
| GET | `/payments/payable/:id` | Получить по ID |
| POST | `/payments/payable` | Создать (обычно автоматически) |
| PUT | `/payments/payable/:id` | Обновить |
| PUT | `/payments/payable/:id/schedule` | Запланировать выплату |
| PUT | `/payments/payable/:id/payment` | Записать выплату |
| PUT | `/payments/payable/:id/deductions` | Обновить удержания |
| DELETE | `/payments/payable/:id` | Удалить (только admin) |

---

## Примеры запросов

### 1. Получение всех PaymentReceivable

```javascript
// GET /payments/receivable?page=1&limit=10&status=Pending

const response = await fetch('/payments/receivable?page=1&limit=10', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Response:
{
  "success": true,
  "data": [
    {
      "id": "...",
      "loadId": "...",
      "customer": {
        "id": "...",
        "companyName": "ABC Company",
        "paymentMethod": "Net 30"
      },
      "amount": 5000,
      "status": "Pending",
      "dueDate": "2025-01-08T00:00:00.000Z",
      "paidAmount": 0,
      "remainingAmount": 5000,
      "isOverdue": false
    }
  ],
  "pagination": {
    "total": 50,
    "totalPages": 5,
    "currentPage": 1,
    "limit": 10
  }
}
```

### 2. Создание инвойса

```javascript
// PUT /payments/receivable/:id/invoice

const response = await fetch(`/payments/receivable/${paymentId}/invoice`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    dueDate: '2025-01-15' // optional, default 30 days
  })
});

// Response:
{
  "success": true,
  "data": {
    "id": "...",
    "status": "Invoiced",
    "invoiceNumber": "INV-202512-00001",
    "invoiceDate": "2025-12-08T...",
    "dueDate": "2025-01-15T..."
  },
  "message": "Invoice created successfully"
}
```

### 3. Запись платежа от Customer

```javascript
// PUT /payments/receivable/:id/payment

const response = await fetch(`/payments/receivable/${paymentId}/payment`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 2500,
    paymentMethod: 'Wire',
    transactionReference: 'TXN-123456',
    notes: 'Partial payment received'
  })
});

// Response:
{
  "success": true,
  "data": {
    "id": "...",
    "status": "Partial", // или "Paid" если полностью оплачено
    "paidAmount": 2500,
    "remainingAmount": 2500
  },
  "message": "Payment recorded successfully"
}
```

### 4. Планирование выплаты Carrier

```javascript
// PUT /payments/payable/:id/schedule

const response = await fetch(`/payments/payable/${paymentId}/schedule`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    scheduledDate: '2025-12-15',
    paymentMethod: 'ACH',
    deductions: {
      quickPayFee: 50 // optional
    }
  })
});
```

### 5. Обновление удержаний

```javascript
// PUT /payments/payable/:id/deductions

const response = await fetch(`/payments/payable/${paymentId}/deductions`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    quickPayFee: 75,
    factoringFee: 100,
    otherDeductions: 25,
    deductionNotes: 'Damage claim deduction'
  })
});

// Response включает пересчитанный netAmount
```

### 6. Получение статистики

```javascript
// GET /payments/receivable/stats

const response = await fetch('/payments/receivable/stats', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Response:
{
  "success": true,
  "data": {
    "byStatus": {
      "Pending": { "count": 10, "totalAmount": 50000, "totalPaid": 0, "outstanding": 50000 },
      "Invoiced": { "count": 5, "totalAmount": 25000, "totalPaid": 0, "outstanding": 25000 },
      "Partial": { "count": 3, "totalAmount": 15000, "totalPaid": 8000, "outstanding": 7000 },
      "Paid": { "count": 20, "totalAmount": 100000, "totalPaid": 100000, "outstanding": 0 }
    },
    "overdue": {
      "count": 2,
      "totalAmount": 10000,
      "totalPaid": 0
    },
    "totals": {
      "totalCount": 38,
      "totalAmount": 190000,
      "totalPaid": 108000,
      "outstanding": 82000
    }
  }
}
```

---

## Обновление Customer с новыми полями

```javascript
// PUT /customers/:id

const response = await fetch(`/customers/${customerId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    paymentMethod: 'Net 30',
    paymentTerms: 'Payment due within 30 days of invoice',
    creditLimit: 50000
  })
});
```

---

## Обновление Carrier с банковскими реквизитами

```javascript
// PUT /carriers/:id

const response = await fetch(`/carriers/${carrierId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    routing: '123456789',
    bankAccount: 'First National Bank',
    accountNumber: '9876543210'
  })
});
```

---

## Рекомендации по UI

### 1. Страница списка PaymentReceivable

```
+----------------------------------------------------------+
| Accounts Receivable                    [+ Create Invoice] |
+----------------------------------------------------------+
| Filters: [Status ▼] [Customer ▼] [Date Range ▼] [Search] |
+----------------------------------------------------------+
| ☑ | Invoice #     | Customer    | Amount  | Due Date | Status   |
+---+---------------+-------------+---------+----------+----------+
| ☐ | INV-202512-01 | ABC Corp    | $5,000  | Jan 15   | Pending  |
| ☐ | INV-202512-02 | XYZ Inc     | $3,500  | Jan 10   | Overdue  |
| ☐ | INV-202512-03 | DEF LLC     | $7,200  | Jan 20   | Invoiced |
+----------------------------------------------------------+
| Showing 1-10 of 50              [< Prev] [1] [2] [3] [Next >] |
+----------------------------------------------------------+
```

### 2. Страница списка PaymentPayable

```
+----------------------------------------------------------+
| Accounts Payable                    [Schedule Payments]   |
+----------------------------------------------------------+
| Filters: [Status ▼] [Carrier ▼] [Date Range ▼] [Search]  |
+----------------------------------------------------------+
| ☑ | Load #  | Carrier       | Gross   | Deduct | Net     | Status    |
+---+---------+---------------+---------+--------+---------+-----------+
| ☐ | 123456  | Fast Trucking | $4,000  | $100   | $3,900  | Scheduled |
| ☐ | 123457  | Quick Haul    | $2,800  | $0     | $2,800  | Pending   |
| ☐ | 123458  | Safe Transport| $5,500  | $200   | $5,300  | On Hold   |
+----------------------------------------------------------+
```

### 3. Форма редактирования Customer (новые поля)

```
+------------------------------------------+
| Customer Details                          |
+------------------------------------------+
| Company Name: [ABC Corporation        ]   |
| Email:        [billing@abc.com        ]   |
| Phone:        [(555) 123-4567         ]   |
|                                           |
| --- Payment Information ---               |
|                                           |
| Payment Method: [Net 30          ▼]       |
|   Options: ACH, Wire, Check, Credit Card, |
|            Net 30, Net 60, Net 90, COD,   |
|            Factoring, Other               |
|                                           |
| Payment Terms: [Payment due within 30  ]  |
|                [days of invoice date   ]  |
|                                           |
| Credit Limit:  [$50,000              ]    |
|                                           |
| [Cancel]                      [Save]      |
+------------------------------------------+
```

### 4. Форма редактирования Carrier (новые поля)

```
+------------------------------------------+
| Carrier Details                           |
+------------------------------------------+
| Company Name: [Fast Trucking LLC      ]   |
| MC Number:    [MC-123456              ]   |
| DOT Number:   [DOT-789012             ]   |
|                                           |
| --- Banking Information ---               |
|                                           |
| Bank Name:      [First National Bank  ]   |
| Routing Number: [123456789            ]   |
| Account Number: [9876543210           ]   |
|                                           |
| [Cancel]                      [Save]      |
+------------------------------------------+
```

### 5. Модальное окно записи платежа

```
+------------------------------------------+
| Record Payment                            |
+------------------------------------------+
| Invoice: INV-202512-00001                 |
| Customer: ABC Corporation                 |
| Total Amount: $5,000.00                   |
| Already Paid: $2,500.00                   |
| Remaining:    $2,500.00                   |
|                                           |
| Payment Amount: [$2,500.00           ]    |
|                                           |
| Payment Method: [Wire Transfer    ▼]      |
|                                           |
| Transaction Ref: [TXN-789456        ]     |
|                                           |
| Notes:                                    |
| [Final payment received via wire      ]   |
|                                           |
| [Cancel]                [Record Payment]  |
+------------------------------------------+
```

### 6. Модальное окно удержаний

```
+------------------------------------------+
| Edit Deductions                           |
+------------------------------------------+
| Carrier: Fast Trucking LLC                |
| Gross Amount: $4,000.00                   |
|                                           |
| Quick Pay Fee:    [$50.00            ]    |
| Factoring Fee:    [$0.00             ]    |
| Other Deductions: [$50.00            ]    |
|                                           |
| Deduction Notes:                          |
| [Damage claim - minor scratches       ]   |
|                                           |
| -----------------------------------       |
| Total Deductions: $100.00                 |
| Net Amount:       $3,900.00               |
|                                           |
| [Cancel]              [Save Deductions]   |
+------------------------------------------+
```

---

## Статусы и их значения

### PaymentReceivable Statuses

| Статус | Описание | Цвет (рекомендация) |
|--------|----------|---------------------|
| Pending | Ожидает создания инвойса | Gray |
| Invoiced | Инвойс создан, ожидает оплаты | Blue |
| Partial | Частично оплачено | Yellow |
| Paid | Полностью оплачено | Green |
| Overdue | Просрочено | Red |
| Cancelled | Отменено | Gray (strikethrough) |

### PaymentPayable Statuses

| Статус | Описание | Цвет (рекомендация) |
|--------|----------|---------------------|
| Pending | Ожидает обработки | Gray |
| Scheduled | Запланировано к выплате | Blue |
| Partial | Частично выплачено | Yellow |
| Paid | Полностью выплачено | Green |
| On Hold | Приостановлено | Orange |
| Cancelled | Отменено | Gray (strikethrough) |

---

## Автоматическое создание платежей

При переходе Load в статус "Delivered":

1. **PaymentReceivable** создается если:
   - У Load есть `customer`
   - У Load есть `customerRate`
   - PaymentReceivable для этого Load еще не существует

2. **PaymentPayable** создается если:
   - У Load есть `carrier`
   - У Load есть `carrierRate`
   - PaymentPayable для этого Load еще не существует

Банковские реквизиты carrier автоматически копируются в `PaymentPayable.bankDetails`.

---

## Полезные фильтры

### Фильтрация по дате

```javascript
// Получить receivable с due date в определенном диапазоне
GET /payments/receivable?dueDateFrom=2025-01-01&dueDateTo=2025-01-31
```

### Поиск

```javascript
// Поиск по invoice number
GET /payments/receivable?search=INV-2025
```

### Сортировка

```javascript
// Сортировка по сумме (по убыванию)
GET /payments/receivable?sortBy=amount&sortOrder=desc
```

---

## TypeScript Types (Полные)

```typescript
// types/payment.ts

export type ReceivableStatus = 'Pending' | 'Invoiced' | 'Partial' | 'Paid' | 'Overdue' | 'Cancelled';
export type PayableStatus = 'Pending' | 'Scheduled' | 'Partial' | 'Paid' | 'On Hold' | 'Cancelled';
export type PaymentMethod = 'ACH' | 'Wire' | 'Check' | 'QuickPay' | 'Factoring' | 'Other';
export type CustomerPaymentMethod = 'ACH' | 'Wire' | 'Check' | 'Credit Card' | 'Net 30' | 'Net 60' | 'Net 90' | 'COD' | 'Factoring' | 'Other';

export interface PaymentReceivable {
  id: string;
  loadId: string;
  load?: LoadSummary;
  customer: CustomerSummary;
  amount: number;
  status: ReceivableStatus;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  dueDate: string | null;
  paidDate: string | null;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string | null;
  transactionReference: string | null;
  notes: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentPayable {
  id: string;
  loadId: string;
  load?: LoadSummary;
  carrier: CarrierSummary;
  amount: number;
  status: PayableStatus;
  scheduledDate: string | null;
  paidDate: string | null;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: PaymentMethod;
  bankDetails: BankDetails | null;
  transactionReference: string | null;
  deductions: Deductions;
  netAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankDetails {
  routing: string | null;
  bankAccount: string | null;
  accountNumber: string | null;
}

export interface Deductions {
  quickPayFee: number;
  factoringFee: number;
  otherDeductions: number;
  deductionNotes: string | null;
  totalDeductions: number;
}

export interface CustomerSummary {
  id: string;
  companyName: string;
  emails: string[];
  phoneNumber: string;
  paymentMethod: CustomerPaymentMethod;
  paymentTerms: string;
  creditLimit: number;
  address?: Address;
}

export interface CarrierSummary {
  id: string;
  name: string;
  companyName: string;
  email: string;
  emails: string[];
  phoneNumber: string;
  mcNumber: string;
  dotNumber: string;
  routing: string | null;
  bankAccount: string | null;
  accountNumber: string | null;
  address?: Address;
}

export interface LoadSummary {
  id: string;
  orderId: string;
  status: string;
  customerRate?: string;
  carrierRate?: string;
}

export interface Address {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface PaymentStats {
  byStatus: Record<string, StatusStats>;
  overdue?: OverdueStats;
  totals: TotalStats;
}

export interface StatusStats {
  count: number;
  totalAmount: number;
  totalPaid: number;
  outstanding: number;
}

export interface OverdueStats {
  count: number;
  totalAmount: number;
  totalPaid: number;
}

export interface TotalStats {
  totalCount: number;
  totalAmount: number;
  totalPaid: number;
  outstanding: number;
  totalNetAmount?: number; // Only for payable
}

// API Request types
export interface RecordPaymentRequest {
  amount: number;
  paymentMethod?: string;
  transactionReference?: string;
  notes?: string;
}

export interface CreateInvoiceRequest {
  dueDate?: string;
}

export interface SchedulePaymentRequest {
  scheduledDate?: string;
  paymentMethod?: PaymentMethod;
  deductions?: Partial<Omit<Deductions, 'totalDeductions'>>;
}

export interface UpdateDeductionsRequest {
  quickPayFee?: number;
  factoringFee?: number;
  otherDeductions?: number;
  deductionNotes?: string;
}
```

---

## React Hooks Examples

```typescript
// hooks/usePayments.ts

import { useState, useCallback } from 'react';
import { api } from '../services/api';

export function useReceivables() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAll = useCallback(async (params?: { page?: number; limit?: number; status?: string }) => {
    setLoading(true);
    try {
      const response = await api.get('/payments/receivable', { params });
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createInvoice = useCallback(async (id: string, dueDate?: string) => {
    setLoading(true);
    try {
      const response = await api.put(`/payments/receivable/${id}/invoice`, { dueDate });
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const recordPayment = useCallback(async (id: string, data: RecordPaymentRequest) => {
    setLoading(true);
    try {
      const response = await api.put(`/payments/receivable/${id}/payment`, data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { getAll, createInvoice, recordPayment, loading, error };
}

export function usePayables() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAll = useCallback(async (params?: { page?: number; limit?: number; status?: string }) => {
    setLoading(true);
    try {
      const response = await api.get('/payments/payable', { params });
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const schedulePayment = useCallback(async (id: string, data: SchedulePaymentRequest) => {
    setLoading(true);
    try {
      const response = await api.put(`/payments/payable/${id}/schedule`, data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const recordPayment = useCallback(async (id: string, data: RecordPaymentRequest) => {
    setLoading(true);
    try {
      const response = await api.put(`/payments/payable/${id}/payment`, data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDeductions = useCallback(async (id: string, data: UpdateDeductionsRequest) => {
    setLoading(true);
    try {
      const response = await api.put(`/payments/payable/${id}/deductions`, data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { getAll, schedulePayment, recordPayment, updateDeductions, loading, error };
}
```

---

## Changelog

### Version 1.0.0 (December 2024)

- Добавлены модели `PaymentReceivable` и `PaymentPayable`
- Обновлена модель `Customer` с полями: `paymentMethod`, `paymentTerms`, `creditLimit`
- Обновлена модель `Carrier` с полями: `routing`, `bankAccount`, `accountNumber`
- Добавлено автоматическое создание платежей при статусе "Delivered"
- Добавлены API endpoints для управления платежами
- Добавлена статистика по платежам

