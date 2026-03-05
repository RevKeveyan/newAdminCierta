# Fix and Test: Loads + Statistics Access (createdBy OR customer)

## Implemented (this workspace)

- **Statistics (statsWorker.js):** `buildLoadFilterForNonAdmin(customerIds, userId)` added; `computeSnapshotForCustomerIds` and `computeSnapshotsForCustomerIdsBatch` now accept `userId` and use Load filter `(customer in allowed) OR (createdBy = userId)`. Payments still filtered by customer only.
- **Statistics (StatsController.js):** All calls to the worker pass `userId`; getTopCarriers and getTopCustomers (and customers summary) use `loadMatch.$or = [ { customer: $in }, { createdBy: currentUser } ]` for non-admin.
- **Load list / Customer list:** Not in this workspace. Apply the same rule in the backend that serves GET /loads and GET /customers: for non-admin, filter loads by `$or: [ { customer: { $in: allowedIds } }, { createdBy: req.user._id } ]`; filter customers by allowed list only (no change).

---

## 1. What to fix

**Rule:** A non-admin user should see a load (and it should count in their stats) if:
- they **created** the load (`createdBy` = this user), OR  
- the load’s **customer** is in their **allowedCustomers**.

### 1.1 Backend – Statistics

**Where:** `server/services/statsWorker.js` and `server/controllers/StatsController.js`.

- **statsWorker**
  - `computeSnapshotForCustomerIds(rangeStart, rangeEnd, customerIds)`  
    Today: `baseLoadFilter = { customer: { $in: ids } }`.  
    Change to: pass also `userId` and use  
    `baseLoadFilter = { $or: [ { customer: { $in: ids } }, { createdBy: userId } ] }`  
    (when `ids.length > 0`; if only `userId` is used, filter by `createdBy` only).
  - `computeSnapshotsForCustomerIdsBatch(dateKeys, rangeStart, rangeEnd, customerIds)`  
    Same idea: add `userId` and use `$or: [ { customer: { $in: ids } }, { createdBy: userId } ]` in the Load match for non-admin.

- **StatsController**
  - Every place that builds `loadMatch` or similar for non-admin (e.g. getTopCarriers, getTopCustomers, export, etc.):  
    Today: `loadMatch.customer = { $in: allowedIds }`.  
    Change to: `loadMatch.$or = [ { customer: { $in: allowedIds } }, { createdBy: currentUser._id } ]`  
    and remove the direct `loadMatch.customer` assignment for that branch.

- **Scope / params**
  - For “global” non-admin, the API already resolves to `customerIdsForAggregate` (and possibly empty list).  
  - You need to also pass **current user id** into the worker and into any controller logic that builds Load filters, so “created by me” can be applied.

### 1.2 Backend – Load list (GET /loads)

**Where:** The controller or service that handles listing loads (e.g. LoadController or equivalent).

- Today (typical): filter by `customer: { $in: allowedCustomerIds }` for non-admin.
- Change to: for non-admin, filter by  
  `$or: [ { customer: { $in: allowedCustomerIds } }, { createdBy: req.user._id } ]`.
- Admin/manager: no change (see all loads).

### 1.3 Permissions / scope

- **statsPermissions.js**  
  No change to the rule “who has which entity types”. You only add “created by me” **inside** the existing customer-scoped stats and load list. So `getStatsScope` can stay as is; the change is in how the Load query is built (customer list **or** createdBy).

---

## 2. How to test (per user type)

Use one browser (or incognito) per role. Prefer real DB users with known `allowedCustomers` and at least one load created by that user and one by another user.

### 2.1 Admin

- **Statistics**
  - Open Statistics → Loads (and other tabs if applicable).  
  - Expect: totals and charts for **all** loads (system-wide).  
  - Change scope to a specific customer/carrier/user: numbers must match that entity only.
- **Loads list**
  - Loads page: see all loads.  
  - Filters by customer/carrier: work and restrict list correctly.
- **Access**
  - Can open Statistics, Loads, Customers, Carriers, Users (as per your app). No 403.

### 2.2 Manager

- Same as Admin: full access to stats and load list, system-wide and per-entity filters.

### 2.3 FreightBroker / Dispatcher / Pre-dispatcher / BidAgent

- **Setup**
  - User has `allowedCustomers = [customerA, customerB]`.  
  - At least:  
    - Load 1: `customer = customerA`, `createdBy = this user`.  
    - Load 2: `customer = customerA`, `createdBy = other user`.  
    - Load 3: `customer = customerC` (not in allowed), `createdBy = this user`.  
    - Load 4: `customer = customerC`, `createdBy = other user`.
- **Statistics**
  - Open Statistics → Loads (global view).  
  - Expect: Load 1, Load 2 (customer in list), and Load 3 (created by me).  
  - Expect: Load 4 **not** in stats (wrong customer and not created by me).  
  - Totals and breakdowns (by status, etc.) must match this set.
- **Loads list**
  - Expect: same as stats — Load 1, 2, 3 visible; Load 4 not.  
  - Search/filter by customer: only customers they’re allowed to see; list still respects “created by me” for any customer.
- **Access**
  - Statistics: only Loads section (no Payments/Users as per your RBAC).  
  - No access to other users’ loads that are neither in allowed customers nor created by this user.

### 2.4 SalesAgent

- **Setup**
  - Same idea as above, but `allowedCustomers` are restricted to **platform** customers in code.  
  - Create: loads for a platform customer (created by this user and by another); loads for a non-platform customer created by this user.
- **Statistics**
  - Global stats: must include loads for allowed (platform) customers **and** loads created by this user (even if customer is not in their list).  
  - Must **not** include loads for non-allowed customers that are not created by this user.
- **Loads list**
  - Same rule: see load if (customer in allowed platform list) OR (createdBy = me).
- **Access**
  - Only Loads stats and load list; no system-wide or other-entity stats.  
  - If no allowed customers and no “created by me” loads, stats can be zeros and list empty (no 403 if you fixed that earlier).

### 2.5 Accounting roles (accountingManager, accountingIn, accountingOut)

- **Statistics**
  - Only Payments section; scope is system.  
  - No Loads stats.  
  - Check receivable/payable visibility as per role (e.g. accountingIn only receivable).
- **Loads list**
  - Typically no access to Loads page (or same as “other” roles if they have it — then apply same “customer or createdBy” rule if they have allowedCustomers).
- **Access**
  - 403 or hidden menu for Loads stats / Loads list if not allowed.

### 2.6 Partner (or role with no stats)

- **Statistics**
  - No access: 403 or Statistics not available.  
  - No loads in stats.
- **Loads list**
  - Per your RBAC: if they have no allowedCustomers and no “created by me” rule, list is empty or 403.

---

## 3. Test checklist (summary)

| Role            | Stats: see own-created loads? | Stats: see loads by customer only? | Load list: same rule? | Access (403 / sections) |
|----------------|--------------------------------|-------------------------------------|----------------------|--------------------------|
| Admin          | Yes (all)                     | Yes (all)                           | Yes (all)            | Full                     |
| Manager        | Yes (all)                     | Yes (all)                           | Yes (all)            | Full                     |
| FreightBroker  | Yes (after fix)               | Yes                                 | Yes (after fix)      | Loads only               |
| Dispatcher     | Yes (after fix)               | Yes                                 | Yes (after fix)      | Loads only               |
| SalesAgent     | Yes (after fix)               | Yes (platform only)                 | Yes (after fix)      | Loads only               |
| Accounting*    | N/A (payments only)           | N/A                                 | Per RBAC             | Payments only            |
| Partner        | No                            | No                                  | No / empty           | No stats                 |

---

## 4. Quick test flow (one non-admin user)

1. Log in as a non-admin (e.g. dispatcher) with at least one `allowedCustomers` and note `userId`.
2. In DB (or via API):  
   - One load: `customer` = one of allowed, `createdBy` = **another** user → must appear in stats and list.  
   - One load: `customer` = **not** in allowed, `createdBy` = **this** user → must appear in stats and list after fix.  
   - One load: `customer` = not in allowed, `createdBy` = other user → must **not** appear.
3. Open Statistics → Loads: check totals and one breakdown (e.g. by status); compare with expected set of loads.
4. Open Loads page: check that the same three rules hold (visible / not visible).
5. Repeat for another role (e.g. salesAgent) with platform vs non-platform customer and createdBy combinations.

---

## 5. Where to add automated tests (optional)

- **Backend**
  - Unit or integration tests for the function that builds the Load filter for non-admin (e.g. “given allowedCustomers and userId, filter is $or customer $in or createdBy”).
  - Stats worker: test that `computeSnapshotForCustomerIds` / batch with `userId` returns counts that include loads only in (allowed customers ∪ created by user).
- **E2E**
  - Log in as dispatcher/salesAgent, create a load with customer not in list, then open Statistics and Loads and assert that this load appears.

This document is the fix-and-test guide only; no code changes were applied.
