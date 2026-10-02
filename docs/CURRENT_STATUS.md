# Current Project Status

Last Updated: 2026-10-02 (branch `sync-production-development`; baseline commits `78d045c`…`9bd1041` + docs; Group C and Group I still uncommitted)

## Stable / Implemented

Implemented in backend routes + frontend pages, with unit tests:

- Auth (own token, bcrypt, login lockout), user management, role/permission enforcement
- Sales Orders: line items, container generation, ownership, Finance locks, cancellation request/review, vendor orders, invoice delivery status
- Container jobs: assignment with history, status flow incl. `repo_stored` (titip) and `inap`, completion document checks, SPK, admin correction mode, backdate entries, vendor execution
- Container job expenses + auto UJ + Rekening Dropping (requests, deposits, daily batches with carry-forward, reconciliation, multi transfer proofs)
- Finance: SO number verification, invoice number/documents, payments (incl. bulk customer allocation), voids, revenue lines, debit notes, customer outstanding (+ export), finance corrections, completed trips, billing readiness
- Driver commissions: weekly batches, approval, payment, deductions, void, CSV export
- Master data (10 resources), vehicle documents with expiry monitoring, fleet assignment (default driver, chassis)
- Historical entry with period locks
- Reports (sales, revenue, operations, documents, driver performance, input monitoring), truck utilization, activity log
- Storage trash/restore, backup lock, Hino telematics sync + live positions

## Git Baseline (2026-10-02)

Committed on `sync-production-development` (not pushed):

| Commit | Content |
|---|---|
| `78d045c` | Migrations `202609180001`–`202609180003`, `202609260001` |
| `ea373d9` | Baseline test/lint repair |
| `560699c` | Container pickup workflow (routes, service, Operations page) |
| `2acb613` | Truck chassis history + utilization reporting |
| `0bc9704` | Finance invoice detail UI + tests, integration-test alignment |
| `9bd1041` | Driver commission page (Sunday–Saturday dropdown, account column) |
| docs commit | `docs/*`, `CLAUDE.md` |

## In Progress (still uncommitted)

**Group C — locations + SO-level vendor deprecation. Blocked: NEEDS OWNER DECISION on the vendor change.**
- Locations: `app.js` (registers `GET /api/locations`), `modules/locations/*`, `sales-orders.controller.js` (location audit), sales-order mapper/repository location snapshot, `master.{controller,mapper,service}.js` (end-users fields, `sanitizeMasterResultForActor`), `EndUsersPage`, `LocationMasterPage`, `ActivityLogPage` + `activityLogService` (location filter), `SalesOrderForm`, `WarehouseLocationCard`, `locationService`, `utils/googleMapsUrl`, `ujRecommendation` + `UjRecommendationCard`, `sales-order.css` (`.operational-modal` width), and their tests.
- Vendor change (current behavior at `HEAD` still allows SO-level vendor orders):
  - `sales-orders.mapper.js` `toSalesOrderDb` always writes `is_vendor_order: false`, `vendor_name/vendor_note: null`.
  - `sales-orders.service.js` drops `VENDOR_ORDER_ALLOWED_STATUSES`.
  - `sales-orders.repository.js` removes the `is_vendor_order` branches (create always inserts container jobs; `SALES_ORDER_VENDOR_HAS_CONTAINER_JOBS` removed).
  - `SalesOrderForm.jsx` removes the "Dikerjakan oleh Vendor" checkbox.
  - Tests: `sales-orders.mapper.test.js`, `sales-orders.service.test.js`, `SalesOrderForm.test.jsx`, and `vendor-execution.regression.test.js` (2 added tests).
  - `package.json` scripts `vendor-orders:audit|convert` → `scripts/convert-legacy-vendor-orders.js`.
- Not separable by hunk staging:
  - `sales-orders.repository.js` raw diff is two whole-file line-ending hunks mixing both features.
  - Mapper hunk 4, `SalesOrderForm.jsx` hunks 2 and 8, and `SalesOrderForm.test.jsx` hunks 4 and 6 contain both.
  - A locations-only version would need hand-written, untested intermediate code.

**Group I — intentionally left untouched:** deleted `FiturOutstanding.md`, `SOP_DAN_DOKUMENTASI_FLOW_BESAR.md`, `fe-truck-management-system/NEW UPDATE SHIPMENT TRUCKING .xlsx`. Untracked `be-truck-management-system/scripts/{clear-e2e-transactions,convert-legacy-vendor-orders,seed-progress-report-demo}.js`.

**Line-ending only (no content change):** `container-jobs.service.test.js`.

## Reproducibility Gap (open)

- Committed `fe/src/components/forms/OperationalForm.jsx` imports `../operations/WarehouseLocationCard` since commit `dea6450` (2026-09-29). That component and its dependency `utils/googleMapsUrl.js` are untracked (Group C). **A clean checkout of any commit since `dea6450` cannot build or test the frontend** (`Failed to resolve import`).
- The working tree is unaffected. Fix: commit `WarehouseLocationCard.jsx`, `googleMapsUrl.js` (+ tests). They depend only on `lucide-react`, not on the vendor change. NEEDS OWNER DECISION (they belong to Group C).
- The backend at `HEAD` is self-contained: migrations committed, `node --check` passes, unit tests pass on a clean export.

### Migration integrity (verified 2026-10-02, not executed)

All four are additive and idempotent, and are now committed in `78d045c`. Committed code needs `…0002`, `…0003` and `…0260001`; `…0001` is used by Group C.

| Migration | Change |
|---|---|
| `202609180001` | `end_users` + `destination_id`, `google_maps_url`, `latitude`, `longitude` |
| `202609180002` | `warehouse_location_id` (FK `end_users`) on `sales_orders`, `container_jobs` |
| `202609180003` | warehouse name/address snapshots + `destination_id` on both tables |
| `202609260001` | `container_pickup_movements` + `container_pickup_items` |

Their numbers are older than some committed migrations. This is valid because `runMigrations.js` applies every unapplied file in name order.

### Dangerous utility: `scripts/clear-e2e-transactions.js` (untracked, not executed)
- **Deletes:** `TRUNCATE … RESTART IDENTITY CASCADE` of every base table except `schema_migrations, system_settings, users, customers, drivers, vehicles, kir_heads, kir_chassis, depots, terminals, destination_locations, stid_masters, end_users`. That wipes all SOs, jobs, expenses, dropping ledger/batches, payments, commissions, attachment metadata (files on disk become orphans), vehicle documents, trash, activity logs, history, Hino data and historical periods. It then deletes all users except the five `@demo.com` accounts, deletes all terminals, and inserts E2E terminal/STID/end-user rows. (No kept table has an FK to a truncated table, so `CASCADE` doesn't reach master data.)
- **Guards:** refuses if `DATABASE_URL` is empty, if `NODE_ENV` is `production`, or if the host isn't `localhost` / `127.0.0.1` / `::1`. No confirmation prompt, dry-run, or database-name check. `clear-dev-database.js` has the same guards.
- **Can still hit a real database when:** run on the production server itself (the production env example uses `localhost:5432`) with `NODE_ENV` unset or overridden in the shell (dotenv doesn't override existing variables); through an SSH tunnel or port-forward to a remote database; or against a local restore of production data.
- **Recommended (not applied, needs owner approval):** require an explicit flag (e.g. `--confirm`) or `ALLOW_DESTRUCTIVE_CLEANUP=1`; allowlist database names (e.g. `*_test` / `*_e2e`); print the target database and row counts before truncating.

## Known Issues

- FIXED in `ea373d9` (all three failures pre-dated the uncommitted work):
  - Stale regex in `vendor-execution.regression.test.js` (code changed in `dea6450`).
  - Date-dependent `DriverCommissionOperationalPage.test.jsx` case, now pinned to 2026-08-12 WIB.
  - Six `no-unused-vars` lint errors (dead code left by `96cfa5a`, `7c160f4`, `9ca093a`).
- NEEDS OWNER DECISION: UI left orphaned by those earlier commits.
  - The admin-fee note is still passed to `ExpenseCheckConfirmModal` but not rendered.
  - The Operational dropping page's upload/UJ-proof modals have no opener.
- `0bc9704` removes the "Dokumen Dasar Tagih" and "Internal Cost" cards from the invoice detail modal (as found in the working tree).
- Remaining: 6 `react-hooks/exhaustive-deps` lint warnings. No TODO/FIXME markers in `src/`.
- See also **Reproducibility Gap** above.

## Security Concerns

- Demo accounts (`admin@demo.com` etc., password `password`) are created by migrations `202607080004` and `202607160001`, and nothing removes them. NEEDS PRODUCTION VERIFICATION.
- Destructive cleanup scripts (see above) are guarded only by `NODE_ENV` and a localhost check; production runs Postgres on localhost. NEEDS PRODUCTION VERIFICATION that `NODE_ENV=production` is set there.

## Technical Debt

- Very large files: `finance/finance.repository.js` (~6.8k lines), `container-jobs/container-jobs.repository.js` (~4k), `reports/reports.repository.js` (~2k).
- Permission names differ between backend (`sales_order.read`) and frontend (`orders.read`); two maps must be kept in sync manually.
- LEGACY RPUJ approve/reject/transfer endpoints with no UI caller; `rpuj_status` reused as a stage marker.
- Outdated docs: `be-truck-management-system/README.md` (says Supabase auth, only Settings module), `fe-truck-management-system/supabase/`, Phase-1 driver commission doc (Thursday–Wednesday period vs code Sunday–Saturday).
- Some regression tests assert on source text with regexes (brittle to refactors).
- Mixed CRLF/LF line endings and BOMs in some backend files.
- In-memory login rate limiting and actor-status cache (per-process; not shared across instances).

## Recent Architecture Decisions

Observable from code/migrations:

- Moved from Supabase to own Node API + PostgreSQL with custom token auth (FE defaults `VITE_DATA_SOURCE=api`, `VITE_AUTH_SOURCE=api`).
- Framework-less backend with declarative route table and module layering (routes/controller/service/repository/mapper).
- RPUJ replaced by `container_job_expenses` + Rekening Dropping ledger with daily batches (`202608200001`–`09`).
- Finance-owned SO number (`accurate_so_number`); internal auto SO numbers removed (`202609070001`).
- `lunas` only via recorded payments; payments/revenue lines voided, never deleted; idempotency keys on financial inserts.
- Frozen snapshots (UJ amount, assignment/bank, customer, destination, warehouse location).
- DB-level partial unique indexes guard one active job per driver/vehicle.
- Container destination per job (`202608270001`); vendor execution per job (`202609250001`).

## Owner Decisions / Production Verification

- NEEDS OWNER DECISION: Sales SO visibility (currently all SOs readable; writes are owner-only).
- NEEDS OWNER DECISION: retire the LEGACY RPUJ endpoints, and remove or update the Thursday–Wednesday design docs and the unused `buildCommissionWeekOptions`.
- NEEDS OWNER DECISION: should cancellation approval re-check that the job is still `received`? Vendor job completion requirements. `under_review` batch status. `FinanceWorkflowPage` demo rows (`initialOrderRows`, `initialInvoiceRows`).
- NEEDS PRODUCTION VERIFICATION: deployment (process manager, static hosting, `/api` proxy). Demo users. `NODE_ENV`. Migrations `202609180001`–`03` and `202609260001` applied in each environment (`schema_migrations`).

## Build / Test Status

Run on 2026-10-02. **Working tree** = all files incl. uncommitted Group C. **Clean `HEAD`** = `git archive HEAD` export (what a fresh clone gets).

| Check | Command | Working tree | Clean `HEAD` |
|---|---|---|---|
| Backend syntax | `cd be-truck-management-system && npm run check` | PASS | PASS |
| Backend unit tests | `DATABASE_URL= node --test` | PASS — 284/286 (2 skipped) | PASS — 260/262 (2 skipped) |
| Frontend lint | `cd fe-truck-management-system && npm run lint` | PASS — 0 errors, 6 warnings | PASS |
| Frontend tests | `npm run test:run` | PASS — 491/491 | **FAIL** — 3 files can't load (`WarehouseLocationCard` missing); 387 loaded tests pass |
| Frontend build | `npx vite build --outDir <temp>` (keeps `dist/` intact) | PASS | **FAIL** — `Could not resolve "../operations/WarehouseLocationCard"` |
| Backend integration | `npm test` with `DATABASE_URL` set | NOT RUN — destructive; disposable DB only | NOT RUN |
| Utilization chassis SQL | needs `CHASSIS_TEST_DATABASE_URL` | NOT RUN (opt-in) | NOT RUN |
| Health check | `GET http://localhost:3000/health` | NOT RUN — server not started | NOT RUN |

Notes:
- `npm test` in the backend loads `.env`; if `DATABASE_URL` is set there, the integration test runs and mutates that database. Blank it (`DATABASE_URL=`) for unit-only runs.
- Frontend tests take ~4–5 minutes. Under heavy CPU load (two suites in parallel), two UI tests timed out once (`OperationsPage` inap modal, `SalesOrdersPage` DO PNG download). Both pass in isolation and in a normal full run.
