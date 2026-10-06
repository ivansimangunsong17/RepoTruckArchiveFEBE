# Database Overview

Source of truth: `be-truck-management-system/src/db/migrations/*.sql` (no ORM, no schema dump). Queries are raw SQL in `*.repository.js`.

## Database Engine

- PostgreSQL (backups use `pg_dump` from PostgreSQL 17 per `.env.example` `PG_DUMP_PATH`).
- Extension: `pgcrypto` (`gen_random_uuid()`); all main PKs are `uuid`.
- Connection: single `pg.Pool` from `DATABASE_URL` (`src/db/client.js`). `DATE` columns are returned as plain `YYYY-MM-DD` strings (type parser override).
- Conventions: `snake_case` columns; `created_at`/`updated_at timestamptz`; soft delete via `archived_at` on master tables; actor stored as names (`created_by_name`, `updated_by_name`) and sometimes user ids (`created_by_user_id`); status columns are `text` + `CHECK` constraints; money `numeric(14,2)` on SOs, `numeric(14,0)` (integer rupiah) on expenses/commissions.

## Core Tables

### sales_orders
Purpose: customer order; parent of container jobs and billing.
PK: `id`. FKs: `customer_id → customers`, `warehouse_location_id → end_users`, `destination_id → destination_locations`, `created_by_user_id/updated_by_user_id → users`.
Important fields: `accurate_so_number` (Finance SO no., unique lower-case where set), `so_number` (legacy/historical), `status` (`waiting_operational|running|completed|cancelled`), `finance_verification_status` (`pending_so|verified`), `billing_status`, `invoice_number`, `invoice_document_status`, `debit_note_number`, `line_items jsonb`, `reference_documents jsonb`, `payment_type`/`payment_term_days`, `cancel_request_*`, `entry_source` (`realtime|historical`), `historical_period`, `is_vendor_order`/`vendor_name`, customer & warehouse snapshot columns, `total_amount`.
Related: container_jobs, sales_order_payments, debit_note_payments, manual_revenue_lines, finance_correction_requests, attachments (`entity_type='sales_order'`).
Used by: sales-orders, finance, reports, archive.

### container_jobs
Purpose: one container trip ("ritasi").
PK: `id`. FKs: `sales_order_id → sales_orders (cascade)`, `driver_id → drivers`, `vehicle_id → vehicles`, `destination_id`/`uj_source_destination_id`/`driver_commission_source_destination_id → destination_locations`, `commission_driver_id`, `repo_released_driver_id/vehicle_id`, `warehouse_location_id → end_users`.
Important fields: `status` (`received|running|repo_stored|completed|cancelled|inap`), `execution_source` (`internal|vendor`), `container_number` (not unique — reuse allowed), `container_type` (free text; the Sales form offers `Dry`, `Reefer`, `Special`, `Isotank`), `container_size` (`20FT|40FT`), `destination`, `assignment_snapshot jsonb`, `running_at`/`completed_at`, document numbers (`spk_number`, `eir_number`, `tila_gatepass_document_number`, …), `repo_*`, `inap_*`, `uj_amount_snapshot`, `has_driver_commission`/`driver_commission_amount`/`commission_status`/`commission_locked_*`, `rpuj_*` (legacy), `entry_source`, `is_backdate_entry`, `cancel_*`.
Related: container_job_expenses, container_job_assignment_history, container_pickup_items, driver_commission_items, attachments (`entity_type='container_job'`).
Used by: container-jobs, finance, driver-commissions, reports, operations.

### container_job_expenses
Purpose: per-job costs (UJ, tolls, reimbursements…); feeds dropping ledger and debit notes.
PK: `id`. FKs: `container_job_id → container_jobs (cascade)`, `sales_order_id`, `driver_id`, `proof_attachment_id → attachments`.
Important fields: `category`, `expense_group` (`operational|reimbursement`), `amount`, `payment_status`, `finance_check_status`, `source` (`manual`, `auto_uj_order`, legacy), `source_ref_id`, `input_source` (CHECK dropped in `202610010006`; values `operational|finance|system`), `idempotency_key` (unique), `admin_fee_amount`.
Related: operational_fund_transactions, container_job_expense_transfer_proofs.

### operational_fund_requests / operational_fund_transactions / operational_fund_batches
Purpose: Rekening Dropping. Requests (`submitted|approved|rejected|transferred|cancelled`); ledger transactions (`credit|debit|adjustment`, `posted|void`, category incl. `dropping_in`, `container_job_expense`, carry-forward, admin transfer); daily batches (`open|under_review|closed`, one per `batch_date`).
Key FKs: `transactions.fund_request_id`, `transactions.container_job_expense_id`, `transactions.batch_id`. Unique guards prevent double debit per expense and double carry-forward per batch.
View: `operational_fund_daily_ledger`.

### customers, end_users, drivers, vehicles, kir_heads, kir_chassis, depots, terminals, destination_locations, stid_masters
Purpose: master data served by `/api/master/:resource` (mapping in `modules/master/master.mapper.js`: `customers`, `end-users`, `drivers`, `trucks`→`vehicles`, `kir-heads`, `kir-chassis`, `depots`, `terminals`, `destinations`→`destination_locations`, `stids`).
Notable: `vehicles.default_driver_id → drivers`, `vehicles.current_chassis_id → kir_chassis`, `vehicles.unit_kind`, `vehicles.operational_status` (`Aktif`, `Bertugas`, `Maintenance`, `Tidak Aktif`); `drivers.operational_status` (`Aktif`, `Bertugas`, `Cuti`, `Tidak Aktif`), bank/e-money fields, `nik` unique; `destination_locations.uj_20ft/uj_40ft`, `driver_commission_20ft_amount/40ft_amount`; `end_users.destination_id`, coordinates; `depots`/`terminals` `google_maps_url`, `latitude`, `longitude` (nullable, `202610060001`).

### driver_commission_batches / _payments / _items / _payment_deductions
Purpose: weekly commission payout. Batch (`draft|submitted|approved|rejected|paid`, `period_start/end`, `revision_count`) → payment per driver (`bank|emoney`, `pending|paid`, proof attachment) → items per container job (unique active per job) → deductions (`active|void`).

### sales_order_payments / debit_note_payments / manual_revenue_lines
Purpose: customer receivables. Payments have `idempotency_key` (unique) and void columns (`voided_at`, `void_reason`). Revenue lines: `charge_type`, `status draft|active|void`.

### finance_correction_requests
Purpose: requests to change Finance SO/invoice numbers (`so_number|invoice_number`, `pending|approved|rejected|applied`), one pending per order+type.

### attachments, vehicle_documents, storage_trash
Purpose: file metadata (polymorphic `entity_type` + `entity_id`, `category`, `storage_path`); vehicle-specific documents; trash records for restore (`source_table` `attachments|vehicle_documents`).

### users, activity_logs, system_settings, schema_migrations
`users` (email unique, `password_hash`, `role`, `status`); `activity_logs` (`actor_name`, `actor_role`, `action`, `target`, `metadata jsonb`); `system_settings` (key → `jsonb`).

### Other
`container_job_assignment_history` (`change_source`: `operational`, `admin_correction`, and since `202609290001` `repo_pickup`, `repo_combo_pickup`), `vehicle_assignment_history`, `container_pickup_movements` + `container_pickup_items` (repo pickups, `single|combo_2x20`), `historical_entry_periods` (`draft|locked`), `utilization_notes`, `utilization_chassis_corrections`, `master_viewer_notes`, `hino_api_tokens`, `hino_api_usage_logs`, `hino_vehicles`, `hino_vehicle_links`, `hino_vehicle_positions`.

## Relationship Overview

```
customers ─┐            end_users (warehouse) ─┐   destination_locations (UJ, commission rates)
           ↓                                    ↓          ↓
        sales_orders ──→ sales_order_payments / debit_note_payments / manual_revenue_lines / finance_correction_requests
           ↓ (cascade)
        container_jobs ──→ drivers, vehicles (→ kir_chassis, default driver)
           ↓                ├→ container_job_assignment_history
           ↓                ├→ container_pickup_items → container_pickup_movements
           ↓                └→ driver_commission_items → driver_commission_payments → driver_commission_batches
        container_job_expenses ──→ operational_fund_transactions ──→ operational_fund_batches
                                         ↑ operational_fund_requests
attachments (entity_type/entity_id: sales_order, container_job, operational_fund_*, …) → storage_trash
```

## Important Constraints

- `uq_container_jobs_driver_active` / `uq_container_jobs_vehicle_active`: one active (non completed/cancelled/repo_stored), non-historical job per driver/vehicle.
- `sales_orders_accurate_so_number_unique` on `lower(accurate_so_number)`.
- `container_jobs.container_number`: NOT unique (dropped in `202607200004`).
- Master uniqueness via partial unique indexes `where archived_at is null`.
- `uq_driver_commission_batches_active_period`, `uq_driver_commission_items_active_job`, `uq_driver_commission_payments_batch_driver`.
- Idempotency keys on `container_job_expenses`, `sales_order_payments`, `debit_note_payments`.
- `uq_container_job_expenses_auto_uj_order` on `(source, source_ref_id)` for auto UJ.
- Multi-step writes use `withTransaction()` (`BEGIN/COMMIT/ROLLBACK`); assignment uses `SELECT … FOR UPDATE` style row locks on drivers/vehicles.

## Migration Strategy

- Files: `be-truck-management-system/src/db/migrations/YYYYMMDDNNNN_description.sql`, applied in sorted filename order by `npm run db:migrate` (`src/db/runMigrations.js`); each file runs in its own transaction and is recorded in `schema_migrations(version)`.
- Forward-only (no down migrations). Migrations are written idempotently (`if not exists`, `do $$ … duplicate_object`, `on conflict do nothing`) and often include data backfills.
- Two files share a timestamp prefix in some cases (e.g. `202607140001_*`); ordering is then alphabetical by full name.
- Seeds: `npm run db:seed` (`src/db/seeds/`).
- Demo users are created by migrations, not seeds, so `db:migrate` on any database (including production) creates them:
  - `202607080004_users_auth_support.sql`: `admin@`, `sales@`, `operational@`, `pengamat@demo.com`.
  - `202607160001_seed_finance_user.sql`: `finance@demo.com`.
  - All have password `password` (unsalted SHA-256, accepted by `verifyPassword` as legacy) and status `Aktif`, and use `on conflict (email) do update`, so they're reactivated if the migration re-runs on a fresh `schema_migrations`.
  - No later migration or app code disables or removes them. The dev script `scripts/clear-dev-database.js` refuses to run when `NODE_ENV=production` or the database host is not localhost.
  - NEEDS PRODUCTION VERIFICATION: whether these accounts exist or are active in production. This is a security risk if they are (an admin account with a known password).
- LEGACY: `fe-truck-management-system/supabase/migrations/` belong to the old Supabase phase and are not applied by the backend.

## Data Ownership / Lifecycle

| Record | Created by | Updated by |
|---|---|---|
| sales_orders | Sales (Admin for historical) | Sales (until locked), Finance (SO no., invoice fields), status derived from jobs |
| container_jobs | Created with SO (one per D20/D40 qty); synced on SO edit (`sales-orders.container-sync.js`) | Operational (assignment/status/docs), Sales (docs only), Admin correction |
| container_job_expenses | Operational/Finance manually; system (auto UJ on job start) | Finance reconciliation; Operational before Finance check |
| operational_fund_* | Operational (requests), Finance (deposits, approval, batch close) | Admin (reopen) |
| payments / revenue lines / debit notes | Finance/Admin | void only (rows retained) |
| driver_commission_* | Operational/Sales/Admin submit | Finance approve/pay; Admin void |
| activity_logs | Backend controllers (`safeRecordActivityLog`) and `POST /api/activity-logs` | never |

## Open Items

- NEEDS OWNER DECISION: `operational_fund_batches.status = 'under_review'` is allowed by the constraint but not set by code.
- Exact current `vehicle_documents.document_type` list (expanded in `202607200001`); not re-checked.
- NEEDS PRODUCTION VERIFICATION: each environment has applied the latest migrations, including `202609180001`–`202609180003` (warehouse locations), `202609260001` (container pickups) `202609290001` (assignment-history change sources) and `202610060001` (Terminal/Depo Maps fields). Check `schema_migrations`.
