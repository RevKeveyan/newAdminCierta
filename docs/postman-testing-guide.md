# Postman Testing Guide for the Cierta Admin API

This guide consolidates every currently exposed HTTP endpoint so you can build a complete Postman collection that exercises authentication, user management, load lifecycle, statistics, performance metrics, and health checks. Follow the setup steps, then work through each suite to validate the server end to end.

## 1. Prerequisites

- **Base URL**: the server mounts resources at the root (for example `http://localhost:5000`). There is no `/api` prefix.
- **MongoDB** and **Redis** must be running; otherwise caches and controllers may fail.
- **Seed data**: create at least one admin user directly in the database, or have credentials available for login.
- **JWT secret**: set `JWT_SECRET` in your environment so auth tokens can be issued.

### Recommended Postman Environment Variables

| Variable | Purpose |
|----------|---------|
| `base_url` | Server root, e.g. `http://localhost:5000`. |
| `admin_email` / `admin_password` | Credentials for the admin user who can manage everything. |
| `dispatcher_email` / `dispatcher_password` | Optional secondary credentials for dispatcher-only flows. |
| `auth_token` | Filled automatically after login (`Bearer` token). |
| `user_id` | Populated after creating or fetching a user (24-char ObjectId). |
| `load_id` | Populated after creating or fetching a load. |
| `pdf_filename` | Filled after document generation to download the right file. |

### Authorization Header Automation

1. In your Postman collection, create a **Pre-request Script**:

```javascript
if (pm.environment.get('auth_token')) {
  pm.request.headers.upsert({
    key: 'Authorization',
    value: `Bearer ${pm.environment.get('auth_token')}`
  });
}
```

2. Add a **Tests** script to the login request to persist the token:

```javascript
pm.test('Login succeeded', () => {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.expect(json).to.have.property('token');
});

const json = pm.response.json();
pm.environment.set('auth_token', json.token);
pm.environment.set('user_id', json.user?.id || json.user?._id);
```

## 2. Authentication Suite (`/auth`)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `POST` | `/auth/login` | `{ "email": "{{admin_email}}", "password": "{{admin_password}}" }` | Required first step; stores `auth_token`. |
| `POST` | `/auth/forgot-password` | `{ "email": "user@example.com" }` | Sends a six-digit reset code (check mail logs in development). |
| `POST` | `/auth/reset-password` | `{ "email": "...", "code": "123456", "newPassword": "NewSecret1" }` | Consumes the reset code and updates credentials. |

**Suggested Tests**

```javascript
pm.test('Response structure is valid', () => {
  const json = pm.response.json();
  pm.expect(json).to.have.property('token');
  pm.expect(json).to.have.property('user');
});
```

## 3. User Management Suite (`/users`)

Most endpoints require an admin JWT. All IDs are Mongo ObjectIds.

| Method | Path | Body / Query | Purpose | Role |
|--------|------|--------------|---------|------|
| `GET` | `/users` | `?page=1&limit=20` | Paginated list (cached for 5 minutes). | `admin` |
| `GET` | `/users/search` | `?q=smith&role=dispatcher` | Text search across configured fields. | `admin` |
| `GET` | `/users/role/:role` | e.g. `/users/role/dispatcher?page=1&limit=10` | Filter by role. | `admin` |
| `GET` | `/users/profile` | — | Returns logged-in user profile (no password). | any authenticated |
| `POST` | `/users` | JSON or multipart form-data (for `profileImage`). | Create user; hashes password automatically. | `admin` |
| `PUT` | `/users/:id` | Only changed fields; supports avatar upload. | Applies diff-only updates. | `admin` |
| `PUT` | `/users/:id/status` | `{ "status": "suspended" }` | Toggle active/suspended. | `admin` |
| `PUT` | `/users/profile` | Only changed fields (optional avatar). | Self-update for current user. | any authenticated |
| `DELETE` | `/users/:id` | — | Removes user (hard delete). | `admin` |

**Postman Tips**
- Use the **Tests** tab after `POST /users` to set `user_id`:

```javascript
const json = pm.response.json();
pm.environment.set('user_id', json.data?.id || json.data?._id);
```

- For multipart uploads, switch Postman body to **form-data**, add fields as text, and attach files to `profileImage`.

## 4. Load Lifecycle Suite (`/loads`)

Most endpoints require `admin` or `dispatcher` access. The base `GET /loads` route is currently unsecured (middleware commented out).

| Method | Path | Body / Query | Purpose | Role |
|--------|------|--------------|---------|------|
| `GET` | `/loads` | `?page=1&limit=20&sortBy=createdAt&sortOrder=desc` | Cached paginated fetch. | public *(should still test with token)* |
| `GET` | `/loads/search` | `?q=VIN123&type=Cars` | Advanced search. | `admin`, `dispatcher`, `manager` |
| `GET` | `/loads/status/:status` | e.g. `/loads/status/Delivered` | Filter by status. | `admin`, `dispatcher`, `manager` |
| `GET` | `/loads/carrier/:carrierId` | Provide carrier ObjectId stored inside load. | Filter by embedded carrier. | `admin`, `dispatcher`, `manager` |
| `GET` | `/loads/:id/history` | — | Returns change log populated with user info. | `admin`, `dispatcher`, `manager` |
| `POST` | `/loads` | Multipart form-data (images allowed). | Creates load, writes history. | `admin`, `dispatcher` |
| `PUT` | `/loads/:id` | JSON; only changed fields applied. | Standard update without files. | `admin`, `dispatcher` |
| `PUT` | `/loads/:id/full` | Multipart with new images. | Merges new files with existing ones. | `admin`, `dispatcher` |
| `PUT` | `/loads/:id/status` | `{ "status": "Delivered" }` | Updates status and history. | `admin`, `dispatcher` |
| `DELETE` | `/loads/:id` | — | Hard deletes a load. | `admin` |
| `GET` | `/loads/:id/bol` | — | Triggers Bill of Lading PDF generation. | `admin`, `dispatcher`, `manager` |
| `GET` | `/loads/:id/rate-confirmation` | — | Generates rate confirmation PDF. | `admin`, `dispatcher`, `manager` |
| `GET` | `/loads/:id/documents` | — | Generates both PDFs. | `admin`, `dispatcher`, `manager` |
| `GET` | `/loads/download/:filename` | — | Streams generated PDF (`generated-pdfs` folder). | `admin`, `dispatcher`, `manager` |

**Key Fields from `Load` Model**
- `type` (enum): `"Boats"`, `"Cars"`, `"Motorcycles"`, `"RVs"`.
- `vin`: unique string.
- `carrier`: object containing `name`, `contact`, etc.
- `status` enum: `"Listed"`, `"Dispatched"`, `"Picked up"`, `"Delivered"`, `"On Hold"`, `"Cancelled"`.
- `value`: numeric revenue base for stats.
- `createdBy`: required user ObjectId (set automatically for authenticated creators).

**Tests Suggestions**

```javascript
pm.test('Load created', () => pm.response.to.have.status(201));
const { data } = pm.response.json();
pm.environment.set('load_id', data?.id || data?._id);
```

For PDF generation responses, capture the filenames returned and populate `pdf_filename` so you can call `/loads/download/{{pdf_filename}}`.

## 5. Statistics Suite (`/stats`)

All routes require valid JWTs; some are admin only.

| Method | Path | Query | Purpose | Role |
|--------|------|-------|---------|------|
| `GET` | `/stats/general` | `period=day|month`, optional `startDate`, `endDate` | Returns cached or freshly generated aggregate KPIs. | any authenticated |
| `GET` | `/stats/user/:userId` | same query as general | Load KPIs and earnings for the specified user. | any authenticated |
| `GET` | `/stats/users` | same query as general | Leaderboard plus archived `UserStats`. | `admin`, `manager` |
| `GET` | `/stats/detailed` | `userId?`, **required** `startDate`, `endDate` (ISO) | Day-by-day breakdown aggregated from `Load`. | any authenticated |
| `POST` | `/stats/update` | `{ "force": false }` | Legacy stats recalculation via `statsService`. | `admin` |
| `POST` | `/stats/update-cached` | — | Refreshes all cached snapshots (`Cached*` collections). | `admin` |

**Validation Notes**
- `period=year` is allowed by validation but not implemented; expect fallback behaviour.
- When `startDate` and `endDate` are supplied, the controller skips current-day shortcuts and generates specific date windows.

**Postman Tests**

```javascript
pm.test('General stats structure', () => {
  const { data } = pm.response.json();
  pm.expect(data).to.have.property('totalLoads');
  pm.expect(data).to.have.property('loadsByStatus');
});
```

## 6. Performance Monitoring Suite (`/performance`)

All endpoints require an admin token. They read/write metrics maintained by the in-memory performance monitor middleware.

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| `GET` | `/performance/stats` | — | Snapshot of aggregated latency, counts, slowest requests, grouped data. |
| `POST` | `/performance/export` | `{ "filename": "perf-report.json" }` | Persists metrics to disk; response returns path. |
| `DELETE` | `/performance/clear` | — | Resets in-memory counters. |

Add tests confirming a `success: true` payload and verifying expected keys. For export, assert that `data.filePath` ends with the provided filename.

## 7. Health Check

- `GET /health` – public endpoint for uptime monitoring. Should always return `{ "ok": true }` with status `200`.

## 8. Error Handling Patterns

- **Validation errors** return `400` with `details` array (field/message).
- **Auth errors** return `401` or `403` depending on missing token vs. role mismatch.
- **Not found**: `404` with `error` message.
- **Server errors**: `500` with `error` and `details` (details only in development for some controllers).

Add generic Postman tests to ensure expected codes:

```javascript
pm.test('Responds with 400 on invalid ID', () => {
  if (pm.response.code === 400) {
    const body = pm.response.json();
    pm.expect(body.error).to.match(/Invalid ID/i);
  }
});
```

## 9. Using the Guide to Build a Collection

1. **Create folders** in Postman for `Auth`, `Users`, `Loads`, `Stats`, `Performance`, and `Health`.
2. **Attach the environment** variables listed earlier. Use `{{base_url}}` in every request.
3. **Set pre-request script** at collection level to apply the `Authorization` header automatically when `auth_token` exists.
4. **Chain requests** by using Tests scripts to store ids (`user_id`, `load_id`, `pdf_filename`) for downstream calls.
5. **Cover edge cases**:
   - Invalid credentials (expect 401).
   - Duplicate VIN on load creation (expect 400 due to unique index).
   - Unauthorized role hitting admin endpoint (expect 403).
   - Detailed stats without required dates (expect 400 from validation middleware).
6. **Automate run**: Use Postman’s Collection Runner or Newman with the environment file to execute the complete suite after deployments.

## 10. Quick Newman Command

Export your collection (`cierta-collection.json`) and environment (`cierta-env.json`), then run:

```bash
newman run cierta-collection.json \
  --environment cierta-env.json \
  --reporters cli,html \
  --reporter-html-export newman-report.html
```

This produces a reproducible regression report covering every critical route.

---

With this guide, you can assemble or update a Postman collection that validates every live controller and model-driven workflow currently exposed by the server. Extend it as new routes appear so the test suite always mirrors reality.*** End Patch

