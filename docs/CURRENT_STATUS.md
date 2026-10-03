# Current Project Status

Last Updated: 2026-10-03 — branch `reconcile/local-dev-after-afdebf6` at `65749db` (pushed). Based on `origin/sync-production-development` at `afdebf6`, plus 7 reconciled frontend commits.

## Stable / Implemented

Implemented in backend routes + frontend pages, with unit tests:

- Auth (own token, bcrypt, login lockout, automatic logout on 401), user management, role/permission enforcement
- Sales Orders: line items, container generation, ownership, Finance locks, cancellation request/review, invoice delivery status, warehouse location picker. Container types: Dry, Reefer, Special, Isotank.
- Container jobs: assignment with history, status flow incl. `repo_stored` (titip) and `inap`, completion document checks, SPK, admin correction mode, backdate entries, per-job vendor execution (`execution_source`), container pickup (single / combo 2×20)
- Container job expenses + auto UJ (reefer surcharge) + Rekening Dropping (requests, deposits, daily batches with carry-forward, reconciliation, multi transfer proofs)
- Finance: SO number verification, invoice number/documents, payments (incl. bulk customer allocation, proof optional), voids, revenue lines, debit notes, customer outstanding (+ CSV export), finance corrections, completed trips, billing readiness. The invoice detail shows container numbers and per-container inap badges.
- Driver commissions: weekly Sunday–Saturday batches, approval, payment, deductions, void, CSV export, driver-alias resolution. The Operational page shows the payout account and the last 9 weekly periods.
- Master data (10 resources), vehicle documents with expiry monitoring, fleet assignment (default driver, chassis) with history, warehouse locations (`GET /api/locations`, maps fields)
- Historical entry with period locks
- Reports (sales, revenue, operations, documents, driver performance, input monitoring), truck utilization with historical chassis, activity log with location and commission events
- Storage trash/restore, backup lock, Hino telematics sync + live positions

## Git Baseline (2026-10-03)

- `origin/sync-production-development` = `afdebf6` — trusted development baseline (production reconciliation).
- `origin/reconcile/local-dev-after-afdebf6` = `65749db` — `afdebf6` plus these frontend-only commits (no backend, migration or package changes):

| Commit | Change |
|---|---|
| `db03789` | Remove six unused variables (lint errors) |
| `f78626e` | Pin the date in the commission batch-dropdown test |
| `faedd5b` | Mock the outstanding export and add a full-filter CSV export test |
| `76bc06b` | Invoice detail: container-number header, inap badges, cards regrouped into one stacked column |
| `00db945` | Commission page: payout account column, last 9 weekly periods |
| `70cd45d` | Operations: inap jobs counted and listed under "Sedang Jalan"; Finance SO number shown |
| `65749db` | Activity Log: location/commission event labels, keeps before/after data |

- Not merged into `sync-production-development` yet; that needs an owner decision.

## Known Issues

- NEEDS OWNER DECISION: UI orphaned by earlier commits.
  - The admin-fee note is passed to `ExpenseCheckConfirmModal` but not rendered.
  - The Operational dropping page's upload/UJ-proof modals have no opener.
- Intermittent UI test timeouts under heavy CPU load. In full parallel runs, one or two tests in files these commits didn't touch occasionally fail: `FinanceWorkflowPage` validation modals, `SalesOrderForm` location search, `SalesOrdersPage` DO PNG download. Each passes in isolation, and the suite passes with `--maxWorkers=1`.
- 6 `react-hooks/exhaustive-deps` lint warnings. No TODO/FIXME markers in `src/`.

## Security Concerns

- Demo accounts (`admin@demo.com` etc., password `password`) are created by migrations `202607080004` and `202607160001`, and nothing removes them. NEEDS PRODUCTION VERIFICATION.
- `scripts/clear-dev-database.js` is guarded only by `NODE_ENV` and a localhost check. `docs/PM2.md` sets `NODE_ENV=production` for the PM2 process, but a manually run script uses the shell environment and `.env`. Don't run it on the production server.
- `scripts/convert-legacy-vendor-orders.js --apply` changes every legacy vendor SO in one transaction and has known defects (see `BUSINESS_RULES.md`). Owner approval and a backup are required first.

## Technical Debt

- Very large files: `finance/finance.repository.js` (~6.8k lines), `container-jobs/container-jobs.repository.js` (~4k), `reports/reports.repository.js` (~2k).
- Permission names differ between backend (`sales_order.read`) and frontend (`orders.read`); two maps must be kept in sync manually.
- LEGACY RPUJ approve/reject/transfer endpoints with no UI caller; `rpuj_status` reused as a stage marker.
- Outdated docs: `be-truck-management-system/README.md` (says Supabase auth, only Settings module), `fe-truck-management-system/supabase/`, Phase-1 driver commission docs (Thursday–Wednesday period; code is Sunday–Saturday).
- Some regression tests assert on source text with regexes (brittle to refactors).
- Mixed CRLF/LF line endings and BOMs in some backend files.
- In-memory login rate limiting and actor-status cache (per process; PM2 runs a single process).
- `ecosystem.config.cjs` and the Nginx config are not tracked in git (documented in `docs/PM2.md`).

## Recent Architecture Decisions

Observable from code/migrations:

- Moved from Supabase to own Node API + PostgreSQL with custom token auth (FE defaults `VITE_DATA_SOURCE=api`, `VITE_AUTH_SOURCE=api`).
- Framework-less backend with declarative route table and module layering (routes/controller/service/repository/mapper).
- RPUJ replaced by `container_job_expenses` + Rekening Dropping ledger with daily batches (`202608200001`–`09`).
- Finance-owned SO number (`accurate_so_number`); internal auto SO numbers removed (`202609070001`).
- `lunas` only via recorded payments; payments/revenue lines voided, never deleted; idempotency keys on financial inserts.
- Frozen snapshots (UJ amount, assignment/bank, customer, destination, warehouse location).
- DB-level partial unique indexes guard one active job per driver/vehicle.
- Container destination per job (`202608270001`).
- CURRENT: vendor execution is chosen per container job (`execution_source`, `202609250001`). DEPRECATED: Sales marking an SO as vendor/non-vendor (owner decision 2026-10-02).
- Warehouse locations and transaction snapshots (`202609180001`–`03`); container pickup movements (`202609260001`); pickup sources in assignment history (`202609290001`).
- Production runtime: PM2 single backend process + static frontend (`docs/PM2.md`).

## Owner Decisions / Production Verification

- NEEDS OWNER DECISION: merge `reconcile/local-dev-after-afdebf6` into `sync-production-development`.
- NEEDS OWNER DECISION: "Selesai Inap" opening the editor instead of resuming directly (not implemented). Optional Operations extras: a per-row Vendor badge, a Pickup Movement line in the detail view, passing `masterLocations` to `OperationalForm`.
- NEEDS OWNER DECISION: vendor bills/payables (an older design exists only as a local stash, not in the repository).
- NEEDS PRODUCTION VERIFICATION: number and state of legacy SOs with `is_vendor_order = true`. Then decide whether to fix and run the conversion script.
- NEEDS OWNER DECISION: Sales SO visibility (all SOs readable; writes are owner-only).
- NEEDS OWNER DECISION: retire the LEGACY RPUJ endpoints, and remove or update the Thursday–Wednesday design docs and the unused `buildCommissionWeekOptions`.
- NEEDS OWNER DECISION:
  - should cancellation approval re-check that the job is still `received`?
  - vendor job completion requirements;
  - the `under_review` batch status;
  - the `FinanceWorkflowPage` demo rows (`initialOrderRows`, `initialInvoiceRows`).
- NEEDS PRODUCTION VERIFICATION:
  - the server matches `docs/PM2.md`;
  - demo users;
  - the latest migrations are applied (`schema_migrations`, incl. `202609180001`–`03`, `202609260001`, `202609290001`).

## Build / Test Status

Run 2026-10-02/03 on `reconcile/local-dev-after-afdebf6` at `65749db`. The backend is identical to `afdebf6`, so the backend figures come from the `afdebf6` run.

| Check | Command | Result |
|---|---|---|
| Backend syntax | `cd be-truck-management-system && npm run check` | PASS |
| Backend unit tests | `DATABASE_URL= node --test` | PASS — 287 pass, 0 fail, 2 skipped (289) |
| Frontend lint | `cd fe-truck-management-system && npm run lint` | PASS — 0 errors, 6 warnings |
| Frontend tests | `npx vitest run --maxWorkers=1` | PASS — 497/497 (55 files). Default parallel runs: see Known Issues |
| Frontend build | `npx vite build --outDir <temp>` (keeps `dist/` intact) | PASS |
| Backend integration | `npm test` with `DATABASE_URL` set | NOT RUN — destructive; disposable DB only |
| Utilization chassis SQL | needs `CHASSIS_TEST_DATABASE_URL` | NOT RUN (opt-in) |
| Health check | `GET http://localhost:3000/health` | NOT RUN — server not started |

Notes:
- `npm test` in the backend loads `.env`; if `DATABASE_URL` is set there, the integration test runs and mutates that database. Blank it (`DATABASE_URL=`) for unit-only runs.
- Both failures present at `afdebf6` are fixed on this branch: the commission dropdown date test and the outstanding CSV export test (missing mock).
