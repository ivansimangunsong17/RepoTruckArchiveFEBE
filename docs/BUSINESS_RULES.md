# Business Rules

Rules below are taken from backend services/repositories (the enforcement point). Paths are relative to `be-truck-management-system/src/modules/` unless stated. Glossary: **SO** = Sales Order, **ritasi** = container job (one trip), **UJ** = uang jalan (driver journey money), **RPUJ** = legacy UJ request, **Rekening Dropping** = daily operational fund account, **titip/repo** = container stored at a depot, **inap** = overnight stay, **OTS** = outstanding.

Cross-cutting rules:

- CURRENT: **Admin correction mode** — payload `adminCorrectionMode: true` + `adminCorrectionReason` (≥8 chars), admin only. It bypasses operational/finance locks and is audited (`ADMIN_CORRECTION_CONTAINER_JOB` etc.). Without the flag, admins hit the same locks as other roles. Details: `be-truck-management-system/docs/ADMIN_CORRECTION_WORKFLOW.md`.
- CURRENT: **Historical entry** (`entrySource: 'historical'` + `historicalPeriod`) is admin-only (`historical_entry.manage`). Edits are blocked when the period in `historical_entry_periods` is `locked`. Historical records skip auto UJ, document requirements, and the "one active job per driver/truck" constraint.
- CURRENT: **Backdate/"ritasi susulan"** (`isBackdateEntry` + `backdateReason` ≥8 chars) is allowed for normal roles; like historical, it skips auto UJ/dropping and completion document checks and does not mark driver/truck "Bertugas".
- CURRENT: Snapshots are frozen at creation: customer data on the SO, warehouse location, container destination, driver/truck/bank assignment snapshot, and UJ amount (`uj_amount_snapshot`). Routine updates must not refresh them from master data.

## Sales Orders

`sales-orders/sales-orders.service.js`, `sales-orders.repository.js`, `sales-orders.controller.js`

### Current Rules
- Create: only role `sales` (non-historical). Admin may create only historical SOs (`SALES_ORDER_CREATE_SALES_ONLY`).
- Required: `customer`, `origin`, `destination`, and ≥1 container or line item.
- Line item services: `Jasa Angkut D20`, `Jasa Angkut D40`, `Bon Muat/Bongkar`, `Tila/Gatepass`, `Handling`, `Jasa Lainnya`. D20/D40 price must be > 0; `Jasa Lainnya` needs notes. Each D20/D40 qty creates one container job (20FT/40FT).
- Container type options in the Sales form (`CONTAINER_TYPE_OPTIONS` in `SalesOrderForm.jsx`): `Dry`, `Reefer`, `Special`, `Isotank`. These are frontend options only; the backend stores the text without an enum check. `Reefer` affects UJ (see Operational Costs).
- Payment type `cash` or `tempo`; tempo requires `paymentTermDays ≥ 1`.
- CURRENT — write access: Sales can only update, cancel, request cancellation of, or change invoice delivery for SOs they created (`ensureCanAccessSalesOrder`: `createdByUserId`, falling back to creator name). The frontend mirrors this for button visibility only (`isSalesOrderOwner` in `SalesOrdersPage.jsx`).
- CURRENT — read access: Sales can list and open **all** SOs. `GET /api/sales-orders` and `GET /api/sales-orders/:id` need only `sales_order.read` and do no owner check. `findSalesOrdersPage` supports `ownerUserId`/`ownerName` filters, but `listSalesOrders` never passes them. NEEDS OWNER DECISION: whether Sales should see only their own SOs.
- New SOs start with no SO number: `finance_verification_status = 'pending_so'`. The working SO number is `accurate_so_number`, entered by Finance. DEPRECATED: auto-generated internal `SO-ARM-…` numbers (cleared by migration `202609070001`).
- Locks for Sales once Finance assigned the SO number or RPUJ was sent: Sales may still revise only if all containers are `received`, no invoice number/invoice PDFs, no active expenses, no debit-note document, no active payments, and no commission items (`SALES_ORDER_ADVANCED_PROCESSING_LOCKED`). Admin needs correction mode (`SALES_ORDER_FINANCE_NUMBER_LOCKED_CORRECTION_REQUIRED` / `…_RPUJ_LOCKED_…`).
- `cancelled` SOs cannot be edited; `completed` SOs cannot be edited (exception: LEGACY vendor SOs, below).
- CURRENT — vendor execution is handled by the container-job vendor workflow (`execution_source`, see Container Jobs), not by Sales.
- DEPRECATED — Sales marking an SO as vendor/non-vendor (owner decision 2026-10-02). The form has no "Dikerjakan oleh Vendor" checkbox, and `toSalesOrderDb` always writes `is_vendor_order = false`, `vendor_name/vendor_note = null`. Every SO creates and reconciles container jobs normally.
- LEGACY — SOs saved earlier with `is_vendor_order = true` are still read: the "Vendor" badge and list filter (`vendorFilter`), exclusion from dashboard/report revenue and missing-SO-number counts (`reports.repository.js`), and exemption from the completed-edit lock and the Sales lock.
  - Editing such an SO saves it as non-vendor and reconciles container jobs from its line items as `internal` jobs.
  - The conversion script `scripts/convert-legacy-vendor-orders.js` is committed (no npm alias; dry-run audit unless `--apply`). With `--apply` it converts every flagged SO to `execution_source = 'vendor'` jobs in one transaction.
  - Known risks of the script as written; review before any `--apply`:
    - It plans `max(do20+do40, quantity)` jobs, so non-container line items (Handling, Bon Muat, …) produce extra jobs.
    - Cancelled SOs receive `received` jobs.
    - It sets every existing job on the SO to vendor and clears driver/truck.
    - Completed SOs get `completed_at = so.updated_at`.
    - New jobs default to `entry_source = 'realtime'`.
    - It writes no activity log.
    - Converted completed SOs become billable in Finance (vendor jobs count as finance rows) and are no longer excluded from report revenue.
  - NEEDS PRODUCTION VERIFICATION: how many legacy vendor SOs exist, and in which state (completed, cancelled, open with or without jobs).
  - NEEDS OWNER DECISION: convert, fix the script first, or leave closed records as they are.
- CURRENT — warehouse location (optional, `warehouseLocationId` → `end_users`): when chosen it must exist, be `Aktif`, and belong to the SO's destination (`WAREHOUSE_LOCATION_NOT_FOUND | _INACTIVE | _DESTINATION_MISMATCH`). Name/address are snapshotted and re-snapshotted only when the location actually changes. Container-job location snapshots follow SO changes only while the job is `received`. Location changes are audited separately.

### Status Flow (operational, derived — `refreshOrderStatus`)
```
waiting_operational → running → completed
                 ↘ cancelled (when all container jobs are cancelled)
```
Derived from container jobs: all active jobs `completed` → `completed`; any `running`/`repo_stored`/`completed` → `running`; otherwise `waiting_operational`.

### Finance verification
`pending_so → verified` (Finance enters `accurate_so_number`; unique case-insensitive; cannot be re-entered — changes go through Finance Corrections).

### Billing status (`sales-orders.billing-status.js`)
```
belum_invoice → belum_dikirim → belum_diterima / belum_dikonfirmasi → menunggu_pembayaran → lunas
                                                      revisi_dispute (side state)
```
- Any status other than `belum_invoice` requires order `completed` and an invoice number.
- `PATCH /:id/invoice-delivery-status` (finance/admin): requires completed order, invoice number, and both `invoicePdf` + `taxInvoicePdf` attachments plus a delivery method when marking as sent.
- `lunas` cannot be set manually; only a recorded payment that clears outstanding sets it. If billing later increases (revenue correction), status drops back to `menunggu_pembayaran`.
- Invoice document status: `belum_upload → siap_dikirim → terkirim`.

### Cancellation
- Direct cancel (`PATCH /:id/cancel`, `DELETE /:id`): only when all jobs are `received` and no active (non-`batal`) expenses. Cascades `received` jobs to `cancelled` and releases idle drivers/trucks.
- Request/review: `cancel_request_status: none → submitted → approved|rejected`. Request by SO owner; review by `operational` or `admin`.

### Permissions
- Sales: create/update/cancel own SOs, upload documents. Operational/Admin: cancellation review. Finance/Admin: invoice delivery status. Observer: read only.

## Container Jobs (Ritasi)

`container-jobs/container-jobs.service.js`, `container-jobs.repository.js`

### Status Flow
```
received → running → completed
             ├→ inap (reason ≥8) → running | completed | cancelled
             └→ repo_stored (titip) → pickup → received|running → completed
received/running → cancelled
```
- Allowed values: `received, running, repo_stored, completed, cancelled, inap`.
- Operational/Admin (without correction) cannot: change status of `completed`/`cancelled` jobs, move `running → received`, or cancel a job with repo history.
- CURRENT — `completed → cancelled`: blocked for everyone except Admin correction mode. The service check `ensureOperationalCanChangeStatus` (`container-jobs.service.js`) lets it through, but `updateContainerJob` in `container-jobs.repository.js` then rejects it with `409 CONTAINER_JOB_COMPLETED_CANNOT_CANCEL` unless `allowAdminCorrection` is set (guard in place since commit `c47621b`). Cancelling any job also requires no active (non-`batal`) expenses (`CONTAINER_JOB_CANCEL_HAS_ACTIVE_EXPENSE`).
- CURRENT — cancellation request path: requests are only accepted while the job is `received` (`ensureCanRequestCancellation`). Approval (`reviewContainerJobCancellation`) checks only `cancel_request_status = 'submitted'` and active expenses, not the job's current status. Nothing blocks a job with a pending request from progressing. NEEDS OWNER DECISION: should approval re-check that the job is still `received`?
- `repo_stored` requires: status `running`, container number, driver, truck, depot (`repoLocation`), reason ≥8, EIR Titip number, condition `empty|loaded`, uploaded `repoEirDocument`. A container can be stored only once. Pickup requires a new driver+truck (`/repo-pickups/single/:id`, `/repo-pickups/combo-2x20`).
- Completion (realtime): container number, driver, truck, start and end time (end ≥ start), SPK number or `spkDocument`, `eirDocument` attachment, and EIR Titip if previously stored.
- Repo timeline: `running_at` is the original-leg start and is never replaced by the Repo pickup or by the completion form once `repo_stored_at` is set (only Admin correction can change it). The Repo leg is `repo_picked_up_at` / `container_pickup_movements.started_at`. Completion of a Repo-picked job also requires `completed_at ≥ max(running_at, repo_picked_up_at, movement.started_at)` (`409 CONTAINER_JOB_COMPLETION_INVALID_TIME`, checked before anything is saved; `repo-pickup-lifecycle.js`). Movement reconciliation uses only linked-job completion times ≥ `started_at` (else `now()`) and never writes `movement.completed_at < started_at`.
- One active job per driver and per truck (status not in completed/cancelled/repo_stored, realtime only) — enforced by row locks and partial unique indexes.
- Assignment marks driver/vehicle `Bertugas`; they return to `Aktif` when no active jobs remain.
- After a job is `running`, changing driver/truck requires `assignmentChangeReason`; after `completed`/`cancelled` or RPUJ `paid` it is locked. Changes are recorded in `container_job_assignment_history` with `change_source` `operational`, `admin_correction`, `repo_pickup` or `repo_combo_pickup` (the last two added by migration `202609290001` for container pickups).
- Operations page: the "Sedang Jalan" tab requests `status=active_journey` (backend returns `running` + `inap`), and its count includes inap jobs. The separate "Inap" tab remains. "Selesai Inap" resumes the job directly.
- Container number is locked once running/completed/cancelled/stored (first-time fill is allowed while active).
- Documents locked after completion; timeline (`runningAt`/`completedAt`) editable only by Admin correction after completion.
- Driver commission on a job is locked after completion/cancel or RPUJ approved/paid.
- Document-only actors can update documents without touching status/assignment/UJ. Sales is always treated as document-only when it has `container_job.document.update` (explicit role check in `isDocumentOnlyActor`, service and controller).
- Repo shipments (`shipment_type` normalized to `repo_*`, `isRepoShipment`): no driver commission and no reefer UJ surcharge.
- CURRENT — vendor execution (`execution_source = 'internal' | 'vendor'`, migration `202609250001`) is the only vendor mechanism.
  - Set per container job in the Operational form.
  - Vendor jobs: driver/truck cleared; no auto UJ, Rekening Dropping, internal SPK, assignment checks or assignment history (`ensureInternalExecution`); no driver commission; cannot use `repo_stored` / `inap`.
  - Excluded from commission, fleet availability and utilization queries; still counted in the SO's fulfilment status.
- Cancellation request by SO owner; Sales cannot request once RPUJ was sent (`CONTAINER_JOB_RPUJ_LOCKED_ADMIN_ONLY`). Review by operational/admin.
- Reset misassigned job (`/reset-assignment`): operational/admin, reason ≥8.

## Operational Costs / UJ (`container_job_expenses`)

- Categories: `uj_awal, top_up_uj, tol, parkir, bongkar, muat, lolo, inap, terminal_depo, tunggu, uang_admin_tf, reimbursement, lainnya`. Group: `operational` or `reimbursement` (required). Amount > 0, rounded to integer rupiah.
- Payment status: `belum_dibayar, pending_pembayaran, sudah_dibayar, batal, ditahan_sopir, dipakai_job_berikutnya`. Operational-created expenses are forced to `belum_dibayar`; Finance may set status.
- Finance check status: `belum_dicek → sudah_dicek | perlu_klarifikasi (note required) | dikoreksi`.
- Edit before Finance check is allowed; **move to another job** and **void** are not available to Operational.
- **Auto UJ**: when an internal, realtime, non-backdate job first becomes `running`/`completed` and has no manual `uj_awal` (and RPUJ not approved/paid), the system creates `uj_awal` (`source = 'auto_uj_order'`, `sudah_dibayar`, `belum_dicek`) using the frozen UJ snapshot or the destination master rate (plus a fixed reefer surcharge of 100,000 when `container_type` contains "reefer" and the shipment is not a repo shipment; the frontend recommendation shows the same, `REEFER_UJ_SURCHARGE`), and debits the dropping ledger. It is not re-posted when its ledger entry already sits in a closed batch.
- Reimbursement expenses feed Debit Notes (see Finance).
- Multiple transfer proofs per expense with optional admin fee (`container_job_expense_transfer_proofs`); insufficient dropping balance is rejected.
- RPUJ (`container_jobs.rpuj_status`: `pending, submitted, approved, paid, rejected`):
  - CURRENT (legacy name, still written): saving the Operational form's "Biaya Perjalanan & SPK" phase sends `rpujStatus: 'submitted'` (`OperationalForm.jsx` `forceRpujStatus`), and `normalizeRpujStatusForOperational` lets Operational set only `pending`/`submitted`. The Operations page labels these stages "Belum Dicatat / Biaya Tercatat / Dicek Finance / Bukti Tercatat". `submitted` locks the SO for Sales and blocks Sales cancellation requests.
  - LEGACY: `approved`/`paid`/`rejected` are set only by `/api/finance/rpuj-requests/:id/{approve,reject,transfer-proof}` (`finance.repository.js` `approveRpujRequest`, `rejectRpujRequest`, `markRpujTransferUploaded`). No frontend page calls these; the functions in `financeService.js` are exported but unused, and `FinanceWorkflowPage.test.jsx` asserts `fetchFinanceRpujRequests` is not called. Locks keyed on `approved`/`paid` therefore apply in practice only to records that reached those states earlier (or via direct API calls).
  - NEEDS OWNER DECISION: whether to retire the RPUJ endpoints. The backend integration test still exercises them.

## Daily Dropping (Rekening Dropping / Operational Fund)

`finance/finance.service.js`, `finance.repository.js`, migrations `202608200001`–`202608200009`

- Operational requests funds: `submitted → approved | rejected (note required) → transferred` (also `cancelled`). Finance uploads transfer proof.
- Finance deposits: append-only credits; a transfer proof file is required; multiple deposits per day allowed.
- Ledger `operational_fund_transactions`: `credit | debit | adjustment`, `posted | void`. Amount > 0.
- Daily batches (`operational_fund_batches`, one per date): `open → closed`. Close requires every debit in the batch to be finance-checked (`OPERATIONAL_FUND_BATCH_HAS_UNCHECKED_DEBIT`); remaining balance is carried forward to the next day. `under_review` exists in the DB constraint but no code path sets it (NEEDS OWNER DECISION).
- Reopen: admin only, reason required; voids the carry-forward; blocked if the next day's batch is already closed.

## Finance / Invoice

- Invoice number: Finance/Admin, only for `completed` SOs, set once (`INVOICE_NUMBER_ALREADY_SET`), unique. Changes go through Finance Corrections.
- Invoice documents: PDF only; types `invoicePdf`, `taxInvoicePdf`, `debitNotePdf` (re-upload replaces).
- Payments (`sales_order_payments`): Finance/Admin; requires completed SO with invoice number; cannot exceed recomputed outstanding; idempotency key checked before balance validation. Void keeps the row (`voided_at`, reason required) — permission held by Finance and Admin.
- Customer bulk payment (`POST /api/finance/customer-payments`): one transfer allocated across invoices; allocations cannot exceed transfer total.
- Manual revenue lines: types `inap, waiting_charge, extra_trip, storage, other`; status `draft|active|void`; Finance/Admin; cannot change once invoice is paid; void needs reason.
- Debit Notes: one per SO, from reimbursement expenses; separate from trucking OTS; own number (unique) and payments with same rules as invoice payments.
- Finance Corrections (`finance_correction_requests`): types `so_number`, `invoice_number`; `pending → approved|rejected` (`applied` also allowed by constraint); only one pending request per SO/type; approval permission is admin-only.

## Driver Commissions

`driver-commissions/`; design notes in `be-truck-management-system/docs/DRIVER_COMMISSION_*.md`

- Job-level commission set by Operational (`has_driver_commission`, amount; default from destination by size 20/40FT). Commission is not part of UJ.
- CURRENT — period is a **Sunday–Saturday** week (WIB date keys). Enforced at submit: `submitDriverCommissionBatch` rejects any period where `isCommissionWeekPeriod` is false ("wajib memakai periode Minggu sampai Sabtu"). The frontend period pickers (`DriverCommissionPage.jsx`, `DriverCommissionOperationalPage.jsx`) build Sunday-start weeks. Introduced by commit `c98f43c` (2026-09-21, "use Sunday to Saturday periods").
- LEGACY — Thursday–Wednesday references remain in `be-truck-management-system/docs/DRIVER_COMMISSION_WEEKLY_WORKFLOW_PHASE1.md` and `DRIVER_COMMISSION_PERIOD_REPORT_AUDIT.md`, and in `buildCommissionWeekOptions` (`fe/src/pages/reports/ReportsPage.jsx`, `getDay() !== 4`). That function is called only by `ReportsPage.test.js`, not by any page. Phase-1 operating days (Operational submits Thursday, Finance pays Friday) are not enforced in code; the Finance page text says "pembayaran mingguan target Rabu".
- Batch: `draft → submitted → approved | rejected → paid`; one active batch per period; revisions tracked (`revision_count`). Submit: admin/operational/sales; approve/reject: finance/admin; pay & proof: finance/admin; void payment: admin only (reason required).
- Commission recipient and payout account come from the job's commission snapshot (`commission_driver_id/name/snapshot`), falling back to the assignment snapshot and then the driver master. If a job has no driver ID, the recipient is matched by name to an active driver's `name`, `nickname` or `bank_account_holder`.
- Payments per driver per batch (`bank | emoney`, `pending | paid`). Deductions (`hutang_sopir, kasbon, penalti, lainnya`) cannot exceed gross and are locked once paid.
- Job commission status: `pending, with_commission, without_commission, needs_review`; late jobs into already-paid periods are added to the current batch flagged `is_backdate_commission`.

## Attachments / Documents

- Upload as base64 JSON; allowed mime/extension from env (pdf/jpg/jpeg/png), file signature checked, size ≤ `MAX_UPLOAD_SIZE_MB` (default 5). Exception: Finance billing documents (Invoice, Faktur Pajak, Debit Note via `POST /api/finance/invoices/:id/documents/:documentType`) are PDF-only, ≤ `FINANCE_DOCUMENT_MAX_UPLOAD_SIZE_MB` (default 20), and stored uncompressed.
- Stored under `UPLOAD_DIR` in folders by entity (`Sales Order/<…>/01 - Dokumen Sales | 02 - Dokumen Container | 03 - Dokumen Finance`, `Master Data/…`) — see `attachments/attachment-storage.js`.
- Delete moves file + record to `storage_trash` (retention `FILE_TRASH_RETENTION_DAYS`, default 30); admin can restore/purge (`storage.manage`).
- Vehicle documents types: `KIR_HEAD, KIR_BUNTUT, STNK, PAJAK, ASURANSI, OTHER` (extended in migration `202607200001`).

## Other Domains

- **Master data**: soft delete via `archived_at`; unique names/codes enforced by partial indexes (active rows only). For Sales, `end-users` responses omit address, Google Maps URL and coordinates (`sanitizeMasterResultForActor`). Destinations hold UJ rates and driver commission by size.
- **Fleet assignment**: truck default driver and current chassis; changes logged in `vehicle_assignment_history` (`source: fleet_assignment | master_truck`).
- **Users**: statuses `Aktif` / non-active; inactive users are rejected on every request (fresh status check per request, short cache). Default role on create: `pengamat`.
- **Backups**: while a storage backup lock exists, all mutations return 503.

## Open Items
- NEEDS OWNER DECISION: Sales SO visibility (all vs. own). Whether cancellation approval should re-check job status. Retiring the RPUJ endpoints. Updating or removing the Thursday–Wednesday design docs and `buildCommissionWeekOptions`.
- NEEDS OWNER DECISION: vendor job completion requirements (vendor jobs still go through `requireCompletedJobReady`, which checks driver/truck; not investigated further).
- NEEDS OWNER DECISION: `operational_fund_batches.status = 'under_review'` is allowed by the constraint but no code sets it.
