# Statistics for Non-Admin / Non-Manager Users — Analysis

## 1. Who Has Access

| Role | Sections | Entity scope | Notes |
|------|----------|--------------|--------|
| **admin** / **manager** | loads, payments, users | system, customer, carrier, user (all) | Full access. Uses pre-computed StatsSnapshot (worker). |
| **accountingManager** | payments only | system | Payments stats only. |
| **accountingIn** | payments only | system | Receivable only. |
| **accountingOut** | payments only | system | Payable only. |
| **freightBroker**, **dispatcher**, **Pre-dispatcher**, **bidAgent** | loads only | customer (list from `user.allowedCustomers`) | See only loads for their allowed customers. |
| **salesAgent** | loads only | customer (only **platform** customers from `allowedCustomers`) | Subset of allowed customers. |
| **partner** | none | — | No statistics access. |

- Access is enforced in `server/utils/statsPermissions.js` via `getStatsScope(user)` and used in `StatsController` (e.g. `getLoadsStats` checks `scope.allowedSections`, `scope.allowedEntityTypes`, and `hasStatsEntityAccess` for entityId/email).

---

## 2. How Data Is Loaded (Loads Stats)

- **Admin/Manager (and single-entity requests)**  
  - Use **StatsSnapshot** from DB (filled by stats worker from `StatsDirty`).  
  - Worker uses `computeSnapshot(rangeStart, rangeEnd, entityType, entityId)` with:
    - `createdAt` in `[rangeStart, rangeEnd)`
    - `customer` / `carrier` / `createdBy` when entityType is customer/carrier/user.
  - So: “loads created in period” with current status breakdown (and delivered/pickedUp by deliveryAt/pickupAt in the current implementation).

- **Non-admin with multiple customers (freightBroker, dispatcher, salesAgent)**  
  - Do **not** use StatsSnapshot.  
  - When request is “global” and scope has `allowedEntityTypes: ['customer']` and `allowedEntityIds.customer = [id1, id2, ...]`, backend uses **customerIdsForAggregate**.  
  - Data is computed **on the fly** with:
    - `statsWorker.computeSnapshotForCustomerIds(rangeStart, rangeEnd, customerIds)`
    - or `statsWorker.computeSnapshotsForCustomerIdsBatch(dateKeys, rangeStart, rangeEnd, customerIds)` for day grain over a range.  
  - Filter: `customer: { $in: customerIds }` (only their allowed customers).  
  - So: **always live data**, no worker/cache; same date logic as in `computeSnapshot` (deliveryAt, pickupAt, createdAt in range).

---

## 3. Scope Resolution (Backend)

- In `StatsController.getLoadsStats`:
  - Query: `entityType` (from query or default `system`), `entityId`, optional `email`.
  - `scopeType` = `queryEntityType === 'system' ? 'global' : queryEntityType`.
  - `resolveStatsScopeForRequest(scope, scopeType, scopeId)`:
    - If scope is **global** and user has **customer** scope with a list of IDs → returns `entityType: 'customer'`, `entityId: null`, **customerIdsForAggregate: customerIds**.
    - Otherwise returns single `entityType` / `entityId` (and no customerIdsForAggregate).
- So for non-admin with customers:
  - “Global” view → aggregate over **all** allowed customers.
  - If frontend sent a specific customer (scopeType=customer, scopeId=id), backend checks `hasStatsEntityAccess` so they only see that customer if it’s in `allowedEntityIds.customer`.

---

## 4. Frontend (Statistic Page)

- `buildStatsSnapshotParams()` (or equivalent) builds `scopeType` and `scopeId` from filters.
- For non-admin, the UI typically does **not** show “system” or “all”; they see only their scope (e.g. aggregate of their customers for Load tab).
- Request is still sent as `scopeType: 'global'` when they don’t pick a concrete customer; backend then uses `customerIdsForAggregate` so they see only their customers.

---

## 5. Differences vs Admin/Manager

| Aspect | Admin/Manager | Non-admin (e.g. freightBroker, salesAgent) |
|--------|----------------|--------------------------------------------|
| Data source | StatsSnapshot (worker) | Live aggregation in request |
| Scope | system / any customer / carrier / user | Only customers in `allowedCustomers` (salesAgent: only platform) |
| Sections | loads, payments, users | loads only (or payments only for accounting) |
| Caching | Snapshot cache; can be stale until worker runs | No snapshot; always fresh for their scope |
| When worker runs | Mark dirty on load create/update/delete; worker recomputes | N/A (no snapshots for multi-customer aggregate) |

---

## 6. Possible Issues to Watch

1. **Consistency of semantics**  
   Admin path uses snapshots (created in period + current status; worker logic). Non-admin path uses the same `computeSnapshot`-style logic (deliveryAt/pickupAt/createdAt in range) but in `computeSnapshotForCustomerIds` / batch. So “total” and “by status” should be consistent for that logic; any change to “created in period vs activity in period” should be aligned in both `computeSnapshot` and `computeSnapshotForCustomerIds` (and batch).

2. **Performance**  
   For non-admin, every request runs aggregations over `Load` (and payments) for `customer: { $in: ids }`. Large `allowedCustomers` or big date ranges can be heavy; consider indexing and/or limiting date range.

3. **Empty allowedCustomers**  
   freightBroker/dispatcher etc. with no `allowedCustomers` still get `allowedEntityTypes: ['customer']` and `allowedEntityIds: { customer: [] }`. With `customerIdsForAggregate = []`, the controller still calls `getSnapshotsForDateKeys(..., 'customer', null, [])`. The batch/single functions return empty snapshot when `ids.length === 0`, so they see zeros, which is correct.

4. **salesAgent and platform filter**  
   salesAgent only gets platform customers from `allowedCustomers`. If none are platform, they get `allowedEntityTypes: []` and no access.

---

## 7. Files Reference

- Permissions: `server/utils/statsPermissions.js` (`getStatsScope`, `hasStatsEntityAccess`, `resolveStatsScopeForRequest`).
- Controller: `server/controllers/StatsController.js` (`getLoadsStats`, `getSnapshotsForDateKeys`).
- Worker / live compute: `server/services/statsWorker.js` (`computeSnapshot`, `computeSnapshotForCustomerIds`, `computeSnapshotsForCustomerIdsBatch`).
- Frontend: `my-app/src/pages/statistic-page/`, `buildStatsSnapshotParams` (e.g. in `statsFilterUtils.js`), `useStatsDataFetch`, `statsApi.getStats()`.
