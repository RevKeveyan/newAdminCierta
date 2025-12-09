# Payment API Documentation

## Overview

The Payment API has been simplified to focus on essential fields:

- **PaymentPayable** - Bank details for carrier payments (Bank, Routing, Account Number)
- **PaymentReceivable** - Invoice tracking for customer payments (Invoiced Date, Days to Pay, Invoice Status)

Both payment records are automatically created when a Load status changes to "Delivered".

---

## PaymentPayable (Carrier Payments)

### Model Structure

```typescript
interface PaymentPayable {
  id: string;
  loadId: string;
  carrier: {
    id: string;
    name: string;
    companyName: string;
    email: string;
    phoneNumber: string;
    mcNumber: string;
    dotNumber: string;
  };
  bank: string | null;           // Bank name
  routing: string | null;        // Routing number
  accountNumber: string | null; // Account number
  createdAt: string;
  updatedAt: string;
}
```

### API Endpoints

#### 1. Get All Payables

```
GET /payments/payable?page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "loadId": "507f1f77bcf86cd799439012",
      "carrier": {
        "id": "507f1f77bcf86cd799439013",
        "name": "John Carrier",
        "companyName": "Carrier Inc",
        "email": "carrier@example.com",
        "phoneNumber": "+1234567890",
        "mcNumber": "MC123456",
        "dotNumber": "DOT123456"
      },
      "bank": "First National Bank",
      "routing": "123456789",
      "accountNumber": "987654321",
      "createdAt": "2024-12-09T10:30:00.000Z",
      "updatedAt": "2024-12-09T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "totalPages": 10,
    "currentPage": 1,
    "limit": 10
  }
}
```

#### 2. Get Payable by ID

```
GET /payments/payable/:id
```

#### 3. Get Payables by Carrier

```
GET /payments/payable/carrier/:carrierId?page=1&limit=10
```

#### 4. Get Payable by Load

```
GET /payments/payable/load/:loadId
```

#### 5. Create Payable

```
POST /payments/payable
Content-Type: application/json
```

**Request Body:**
```json
{
  "loadId": "507f1f77bcf86cd799439012",
  "carrier": "507f1f77bcf86cd799439013",
  "bank": "First National Bank",
  "routing": "123456789",
  "accountNumber": "987654321"
}
```

**Note:** Usually created automatically when Load status changes to "Delivered".

#### 6. Update Payable (Bank Details)

```
PUT /payments/payable/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "bank": "Updated Bank Name",
  "routing": "987654321",
  "accountNumber": "123456789"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "bank": "Updated Bank Name",
    "routing": "987654321",
    "accountNumber": "123456789",
    ...
  },
  "message": "PaymentPayable updated successfully"
}
```

#### 7. Delete Payable

```
DELETE /payments/payable/:id
```

---

## PaymentReceivable (Customer Payments)

### Model Structure

```typescript
interface PaymentReceivable {
  id: string;
  loadId: string;
  customer: {
    id: string;
    companyName: string;
    emails: string[];
    phoneNumber: string;
    paymentMethod: string;
  };
  invoicedDate: string | null;    // Set automatically when status changes to "received"
  daysToPay: number;              // 1-90, default: 30
  invoiceStatus: "pending" | "invoiced" | "received" | "overdue" | "cancelled";
  createdAt: string;
  updatedAt: string;
}
```

### Invoice Status Values

- `pending` - Initial status when created
- `invoiced` - Invoice has been sent
- `received` - Payment received (invoicedDate is automatically set)
- `overdue` - Payment is overdue
- `cancelled` - Invoice cancelled

### API Endpoints

#### 1. Get All Receivables

```
GET /payments/receivable?page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439021",
      "loadId": "507f1f77bcf86cd799439012",
      "customer": {
        "id": "507f1f77bcf86cd799439022",
        "companyName": "Customer Inc",
        "emails": ["customer@example.com"],
        "phoneNumber": "+1234567890",
        "paymentMethod": "Net 30"
      },
      "invoicedDate": null,
      "daysToPay": 30,
      "invoiceStatus": "pending",
      "createdAt": "2024-12-09T10:30:00.000Z",
      "updatedAt": "2024-12-09T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "totalPages": 10,
    "currentPage": 1,
    "limit": 10
  }
}
```

#### 2. Get Receivable by ID

```
GET /payments/receivable/:id
```

#### 3. Get Receivables by Status

```
GET /payments/receivable/status/:status?page=1&limit=10
```

**Status values:** `pending`, `invoiced`, `received`, `overdue`, `cancelled`

#### 4. Get Receivables by Customer

```
GET /payments/receivable/customer/:customerId?page=1&limit=10
```

#### 5. Get Receivable by Load

```
GET /payments/receivable/load/:loadId
```

#### 6. Create Receivable

```
POST /payments/receivable
Content-Type: application/json
```

**Request Body:**
```json
{
  "loadId": "507f1f77bcf86cd799439012",
  "customer": "507f1f77bcf86cd799439022",
  "daysToPay": 30
}
```

**Note:** Usually created automatically when Load status changes to "Delivered".

#### 7. Update Receivable

```
PUT /payments/receivable/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "invoiceStatus": "invoiced",
  "daysToPay": 45,
  "invoicedDate": "2024-12-09T10:30:00.000Z"
}
```

**Note:** When `invoiceStatus` is set to `"received"`, `invoicedDate` is automatically set to current date.

#### 8. Mark as Received

```
PUT /payments/receivable/:id/received
```

This endpoint automatically:
- Sets `invoiceStatus` to `"received"`
- Sets `invoicedDate` to current date

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439021",
    "invoiceStatus": "received",
    "invoicedDate": "2024-12-09T15:30:00.000Z",
    ...
  },
  "message": "Payment marked as received"
}
```

#### 9. Delete Receivable

```
DELETE /payments/receivable/:id
```

---

## Frontend Implementation Examples

### React: PaymentPayable Form

```jsx
import { useState, useEffect } from 'react';

function PaymentPayableForm({ payableId, onSuccess }) {
  const [formData, setFormData] = useState({
    bank: '',
    routing: '',
    accountNumber: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (payableId) {
      fetchPayable();
    }
  }, [payableId]);

  const fetchPayable = async () => {
    try {
      const response = await fetch(`/payments/payable/${payableId}`);
      const result = await response.json();
      if (result.success) {
        setFormData({
          bank: result.data.bank || '',
          routing: result.data.routing || '',
          accountNumber: result.data.accountNumber || ''
        });
      }
    } catch (error) {
      console.error('Error fetching payable:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/payments/payable/${payableId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Bank details updated successfully!');
        onSuccess?.(result.data);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating payable:', error);
      alert('Failed to update bank details');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Bank Name *</label>
        <input
          type="text"
          value={formData.bank}
          onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Routing Number *</label>
        <input
          type="text"
          value={formData.routing}
          onChange={(e) => setFormData({ ...formData, routing: e.target.value })}
          required
          pattern="[0-9]{9}"
          maxLength={9}
        />
      </div>

      <div>
        <label>Account Number *</label>
        <input
          type="text"
          value={formData.accountNumber}
          onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
          required
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save Bank Details'}
      </button>
    </form>
  );
}

export default PaymentPayableForm;
```

### React: PaymentReceivable Form

```jsx
import { useState, useEffect } from 'react';

function PaymentReceivableForm({ receivableId, onSuccess }) {
  const [formData, setFormData] = useState({
    invoiceStatus: 'pending',
    daysToPay: 30
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (receivableId) {
      fetchReceivable();
    }
  }, [receivableId]);

  const fetchReceivable = async () => {
    try {
      const response = await fetch(`/payments/receivable/${receivableId}`);
      const result = await response.json();
      if (result.success) {
        setFormData({
          invoiceStatus: result.data.invoiceStatus || 'pending',
          daysToPay: result.data.daysToPay || 30
        });
      }
    } catch (error) {
      console.error('Error fetching receivable:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/payments/receivable/${receivableId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Receivable updated successfully!');
        onSuccess?.(result.data);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating receivable:', error);
      alert('Failed to update receivable');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsReceived = async () => {
    if (!confirm('Mark this payment as received?')) return;

    setLoading(true);
    try {
      const response = await fetch(`/payments/receivable/${receivableId}/received`, {
        method: 'PUT'
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Payment marked as received!');
        onSuccess?.(result.data);
        fetchReceivable(); // Refresh data
      }
    } catch (error) {
      console.error('Error marking as received:', error);
      alert('Failed to mark as received');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Invoice Status *</label>
        <select
          value={formData.invoiceStatus}
          onChange={(e) => setFormData({ ...formData, invoiceStatus: e.target.value })}
          required
        >
          <option value="pending">Pending</option>
          <option value="invoiced">Invoiced</option>
          <option value="received">Received</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div>
        <label>Days to Pay (1-90) *</label>
        <input
          type="number"
          min="1"
          max="90"
          value={formData.daysToPay}
          onChange={(e) => setFormData({ ...formData, daysToPay: parseInt(e.target.value) })}
          required
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Update Receivable'}
      </button>

      <button 
        type="button" 
        onClick={handleMarkAsReceived}
        disabled={loading || formData.invoiceStatus === 'received'}
        style={{ marginLeft: '10px' }}
      >
        Mark as Received
      </button>
    </form>
  );
}

export default PaymentReceivableForm;
```

### JavaScript: Fetch Examples

```javascript
// Get all payables
async function getPayables(page = 1, limit = 10) {
  const response = await fetch(`/payments/payable?page=${page}&limit=${limit}`);
  return response.json();
}

// Get payable by load
async function getPayableByLoad(loadId) {
  const response = await fetch(`/payments/payable/load/${loadId}`);
  return response.json();
}

// Update payable bank details
async function updatePayableBankDetails(payableId, bankDetails) {
  const response = await fetch(`/payments/payable/${payableId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bank: bankDetails.bank,
      routing: bankDetails.routing,
      accountNumber: bankDetails.accountNumber
    })
  });
  return response.json();
}

// Get all receivables
async function getReceivables(page = 1, limit = 10) {
  const response = await fetch(`/payments/receivable?page=${page}&limit=${limit}`);
  return response.json();
}

// Get receivables by status
async function getReceivablesByStatus(status, page = 1, limit = 10) {
  const response = await fetch(`/payments/receivable/status/${status}?page=${page}&limit=${limit}`);
  return response.json();
}

// Update receivable
async function updateReceivable(receivableId, data) {
  const response = await fetch(`/payments/receivable/${receivableId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      invoiceStatus: data.invoiceStatus,
      daysToPay: data.daysToPay
    })
  });
  return response.json();
}

// Mark receivable as received
async function markReceivableAsReceived(receivableId) {
  const response = await fetch(`/payments/receivable/${receivableId}/received`, {
    method: 'PUT'
  });
  return response.json();
}
```

---

## Automatic Creation

Both `PaymentPayable` and `PaymentReceivable` are automatically created when a Load's status changes to `"Delivered"`:

- **PaymentPayable** is created if the Load has a `carrier`
- **PaymentReceivable** is created if the Load has a `customer`

Bank details for PaymentPayable are automatically copied from the Carrier model.

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## Notes

1. **Invoiced Date**: Automatically set when `invoiceStatus` changes to `"received"` (either via update or the `/received` endpoint)

2. **Days to Pay**: Must be between 1 and 90, default is 30

3. **Bank Details**: All three fields (bank, routing, accountNumber) are optional but typically all should be provided

4. **Automatic Creation**: Payments are created automatically - manual creation is usually not needed

5. **Status Values**: Use exact enum values for `invoiceStatus` - any other value will be rejected
