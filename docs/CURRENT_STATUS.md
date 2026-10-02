# Current Project Status

Last Updated: 2026-10-02 (branch `sync-production-development`, not pushed; all feature work committed — only Group I left uncommitted)

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
- Warehouse locations: `GET /api/locations`, SO/job location snapshots, Sales Order location picker, end-user maps fields
- Container pickup (single / combo 2×20) and truck chassis history in utilization reports

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
| `dd1364d` | `docs/*`, `CLAUDE.md` |
| `b691940` | `WarehouseLocationCard.jsx` + `utils/googleMapsUrl.js` (+ tests): fixes the fresh-clone frontend build broken since `dea6450` |
| `d068c53` | Warehouse locations (`GET /api/locations`, SO/job location snapshots, end-user maps fields) + DEPRECATED Sales-level vendor flag |

Reproducibility: since `b691940` a fresh clone builds and passes all frontend tests; the backend was already self-contained after `78d045c`.

## In Progress (still uncommitted)

- **Group I, intentionally untouched (owner decision pending):**
  - deleted `FiturOutstanding.md`, `SOP_DAN_DOKUMENTASI_FLOW_BESAR.md`, `fe-truck-management-system/NEW UPDATE SHIPMENT TRUCKING .xlsx`
  - untracked `be-truck-management-system/scripts/{clear-e2e-transactions,convert-legacy-vendor-orders,seed-progress-report-demo}.js`
- Tied to the conversion script and therefore left out of `d068c53`:
  - the `package.json` scripts `vendor-orders:audit` / `vendor-orders:convert`
  - the regression test "konversi SO vendor lama bersifat dry-run…" in `vendor-execution.regression.test.js` (still in the working tree)
- Line-ending only (no content change): `container-jobs.service.test.js`.

### Migration integrity (verified 2026-10-02, not executed)

All four are additive and idempotent, committed in `78d045c`. `…0001` is used by the locations module (`d068c53`); the others by container-job reads and repo pickups.

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
- CURRENT: vendor execution is handled by the container-job vendor workflow (`execution_source`). DEPRECATED: Sales marking an SO as vendor/non-vendor (`d068c53`, owner decision 2026-10-02).

## Owner Decisions / Production Verification

- NEEDS OWNER DECISION: Group I files (deleted root docs/xlsx, three dev scripts incl. `convert-legacy-vendor-orders.js`).
- NEEDS PRODUCTION VERIFICATION: number of legacy SOs with `is_vendor_order = true`, and whether to run the vendor conversion (`--apply`) before deploying `d068c53`. Editing such an SO now turns it into internal container jobs.
- NEEDS OWNER DECISION: Sales SO visibility (currently all SOs readable; writes are owner-only).
- NEEDS OWNER DECISION: retire the LEGACY RPUJ endpoints, and remove or update the Thursday–Wednesday design docs and the unused `buildCommissionWeekOptions`.
- NEEDS OWNER DECISION: should cancellation approval re-check that the job is still `received`? Vendor job completion requirements. `under_review` batch status. `FinanceWorkflowPage` demo rows (`initialOrderRows`, `initialInvoiceRows`).
- NEEDS PRODUCTION VERIFICATION: deployment (process manager, static hosting, `/api` proxy). Demo users. `NODE_ENV`. Migrations `202609180001`–`03` and `202609260001` applied in each environment (`schema_migrations`).

## Build / Test Status

Run on 2026-10-02 after `d068c53`. **Clean `HEAD`** = `git archive HEAD` export (what a fresh clone gets). **Working tree** additionally holds the uncommitted Group I scripts, the `package.json` vendor scripts, and one script-dependent regression test.

| Check | Command | Clean `HEAD` | Working tree |
|---|---|---|---|
| Backend syntax | `cd be-truck-management-system && npm run check` | PASS | PASS |
| Backend unit tests | `DATABASE_URL= node --test` | PASS — 283/285 (2 skipped) | PASS — 284/286 (2 skipped) |
| Frontend lint | `cd fe-truck-management-system && npm run lint` | PASS — 0 errors, 6 warnings | same (no uncommitted frontend code) |
| Frontend tests | `npm run test:run` | PASS — 491/491 (54 files) | same |
| Frontend build | `npx vite build --outDir <temp>` (keeps `dist/` intact) | PASS | same |
| Backend integration | `npm test` with `DATABASE_URL` set | NOT RUN — destructive; disposable DB only | NOT RUN |
| Utilization chassis SQL | needs `CHASSIS_TEST_DATABASE_URL` | NOT RUN (opt-in) | NOT RUN |
| Health check | `GET http://localhost:3000/health` | NOT RUN — server not started | NOT RUN |

Notes:
- `npm test` in the backend loads `.env`; if `DATABASE_URL` is set there, the integration test runs and mutates that database. Blank it (`DATABASE_URL=`) for unit-only runs.
- Frontend tests take ~4–5 minutes. Under heavy CPU load (two suites in parallel), two UI tests timed out once (`OperationsPage` inap modal, `SalesOrdersPage` DO PNG download). Both pass in isolation and in a normal full run.
