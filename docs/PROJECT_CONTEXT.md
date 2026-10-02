# Project Context

ATMS (Armada Truck Management System). Monorepo with a React frontend and a Node.js + PostgreSQL backend. UI text, error messages, and most code comments are in Indonesian.

## Purpose

Internal operations system for a container trucking company. It replaces Excel-based tracking (see `fe-truck-management-system/docs/ATMS-Excel-Replacement-MVP.md`) and covers:

- Sales Orders (SO) from customers → container jobs ("ritasi") executed by drivers/trucks
- Operational execution: assignment, status, documents, container storage ("titip"/repo), overnight ("inap")
- Journey money (UJ) and operational expenses paid from a daily dropping account ("Rekening Dropping")
- Finance: SO number verification (Accurate), invoice numbers/documents, customer payments, outstanding, debit notes
- Weekly driver commissions
- Master data (customers, end users/warehouses, drivers, trucks, chassis, depots, terminals, destinations, STID), vehicle documents and expiry monitoring
- Reports, truck utilization, Hino telematics (live vehicle positions)

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, react-router-dom 7, Tailwind 3 + plain CSS (`src/styles/`), lucide-react, Leaflet |
| Frontend tests | Vitest + Testing Library (jsdom); Playwright is installed but only used by `scripts/mobile-screenshots.mjs` |
| Backend | Node.js ≥20, ESM, **no web framework** — raw `node:http` server with a custom router (`src/app.js`) |
| Backend deps | Only `pg`, `bcryptjs`, `dotenv` |
| Backend tests | `node:test` (`node --test`) |
| Database | PostgreSQL (`pgcrypto` extension) via `pg` Pool |
| Auth | Custom HMAC-signed bearer token (`auth.utils.js`), bcrypt passwords |
| File storage | Local filesystem under `UPLOAD_DIR` (production example: `D:\ARMADA_SYSTEM\storage`) |

## Architecture

```
React SPA (fe-truck-management-system)
  services/* → httpClient (fetch, Bearer token, VITE_API_BASE_URL)
        ↓ JSON over HTTP
Node HTTP server (be-truck-management-system/src/app.js)
  route table → authorizeRoute (token + permission) → backup-lock check → JSON body parse
        ↓
  module: *.routes.js → *.controller.js → *.service.js → *.repository.js (raw SQL)
        ↓                                   (*.mapper.js converts snake_case rows ↔ camelCase)
PostgreSQL                     Filesystem storage (attachments, vehicle documents, trash)
```

Each backend module lives in `be-truck-management-system/src/modules/<module>/`. Controllers also write audit entries via `safeRecordActivityLog`.

## Repository Structure

```
be-truck-management-system/
  src/app.js, server.js        HTTP server, route registry, CORS, health check
  src/config/env.js            All env vars (validated at startup)
  src/db/client.js             pg Pool, query(), withTransaction()
  src/db/migrations/*.sql      Forward-only SQL migrations (runMigrations.js)
  src/db/seeds/                Dev seed data
  src/middlewares/             auth.middleware.js, error.middleware.js
  src/modules/                 Domain modules (see below)
  src/utils/                   apiResponse.js, permissions.js
  src/integration/             DB-backed end-to-end test (destructive, needs DATABASE_URL)
  scripts/                     Backup, storage migration/audit, data audits, seeding utilities
  docs/                        Feature design/audit notes (driver commission, admin correction)
fe-truck-management-system/
  src/routes/                  AppRoutes.jsx, ProtectedRoute, RoleRoute
  src/pages/                   Pages by area: sales-orders, operations, finance, admin, reports, monitoring, system
  src/services/                API clients per domain (+ legacy local adapters)
  src/contexts/                AuthContext, ArchiveDataContext, FeedbackContext
  src/constants/               roles.js, navigation.js
  supabase/                    LEGACY Supabase schema/function (pre-backend phase)
  docs/                        Original SRS / MVP / UAT documents
deploy/                        Production env examples + Windows PowerShell setup/backup scripts
docs/                          This documentation layer
```

## Main Modules (backend `src/modules/`)

| Module | Responsibility |
|---|---|
| `auth`, `users` | Login/logout/me/change-password; user CRUD, status, password reset |
| `sales-orders` | SO CRUD, line items → container jobs, cancellation, invoice delivery status, customer outstanding summary |
| `container-jobs` | Ritasi execution: assignment, status, documents, SPK, repo storage/pickup, expenses (UJ, costs), cancellation |
| `operations/fleet-assignment` | Truck ↔ default driver ↔ current chassis assignment + history |
| `finance` | SO number verification, operational fund (dropping) requests/deposits/batches/ledger, expense reconciliation, invoices, payments, debit notes, revenue lines, corrections, completed trips |
| `driver-commissions` | Weekly commission batches, payments, deductions |
| `historical-entry` | Admin backfill of past-period data with period locks |
| `master`, `locations` | Generic master-data CRUD (`/api/master/:resource`), location lookup |
| `vehicle-documents`, `attachments`, `storage` | Vehicle docs, generic file attachments, trash/restore |
| `reports`, `archive`, `utilization-notes` | Dashboards, reports, trip archive, utilization notes |
| `telematics` | Hino Connect API sync + live positions (optional scheduler) |
| `activity-logs`, `settings` | Audit trail, key/value system settings |

## User Roles

Defined in `be-truck-management-system/src/modules/users/users.mapper.js` (`ROLE_PERMISSIONS`) and mirrored (with different permission names) in `fe-truck-management-system/src/constants/roles.js`.

| Role | Responsibility (from permissions) |
|---|---|
| `admin` | Everything (`actorHasPermission` always true); admin correction mode, historical entry, reopen batches, approve finance corrections, users/settings |
| `sales` | Create/update/cancel own SOs, upload customer documents, submit driver commissions |
| `operational` | Assign/update/complete container jobs, review cancellations, request dropping funds, fleet assignment, Hino sync |
| `finance` | SO number verification, UJ/expense reconciliation, dropping deposits/batches, invoices, payments, debit notes, commission approval/payment |
| `pengamat` / `observer` | Read-only across sales, operations, master data, reports, finance (FE label "Viewer") |

## Deployment

- Target is a Windows server: `deploy/scripts/setup-production-folders.ps1` creates `D:\ARMADA_SYSTEM\{apps\frontend, apps\backend, storage, backups, logs, deploy}`.
- Env templates: `deploy/env/backend.env.production.example`, `deploy/env/frontend.env.production.example`, `be-truck-management-system/.env.example`.
- Frontend: `npm run build` → static `dist/`. Backend: `npm start` (`node src/server.js`), default port 3000.
- Migrations: `npm run db:migrate` (manual step).
- Backups: `deploy/scripts/register-backup-tasks.ps1` registers Windows Scheduled Tasks for daily DB (`pg_dump`) and storage zip backups.
- NEEDS PRODUCTION VERIFICATION (owner input): the repo has no PM2/`ecosystem.config`, Nginx/IIS/`web.config`, reverse-proxy, Windows service (NSSM/WinSW/`New-Service`), or Docker config. It is unknown how the backend process is kept alive, how the frontend `dist/` is served, and whether `/api` is proxied (the env example uses `VITE_API_BASE_URL=http://IP-SERVER-ATAU-DOMAIN/api`, which implies a proxy or same-host routing). The only Windows Scheduled Tasks in the repo are the backups (`register-backup-tasks.ps1`). `npm run preview` (`vite preview`) exists but isn't documented as a production server.

## External Integrations

- **Hino Connect API** (`modules/telematics/`): token, vehicles, vehicle positions. Credentials via `HINO_*` env vars; auto-sync scheduler disabled by default (`HINO_AUTO_SYNC_ENABLED=false`).
- **Accurate** (accounting software): not integrated by API. Finance manually enters Accurate SO/invoice numbers and uploads Accurate PDFs.
- **Google Maps**: URL links only (`fe/src/utils/googleMapsUrl.js`, currently untracked — see `CURRENT_STATUS.md` Reproducibility Gap).
- No email/WhatsApp/cloud storage integrations found.

## Important Technical Constraints

- Windows production host; PowerShell scripts for backup/compress; paths like `D:\ARMADA_SYSTEM\storage`.
- File uploads are base64 inside JSON bodies (no multipart). Allowed: pdf/jpg/jpeg/png, default 5 MB (`MAX_UPLOAD_SIZE_MB`).
- All mutating requests return `503 BACKUP_IN_PROGRESS` while a storage backup lock file exists.
- `AUTH_TOKEN_SECRET` is required (≥32 chars; placeholder values rejected in production) — server won't start without it.
- Dates/periods are computed in `Asia/Jakarta` time (WIB).
- Migrations are forward-only SQL files, applied in filename order and tracked in `schema_migrations`.
- Financial snapshots are deliberately frozen (customer snapshot on SO, assignment/bank snapshot and UJ amount on container job) — do not "refresh" them from master data on routine updates.

## Known Legacy Areas

- `fe-truck-management-system/supabase/` and `be-truck-management-system/README.md` describe the earlier Supabase-auth phase. CURRENT: auth and data both go through the Node API (`VITE_AUTH_SOURCE=api`, `VITE_DATA_SOURCE=api` are the defaults).
- Frontend local/localStorage adapters (`ArchiveDataContext.jsx` local keys, `services/settings/adapters/localSettingsStore.js`) are used only when `VITE_DATA_SOURCE` ≠ `api`.
- RPUJ: older UJ approval flow; data migrated into `container_job_expenses` (`202608200001`).
  - LEGACY: `/api/finance/rpuj-requests*` (list/approve/reject/transfer-proof) are still routed and covered by the integration test, but no frontend page calls them.
  - CURRENT under a legacy name: `container_jobs.rpuj_status` `pending`/`submitted` is still written by the Operational form as the "trip cost recorded" stage marker.
  - The finance UI tab id `rpuj-approval` renders "Rekening Dropping".
  - Details in `BUSINESS_RULES.md`.
- LEGACY: Thursday–Wednesday driver commission week in `be-truck-management-system/docs/DRIVER_COMMISSION_*.md` and the unused `buildCommissionWeekOptions` (ReportsPage). The current code uses Sunday–Saturday.
- Legacy billing status values (`pending_invoice`, `invoice_issued`, `waiting_payment`, `paid`) are mapped to current Indonesian values in `sales-orders.billing-status.js`.
- Legacy SHA-256 password hashes are still accepted and flagged for rehash (`auth.utils.js`).
