# Notification Service Integration Guide

## Overview

The Cierta Admin API is integrated with an external notification service that runs on port 5001. This service handles sending notifications to users when important events occur in the system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Cierta Admin API (Port 5000)                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         LoadController / Other Controllers         │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                        │
│                     ▼                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         NotificationService (Client)                │   │
│  │  - sendNotification()                                │   │
│  │  - sendLoadStatusUpdate()                            │   │
│  │  - sendLoadCreated()                                  │   │
│  │  - sendLoadAssigned()                                 │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                        │
│                     │ HTTP POST                             │
└─────────────────────┼───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         Notification Service (Port 5001)                   │
│                                                             │
│  POST /notifications                                    │
│  POST /notifications/bulk                                │
│  GET  /health                                                │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Notification Service Configuration
NOTIFICATION_SERVICE_URL=http://localhost:5001
NOTIFICATION_SERVICE_TIMEOUT=5000
NOTIFICATION_SERVICE_ENABLED=true
```

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NOTIFICATION_SERVICE_URL` | Base URL of notification service | `http://localhost:5001` | No |
| `NOTIFICATION_SERVICE_TIMEOUT` | Request timeout in milliseconds | `5000` | No |
| `NOTIFICATION_SERVICE_ENABLED` | Enable/disable notification service | `true` | No |

### Installation

The notification service integration requires `axios`:

```bash
npm install axios
```

## Integration Points

### 1. Load Created

**Trigger**: When a new load is created via `POST /loads`

**Notification Type**: `load_created`

**Recipients**:
- Customer emails (from `customerEmails` field)
- Carrier emails (from `carrierEmails` field)

**Implementation**:
```javascript
// In LoadController.create()
notificationService.sendLoadCreated(populatedLoad, createdBy)
  .catch(error => {
    console.error('Failed to send notification:', error);
  });
```

### 2. Load Status Update

**Trigger**: When load status changes via:
- `PUT /loads/:id/status`
- `PUT /loads/:id` (when status field changes)
- `PUT /loads/:id/full` (when status field changes)

**Notification Type**: `load_status_update`

**Recipients**:
- Customer emails
- Carrier emails
- User who created the load

**Priority**: Based on status:
- `Delivered` → `urgent`
- `Picked up` → `high`
- `Cancelled` → `high`
- `Dispatched` → `normal`
- `On Hold` → `normal`
- `Listed` → `low`

**Implementation**:
```javascript
// In LoadController.updateStatus() and updateLoad()
if (status !== oldDoc.status) {
  notificationService.sendLoadStatusUpdate(updated, oldDoc.status, status, req.user?.id)
    .catch(error => {
      console.error('Failed to send notification:', error);
    });
}
```

### 3. Load Assigned

**Trigger**: When a carrier is assigned to a load via:
- `PUT /loads/:id` (when carrier field changes)
- `PUT /loads/:id/full` (when carrier field changes)

**Notification Type**: `load_assigned`

**Recipients**:
- Carrier emails
- Carrier user ID

**Priority**: `high`

**Implementation**:
```javascript
// In LoadController.update() and updateLoad()
if (carrierId && carrierId.toString() !== oldDoc.carrier?.toString()) {
  notificationService.sendLoadAssigned(updated, carrierId, req.user?.id)
    .catch(error => {
      console.error('Failed to send notification:', error);
    });
}
```

## Notification Service API

### Notification Payload Format

```json
{
  "type": "load_status_update",
  "title": "Load Status Updated: 1234567890",
  "message": "Load status changed from \"Listed\" to \"Dispatched\"",
  "recipients": ["user@example.com", "507f1f77bcf86cd799439011"],
  "data": {
    "loadId": "507f1f77bcf86cd799439011",
    "orderId": "1234567890",
    "oldStatus": "Listed",
    "newStatus": "Dispatched",
    "updatedBy": "507f1f77bcf86cd799439012",
    "load": {
      "id": "507f1f77bcf86cd799439011",
      "orderId": "1234567890",
      "status": "Dispatched",
      "customer": "507f1f77bcf86cd799439013",
      "carrier": "507f1f77bcf86cd799439014"
    }
  },
  "priority": "normal"
}
```

### Endpoints

#### POST /notifications

Send a single notification.

**Request Body**:
```json
{
  "type": "string",
  "title": "string",
  "message": "string",
  "recipients": ["string"],
  "data": {},
  "priority": "low|normal|high|urgent"
}
```

#### POST /notifications/bulk

Send notifications to multiple recipients.

**Request Body**:
```json
{
  "type": "string",
  "title": "string",
  "message": "string",
  "recipients": ["string"],
  "data": {},
  "priority": "low|normal|high|urgent"
}
```

#### GET /health

Health check endpoint.

**Response**:
```json
{
  "status": "ok"
}
```

## Error Handling

The notification service is designed to be **non-blocking**. If the notification service is unavailable or returns an error:

1. **The main request continues normally** - The API response is not affected
2. **Errors are logged** - Check server logs for notification failures
3. **No exception is thrown** - The application continues to function

### Error Logging

Notification errors are logged with the prefix `[NotificationService]`:

```
[NotificationService] Failed to send notification: connect ECONNREFUSED 127.0.0.1:5001
```

## Service Availability

### Health Check

The notification service includes a health check method:

```javascript
const notificationService = require('../services/notificationService');

const isAvailable = await notificationService.checkHealth();
if (isAvailable) {
  console.log('Notification service is available');
} else {
  console.log('Notification service is unavailable');
}
```

### Disabling Notifications

To disable notifications without removing code:

```env
NOTIFICATION_SERVICE_ENABLED=false
```

When disabled, notification calls are skipped and logged:

```
[NotificationService] Service is disabled, skipping notification
```

## Testing

### Manual Testing

1. **Start the notification service** on port 5001
2. **Create a load** via `POST /loads`
3. **Check notification service logs** for incoming requests
4. **Update load status** via `PUT /loads/:id/status`
5. **Verify notifications** are sent

### Testing with Notification Service Down

1. **Stop the notification service**
2. **Perform operations** (create load, update status)
3. **Verify API responses** are still successful
4. **Check logs** for error messages (should not crash)

## Notification Types

| Type | Description | Trigger |
|------|-------------|---------|
| `load_created` | New load created | Load creation |
| `load_status_update` | Load status changed | Status update |
| `load_assigned` | Load assigned to carrier | Carrier assignment |

## Recipients

Recipients can be:
- **Email addresses**: `"user@example.com"`
- **User IDs**: `"507f1f77bcf86cd799439011"`

The service automatically:
- Removes duplicates
- Handles both email and ID formats
- Sends to all specified recipients

## Priority Levels

| Priority | Description | Use Cases |
|----------|-------------|-----------|
| `low` | Low priority | Listed status, informational |
| `normal` | Normal priority | Standard updates |
| `high` | High priority | Status changes, assignments |
| `urgent` | Urgent priority | Delivered, critical updates |

## Best Practices

1. **Always use non-blocking calls** - Don't await notification calls
2. **Handle errors gracefully** - Log but don't throw
3. **Populate related data** - Ensure load data is populated before sending
4. **Test with service down** - Verify graceful degradation
5. **Monitor logs** - Watch for notification failures
6. **Use appropriate priorities** - Match priority to importance

## Troubleshooting

### Notifications Not Sending

1. **Check service is running**: `curl http://localhost:5001/health`
2. **Verify environment variables**: Check `.env` file
3. **Check service is enabled**: `NOTIFICATION_SERVICE_ENABLED=true`
4. **Review logs**: Look for `[NotificationService]` messages
5. **Test connectivity**: Check network/firewall settings

### Service Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5001
```

**Solutions**:
- Ensure notification service is running
- Check `NOTIFICATION_SERVICE_URL` is correct
- Verify port 5001 is not blocked
- Check firewall settings

### Timeout Errors

```
Error: timeout of 5000ms exceeded
```

**Solutions**:
- Increase `NOTIFICATION_SERVICE_TIMEOUT`
- Check notification service performance
- Verify service is not overloaded

## Future Enhancements

Potential improvements:
- Retry mechanism for failed notifications
- Notification queue for offline scenarios
- Webhook support for custom integrations
- Notification preferences per user
- Batch notification optimization
- Notification delivery status tracking

---

**Last Updated**: 2024
**Service Version**: 1.0.0


