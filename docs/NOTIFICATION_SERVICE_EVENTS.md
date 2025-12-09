# Notification Service - Спецификация событий

## Обзор

Notification Service получает события от Admin API через HTTP POST запросы на endpoint `/notifications`. 
Каждое событие содержит тип, заголовок, сообщение, получателей и дополнительные данные.

## Структура запроса

```typescript
interface NotificationRequest {
  type: string;              // Тип события
  title: string;             // Заголовок уведомления
  message: string;           // Текст уведомления
  recipients: string[];      // Массив userId или email
  data: object;              // Дополнительные данные события
  priority: 'low' | 'normal' | 'high' | 'urgent';
}
```

---

## События Load

### 1. `load_created` - Создание Load

**Когда срабатывает:** При создании нового Load

```json
{
  "type": "load_created",
  "title": "New Load Created: ORD-2024-0001",
  "message": "A new load has been created with order ID: ORD-2024-0001",
  "recipients": ["customer@email.com", "carrier@email.com"],
  "priority": "normal",
  "data": {
    "loadId": "675abc123def456",
    "orderId": "ORD-2024-0001",
    "createdBy": "user_id_123",
    "load": {
      "id": "675abc123def456",
      "orderId": "ORD-2024-0001",
      "status": "Listed",
      "customer": "customer_id",
      "carrier": "carrier_id"
    }
  }
}
```

**Действия Notification Service:**
- Сохранить уведомление в БД
- Отправить через Socket.IO если пользователь онлайн
- Отправить email получателям (опционально)

---

### 2. `load_updated` - Обновление Load

**Когда срабатывает:** При любом обновлении Load (кроме смены статуса)

```json
{
  "type": "load_updated",
  "title": "Load Updated: ORD-2024-0001",
  "message": "Load ORD-2024-0001 has been updated",
  "recipients": ["customer@email.com", "carrier@email.com", "user_id_123"],
  "priority": "normal",
  "data": {
    "loadId": "675abc123def456",
    "orderId": "ORD-2024-0001",
    "updatedBy": "user_id_456",
    "changes": {
      "customerRate": { "from": "5000", "to": "5500" },
      "pickup.date": { "from": "2024-12-15", "to": "2024-12-16" }
    },
    "load": {
      "id": "675abc123def456",
      "orderId": "ORD-2024-0001",
      "status": "Dispatched"
    }
  }
}
```

---

### 3. `load_status_update` - Смена статуса Load

**Когда срабатывает:** При изменении статуса Load

```json
{
  "type": "load_status_update",
  "title": "Load Status Updated: ORD-2024-0001",
  "message": "Load status changed from \"Dispatched\" to \"Picked up\"",
  "recipients": ["customer@email.com", "carrier@email.com", "user_id_123"],
  "priority": "high",
  "data": {
    "loadId": "675abc123def456",
    "orderId": "ORD-2024-0001",
    "oldStatus": "Dispatched",
    "newStatus": "Picked up",
    "updatedBy": "user_id_456",
    "load": {
      "id": "675abc123def456",
      "orderId": "ORD-2024-0001",
      "status": "Picked up",
      "customer": "customer_id",
      "carrier": "carrier_id"
    }
  }
}
```

**Приоритеты по статусам:**
| Статус | Priority |
|--------|----------|
| Listed | low |
| Dispatched | normal |
| On Hold | normal |
| Picked up | high |
| Cancelled | high |
| Delivered | urgent |

---

### 4. `load_delivered` - Load доставлен (ВАЖНОЕ СОБЫТИЕ!)

**Когда срабатывает:** Когда статус Load меняется на "Delivered"

**Особенность:** Это событие также содержит информацию о созданных платежных записях!

```json
{
  "type": "load_delivered",
  "title": "Load Delivered: ORD-2024-0001",
  "message": "Load ORD-2024-0001 has been delivered. Payment records created.",
  "recipients": ["customer@email.com", "carrier@email.com", "user_id_123"],
  "priority": "urgent",
  "data": {
    "loadId": "675abc123def456",
    "orderId": "ORD-2024-0001",
    "updatedBy": "user_id_456",
    "deliveryDate": "2024-12-08T15:30:00.000Z",
    "load": {
      "id": "675abc123def456",
      "orderId": "ORD-2024-0001",
      "status": "Delivered",
      "customerRate": "5500",
      "carrierRate": "4200"
    },
    "paymentReceivable": {
      "id": "payment_receivable_id",
      "amount": 5500,
      "totalAmount": 5500,
      "status": "Pending",
      "dueDate": "2025-01-07T15:30:00.000Z"
    },
    "paymentPayable": {
      "id": "payment_payable_id",
      "amount": 4200,
      "grossAmount": 4200,
      "netAmount": 4200,
      "status": "Pending"
    }
  }
}
```

**Действия Notification Service:**
- Отправить срочное уведомление всем участникам
- Отправить email о доставке
- Уведомить accounting team о новых платежах
- Показать Toast/Push notification

---

### 5. `load_assigned` - Назначение Carrier

**Когда срабатывает:** При назначении carrier на load

```json
{
  "type": "load_assigned",
  "title": "Load Assigned: ORD-2024-0001",
  "message": "You have been assigned to load ORD-2024-0001",
  "recipients": ["carrier@email.com", "carrier_id"],
  "priority": "high",
  "data": {
    "loadId": "675abc123def456",
    "orderId": "ORD-2024-0001",
    "carrierId": "carrier_id",
    "assignedBy": "user_id_456",
    "load": {
      "id": "675abc123def456",
      "orderId": "ORD-2024-0001",
      "status": "Dispatched"
    }
  }
}
```

---

## События Payment

### 6. `payment_receivable_created` - Создание PaymentReceivable

**Когда срабатывает:** При создании PaymentReceivable (автоматически при Delivered)

```json
{
  "type": "payment_receivable_created",
  "title": "Payment Receivable Created: ORD-2024-0001",
  "message": "Invoice pending for load ORD-2024-0001. Amount: $5500",
  "recipients": ["user_id_123"],
  "priority": "high",
  "data": {
    "paymentReceivableId": "payment_id_123",
    "loadId": "load_id_456",
    "orderId": "ORD-2024-0001",
    "customerId": "customer_id_789",
    "amount": 5500,
    "totalAmount": 5500,
    "status": "Pending",
    "dueDate": "2025-01-07T00:00:00.000Z"
  }
}
```

**Действия Notification Service:**
- Уведомить accounting team (роли: `accountingIn`, `accountingManager`)
- Добавить в очередь для invoice generation

---

### 7. `payment_payable_created` - Создание PaymentPayable

**Когда срабатывает:** При создании PaymentPayable (автоматически при Delivered)

```json
{
  "type": "payment_payable_created",
  "title": "Payment Payable Created: ORD-2024-0001",
  "message": "Payment scheduled for carrier on load ORD-2024-0001. Amount: $4200",
  "recipients": ["user_id_123", "carrier@email.com"],
  "priority": "high",
  "data": {
    "paymentPayableId": "payment_id_456",
    "loadId": "load_id_789",
    "orderId": "ORD-2024-0001",
    "carrierId": "carrier_id_123",
    "amount": 4200,
    "grossAmount": 4200,
    "netAmount": 4200,
    "status": "Pending",
    "scheduledDate": null
  }
}
```

**Действия Notification Service:**
- Уведомить accounting team (роли: `accountingOut`, `accountingManager`)
- Уведомить carrier о предстоящем платеже

---

### 8. `payment_receivable_status_update` - Обновление статуса Receivable

**Когда срабатывает:** При изменении статуса PaymentReceivable

```json
{
  "type": "payment_receivable_status_update",
  "title": "Payment Receivable Status Updated: ORD-2024-0001",
  "message": "Payment status changed from \"Pending\" to \"Invoiced\". Amount: $5500",
  "recipients": ["user_id_123"],
  "priority": "normal",
  "data": {
    "paymentId": "payment_id_123",
    "paymentType": "receivable",
    "loadId": "load_id_456",
    "orderId": "ORD-2024-0001",
    "oldStatus": "Pending",
    "newStatus": "Invoiced",
    "amount": 5500,
    "paidAmount": 0,
    "remainingAmount": 5500
  }
}
```

**Статусы PaymentReceivable:**
- `Pending` → `Invoiced` → `Partial` → `Paid`
- `Pending` → `Overdue`
- `*` → `Cancelled`

---

### 9. `payment_payable_status_update` - Обновление статуса Payable

**Когда срабатывает:** При изменении статуса PaymentPayable

```json
{
  "type": "payment_payable_status_update",
  "title": "Payment Payable Status Updated: ORD-2024-0001",
  "message": "Payment status changed from \"Pending\" to \"Scheduled\". Amount: $4200",
  "recipients": ["user_id_123"],
  "priority": "normal",
  "data": {
    "paymentId": "payment_id_456",
    "paymentType": "payable",
    "loadId": "load_id_789",
    "orderId": "ORD-2024-0001",
    "oldStatus": "Pending",
    "newStatus": "Scheduled",
    "amount": 4200,
    "paidAmount": 0,
    "remainingAmount": 4200
  }
}
```

**Статусы PaymentPayable:**
- `Pending` → `Scheduled` → `Partial` → `Paid`
- `*` → `On Hold`
- `*` → `Cancelled`

---

### 10. `payment_overdue` - Просроченный платеж

**Когда срабатывает:** Когда PaymentReceivable просрочен (dueDate < сегодня)

```json
{
  "type": "payment_overdue",
  "title": "⚠️ Payment Overdue: ORD-2024-0001",
  "message": "Payment for load ORD-2024-0001 is overdue! Amount: $5500. Due date: 2024-12-01",
  "recipients": ["user_id_123"],
  "priority": "urgent",
  "data": {
    "paymentReceivableId": "payment_id_123",
    "loadId": "load_id_456",
    "orderId": "ORD-2024-0001",
    "amount": 5500,
    "dueDate": "2024-12-01T00:00:00.000Z",
    "daysOverdue": 7
  }
}
```

**Действия Notification Service:**
- Отправить срочное уведомление
- Отправить email accounting team
- Добавить в dashboard как critical alert

---

## Требования к Notification Service

### 1. Endpoint для приёма событий

```javascript
// POST /notifications
router.post('/notifications', async (req, res) => {
  const { type, title, message, recipients, data, priority } = req.body;
  
  // 1. Сохранить в БД
  const notification = await Notification.create({
    type,
    title,
    message,
    recipients,
    data,
    priority,
    read: false,
    createdAt: new Date()
  });
  
  // 2. Отправить через Socket.IO онлайн пользователям
  recipients.forEach(recipient => {
    io.to(recipient).emit('notification', notification);
  });
  
  // 3. Отправить email для urgent/high priority
  if (priority === 'urgent' || priority === 'high') {
    await sendEmailNotification(recipients, title, message, data);
  }
  
  res.json({ success: true, notification });
});
```

### 2. Модель Notification

```javascript
const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'load_created',
      'load_updated', 
      'load_status_update',
      'load_delivered',
      'load_assigned',
      'payment_receivable_created',
      'payment_payable_created',
      'payment_receivable_status_update',
      'payment_payable_status_update',
      'payment_overdue'
    ],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  recipients: [{ type: String }], // userId или email
  data: { type: mongoose.Schema.Types.Mixed },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  emailSent: { type: Boolean, default: false },
  emailSentAt: { type: Date }
}, { timestamps: true });

// Индексы
notificationSchema.index({ recipients: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ priority: 1 });
```

### 3. Socket.IO Events

```javascript
// Клиент подключается
io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;
  
  // Присоединить к комнате пользователя
  socket.join(userId);
  
  // Отправить непрочитанные уведомления
  const unread = await Notification.find({ 
    recipients: userId, 
    read: false 
  }).sort({ createdAt: -1 }).limit(20);
  
  socket.emit('unread_notifications', unread);
});

// События для клиента
// 'notification' - новое уведомление
// 'unread_notifications' - список непрочитанных
// 'notification_read' - уведомление прочитано
```

### 4. Email Templates

Notification Service должен иметь email шаблоны для каждого типа:

| Type | Subject | Template |
|------|---------|----------|
| `load_created` | New Load Created: {orderId} | load-created.html |
| `load_delivered` | ✅ Load Delivered: {orderId} | load-delivered.html |
| `payment_receivable_created` | 💰 Invoice Pending: {orderId} | payment-receivable.html |
| `payment_payable_created` | 💸 Payment Scheduled: {orderId} | payment-payable.html |
| `payment_overdue` | ⚠️ OVERDUE: {orderId} | payment-overdue.html |

---

## Роли и получатели

| Event Type | Кто получает |
|------------|--------------|
| `load_created` | customer emails, carrier emails |
| `load_updated` | customer emails, carrier emails, createdBy |
| `load_status_update` | customer emails, carrier emails, createdBy |
| `load_delivered` | customer emails, carrier emails, createdBy, accounting team |
| `load_assigned` | carrier emails, carrier userId |
| `payment_receivable_created` | accountingIn, accountingManager, createdBy |
| `payment_payable_created` | accountingOut, accountingManager, createdBy, carrier |
| `payment_*_status_update` | createdBy, relevant accounting role |
| `payment_overdue` | accountingIn, accountingManager, admin |

---

## Конфигурация в Admin API

Добавить в `.env`:

```env
NOTIFICATION_SERVICE_URL=http://localhost:5001
NOTIFICATION_SERVICE_ENABLED=true
NOTIFICATION_SERVICE_TIMEOUT=5000
```

---

## Тестирование

### Curl примеры

```bash
# Test load_created
curl -X POST http://localhost:5001/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "type": "load_created",
    "title": "New Load Created: TEST-001",
    "message": "A new load has been created",
    "recipients": ["test@example.com"],
    "priority": "normal",
    "data": {"loadId": "123", "orderId": "TEST-001"}
  }'

# Test load_delivered
curl -X POST http://localhost:5001/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "type": "load_delivered",
    "title": "Load Delivered: TEST-001",
    "message": "Load delivered, payments created",
    "recipients": ["test@example.com"],
    "priority": "urgent",
    "data": {
      "loadId": "123",
      "orderId": "TEST-001",
      "paymentReceivable": {"id": "pr123", "amount": 5500},
      "paymentPayable": {"id": "pp456", "amount": 4200}
    }
  }'
```



