# API Conventions

Backend: `be-truck-management-system/src/`. Frontend client: `fe-truck-management-system/src/services/api/httpClient.js`.

## Base API Structure

- Plain `node:http` server; no Express. All routes are objects `{ method, path, handler, permission | permissions | authOnly | public }` exported from `modules/<module>/<module>.routes.js` and spread into the `routes` array in `src/app.js`.
- Routing is **first match wins** in array order; `:param` segments are decoded into `request.params`; segment counts must match exactly. Put literal paths (e.g. `/api/container-jobs/expenses`) before `/:id` paths in the same file.
- Request object augmentation: `request.query` (flat object from URLSearchParams), `request.params`, `request.user` (token payload with fresh `role`), `request.body` (parsed JSON, POST/PUT/PATCH only).
- Prefix: `/api/...`. Exception: `GET /health` (public; reports DB status).
- Frontend base URL: `VITE_API_BASE_URL` (default `http://localhost:3000/api`); FE services call paths without `/api` (e.g. `httpClient.get('/finance/invoices')`).
- CORS: `CORS_ORIGINS` (comma list) or `CORS_ORIGIN`; headers `Content-Type, Authorization`.

## Authentication

- `POST /api/auth/login` → `{ user, token, tokenType: 'Bearer' }`. Login has in-memory rate limit (20/min) and lockout (5 failures → 15 min) in `auth.service.js`.
- Token: custom `base64url(payload).HMAC-SHA256` signed with `AUTH_TOKEN_SECRET`, TTL 12 h (`auth.utils.js`). Payload: `sub` (user id), `email`, `role`, `name`, `exp`.
- Sent as `Authorization: Bearer <token>`; `?access_token=` query param is also accepted (used for file links).
- Every authenticated request re-reads user status/role (`actor-status-cache.js`); inactive users get 401 and role changes apply immediately.
- Logout is stateless (`{ success: true }`); the FE clears `localStorage['tms-api-auth-token']`.
- On any 401 (except requests sent with `auth: false`), `httpClient` clears the token and dispatches the window event `tms-auth-unauthorized` (`AUTH_UNAUTHORIZED_EVENT` in `authTokenStore.js`). `AuthContext` listens for it and clears the user, which sends the app back to login.
- Passwords: bcrypt (`PASSWORD_HASH_COST`, default 12); legacy SHA-256 hashes accepted and rehashed.

## Authorization

- Route-level: `permission: 'x'` or `permissions: ['a','b']` (any-of) checked in `middlewares/auth.middleware.js` via `actorHasPermission` (`utils/permissions.js`). `authOnly: true` = any logged-in user; `public: true` = no auth. A route with none of these is still authenticated but has no permission check (e.g. `GET /api/reports/dashboard`).
- Role → permission map: `ROLE_PERMISSIONS` in `modules/users/users.mapper.js`. `admin` passes every check.
- Service-level checks add role rules on top (e.g. `['finance','admin'].includes(actor.role)`, Sales ownership via `createdByUserId`, admin correction mode). Error codes like `*_FORBIDDEN` (403).
- Frontend gating (UX only): `constants/roles.js` (different permission names, e.g. `orders.read`), `routes/RoleRoute.jsx`, `constants/navigation.js`. Keep both sides in sync when adding a permission.

## Route Structure

- Resource-style, kebab-case plural nouns: `/api/sales-orders`, `/api/container-jobs`, `/api/driver-commissions/batches`, `/api/finance/operational-fund-requests`.
- Generic master CRUD: `/api/master/:resource[/:id]`, `/api/master/:resource/page` (resources: `customers, end-users, drivers, trucks, kir-heads, kir-chassis, depots, terminals, destinations, stids`).
- State transitions are sub-resource `PATCH` verbs: `/:id/cancel`, `/:id/cancel-request`, `/:id/cancel-review`, `/:id/approve`, `/:id/reject`, `/:id/close`, `/:id/reopen`, `/:id/void`, `/:id/number`, `/:id/so-number`.
- Child collections: `/api/container-jobs/:id/expenses/:expenseId`, `/api/finance/invoices/:id/payments/:paymentId/void`.
- Both `PUT` and `PATCH` exist for some updates (`/api/sales-orders/:id`, `/api/container-jobs/:id`) and map to the same handler.

## Request Conventions

- JSON body only (`Content-Type: application/json`); invalid JSON → 400 `INVALID_JSON`.
- Body fields are camelCase; mappers convert to snake_case DB columns (`*.mapper.js`).
- Query params are strings: `page`, `pageSize`, `query`/`search`, `status`, `dateFrom`/`dateTo` (aliases `startDate`/`endDate` in finance), module-specific filters.
- Special flags: `adminCorrectionMode` + `adminCorrectionReason`; `entrySource: 'historical'` + `historicalPeriod`; `isBackdateEntry` + `backdateReason`; `idempotencyKey` on expense/payment creation.

## Response Conventions

`utils/apiResponse.js`:

- Success: `{ "data": <payload>, "message": "Success" }` — status 200, or 201 for some creates (`sendSuccess(response, data, message, 201)`).
- Error: `{ "error": { "code": "UPPER_SNAKE", "message": "<Indonesian text>", "details": [] } }`.
- FE `httpClient` unwraps `payload.data` and throws `Error(message)` with `.status` and `.payload`.
- File downloads (`GET /api/attachments/:id`, `/api/vehicles/:vehicleId/documents/:documentId/download`) stream the file (`?download=1` → `attachment` disposition).
- CSV export (`/api/finance/outstanding/by-customer/export`) returns JSON data; CSV is built client-side (`fe/src/utils/csvExport.js`).

## Error Handling

- Throw `Error` with `statusCode` and `code` (and optional `details`); `middlewares/error.middleware.js` → `sendError`. Unset `statusCode` → 500 `INTERNAL_ERROR`.
- Typical codes: 400 `VALIDATION_ERROR` / `*_REQUIRED` / `*_INVALID`; 401 `UNAUTHORIZED` / `SESSION_EXPIRED`; 403 `FORBIDDEN` / `*_FORBIDDEN` / `*_LOCKED_*`; 404 `NOT_FOUND` / `<ENTITY>_NOT_FOUND`; 409 business-state conflicts (`*_LOCKED`, `*_ALREADY_*`, `*_DUPLICATE`); 503 `DATABASE_NOT_CONFIGURED`, `BACKUP_IN_PROGRESS`.
- Postgres unique violations (23505) from partial indexes are a final guard for some races (assignment).

## Validation

- Hand-written validation in `*.service.js` (normalize + throw), some in repositories inside transactions (state checks). No schema library.
- Common minimums: reasons for corrections/backdate/inap/repo ≥ 8 chars; notes max 500 chars.

## Pagination

- Repositories clamp `page ≥ 1`, `pageSize` 1–100 (default 20).
- Paged list shape (dominant): `{ rows, total, summary? }` inside `data`. Some list endpoints return plain arrays (e.g. `GET /api/master/:resource` vs `/api/master/:resource/page`). Check the specific repository before assuming.

## Filtering / Search

- `query` (free-text, `ILIKE` in SQL), `status`, date range (`dateFrom`/`dateTo`), and module filters (`entrySource`, `historicalPeriod`, `vendorFilter`, `invoiced`, `invoiceDocumentStatus`, `financeCheckStatus`, `paymentStatus`, `agingBucket`, `sortBy`…). Non-admins are forced to `entrySource=realtime` for container jobs.

## File Uploads / Attachments

- JSON with `fileName`, `mimeType`, `fileSize`, `fileBase64` (raw or data URL), plus `entityType`, `entityId`, `category`, `notes`.
- Generic: `POST /api/attachments/upload`; domain endpoints accept the same fields and create attachments internally (deposits, transfer proofs, invoice documents, payment proofs).
- Server validates MIME, extension, magic-byte signature, and size (`env.js`). Images may be compressed client-side (`fe/src/utils/imageCompression.js`).
- Files live under `UPLOAD_DIR`; delete → `storage_trash` (restorable).

## Database Transactions

- `withTransaction(async (client) => …)` from `src/db/client.js` for any multi-statement write; pass `client` down to helpers. Single reads use `query()`.
- Use `for update` row locks when checking-then-writing shared state (assignment, ledger, payments).
- Idempotency keys for retry-prone financial inserts; replay returns the original result.

## Logging / Audit Trail

- Controllers call `safeRecordActivityLog(request, { action, module, entityType, entityId, beforeData, afterData, metadata })` after successful mutations. Failures to log are swallowed (console only).
- Action names are UPPER_SNAKE (e.g. `ADMIN_CORRECTION_CONTAINER_JOB`, `FINANCE_RECORD_CUSTOMER_INVOICE_PAYMENT`). Read via `GET /api/activity-logs`.
- Server logs: `console.*` only; no logging library.

## Naming Conventions

- Files: `<module>.<layer>.js` (`routes`, `controller`, `service`, `repository`, `mapper`) + co-located `*.test.js`.
- Controllers: `<verb><Entity>Controller`; services: domain verbs; repositories: `find*`, `create*`, `update*`, `*Record`.
- Status/enum values: lowercase snake_case, often Indonesian (`belum_dicek`, `sudah_dibayar`, `lunas`); master statuses use Title-case Indonesian (`Aktif`, `Bertugas`).
- Permissions: `domain.action` or `domain.sub.action` (e.g. `finance.invoice.payment.void`).

## Adding a New Endpoint

1. **Route**: add `{ method, path, permission(s), handler }` to `modules/<m>/<m>.routes.js`; check ordering vs `/:id` routes; new module → import and spread in `src/app.js`.
2. **Authorization**: add permission to `ROLE_PERMISSIONS` (`users.mapper.js`) and FE `constants/roles.js`/route guards if a page uses it; add role/ownership checks in the service if needed.
3. **Controller**: read `request.params/query/body/user`, call service, `sendSuccess`, then `safeRecordActivityLog` for mutations.
4. **Validation/Service**: normalize inputs, throw coded errors, enforce locks/business rules.
5. **Repository**: raw parameterized SQL; `withTransaction` for multi-step writes; map rows via mapper.
6. **Migration** (if schema changes): new timestamped idempotent SQL file in `src/db/migrations/`.
7. **Frontend**: add a function in `src/services/<domain>/…Service.js` using `httpClient`.
8. **Tests**: unit tests next to the module (`node:test`); extend `src/integration/backend-flow.test.js` for DB flows; Vitest for FE.
