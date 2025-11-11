# Postman End-to-End Test Guide

This guide walks you through setting up a Postman collection that exercises every exposed controller in the Cierta Admin server: authentication, users, loads, stats, reviews, performance monitoring, and common health checks. Follow the steps to share a ready-to-run suite with teammates or external QA partners.

---

## 1. Prerequisites

- Running backend (`npm run dev` or deployed instance).
- MongoDB instance populated with at least one admin user.
- `.env` configured with `JWT_SECRET`, `MONGO_URI`, and valid SMTP credentials (for password reset tests).
- Postman Desktop v10+ (recommended for file uploads).
- Optional: Redis if you want to test cached stats refresh (`services/cacheService`).

---

## 2. Postman Environment Setup

Create a new environment named **Cierta Admin** and add the following variables:

| Variable | Initial Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:5000` | Change to deployed host if needed. |
| `adminEmail` | `admin@example.com` | Credentials for login flow. |
| `adminPassword` | `P@ssw0rd` | Matching password. |
| `authToken` | _empty_ | Populated automatically after login test script. |
| `testUserId` | _empty_ | Filled after you create a user; reused by other requests. |
| `testLoadId` | _empty_ | Filled after you create a load. |
| `testReviewId` | _empty_ | Filled after you create a review. |

Add the following **Pre-request Script** at the environment level so the `Authorization` header is applied automatically when available:

```javascript
if (pm.environment.get('authToken')) {
  pm.request.headers.add({
    key: 'Authorization',
    value: `Bearer ${pm.environment.get('authToken')}`
  });
}
```

> **Note:** `/auth/*` routes are rate-limited (max 5 attempts per 15 minutes). Avoid looping login failures during automated runs.

---

## 3. Recommended Collection Structure

```
CIERTA Admin API
├── 0. Health & Diagnostics
├── 1. Authentication
├── 2. Users
├── 3. Loads
├── 4. Statistics
├── 5. Reviews
└── 6. Performance Monitor
```

Each folder below lists the requests, sample payloads, and suggested Postman tests. Use the numbered order when running the full collection.

---

## 4. Health & Diagnostics

### `GET {{baseUrl}}/health`
- **Tests**:
  ```javascript
  pm.test('Healthy response', () => pm.response.to.have.status(200));
  pm.test('Body ok flag', () => pm.expect(pm.response.json().ok).to.be.true);
  ```

---

## 5. Authentication

### `POST {{baseUrl}}/auth/login`
```json
{
  "email": "{{adminEmail}}",
  "password": "{{adminPassword}}"
}
```
- **Tests**:
  ```javascript
  pm.test('Login success', () => pm.response.to.have.status(200));
  const body = pm.response.json();
  pm.environment.set('authToken', body.token);
  pm.expect(body.user).to.have.property('role');
  ```

### `POST {{baseUrl}}/auth/forgot-password`
```json
{ "email": "{{adminEmail}}" }
```
- Confirms email flow; expect HTTP 200.

### `POST {{baseUrl}}/auth/reset-password`
- Requires verification code from mailbox (manual step). Use to validate code expiry and retry limits (`ResetCode` model tracks attempts).

> Add negative tests (wrong password, expired code) to ensure rate limiting and validation work.

---

## 6. Users Controller (`/users`)

All routes require `Authorization: Bearer {{authToken}}`. Admin-only unless stated otherwise.

### `GET {{baseUrl}}/users`
- Tests pagination defaults (`page`, `limit` query params available via `UniversalBaseController.getAll`).

### `GET {{baseUrl}}/users/search?search=alice`
- Verifies search across `firstName`, `lastName`, `email`, `companyName`.

### `GET {{baseUrl}}/users/role/dispatcher`
- Expect filtered list and `role === dispatcher` for all entries.

### `GET {{baseUrl}}/users/profile`
- Confirms authenticated user profile without password.

### `POST {{baseUrl}}/users`
Use `form-data` body to test avatar upload:
- **form-data**
  - `firstName`: `QA`
  - `lastName`: `User`
  - `email`: `qa.user+{{ $timestamp }}@example.com`
  - `password`: `Secret123!`
  - `role`: `dispatcher`
  - `profileImage`: *File* (optional)
- **Tests**:
  ```javascript
  pm.test('User created', () => pm.response.to.have.status(201));
  const body = pm.response.json();
  pm.environment.set('testUserId', body.data.id || body.data._id);
  ```

### `PUT {{baseUrl}}/users/{{testUserId}}`
```json
{ "firstName": "QA-Updated" }
```
- Expect 200 and `data.firstName === 'QA-Updated'`.

### `PUT {{baseUrl}}/users/{{testUserId}}/status`
```json
{ "status": "suspended" }
```
- Ensure status change persists.

### `PUT {{baseUrl}}/users/profile`
```json
{ "lastName": "AdminUpdated" }
```

### `DELETE {{baseUrl}}/users/{{testUserId}}`
- Expect 200 or 204.
- **Test**: follow-up `GET` should return 404.

---

## 7. Loads Controller (`/loads`)

Permissions: most routes require `admin` or `dispatcher`. The top-level `GET /loads` is temporarily public (auth checks commented in `routes/loadRoutes.js`), but assume token in production.

### `GET {{baseUrl}}/loads`
- Optional query params inherited from `UniversalBaseController`: `page`, `limit`, `sort`, `fields`, `search`.

### `GET {{baseUrl}}/loads/search?search=vin123`
- Validates advanced search.

### `POST {{baseUrl}}/loads`
- **Headers**: `Content-Type: multipart/form-data`
- **Body (form-data)**:
  - `type`: `Cars`
  - `vin`: `VIN{{ $timestamp }}`
  - `carrier.name`: `Carrier Inc`
  - `carrier.contact`: `555-123`
  - `value`: `1200`
  - `createdBy`: `{{testUserId}}` (must be a valid user)
  - Optional file fields (images/documents).
- **Tests**:
  ```javascript
  pm.test('Load created', () => pm.response.to.have.status(201));
  const body = pm.response.json();
  pm.environment.set('testLoadId', body.data.id || body.data._id);
  ```

### `PUT {{baseUrl}}/loads/{{testLoadId}}`
```json
{ "status": "Dispatched" }
```
- Confirms generic update.

### `PUT {{baseUrl}}/loads/{{testLoadId}}/full`
- Use `form-data` to append files and update fields simultaneously; verify images array grows.

### `PUT {{baseUrl}}/loads/{{testLoadId}}/status`
```json
{ "status": "Delivered" }
```
- Check history entry created (`LoadHistory`).

### `GET {{baseUrl}}/loads/{{testLoadId}}/history`
- Pagination tests (`page`, `limit`). Ensure change log contains recent status updates.

### `GET {{baseUrl}}/loads/status/Delivered`
- Expect filtered results.

### `GET {{baseUrl}}/loads/carrier/{{carrierId}}`
- Use `carrierId` from a load record’s embedded carrier `_id` if stored, otherwise adjust test once carriers are normalized.

### Document Generation
- `GET {{baseUrl}}/loads/{{testLoadId}}/bol`
- `GET {{baseUrl}}/loads/{{testLoadId}}/rate-confirmation`
- `GET {{baseUrl}}/loads/{{testLoadId}}/documents`
- **Tests**: assert 200 and that `data.fileName` or similar fields exist.
- `GET {{baseUrl}}/loads/download/{{filename}}`: ensure the previously generated PDF downloads (set `Accept` header to `application/pdf`).

### `DELETE {{baseUrl}}/loads/{{testLoadId}}`
- Validate `admin` required; expect 200.

> **Negative tests**: try creating a load without required fields to confirm validation responses (400 with detailed `details` array).

---

## 8. Statistics Controller (`/stats`)

JWT required; some routes restricted to admins/managers.

### `GET {{baseUrl}}/stats/general?period=day`
- Optional `startDate`/`endDate` (ISO). When omitted, controller uses current day/month and cached snapshots (`CachedDayStats` / `CachedMonthStats`).
- **Tests**: ensure `data.loadsByStatus` keys match schema and `success === true`.

### `GET {{baseUrl}}/stats/user/{{testUserId}}?period=month`
- Confirms per-user cache. If snapshot missing, controller triggers on-demand generation.

### `GET {{baseUrl}}/stats/users?period=day`
- Admin/manager only. Verifies aggregated leaderboard (`UserStats`) and `topUsers` array.

### `GET {{baseUrl}}/stats/detailed?startDate=2024-01-01&endDate=2024-01-31`
- Optional `userId` filter. Use ISO dates.
- **Tests**: ensure array response, all entries include `date`, `loadsAdded`, `loadsByStatus`, `loadsByType`.

### `POST {{baseUrl}}/stats/update`
- Admin only. Body:
  ```json
  { "force": true }
  ```
- Triggers legacy `statsService.updateAllStats`.

### `POST {{baseUrl}}/stats/update-cached`
- Admin only. No body required.
- Verifies cached stats refresh (`cachedStatsService.updateAllCachedStats()`).

> After running cache updates, rerun `GET /stats/general` to confirm `lastUpdated` changes.

---

## 9. Reviews Controller (`/reviews`)

Mounted as a nested router—depending on usage, each parent path should supply a `parentId`. Example base: `/loads/:parentId/reviews`.

### `GET {{baseUrl}}/loads/{{testLoadId}}/reviews`
- Uses `BaseSubController.getAll`.

### `POST {{baseUrl}}/loads/{{testLoadId}}/reviews`
```json
{
  "rating": 5,
  "comment": "Great carrier communication!"
}
```
- **Tests**:
  ```javascript
  pm.test('Review created', () => pm.response.to.have.status(201));
  const review = pm.response.json();
  pm.environment.set('testReviewId', review._id);
  ```

### `GET {{baseUrl}}/loads/{{testLoadId}}/reviews/{{testReviewId}}`

### `PUT {{baseUrl}}/loads/{{testLoadId}}/reviews/{{testReviewId}}`
```json
{ "comment": "Updated feedback" }
```

### `DELETE {{baseUrl}}/loads/{{testLoadId}}/reviews/{{testReviewId}}`

> Negative test: omit JWT to ensure 401 response (create/update/delete require authentication).

---

## 10. Performance Monitor (`/performance`)

Admin role required.

### `GET {{baseUrl}}/performance/stats`
- Validates monitoring middleware output (`utils/performanceMonitor`): request counts, latencies.

### `POST {{baseUrl}}/performance/export`
```json
{ "filename": "perf-report-{{ $timestamp }}" }
```
- Response includes file path. Confirm file exists on server if you have access.

### `DELETE {{baseUrl}}/performance/clear`
- Ensures metrics reset. Follow up with `GET /performance/stats` to confirm empty counters.

---

## 11. Automation Tips

- **Collection Runner**: Sequence folders 0 → 6. Insert `setNextRequest(null)` in destructive calls (`DELETE`) if you want to stop after cleanup.
- **Data files**: Use CSV/JSON data-driven tests to create multiple loads or users. Stick to rate limits and create unique emails/VINs with Postman dynamic variables (`{{$guid}}`, `{{$timestamp}}`).
- **Test scripts**: Add schema checks using `tv4` or `chai-json-schema` to ensure DTO responses remain stable.
- **Chaining IDs**: Many controllers return `_id`. Save them into environment variables as shown to reuse across requests.
- **Error cases**: Add paired negative tests for each positive case (missing fields → 400, unauthorized → 401/403, invalid ObjectId → 400).
- **File uploads**: Postman CLI (`newman`) can run multipart tests using the `--folder` flag and `--insecure` if needed.

---

## 12. Maintenance Checklist

- Update the collection when new controllers or routes are added (`app.js` is the source of truth).
- Regenerate Postman environment secrets when rotating admin credentials or JWT secret.
- Keep cached stats tests in sync with any schema changes inside `models/subModels/CachedStats.js`.
- Monitor rate limits: adjust Postman `delay` if you automate high-volume tests on `/auth`.

---

With this guide, you can build a comprehensive Postman collection that validates every major workflow in the Cierta Admin server, from onboarding users and ingesting loads to monitoring analytics and system performance.

