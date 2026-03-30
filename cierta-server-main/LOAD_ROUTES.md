# Load API routes

## Fix 404 for generate-bol / generate-rate-confirmation

If `POST /loads/:id/generate-bol` returns **404**, the app that listens on the API port (e.g. 5000) must mount the load router. Add in that app:

```js
const { loadRoutes } = require('./server');
app.use('/loads', loadRoutes);
```

Or mount the router file directly:

```js
const loadRoutes = require('./server/loadRoutes');
app.use('/loads', loadRoutes);
```

Restart the API server after adding the route.

---

## Recommended: use the full router

Mount the ready-made router that includes all load routes (CRUD, search, history, status, duplicate, generate BOL/Rate Confirmation):

```js
const loadRoutes = require('./path/to/server/loadRoutes');
app.use('/loads', loadRoutes);
```

All handlers are bound to `LoadController`, so `this` works correctly.

## Route list (loadRoutes.js)

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/` | getAll |
| GET    | `/search` | search |
| GET    | `/history` | getAllLoadHistory |
| GET    | `/by-status` | getByStatus |
| GET    | `/driver/:driverId` | getByCarrier |
| GET    | `/customer/:customerId` | getByCustomer |
| POST   | `/` | create |
| POST   | `/generate-bol` | generate BOL (no loadId; returns tempEntityId) |
| POST   | `/generate-rate-confirmation` | generate Rate Confirmation (no loadId) |
| PATCH  | `/status/:id` | updateStatus |
| GET    | `/:id` | getById |
| PUT    | `/:id` | update |
| POST   | `/:id/duplicate` | duplicateLoad |
| GET    | `/:id/history` | getLoadHistory |
| POST   | `/:id/generate-bol` | generate BOL for existing load |
| POST   | `/:id/generate-rate-confirmation` | generate Rate Confirmation for existing load |
| DELETE | `/:id` | delete |

**Important:** Static paths are registered before `/:id` so that `/generate-bol`, `/search`, `/history`, etc. are not matched as `:id`.

## Alternative: add only generate routes to an existing router

If you already have a load router and only need the generate endpoints:

```js
const { registerLoadGenerateRoutes } = require('./path/to/server/loadGenerateRoutes');
registerLoadGenerateRoutes(loadRouter);
```

Register these **before** any `/:id` route so that `/generate-bol` and `/generate-rate-confirmation` are matched correctly.

### Request body

- **POST /loads/generate-bol** and **POST /loads/generate-rate-confirmation**  
  Body: JSON object with the same load payload as for create (orderId, customer, carrier, pickup, delivery, etc.). Parsed with `parseLoadData(req.body)`.

- **POST /loads/:id/generate-bol** and **POST /loads/:id/generate-rate-confirmation**  
  Same body (current form data). Optional: can use existing load from DB; the controller uses body to generate PDF.

### Response

- **200** `{ success: true, key, signedUrl?, tempEntityId? }`  
  - `key`: S3 key of the uploaded PDF  
  - `signedUrl`: temporary URL to view the file (if available)  
  - `tempEntityId`: only when no `:id` (create flow); frontend sends it when creating the load so temp keys can be moved to the real loadId

---

## Routing reference: what is sent vs what the server expects

**Base URL:** Frontend uses `api` from `useHttp.js` with `baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000'`. All load requests go to `{baseURL}/loads{path}`.

### Generate BOL / Rate Confirmation

| | Frontend sends | Server expects |
|--|----------------|----------------|
| **No load (create flow)** | `POST /loads/generate-bol` or `POST /loads/generate-rate-confirmation` | Same. Route: `POST /generate-bol`, `POST /generate-rate-confirmation` (static, before `/:id`). |
| **Body** | JSON: result of `transformLoadDataForAPI(getValues())` (orderId, customer, carrier, pickup, delivery, vehicle, freight, status, etc.) | `parseLoadData(req.body)` — accepts `req.body` or `req.body.load`; if string, parses as JSON. |
| **With loadId (edit flow)** | `POST /loads/{loadId}/generate-bol` or `.../generate-rate-confirmation` | Route: `POST /:id/generate-bol`, `POST /:id/generate-rate-confirmation`. `req.params.id` = loadId. Same body. |
| **Response** | Expects `{ key, signedUrl?, tempEntityId? }` (or wrapped in `data`) | Returns `{ success: true, key, signedUrl?, tempEntityId? }`. |

**Frontend call:** `DocumentsSection` → `getValues()` → `transformLoadDataForAPI(values)` → `loadService.generateBOL(apiData, loadId)` or `generateRateConfirmation(...)`. `loadService` builds URL: `loadId ? \`/${loadId}/generate-bol\` : '/generate-bol'` and does `api.post(\`/loads${endpoint}\`, loadData)`.

### Other load endpoints (summary)

| Frontend (loadService) | Request | Server route | Server params/body |
|------------------------|--------|-------------|--------------------|
| `getLoads()` | GET /loads | GET / | query for pagination/filters |
| `getLoadById(id)` | GET /loads/:id | GET /:id | req.params.id |
| `createLoad(data)` | POST /loads, body = load | POST / | req.body, parseLoadData |
| `updateLoad(id, data)` | PUT /loads/:id, body = load | PUT /:id | req.params.id, req.body |
| `updateLoadStatus(id, status)` | PATCH /loads/status/:id, body = { status } | PATCH /status/:id | req.params.id, req.body.status (or req.body.load.status) |
| `duplicateLoad(id)` | POST /loads/:id/duplicate | POST /:id/duplicate | req.params.id |
| `getLoadHistory(loadId)` | GET /loads/:loadId/history | GET /:id/history | req.params.id |
| `getLoadHistoryList()` | GET /loads/history | GET /history | — |
| `getLoadsByDriver(driverId)` | GET /loads/driver/:driverId | GET /driver/:driverId | Controller uses req.params.driverId (or carrierId) as carrier id |
| `searchLoads(q, filters)` | GET /loads/search?q=... | GET /search | req.query |
| `deleteLoad(id)` | DELETE /loads/:id | DELETE /:id | req.params.id |

**getByStatus:** Route is GET /by-status. Controller accepts `status` from `req.params.status` or `req.query.status` (e.g. GET /loads/by-status?status=Listed).

---

## Rate Confirmation field map (debug)

To see which form field is at which index and fix incorrect data mapping:

- **GET /loads/debug/rate-confirmation-field-map** — generates `RateConfirmation_FIELD_MAP.pdf` and returns it as a download. Each PDF field is filled with `[#index] Label | PDF: actualFieldName` so you can see index, our label, and the real PDF field name.
- **GET /loads/debug/rate-confirmation-field-map?mapping=1** — same generation, but response is JSON: `{ success, filename, path, totalFields, mapping }`. `mapping` is an array of `{ index, fieldName, variable, source }` where `source` is the load data path (e.g. `load.orderId`, `load.carrierRate`).

Use the PDF to verify that the visual position matches the index; use `?mapping=1` to get the exact list and fix `getRateConfirmationFormValues` order if the template field order differs.
