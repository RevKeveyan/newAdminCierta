# Models, Submodels, and User Access

Document describes all server models with embedded submodels, their types, full example documents, notification payloads, and user access (who can do what and see what).

---

## 1. Server models and submodels

### 1.1 Load

**Collection:** loads  
**Submodels:** Address (pickup/delivery), Vehicle, Freight, CarrierPeople[], RepresentativePeople[]

| Field | Type | Submodel / Notes |
|-------|------|------------------|
| orderId | String (unique, required) | — |
| customer | ObjectId ref Customer | — |
| customerEmails | [String] | — |
| customerRate | String | — |
| carrierRate | String | — |
| type | { freight: Boolean, vehicle: Boolean } | — |
| vehicle | **Vehicle** | submodel |
| freight | **Freight** | submodel |
| pickup | { locationName, **address**, contactPhone, notes, date, images } | address = Address |
| delivery | { locationName, **address**, contactPhone, notes, date, images } | address = Address |
| carrier | ObjectId ref Carrier | — |
| carrierEmails | [String] | — |
| carrierPhotos | [String] | — |
| loadCarrierPeople | [**CarrierPeople**] | submodel array |
| loadCustomerRepresentativePeoples | [**RepresentativePeople**] | submodel array |
| insurance | { type, customAmount } | — |
| status | enum | Listed, Dispatched, Picked Up, Delivered, On Hold, Cancelled |
| dates | { assignedDate, deadline, pickupDate, pickupDateType, deliveryDate, … } | + At timestamps |
| fees | [{ type, carrierRate, customerRate, total }] | enum: Detention, Layover, Lumper fee |
| tonu | { enabled, carrierRate, customerRate } | — |
| tracking | String | — |
| paymentMethod, paymentTerms | String | — |
| images, pdfs, bolDocuments, rateConfirmationDocuments, documents | [String] | — |
| paymentReceivable | ObjectId ref PaymentReceivable | — |
| paymentPayable | ObjectId ref PaymentPayable | — |
| createdBy, updatedBy | ObjectId ref User | — |

**Full example (Load with all submodels):**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "orderId": "ORD-2025-001",
  "customer": "507f1f77bcf86cd799439012",
  "customerEmails": ["client@acme.com"],
  "customerRate": "2500",
  "carrierRate": "2000",
  "type": { "freight": true, "vehicle": false },
  "vehicle": {
    "shipment": [
      {
        "vin": "1HGBH41JXMN109186",
        "make": "Toyota",
        "model": "Camry",
        "year": "2022",
        "value": "25000"
      }
    ],
    "specialRequirements": "Enclosed only",
    "pdfs": [],
    "vehicleImages": []
  },
  "freight": {
    "shipment": [
      {
        "commodity": "General",
        "dimensionsLength": "48",
        "dimensionsWidth": "40",
        "dimensionsHeight": "48",
        "dimensionsUnit": "inches",
        "onPallets": true,
        "weight": "2000",
        "shipmentUnits": "1",
        "poNumber": "PO-123",
        "pickupNumber": "PK-456",
        "deliveryReference": "REF-789"
      }
    ],
    "pdfs": [],
    "freightImages": []
  },
  "pickup": {
    "locationName": "Warehouse A",
    "address": {
      "address": "123 Main St",
      "city": "Chicago",
      "state": "IL",
      "zipCode": "60601"
    },
    "contactPhone": "+1234567890",
    "notes": "Dock 5",
    "date": "2025-03-20",
    "images": []
  },
  "delivery": {
    "locationName": "Distribution Center",
    "address": {
      "address": "456 Oak Ave",
      "city": "Dallas",
      "state": "TX",
      "zipCode": "75201"
    },
    "contactPhone": "+1987654321",
    "notes": "",
    "date": "2025-03-22",
    "images": []
  },
  "carrier": "507f1f77bcf86cd799439013",
  "carrierEmails": ["carrier@example.com"],
  "loadCarrierPeople": [
    {
      "type": "driver",
      "fullName": "John Driver",
      "email": "driver@carrier.com",
      "phoneNumber": "+1111111111"
    }
  ],
  "loadCustomerRepresentativePeoples": [
    {
      "fullName": "Jane Contact",
      "email": "jane@customer.com",
      "phoneNumber": "+2222222222"
    }
  ],
  "insurance": { "type": "Cargo", "customAmount": "50000" },
  "status": "Dispatched",
  "dates": {
    "assignedDate": "2025-03-17",
    "deadline": "2025-03-25",
    "pickupDate": "2025-03-20",
    "pickupDateType": "Exact",
    "deliveryDate": "2025-03-22",
    "deliveryDateType": "Estimate",
    "assignedAt": "2025-03-17T12:00:00.000Z",
    "pickupAt": "2025-03-20T08:00:00.000Z",
    "deliveryAt": "2025-03-22T18:00:00.000Z"
  },
  "fees": [
    { "type": "Detention", "carrierRate": "50", "customerRate": "75", "total": "75" }
  ],
  "tonu": { "enabled": false, "carrierRate": "", "customerRate": "" },
  "tracking": "TRK-123",
  "paymentMethod": "ACH",
  "paymentTerms": "Net 30",
  "paymentReceivable": null,
  "paymentPayable": null,
  "createdBy": "507f1f77bcf86cd799439014",
  "updatedBy": "507f1f77bcf86cd799439014",
  "createdAt": "2025-03-17T10:00:00.000Z",
  "updatedAt": "2025-03-17T10:00:00.000Z"
}
```

---

### 1.2 Submodel: Address

Used in: Load (pickup.address, delivery.address), Customer (customerAddress), Carrier (address).

| Field | Type |
|-------|------|
| address | String |
| city | String |
| state | String |
| zipCode | String |
| name | String |
| zip | Number |
| loc | String |
| contactPhone | String |

**Example:** `{ "address": "123 Main St", "city": "Chicago", "state": "IL", "zipCode": "60601" }`

---

### 1.3 Submodel: Vehicle

Used in: Load.vehicle.

| Field | Type |
|-------|------|
| shipment | [**VehicleShipment**] |
| specialRequirements | String |
| pdfs | [String] |
| vehicleImages | [String] |

**VehicleShipment:** `{ vin, make, model, year, value }` (all String).

---

### 1.4 Submodel: Freight

Used in: Load.freight.

| Field | Type |
|-------|------|
| shipment | [**FreightShipment**] |
| pdfs | [String] |
| freightImages | [String] |

**FreightShipment:** `commodity, dimensionsLength/Width/Height, dimensionsUnit (feet|inches), onPallets (Boolean), weight, shipmentUnits, poNumber, pickupNumber, deliveryReference` (String unless noted).

---

### 1.5 Submodel: CarrierPeople

Used in: Load.loadCarrierPeople[], Carrier.people[].

| Field | Type |
|-------|------|
| type | enum: driver, dispatcher |
| fullName | String (required) |
| email | String |
| phoneNumber | String |

---

### 1.6 Submodel: RepresentativePeople

Used in: Load.loadCustomerRepresentativePeoples[], Customer.representativePeoples[].

| Field | Type |
|-------|------|
| fullName | String (required) |
| email | String |
| phoneNumber | String |

---

### 1.7 Customer

**Collection:** customers  
**Submodels:** Address (customerAddress), RepresentativePeople[] (representativePeoples)

| Field | Type |
|-------|------|
| companyName | String (required, unique) |
| type | enum: platform, customer |
| customerAddress | **Address** |
| email | String (sparse unique) |
| phoneNumber | String |
| paymentMethod | enum: ACH, ZELLE, Net 30 |
| paymentTerms | String |
| creditLimit | Number |
| daysToPay | String |
| images, pdfs | [String] |
| loads | [ObjectId ref Load] |
| status | enum: active, suspended, inactive |
| allowedUsers | [ObjectId ref User] |
| representativePeoples | [**RepresentativePeople**] |

**Full example:**

```json
{
  "_id": "507f1f77bcf86cd799439012",
  "companyName": "Acme Corp",
  "type": "customer",
  "customerAddress": {
    "address": "100 Business Blvd",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001"
  },
  "email": "billing@acme.com",
  "phoneNumber": "+1555123456",
  "paymentMethod": "Net 30",
  "paymentTerms": "Net 30",
  "creditLimit": 50000,
  "status": "active",
  "allowedUsers": ["507f1f77bcf86cd799439014"],
  "representativePeoples": [
    {
      "fullName": "Jane Contact",
      "email": "jane@acme.com",
      "phoneNumber": "+1555987654"
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-03-17T00:00:00.000Z"
}
```

---

### 1.8 Carrier

**Collection:** carriers  
**Submodels:** Address (address), CarrierPeople[] (people)

| Field | Type |
|-------|------|
| name | String (required) |
| people | [**CarrierPeople**] |
| phoneNumber | String |
| email | String (sparse unique) |
| companyName, dba | String |
| mcNumber, dotNumber | String (sparse unique) |
| address | **Address** |
| photos | [String] |
| equipment | [{ type, sizes[] }] |
| equipmentType | [String] (required) |
| size | [String] |
| capabilities, certifications | [String] |
| routing, bankAccount, accountNumber | String |
| images, pdfs | [String] |
| loads | [ObjectId ref Load] |
| status | enum: active, suspended, inactive |

**Full example:**

```json
{
  "_id": "507f1f77bcf86cd799439013",
  "name": "Fast Freight LLC",
  "people": [
    {
      "type": "dispatcher",
      "fullName": "Bob Dispatcher",
      "email": "bob@fastfreight.com",
      "phoneNumber": "+1333444555"
    }
  ],
  "phoneNumber": "+1333444555",
  "email": "dispatch@fastfreight.com",
  "companyName": "Fast Freight LLC",
  "mcNumber": "MC123456",
  "dotNumber": "DOT789",
  "address": {
    "address": "200 Truck Lane",
    "city": "Indianapolis",
    "state": "IN",
    "zipCode": "46201"
  },
  "equipmentType": ["Dry Van", "Reefer"],
  "size": ["53"],
  "status": "active",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-03-17T00:00:00.000Z"
}
```

---

### 1.9 User

**Collection:** users  
No embedded submodels.

| Field | Type |
|-------|------|
| firstName, lastName | String (required) |
| companyName | String |
| email | String (required, unique) |
| phoneNumber | String |
| password | String (required) |
| profileImage | String |
| pdfs | [String] |
| role | enum (see Access section) |
| status | enum: active, suspended |
| allowedCustomers | [ObjectId ref Customer] |

**Roles:** admin, manager, accountingManager, accountingIn, accountingOut, freightBroker, dispatcher, Pre-dispatcher, partner, salesAgent, bidAgent.

**Full example:**

```json
{
  "_id": "507f1f77bcf86cd799439014",
  "firstName": "Alex",
  "lastName": "Manager",
  "companyName": "Cierta",
  "email": "alex@cierta.com",
  "phoneNumber": "+1555000000",
  "role": "manager",
  "status": "active",
  "allowedCustomers": ["507f1f77bcf86cd799439012"],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-03-17T00:00:00.000Z"
}
```

---

### 1.10 PaymentReceivable

**Collection:** paymentreceivables (standalone model in subModels folder)  
**Submodel-like:** fees[], tonu{}

| Field | Type |
|-------|------|
| loadId | ObjectId ref Load |
| customer | ObjectId ref Customer (required) |
| status | enum: pending, invoiced, withheld, canceled, on Hold, received, partially received, pay today |
| paymentMethod | enum: ACH, Wire, Check, Credit Card, Cash, Zelle, Other |
| paymentLink, dtp | String |
| orderId | String |
| customerRate, totalAmount, confirmedAmount | Number |
| fees | [{ type (Detention|Layover|Lumper fee), customerRate, total }] |
| tonu | { enabled, customerRate } |
| deadlineDays | Number (required) |
| invoiceAt, dueAt, statusSince, holdStartedAt, receivedAt | Date |
| nextNotifyAt | Date |
| notified | { overdueAt, overdueRepeatAt, payTodayAt, dueTodayAt, … } |
| notes | String |
| images, pdfs | [String] |
| createdBy | ObjectId ref User |

**Full example:**

```json
{
  "_id": "507f1f77bcf86cd799439020",
  "loadId": "507f1f77bcf86cd799439011",
  "customer": "507f1f77bcf86cd799439012",
  "status": "invoiced",
  "paymentMethod": "ACH",
  "orderId": "ORD-2025-001",
  "customerRate": 2500,
  "totalAmount": 2575,
  "confirmedAmount": 0,
  "fees": [
    { "type": "Detention", "customerRate": 75, "total": 75 }
  ],
  "tonu": { "enabled": false, "customerRate": 0 },
  "deadlineDays": 30,
  "invoiceAt": "2025-03-22T00:00:00.000Z",
  "dueAt": "2025-04-21T00:00:00.000Z",
  "statusSince": "2025-03-22T00:00:00.000Z",
  "nextNotifyAt": "2025-04-22T00:00:00.000Z",
  "notified": {},
  "createdBy": "507f1f77bcf86cd799439014",
  "createdAt": "2025-03-22T00:00:00.000Z",
  "updatedAt": "2025-03-22T00:00:00.000Z"
}
```

---

### 1.11 PaymentPayable

**Collection:** paymentpayables  
**Submodel-like:** fees[], tonu{}

| Field | Type |
|-------|------|
| loadId | ObjectId ref Load |
| carrier | ObjectId ref Carrier (required) |
| status | enum: pending, invoiced, withheld, canceled, on Hold, paid, partially paid, pay today |
| paymentMethod | enum: ACH, Wire, Check, Credit Card, Cash, Zelle, Factoring, Other |
| bank, routing, accountNumber | String |
| orderId | String |
| carrierRate, totalAmount, confirmedAmount | Number |
| fees | [{ type, carrierRate, total }] |
| tonu | { enabled, carrierRate } |
| deadlineDays | Number (required) |
| invoiceAt, dueAt, statusSince, holdStartedAt, paidAt | Date |
| nextNotifyAt | Date |
| notified | { dueSoonAt, dueTodayAt, payTodayAt, overdueAt } |
| notes | String |
| images, pdfs | [String] |
| createdBy | ObjectId ref User |

**Full example:** Same structure as PaymentReceivable with carrier/carrierRate/paidAt instead of customer/customerRate/receivedAt.

---

### 1.12 ResetCode

**Collection:** resetcodes  
No submodels.

| Field | Type |
|-------|------|
| email | String (required) |
| code | String (required) |
| expiresAt | Date (required) |
| attempts | Number (default 0) |
| blocked | Boolean (default false) |

---

### 1.13 LoadHistory

**Collection:** loadhistories  
**Submodel:** actor{}, changes[]

| Field | Type |
|-------|------|
| load | ObjectId ref Load (required) |
| action | enum: created, updated, status_update, assign, delete |
| actor | { actorId (ref User), actorRole, actorEmail } |
| changes | [{ field, from, to }] |
| createdAt | Date |

---

### 1.14 UserHistory

**Collection:** userhistories  
**Submodel:** actor{}, changes[]

| Field | Type |
|-------|------|
| entityId | ObjectId ref User (required) |
| action | enum: created, updated, role_change, status_change, permissions_change, delete |
| actor | { actorId, actorRole, actorEmail } |
| changes | [{ field, from, to }] |
| createdAt | Date |

---

### 1.15 LoadPayment

**Collection:** loadpayments  
No submodels.

| Field | Type |
|-------|------|
| load | ObjectId ref Load (required) |
| paidBy | ObjectId ref User (required) |
| amount | Number (required) |
| date | Date |
| type | enum: carrier, customer |
| note | String |

---

### 1.16 StatsSnapshot

**Collection:** statssnapshots  
**Submodels:** loads{}, loadsState{}, loadsEvents{}, receivable{}, payable{}, finance{}

| Field | Type |
|-------|------|
| grain | enum: day, week, month, year |
| dateKey | String |
| rangeStart, rangeEnd | Date |
| entityType | enum: system, customer, carrier, user |
| entityId | ObjectId (nullable) |
| loads | { total, byStatus: { listed, dispatched, … } } |
| loadsState | { listed, dispatched, pickedUp, delivered, onHold, cancelled, expired } |
| loadsEvents | { created, dispatched, pickedUp, delivered, onHold, cancelled } |
| receivable | { totalCount, money: { total, confirmed, outstanding } } |
| payable | { totalCount, money: { total, confirmed, outstanding } } |
| finance | { profitConfirmed } |
| computedAt | Date |
| version | Number |

---

### 1.17 StatsDailyDelta

**Collection:** statsdailydeltas  
**Submodels:** loadsStateDelta (CountSchema), loadsEventsDelta (EventSchema)

| Field | Type |
|-------|------|
| dateKey | String |
| rangeStart, rangeEnd | Date |
| entityType | enum: system, customer, carrier, user |
| entityId | ObjectId |
| loadsStateDelta | { listed, dispatched, pickedUp, delivered, onHold, cancelled, expired } |
| loadsEventsDelta | { created, dispatched, pickedUp, delivered, onHold, cancelled } |

---

### 1.18 StatsDirty

**Collection:** statsdirty  
**Submodel:** lock{}, error{}, sources[]

| Field | Type |
|-------|------|
| grain | enum: day, week, month, year |
| dateKey | String |
| rangeStart, rangeEnd | Date |
| entityType | enum: system, customer, carrier, user |
| entityId | ObjectId |
| sources | [loads, receivable, payable] |
| lock | { locked, lockedAt, lockedBy } |
| attempts | Number |
| priority | Number |
| lastAttemptAt | Date |
| error | { message, occurredAt } |
| createdAt | Date |

---

### 1.19 Review

**Collection:** reviews  
No submodels. Refs: Product, User.

| Field | Type |
|-------|------|
| productId | ObjectId ref Product (required) |
| userId | ObjectId ref User (required) |
| rating | Number 1–5 (required) |
| comment | String (max 1000) |
| createdAt | Date |

---

## 2. Notifications (server + frontend)

Server sends to notification service (`/internal/notifications`) with:

- **type** – notification type  
- **version** – number (default 1)  
- **eventId** – idempotency  
- **title**, **message** – text  
- **recipients** – [userId or email]  
- **data** – payload (see below)  
- **priority** – low | normal | high | urgent  

### 2.1 Notification types and data

| Type | When | data shape (main fields) |
|------|------|---------------------------|
| load_status_update | Load status changed | loadId, orderId, oldStatus, newStatus, load{ id, orderId, status, customer, carrier }, updatedBy |
| load_created | New load | loadId, orderId, load{ id, orderId, status, customer, carrier }, createdBy |
| load_assigned | Load assigned to carrier | loadId, orderId, carrierId, load{ id, orderId, status, carrier }, assignedBy |
| load_delivered | Load delivered, payments created | loadId, orderId, load{ id, orderId, status, customerRate, carrierRate }, paymentReceivable{ id, amount, totalAmount, status, dueDate }, paymentPayable{ id, amount, grossAmount, netAmount, status }, updatedBy |
| load_updated | Load data updated | loadId, orderId, updatedBy, changes, load{ id, orderId, status } |
| payment_receivable_created | PaymentReceivable created | paymentReceivableId, loadId, orderId, customerId, customer{}, amount, customerRate, status, dueDate, load{} |
| payment_payable_created | PaymentPayable created | paymentPayableId, loadId, orderId, carrierId, carrier{}, amount, grossAmount, netAmount, carrierRate, status, load{} |
| payment_receivable_status_update | Receivable status changed | paymentId, paymentType, loadId, orderId, oldStatus, newStatus, amount, customerRate, customer{}, load{} |
| payment_payable_status_update | Payable status changed | paymentId, paymentType, loadId, orderId, oldStatus, newStatus, amount, carrierRate, carrier{}, load{} |
| payment_overdue | Receivable/Payable overdue | paymentReceivableId or paymentPayableId, loadId, orderId, customerId/carrierId, amount, dueDate, daysOverdue, load{} |
| payment_due_today | Receivable due today | paymentReceivableId, loadId, orderId, customerId, status, dueDate, load{} |

### 2.2 Frontend notification mapper (my-app)

`notificationMapper.js` maps raw notification to UI item:

- **id**, **title**, **message**, **time** (relative), **priorityColor**, **actionType** (load | payment | info), **read**, **type**, **data**, **raw**.

Load types: `load_created`, `load_updated`, `load_status_update`, `load_status_changed`, `load_delivered`, `load_assigned`.  
Payment types: `payment_receivable_created`, `payment_payable_created`, `payment_receivable_status_update`, `payment_payable_status_update`, `payment_status_changed`, `payment_overdue`, `payment_due_today`, etc.

---

## 3. User access: who can do what and see what

### 3.1 Roles

- **admin**, **manager** – full access (admin-only: delete load, performance stats, clear cache).  
- **accountingManager**, **accountingIn**, **accountingOut** – payments and stats (scoped by section/type).  
- **freightBroker** – own loads (createdBy).  
- **dispatcher**, **Pre-dispatcher**, **bidAgent** – loads where `customer` in user’s **allowedCustomers**; Load response filtered by role (STEP5 / STEP1_4).  
- **salesAgent** – loads for **platform** customers only (from allowedCustomers).  
- **partner** – special “partner” flow only; no standard list.  
- **Others** – no access to loads/payments/stats.

### 3.2 Loads

| Role | List/read | Filter / scope | Create | Update | Update status | Delete | Payment fields in response |
|------|-----------|----------------|--------|--------|----------------|--------|----------------------------|
| admin | ✅ | All | ✅ | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | All | ✅ | ✅ | ✅ | ❌ | ✅ |
| accountingManager | ❌ | — | ❌ | ❌ | ❌ | ❌ | — |
| accountingIn/Out | ❌ | — | ❌ | ❌ | ❌ | ❌ | — |
| freightBroker | ✅ | createdBy = user | ✅ | ✅ | ✅ | ❌ | ❌ (stripped) |
| dispatcher | ✅ | customer ∈ allowedCustomers | ❌ | ✅ | ✅ | ❌ | ❌ (STEP5 view) |
| Pre-dispatcher | ✅ | customer ∈ allowedCustomers | ✅ | ✅ | ❌ | ❌ | ❌ (STEP1_4, no pickup/delivery images) |
| bidAgent | ✅ | customer ∈ allowedCustomers | ❌ | ✅ | ✅ | ❌ | ❌ |
| salesAgent | ✅ | customer ∈ platform ∩ allowedCustomers | ✅ | ✅ | ✅ | ❌ | ❌ |
| partner | Special (partnerOnly) | Limited format | ❌ | ❌ | ❌ | ❌ | ❌ |

**Load field visibility by role:**

- **dispatcher:** STEP5 only: carrier, carrierEmails, carrierRate, carrierPhotos, insurance, status, dates, paymentMethod, paymentTerms, bolDocuments, rateConfirmationDocuments, documents, fees, tonu, tracking, pickup.images, delivery.images.  
- **Pre-dispatcher:** STEP1_4 only: orderId, customer, customerEmails, customerRate, loadCustomerRepresentativePeoples, type, vehicle, freight, pickup (no images), delivery (no images), dates.assignedDate, dates.deadline.

### 3.3 Customers

| Role | List/read | Scope | Create/update/delete |
|------|-----------|--------|----------------------|
| admin, manager | ✅ | All | ✅ |
| accounting* | ❌ | — | ❌ |
| freightBroker, dispatcher, Pre-dispatcher, bidAgent | ✅ | customerId ∈ allowedCustomers | By route (often commented) |
| salesAgent | ✅ | customerId ∈ allowedCustomers, type platform | By route |
| partner | ❌ | — | ❌ |

### 3.4 Carriers

| Role | Access |
|------|--------|
| admin, manager | Full (all carriers). |
| accounting* | No. |
| freightBroker | Carrier if has load with createdBy=user or customer ∈ allowedCustomers. |
| dispatcher, Pre-dispatcher, bidAgent | Carrier if has load with customer ∈ allowedCustomers. |
| salesAgent | Carrier if has load with customer in platform ∩ allowedCustomers. |
| partner | No. |

### 3.5 Payments (PaymentReceivable / PaymentPayable)

| Role | Receivable | Payable | Notes |
|------|------------|---------|--------|
| admin | ✅ | ✅ | Full |
| manager | By stats only | By stats only | No direct payment CRUD in routes (commented). |
| accountingManager | ✅ | ✅ | Full |
| accountingIn | ✅ | ❌ | Receivable only |
| accountingOut | ❌ | ✅ | Payable only |
| freightBroker, dispatcher, Pre-dispatcher, bidAgent, salesAgent, partner | ❌ | ❌ | No payment routes; Load response has payment refs stripped (except PAYMENT_VIEW_ROLES). |

**Payment view roles (see paymentReceivable/paymentPayable in Load):** admin, accountingManager, accountingIn, accountingOut. All others get these fields stripped from Load.

### 3.6 Statistics (stats)

| Role | Sections | Entity scope | Payment types |
|------|----------|--------------|----------------|
| admin, manager | loads, payments, users | system, customer, carrier, user (all) | All |
| accountingManager | payments | system | All |
| accountingIn | payments | system | receivable only |
| accountingOut | payments | system | payable only |
| freightBroker, dispatcher, Pre-dispatcher, bidAgent | loads | customer (allowedCustomers) | — |
| salesAgent | loads | customer (platform from allowedCustomers) | — |
| partner | — | None | — |

### 3.7 Files (S3)

| Entity | admin | manager | Others |
|--------|--------|---------|--------|
| users/* | ✅ | ✅ | Own files only |
| loads/* | ✅ | ✅ | By checkLoadAccess (same as Load: admin/manager all; freightBroker own; dispatcher/bidAgent/salesAgent by customer; accounting/partner no). |
| customers/* | ✅ | ✅ | By checkCustomerAccess (allowedCustomers or platform). |
| carriers/* | ✅ | ✅ | By checkCarrierAccess (load relation + role). |
| payments-receivable/*, payments-payable/* | ✅ | — | accountingManager: both; accountingIn: receivable; accountingOut: payable. |

### 3.8 Load history

- **getAllLoadHistory:** checkRole(['admin', 'manager']) only.  
- **getLoadHistory (per load):** same as Load read access (hasLoadReadAccess).

### 3.9 Route-level roles (commented in code)

- Load: getAll, search, getByStatus, getByCarrier, getByCustomer, getById, duplicate, create, update, updateStatus – roles often commented; access enforced by **resolveAccessContext** + **getLoadFilter** / **hasLoadReadAccess** in controller.  
- Delete load: only admin.  
- Users: getAll, search, getByRole, getAllowedCustomers, getById, upload, update, updateStatus, removeFile, delete – checkRole(['admin']) commented.  
- Customers: getAll, search, getAllowedUsers, getById, getCustomerLoads, upload, update, removeFile, delete – checkRole commented.  
- Payments: get/create/upload/markAsReceived/delete – checkRole commented; payment access by role in filePermissions and stats (accounting*).  

Effective behavior is: **auth required**, then **data access** is determined by **role + allowedCustomers** and **filter/strip** in controllers and filePermissions/statsPermissions.

---

## 4. Quick reference: models and submodels

| Model | Submodels / embedded |
|-------|------------------------|
| Load | Address (pickup, delivery), Vehicle (VehicleShipment[]), Freight (FreightShipment[]), CarrierPeople[], RepresentativePeople[] |
| Customer | Address (customerAddress), RepresentativePeople[] |
| Carrier | Address, CarrierPeople[] |
| User | — |
| PaymentReceivable | fees[], tonu{} |
| PaymentPayable | fees[], tonu{} |
| LoadHistory | actor{}, changes[] |
| UserHistory | actor{}, changes[] |
| StatsSnapshot | loads{}, loadsState{}, loadsEvents{}, receivable{}, payable{}, finance{} |
| StatsDailyDelta | loadsStateDelta, loadsEventsDelta (Count/Event schemas) |
| StatsDirty | sources[], lock{}, error{} |
| ResetCode, LoadPayment, Review | — |

---

## 5. Логика и CRUD по моделям

### 5.1 Load

- **Где используется**
  - `LoadController` — основной CRUD и поиск.
  - `loadService` — транзакционные операции, аудит, уведомления.
  - `StatsWorker`, `StatsSnapshot/StatsDailyDelta/StatsDirty` — статистика.
  - `PaymentController` — создание платежей при Delivered.
  - `documentsController`, `s3Service`, `filePermissions` — работа с файлами.
- **CRUD**
  - **Create:** маршруты в `loadRoutes` (`POST /loads`, плюс варианты с загрузкой файлов). Логика:
    - валидация (`loadValidation`),
    - нормализация дат (`dateUtils`, `dateNormalization`),
    - очистка `undefined/null` полей в `pre('save')`,
    - заполнение `createdBy`,
    - создание записи в `LoadHistory` через `loadService`,
    - отправка уведомления `load_created`.
  - **Read (list/search/detail):**
    - `GET /loads`, `GET /loads/search`, `GET /loads/byStatus`, `GET /loads/byCarrier`, `GET /loads/byCustomer`, `GET /loads/:id`.
    - Фильтрация по роли и `allowedCustomers` через `resolveAccessContext` и `getLoadFilter`.
    - Для `partner` отдаётся урезанный формат (`formatPartnerLoad`).
    - Для неучётных ролей убираются поля платежей (`maybeStripPaymentFields`).
  - **Update:**
    - `PUT/PATCH /loads/:id` — через `loadService.updateLoad`.
    - Патч ограничен `ALLOWED_UPDATE_FIELDS` (без возможности менять технические поля).
    - Считается diff (`diffChanges`), записывается `LoadHistory` с типом действия (`detectAction`), при изменении статуса дергается `NotificationService` (status/update/delivered + платежи).
  - **Update status:**
    - `PATCH /loads/:id/status` — доступен только ролям из `canUpdateStatus`.
    - При переводе в `Delivered` создаются `PaymentReceivable` и `PaymentPayable`, помечается статистика как "грязная" (`markDirty`).
  - **Delete:**
    - Только `admin` (`delete` в `LoadController` + проверка `ADMIN_ROLES` и `hasLoadReadAccess`).
    - Запись в `LoadHistory` с действием `delete`.

### 5.2 Customer

- **Где используется**
  - `CustomerController` — CRUD + связи с пользователями и лидами.
  - `loadController`, `filePermissions`, `statsPermissions`, статистические скрипты.
- **CRUD**
  - **Create/Update:**
    - маршруты в `customerRoutes` (создание/обновление + загрузка файлов через `uploadSeparateFiles('customers', ...)`).
    - нормализация email, очистка `undefined/null` полей в `pre('save')`,
    - фильтрация массива `representativePeoples` (должен быть `fullName`).
  - **Read:**
    - список, поиск, детальная карточка, загрузки по customer (`getCustomerLoads`),
    - доступ ограничен ролями и `allowedCustomers` (для брокеров/диспетчеров/агентов).
  - **Delete:**
    - только админские роли (фактически — через роуты с закомментированным `checkRole`, но по смыслу — admin/manager).

### 5.3 Carrier

- **Где используется**
  - `CarrierController`, `carrierService` — CRUD и бизнес-логика по перевозчикам.
  - `Load` (поле `carrier`), `PaymentPayable`, `filePermissions`, статистика.
- **CRUD**
  - **Create/Update:**
    - маршруты в `carrierRoutes`, загрузка файлов через `uploadMiddleware` (через `s3Service`).
    - в `pre('save')` очищаются пустые значения, фильтруется массив `people`.
  - **Read:**
    - список, поиск, деталь, фильтрация по `equipmentType`, `status`, индексам `mcNumber/dotNumber/email`.
    - доступ через `checkCarrierAccess` (по ролям и наличию связанных Loads).
  - **Delete:**
    - только для админских ролей (по аналогии с Customers/Loads).

### 5.4 User

- **Где используется**
  - `AuthController` — регистрация, логин, смена пароля (через `ResetCode`), токены.
  - `UserController` — админский CRUD по пользователям и их `allowedCustomers`.
  - `userAuditService`, `UserHistory` — аудит изменений.
- **CRUD**
  - **Create:**
    - регистрация (публичный/ограниченный эндпоинт),
    - админское создание пользователя (`UserController`).
  - **Read:**
    - список пользователей, поиск, фильтр по роли, просмотр `allowedCustomers`.
    - только для admin (по роутам `userRoutes` с `checkRole(['admin'])`).
  - **Update:**
    - изменение профиля и пароля самим пользователем (ограниченный набор полей),
    - админ обновляет роль, статус, `allowedCustomers`.
    - каждая значимая операция пишет запись в `UserHistory`.
  - **Delete:**
    - только админ.

### 5.5 PaymentReceivable / PaymentPayable

- **Где используется**
  - `PaymentController` — ручной CRUD и спец‑операции (markAsReceived, и т.п.).
  - `LoadController` / `loadService` — авто‑создание при Delivered.
  - `paymentNotificationsCron` — периодические проверки и рассылка уведомлений (overdue/dueToday).
  - `StatsWorker` — учёт сумм и статусов в статистике.
- **CRUD**
  - **Auto-create:**
    - при смене статуса Load на `Delivered` (`sendLoadDelivered` + логика в `PaymentController`/`loadService`).
  - **Manual create/update:**
    - роуты в `paymentRoutes` (создание, изменение, загрузка файлов `payments-receivable` / `payments-payable`).
    - логика нормализации сумм и дедлайнов в `pre('save')` (`normalizeAmount`, `calculate*ConfirmedAmount`, пересчёт `dueAt`, `nextNotifyAt`).
  - **Status updates:**
    - переходы `pending → invoiced → received/paid`/`withheld`/`canceled`/`on Hold`/`pay today`,
    - пересчёт `confirmedAmount`, `statusSince`, `holdStartedAt`, финальных дат (`receivedAt`/`paidAt`),
    - вызовы `NotificationService` (`payment_*_status_update`, `payment_overdue`, `payment_due_today`).
  - **Delete:**
    - админские маршруты для удаления платежей (используются редко, больше для исправления миграций).

### 5.6 ResetCode

- **Где используется**
  - `AuthController` — генерация и проверка кодов сброса пароля.
- **CRUD**
  - **Create:** при запросе восстановления пароля создаётся код с `expiresAt`, `attempts = 0`.
  - **Read/Update:** при вводе кода проверяется email+code, увеличиваются `attempts`, при превышении лимита ставится `blocked`.
  - **Delete/cleanup:** устаревшие записи могут чиститься скриптами/cron (или оставаться как лог).

### 5.7 LoadHistory / UserHistory

- **Где используется**
  - `LoadController` + `loadService` — журнал действий по Load.
  - `userAuditService`, `AuditController` — журнал действий по User.
- **CRUD**
  - **Create:** только сервисный код, напрямую из контроллеров/сервисов при любом значимом изменении.
  - **Read:**
    - `GET /loads/history` (все) — только admin/manager,
    - `GET /loads/:id/history` — по тем же правилам доступа, что и сам Load.
  - **Update/Delete:** не используются; записи считаются неизменяемым аудит‑логом.

### 5.8 StatsSnapshot / StatsDailyDelta / StatsDirty

- **Где используется**
  - `statsWorker`, `statsWorkerCron`, `payment/loads` скрипты — пересчёт статистики.
  - `StatsController` — выдача аггрегированной статистики на фронт с учётом `statsPermissions`.
- **CRUD**
  - **StatsDirty:**
    - создаётся/обновляется при изменениях в Loads/Payments (`markDirty`),
    - воркер помечает записи как `locked`, увеличивает `attempts`, записывает ошибки при падениях.
  - **StatsDailyDelta:**
    - создаётся воркером как дневной дельта‑слой по событиям и состояниям.
  - **StatsSnapshot:**
    - создаётся/обновляется воркером для разных `grain` (day/week/month/year) и `entityType` (system/customer/carrier/user).
  - **Read:** только через `StatsController` и вспомогательные скрипты (проверка качества).

### 5.9 LoadPayment

- **Где используется**
  - `PaymentController` и связанные участки кода для отдельных фактических платежей (фиксирование факта оплаты сверх статуса PaymentReceivable/Payable).
- **CRUD**
  - **Create:** при фиксации отдельного факта оплаты (carrier/customer, сумма, дата, note).
  - **Read:** для отчётности и детальной истории по Load.
  - **Update/Delete:** используются редко, в основном для поправки ошибок через служебные роуты/скрипты.

### 5.10 Review

- **Где используется**
  - Поддержка отзывов (product/user); в текущем коде присутствует только модель и базовый контроллер `ReviewController`.
- **CRUD**
  - **Create:** пользователь оставляет отзыв по продукту.
  - **Read:** получение списка/среднего рейтинга по продукту.
  - **Update/Delete:** по бизнес‑логике могут быть доступны только автору отзыва или админам (проверка прав в `ReviewController`).

