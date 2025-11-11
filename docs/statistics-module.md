# Statistics Module Guide

This document explains how the statistics layer in this project works, what data you can fetch from the server, and how to integrate it into client-facing dashboards or automation. Share it with teammates or external partners who need to understand which metrics are available and how to request them.

## High-Level Overview

- **Purpose**: expose operational KPIs around loads, revenue, and workforce activity.
- **Primary inputs**: `Load` and `User` collections.
- **Aggregation flow**:
  1. Raw data is aggregated into day and month snapshots by `services/cachedStatsService`.
  2. Snapshots are stored in dedicated cache collections (`CachedDayStats`, `CachedMonthStats`, `CachedUserDayStats`, `CachedUserMonthStats`).
  3. `controllers/StatsController` serves API responses, using cached snapshots when available and regenerating them on demand otherwise.
- **Formatting**: final payloads pass through `DTO/statistics.dto.js` to normalize response shapes.

## Data Catalog

### General KPIs (`CachedDayStats` / `CachedMonthStats`)

- `totalUsers` – total registered users.
- `totalLoads` – loads created in the requested window.
- `totalRevenue`, `totalExpense`, `totalTurnover`.
- `loadsByStatus` – counts for `listed`, `dispatched`, `pickedUp`, `delivered`, `onHold`, `cancelled`.
- `loadsByType` – counts for freight categories (`boats`, `cars`, `motorcycles`, `rvs`).
- `usersByRole` – headcount split across `admin`, `dispatcher`, `carrier`, `customer`, `accountant`, `manager`, `driver`.
- `topUsers` – top 10 users by loads added with revenue and computed earnings.
- `topCarriers`, `topCustomers` – top 5 partners with load counts and revenue.
- `averageLoadValue`, `averageProcessingTime` (currently 0 until implemented).
- `lastUpdated` – snapshot refresh timestamp.

### User-Level KPIs (`CachedUserDayStats` / `CachedUserMonthStats`)

- `loadsAdded`, `loadsByStatus`, `loadsByType`.
- `revenueGenerated` – sum of `Load.value` created by the user.
- `earnings` – role-based payout (dispatchers 5%, carriers 70%, managers 10%, drivers 60% of generated revenue).
- `averageProcessingTime` – placeholder for future SLA tracking.

### Historical Models (`LoadStats`, `UserStats`)

`models/subModels/LoadStats.js` and `models/subModels/UserStats.js` hold longer-term rollups. They are populated by legacy `services/statsService` tasks and primarily power the `/stats/users` list and any future historical charts.

## REST API

All statistics endpoints are mounted under the stats router (for example `/api/stats`). Authentication via `verifyToken` is required everywhere; some routes have additional role checks.

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/general` | any authenticated user | Summary KPIs for the selected window. |
| `GET` | `/user/:userId` | any authenticated user | KPI snapshot for a single user. |
| `GET` | `/users` | `admin`, `manager` | Leaderboard view for all users plus top performers. |
| `GET` | `/detailed` | any authenticated user | Day-by-day breakdown of created loads with status/type counts. |
| `POST` | `/update` | `admin` | Legacy stats refresh via `services/statsService.updateAllStats`. |
| `POST` | `/update-cached` | `admin` | Force-refresh all cached snapshots via `cachedStatsService.updateAllCachedStats`. |

### Query Parameters

- `period`: `day` or `month`. `year` is validated but not currently implemented in the controller logic.
- `startDate`, `endDate`: ISO date strings. Optional for `/general`, `/user/:userId`, `/users`; required for `/detailed`.
- `userId`: Mongo ObjectId (hex, 24 chars) for `/user/:userId` and optional filter on `/detailed`.

### `/general`

**Request**: `GET /stats/general?period=day`  
When no date range is passed, the service uses the current day/month.

**Response shape** (`StatisticsDTO.formatGeneralStats`):

```json
{
  "period": "day",
  "dateRange": { "startDate": "2024-08-01", "endDate": "2024-08-01" },
  "totalLoads": 42,
  "totalRevenue": 128000,
  "loadsByStatus": {
    "listed": 5,
    "dispatched": 12,
    "pickedUp": 9,
    "delivered": 13,
    "onHold": 2,
    "cancelled": 1
  },
  "historicalData": []
}
```

> Note: `historicalData` is currently empty because the controller does not populate it yet. Add an array of historical snapshots before calling the DTO if you need trend charts.

### `/user/:userId`

**Request**: `GET /stats/user/64df...c2?period=month`

**Response shape** (`StatisticsDTO.formatUserStats`):

```json
{
  "user": {
    "id": "64df...c2",
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "role": "dispatcher"
  },
  "period": "month",
  "dateRange": { "startDate": null, "endDate": null },
  "totalLoads": 87,
  "totalRevenue": 255000,
  "loadsByStatus": {
    "listed": 10,
    "dispatched": 30,
    "pickedUp": 20,
    "delivered": 25,
    "onHold": 1,
    "cancelled": 1
  },
  "loadsByType": {
    "boats": 2,
    "cars": 70,
    "motorcycles": 5,
    "rvs": 10
  },
  "historicalData": []
}
```

### `/users`

Returns a leaderboard plus the raw `UserStats` documents in the selected range.

```json
{
  "period": "month",
  "dateRange": { "date": { "$gte": "...", "$lte": "..." } },
  "usersStats": [
    {
      "date": "2024-08-15T00:00:00.000Z",
      "user": {
        "id": "64df...c2",
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "role": "dispatcher"
      },
      "totalDeals": 15,
      "loadsAdded": 40,
      "totalEarnings": 12000,
      "totalPaymentsProcessed": 7,
      "totalRevenueGenerated": 75000,
      "averageLoadProcessingTime": 0
    }
  ],
  "topUsers": [
    {
      "user": {
        "id": "64df...c2",
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "role": "dispatcher"
      },
      "loadsAdded": 40,
      "totalRevenue": 75000
    }
  ]
}
```

### `/detailed`

Requires `startDate` and `endDate`. Optionally filter by `userId`. The controller runs an aggregation on `Load` and groups results by day.

```json
[
  {
    "date": "2024-08-01",
    "loadsAdded": 9,
    "totalRevenue": 27000,
    "loadsByStatus": { "listed": 1, "dispatched": 3, "delivered": 5 },
    "loadsByType": { "cars": 7, "boats": 1, "motorcycles": 1 }
  }
]
```

## Caching and Refresh Strategy

- Every endpoint first checks the appropriate cached collection.
- If no cached snapshot exists for the requested window, `cachedStatsService` regenerates it on the fly.
- Admins can run `POST /stats/update-cached` to refresh all day/month/user caches in a single call (useful for scheduled jobs).
- The legacy `POST /stats/update` endpoint recalculates `LoadStats` and `UserStats`; keep it if you still rely on those models for BI exports.

### Suggested Automation

- Schedule `cachedStatsService.updateAllCachedStats()` (via the `/update-cached` endpoint or a background job) once per day shortly after midnight.
- Schedule the legacy `updateAllStats()` weekly if you still consume the historical models.

## Extending the Module

- **Adding new metrics**: augment the aggregation facets inside `cachedStatsService.generateDayStats` / `generateMonthStats` and update the corresponding schemas in `models/subModels/CachedStats.js`.
- **Historical trends**: supply a `historicalData` array when calling `StatisticsDTO.formatGeneralStats` and `StatisticsDTO.formatUserStats`; otherwise the DTO currently returns an empty array.
- **Role payouts**: adjust `calculateEarnings` in `cachedStatsService` for new roles or different commission logic.
- **Validation**: update `validations/statisticsValidation.js` when adding new query/body fields.

## Glossary

- **Load**: a shipment record with status, type, value, carrier, and customer details.
- **Revenue**: sum of `Load.value`.
- **Expense**: sum of `Load.carrierPaymentStatus.amount`.
- **Turnover**: revenue minus expense.
- **Earnings**: role-specific payout for the person who created the load.

## Quick Checklist for Integrators

- Authenticate before hitting any `/stats` endpoints.
- Pick `period=day` for same-day dashboards or `period=month` for monthly reporting.
- Include `startDate`/`endDate` when you need historical slices (required for `/detailed`).
- Cache responses on the client if possible; snapshots update at most once per run of the cache refresher.
- Coordinate with admins before bulk-refreshing stats to avoid heavy DB loads during peak hours.

With this reference, teammates can explore the available metrics, hook up dashboards, or extend the statistics engine safely.

