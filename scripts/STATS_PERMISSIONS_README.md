# Statistics Permissions (RBAC) - getStatsScope

## Описание

Функция `getStatsScope(user)` определяет scope доступа пользователя к статистике на основе его роли.

## Расположение

`server/utils/statsPermissions.js`

## Использование

```javascript
const { getStatsScope, hasStatsEntityAccess, hasStatsSectionAccess, hasPaymentTypeAccess } = require('../utils/statsPermissions');

const scope = await getStatsScope(req.user);

if (scope.allowedSections.includes('loads')) {
  // Пользователь имеет доступ к статистике loads
}

if (await hasStatsEntityAccess(req.user, 'customer', customerId)) {
  // Пользователь имеет доступ к статистике конкретного customer
}
```

## Возвращаемый объект

```javascript
{
  allowedEntityTypes: ['system' | 'customer' | 'carrier' | 'user'],
  allowedEntityIds: {
    customer: ['id1', 'id2', ...],  // Только для customer/carrier/user
    carrier: [...],
    user: [...]
  },
  allowedSections: ['loads' | 'payments' | 'users'],
  paymentTypes: ['receivable' | 'payable'] | null  // null = все типы
}
```

## Логика по ролям

### admin / manager
- **allowedEntityTypes**: `['system', 'customer', 'carrier', 'user']`
- **allowedEntityIds**: `{}` (все разрешены)
- **allowedSections**: `['loads', 'payments', 'users']`
- **paymentTypes**: `null` (все типы)

### accountingManager
- **allowedEntityTypes**: `['system']`
- **allowedEntityIds**: `{}`
- **allowedSections**: `['payments']`
- **paymentTypes**: `null` (все типы payments)

### accountingIn
- **allowedEntityTypes**: `['system']`
- **allowedEntityIds**: `{}`
- **allowedSections**: `['payments']`
- **paymentTypes**: `['receivable']` (только receivable)

### accountingOut
- **allowedEntityTypes**: `['system']`
- **allowedEntityIds**: `{}`
- **allowedSections**: `['payments']`
- **paymentTypes**: `['payable']` (только payable)

### freightBroker / dispatcher / Pre-dispatcher / bidAgent
- **allowedEntityTypes**: `['customer']`
- **allowedEntityIds**: `{ customer: [allowedCustomers IDs] }`
- **allowedSections**: `['loads']`
- **paymentTypes**: `null`
- **Ограничения**: 
  - Только customers из `allowedCustomers`
  - Нет доступа к system
  - Нет доступа к payments
  - Нет доступа к users stats

### salesAgent
- **allowedEntityTypes**: `['customer']`
- **allowedEntityIds**: `{ customer: [platform customers IDs] }`
- **allowedSections**: `['loads']`
- **paymentTypes**: `null`
- **Ограничения**:
  - Только customers из `allowedCustomers` с `type: 'platform'`
  - Нет доступа к system
  - Нет доступа к payments
  - Нет доступа к users stats
- **Особенность**: Фильтрует customers по `type: 'platform'` в момент запроса

### partner
- **allowedEntityTypes**: `[]`
- **allowedEntityIds**: `{}`
- **allowedSections**: `[]`
- **paymentTypes**: `null`
- **Ограничения**: Полный запрет на статистику

## Вспомогательные функции

### hasStatsEntityAccess(user, entityType, entityId)
Проверяет доступ к конкретной сущности статистики.

```javascript
const hasAccess = await hasStatsEntityAccess(req.user, 'customer', customerId);
```

### hasStatsSectionAccess(user, section)
Проверяет доступ к разделу статистики.

```javascript
const canViewLoads = await hasStatsSectionAccess(req.user, 'loads');
```

### hasPaymentTypeAccess(user, paymentType)
Проверяет доступ к типу платежей.

```javascript
const canViewReceivable = await hasPaymentTypeAccess(req.user, 'receivable');
```

## Примеры использования в API

```javascript
const { getStatsScope, hasStatsEntityAccess } = require('../utils/statsPermissions');

router.get('/stats/snapshot', async (req, res) => {
  const scope = await getStatsScope(req.user);
  
  if (!scope.allowedSections.includes('loads')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const { entityType, entityId } = req.query;
  
  if (!scope.allowedEntityTypes.includes(entityType)) {
    return res.status(403).json({ error: 'Invalid entity type' });
  }
  
  if (entityType !== 'system' && !await hasStatsEntityAccess(req.user, entityType, entityId)) {
    return res.status(403).json({ error: 'Access denied to this entity' });
  }
  
  // Получить статистику
});
```

## Важные замечания

1. **Асинхронность**: Все функции асинхронные, так как для `salesAgent` требуется запрос к базе данных для фильтрации platform customers.

2. **Кэширование**: Для оптимизации можно кэшировать результаты `getStatsScope` на уровне запроса (например, в `req.statsScope`).

3. **ObjectId**: Функция корректно обрабатывает ObjectId для запросов к базе данных.

4. **Пустые allowedCustomers**: Если у пользователя нет `allowedCustomers`, возвращается пустой scope (кроме admin/manager).

5. **Неизвестные роли**: Возвращается пустой scope (все запрещено).
