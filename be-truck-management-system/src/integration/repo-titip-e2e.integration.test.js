// End-to-end Titip -> Ambil Titip: SO -> Container Job -> Running sopir A -> Titip (Biaya Titip/Repo
// Rp300.000 sebagai item Reimbursement SO) -> Ambil Titip sopir B -> Completed -> Komisi A -> UJ Repo B
// -> Penagihan customer (invoice utama + Debit Note), termasuk Debit Note yang sudah terbit dan koreksi
// penerima komisi oleh Admin.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard.
// Fixture dikenali dari prefix (SO-E2E-*, truck E2E-*, sopir bank 'BANK E2E') dan dihapus sebelum
// dan sesudah suite.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('repo titip e2e integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  // Lampiran dokumen fixture ditulis ke folder sementara, bukan storage uploads development.
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'atms-e2e-uploads-'));
  process.env.UPLOAD_DIR = uploadDir;
  const { query, closePool } = await import('../db/client.js');
  const { createSalesOrder } = await import('../modules/sales-orders/sales-orders.repository.js');
  const {
    correctContainerJobCommissionRecipient,
    findAssignmentHistory,
    pickupSingleRepoContainerJob,
    updateContainerJob,
    updateDroppingExpenseBeforeFinanceCheckRecord,
  } = await import('../modules/container-jobs/container-jobs.repository.js');
  const {
    approveDriverCommissionBatch,
    createDriverCommissionBatch,
    findEligibleDriverCommissions,
  } = await import('../modules/driver-commissions/driver-commissions.repository.js');
  const {
    getInvoiceOrderDetail,
    invoiceOrdersCte,
    updateDebitNoteNumber,
    updateInvoiceNumber,
  } = await import('../modules/finance/finance.repository.js');
  const { getUtilizationTripRows } = await import('../modules/reports/utilization-trips.repository.js');
  const { createAttachment } = await import('../modules/attachments/attachments.service.js');
  const { getContainerJobExpensesReconciliationPage } = await import('../modules/finance/finance.repository.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(3, '0')}`;
  const nextContainerNumber = () => `E${tag}${String(++seq).padStart(4, '0')}`;
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const jakartaDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(iso));
  // Batch komisi diuji pada periode tahun jauh supaya tidak bercampur ritasi lain di scratch.
  const BATCH_PERIOD = { periodStart: '2033-03-06', periodEnd: '2033-03-12' };

  async function cloneRow(table, templateSql, overrides) {
    const result = await query(
      `insert into ${table}
       select (jsonb_populate_record(null::${table}, to_jsonb(t) || $1::jsonb)).*
       from (${templateSql}) t returning *`,
      [JSON.stringify({ id: crypto.randomUUID(), ...overrides })],
    );
    assert.ok(result.rows[0], `Template ${table} tidak ditemukan -- jalankan seed sintetis di database scratch.`);
    return result.rows[0];
  }

  async function templateCustomer() {
    const row = (await query("select customer_name from sales_orders where status <> 'cancelled' and nullif(btrim(customer_name), '') is not null order by created_at limit 1")).rows[0];
    assert.ok(row, 'Template customer tidak ditemukan.');
    return row.customer_name;
  }

  async function createDriver(label, { withAccount = true } = {}) {
    const code = nextTag();
    return cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
      name: `SOPIR E2E ${label} ${code}`, nickname: null, nik: null, operational_status: 'Aktif', archived_at: null,
      payment_method: 'bank', bank_name: 'BANK E2E', bank_account_number: withAccount ? `ACC-${label}-${code}` : null,
      bank_account_holder: `SOPIR E2E ${label} ${code}`, emoney_number: null,
    });
  }

  async function createVehicle(label) {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} ${label}`, unit_code: `E2E-${code}`, engine_number: null, kir_number: null, vin: null,
      container_size: '20FT', current_chassis_id: null, operational_status: 'Aktif', archived_at: null,
      default_driver_id: null, default_driver_name: null,
    });
  }

  // SO lewat jalur pembuatan SO sungguhan, sudah diverifikasi Finance, satu container 20FT.
  async function createVerifiedSalesOrder(customer) {
    const code = nextTag();
    const order = await createSalesOrder({
      soNumber: `SO-E2E-${code}`, accurateSoNumber: `ACC-E2E-${code}`, financeVerificationStatus: 'verified',
      customer, tripDate: jakartaDate(hoursAgo(80)), origin: 'Asal E2E', destination: 'Tujuan E2E',
      price: 2500000, quantity: 1, createdBy: 'Integration Test', containers: [{ size: '20FT' }],
    });
    assert.equal(order.containers.length, 1, 'SO harus membuat tepat satu Container Job');
    return order;
  }

  // Running sopir A -> Titip, lewat updateContainerJob sungguhan.
  async function runAndStoreWithDriverA(order, driverA, truckA) {
    const jobId = order.containers[0].id;
    const runningAt = hoursAgo(72);
    const storedAt = hoursAgo(70);
    const containerNumber = nextContainerNumber();
    await updateContainerJob(jobId, {
      status: 'running', containerNumber, driverId: driverA.id, vehicleId: truckA.id,
      driver: driverA.name, plateNumber: truckA.plate_number, runningAt,
      hasDriverCommission: true, driverCommissionAmount: 100000, driverCommissionEdited: true,
      updatedBy: 'Ops E2E',
    });
    await updateContainerJob(jobId, {
      status: 'repo_stored', repoStoredAt: storedAt, repoLocation: 'Depo E2E', repoEirNumber: `EIR-E2E-${tag}`,
      repoReason: 'Menunggu jadwal bongkar', updatedBy: 'Ops E2E',
    });
    return { jobId, containerNumber, storedAt };
  }

  async function pickupByDriverB(jobId, driverB, truckB) {
    return pickupSingleRepoContainerJob(jobId, {
      pickupConfirmed: true, repoPickedUpAt: hoursAgo(30), driverId: driverB.id, vehicleId: truckB.id,
      updatedBy: 'Ops E2E', repoUjAmount: 150000,
    });
  }

  const PDF_BASE64 = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% ATMS E2E fixture\n%%EOF\n').toString('base64')}`;

  // Dokumen wajib penyelesaian job yang pernah dititip: SPK, EIR, dan EIR Titip -- lewat layanan
  // lampiran sungguhan (file tersimpan + baris attachments).
  async function attachRequiredDocuments(jobId) {
    for (const category of ['spkDocument', 'eirDocument', 'repoEirDocument']) {
      await createAttachment({
        entityType: 'container_job', entityId: jobId, category, fileName: `${category}-${tag}.pdf`,
        fileBase64: PDF_BASE64, mimeType: 'application/pdf', uploadedByName: 'Ops E2E',
      });
    }
  }

  // Penyelesaian lewat jalur sungguhan (requireCompletedJobReady), bukan mengubah status langsung.
  async function complete(jobId) {
    await assert.rejects(
      updateContainerJob(jobId, { status: 'completed', completedAt: hoursAgo(24), updatedBy: 'Ops E2E' }),
      { code: 'CONTAINER_JOB_COMPLETION_INCOMPLETE' },
      'tanpa dokumen wajib, job belum boleh selesai',
    );
    await attachRequiredDocuments(jobId);
    const saved = await updateContainerJob(jobId, { status: 'completed', completedAt: hoursAgo(24), updatedBy: 'Ops E2E' });
    assert.equal(saved.status, 'completed');
    return saved;
  }

  async function invoiceRow(salesOrderId) {
    return (await query(`${invoiceOrdersCte()} select id, billing_amount, billing_items from invoice_orders where id = $1`, [salesOrderId])).rows[0];
  }
  const storageFees = async (salesOrderId) => (await query(
    "select * from container_job_expenses where sales_order_id = $1 and source = 'repo_storage_fee' and payment_status <> 'batal' order by created_at",
    [salesOrderId],
  )).rows;
  const repoLines = async (jobId) => (await query("select * from manual_revenue_lines where container_job_id = $1 and charge_type = 'repo'", [jobId])).rows;
  const commissionRowsFor = async (date, jobId) => {
    const result = await findEligibleDriverCommissions({ periodStart: date, periodEnd: date });
    return { rows: result.rows.filter((row) => row.containerJobId === jobId), review: result.reviewRows.filter((row) => row.containerJobId === jobId) };
  };

  async function cleanupFixtures() {
    const salesOrders = (await query("select id from sales_orders where so_number like 'SO-E2E-%'")).rows.map((row) => row.id);
    const jobs = (await query('select id from container_jobs where sales_order_id = any($1::uuid[])', [salesOrders])).rows.map((row) => row.id);
    const batches = (await query(
      'select distinct batch_id from driver_commission_items where container_job_id = any($1::uuid[])',
      [jobs],
    )).rows.map((row) => row.batch_id);
    if (batches.length) {
      await query('delete from driver_commission_items where batch_id = any($1::uuid[])', [batches]);
      await query('delete from driver_commission_payments where batch_id = any($1::uuid[])', [batches]);
      await query('delete from driver_commission_batches where id = any($1::uuid[])', [batches]);
    }
    const movements = (await query(
      'select distinct cpi.movement_id from container_pickup_items cpi where cpi.container_job_id = any($1::uuid[])',
      [jobs],
    )).rows.map((row) => row.movement_id);
    if (movements.length) {
      const fundBatches = await query(
        "select distinct batch_id from operational_fund_transactions where source = 'repo_uj' and source_ref_id = any($1::text[])",
        [movements],
      );
      await query("delete from operational_fund_transactions where source = 'repo_uj' and source_ref_id = any($1::text[])", [movements]);
      // Batch dana operasional yang kosong setelah debit UJ Repo test ini dihapus dan baru dibuat hari ini.
      await query(
        `delete from operational_fund_batches b
         where b.id = any($1::uuid[]) and b.created_at > now() - interval '1 day'
           and not exists (select 1 from operational_fund_transactions t where t.batch_id = b.id)`,
        [fundBatches.rows.map((row) => row.batch_id)],
      );
    }
    await query("delete from attachments where entity_type = 'container_job' and entity_id = any($1::uuid[])", [jobs]);
    await query('delete from operational_fund_transactions where container_job_id = any($1::uuid[])', [jobs]);
    await query('delete from manual_revenue_lines where sales_order_id = any($1::uuid[])', [salesOrders]);
    await query('delete from container_pickup_movements where id = any($1::uuid[])', [movements]);
    await query('delete from sales_orders where id = any($1::uuid[])', [salesOrders]);
    await query("delete from vehicles where unit_code like 'E2E-%'");
    await query("delete from drivers where bank_name = 'BANK E2E' and name like 'SOPIR E2E %'");
  }

  test.before(cleanupFixtures);
  test.after(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await closePool();
      await rm(uploadDir, { recursive: true, force: true });
    }
  });

  test('alur lengkap: Biaya Titip Rp300.000 sekali sebagai Reimbursement saat titip; Ambil Titip tanpa tagihan baru; komisi A, UJ Repo B', async () => {
    const customer = await templateCustomer();
    const [driverA, truckA, driverB, truckB] = [await createDriver('A'), await createVehicle('A'), await createDriver('B'), await createVehicle('B')];
    const order = await createVerifiedSalesOrder(customer);
    const { jobId, containerNumber, storedAt } = await runAndStoreWithDriverA(order, driverA, truckA);

    const stored = (await query('select status, commission_driver_id from container_jobs where id = $1', [jobId])).rows[0];
    assert.deepEqual(stored, { status: 'repo_stored', commission_driver_id: driverA.id }, 'komisi terkunci ke A saat titip');
    let fees = await storageFees(order.id);
    assert.deepEqual(fees.map((fee) => [fee.container_job_id, fee.category, fee.expense_group, Number(fee.amount), fee.payment_status]),
      [[jobId, 'reimbursement', 'reimbursement', 300000, 'belum_dibayar']]);
    assert.equal(fees[0].description, `Biaya Titip/Repo ${containerNumber}`);
    const noCash = await query('select count(*)::int as total from operational_fund_transactions where container_job_expense_id = $1', [fees[0].id]);
    assert.equal(noCash.rows[0].total, 0, 'tidak ada transaksi Rekening Dropping');
    const billingAtStorage = await invoiceRow(order.id);

    // Simpan ulang data titip: tidak menambah item.
    await updateContainerJob(jobId, { status: 'repo_stored', repoNotes: `Catatan ulang ${tag}`, updatedBy: 'Ops E2E' });
    assert.equal((await storageFees(order.id)).length, 1);

    // Operational tidak bisa mengubah item otomatis ini.
    await assert.rejects(
      updateDroppingExpenseBeforeFinanceCheckRecord(jobId, fees[0].id, { amount: 1, actorName: 'Ops E2E' }),
      { code: 'CONTAINER_JOB_EXPENSE_REPO_STORAGE_FEE_LOCKED' },
    );

    const picked = await pickupByDriverB(jobId, driverB, truckB);
    await complete(jobId);

    // Ambil Titip: tidak ada tagihan Rp300.000 baru (reimbursement maupun Revenue Repo lama).
    fees = await storageFees(order.id);
    assert.equal(fees.length, 1);
    assert.deepEqual(await repoLines(jobId), []);

    // Satu Container Job, satu ritasi atas nama A, riwayat A -> B pada job yang sama.
    const jobs = await query('select id, driver_id from container_jobs where sales_order_id = $1 or container_number = $2', [order.id, containerNumber]);
    assert.deepEqual(jobs.rows.map((row) => row.id), [jobId]);
    assert.equal(jobs.rows[0].driver_id, driverB.id, 'assignment aktual tetap sopir Ambil Titip');
    const trips = (await getUtilizationTripRows({ dateFrom: jakartaDate(hoursAgo(80)), dateTo: jakartaDate(hoursAgo(0)) })).filter((row) => row.jobId === jobId);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].driverId, driverA.id);
    const history = (await findAssignmentHistory(jobId)).filter((row) => row.changeSource === 'repo_pickup');
    assert.deepEqual(history.map((row) => [row.previousDriverName, row.nextDriverName, row.previousPlateNumber, row.nextPlateNumber]),
      [[driverA.name, driverB.name, truckA.plate_number, truckB.plate_number]]);

    // Komisi A (rekening & plat A) dan UJ Repo B.
    const commission = await commissionRowsFor(jakartaDate(storedAt), jobId);
    assert.equal(commission.rows.length, 1);
    assert.equal(commission.review.length, 0);
    assert.deepEqual([commission.rows[0].driverId, commission.rows[0].bankAccountNumber, commission.rows[0].truckPlateNumber],
      [driverA.id, driverA.bank_account_number, truckA.plate_number]);
    const uj = await query("select driver_name, amount from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1", [picked.movement.id]);
    assert.deepEqual(uj.rows.map((row) => [row.driver_name, Number(row.amount)]), [[driverB.name, 150000]]);

    // Invoice utama tidak memuat Biaya Titip; Debit Note memuatnya tepat sekali.
    const invoice = await invoiceRow(order.id);
    assert.equal(Number(invoice.billing_amount), Number(billingAtStorage.billing_amount));
    assert.equal(invoice.billing_items.some((item) => item.includes('Biaya Titip') || item.includes('Revenue Repo')), false);
    let detail = await getInvoiceOrderDetail(order.id);
    assert.equal(detail.debitNoteAmount, 300000);
    assert.deepEqual(detail.debitNoteItems.map((item) => [item.description, item.amount]), [[`Biaya Titip/Repo ${containerNumber}`, 300000]]);

    // Invoice utama terbit, Debit Note belum: Biaya Titip tetap di Debit Note, invoice tidak berubah.
    await updateInvoiceNumber(order.id, { invoiceNumber: `INV-E2E-${tag}-1`, actorName: 'Finance E2E' });
    detail = await getInvoiceOrderDetail(order.id);
    assert.equal(detail.invoiceNumber, `INV-E2E-${tag}-1`);
    assert.equal(Number((await invoiceRow(order.id)).billing_amount), Number(billingAtStorage.billing_amount));
    assert.equal(detail.debitNoteAmount, 300000);
    assert.equal(detail.debitNoteNumber, '');

    // Finance menerbitkan Debit Note: nominal Rp300.000 tepat sekali.
    await updateDebitNoteNumber(order.id, { debitNoteNumber: `DN-E2E-${tag}-1`, actorName: 'Finance E2E' });
    detail = await getInvoiceOrderDetail(order.id);
    assert.equal(detail.debitNoteNumber, `DN-E2E-${tag}-1`);
    assert.equal(detail.debitNoteAmount, 300000);

    // Pickup berikutnya ditolak dan tidak menambah tagihan.
    await assert.rejects(pickupByDriverB(jobId, driverB, truckB), (error) => error.statusCode === 409);
    assert.equal((await storageFees(order.id)).length, 1);
  });

  test('request titip bersamaan: tetap satu item; Debit Note sudah terbit: dokumen lama tidak diubah, pengecualian untuk Finance', async () => {
    const customer = await templateCustomer();
    const [driverA, truckA] = [await createDriver('A'), await createVehicle('A')];

    const order = await createVerifiedSalesOrder(customer);
    const jobId = order.containers[0].id;
    await updateContainerJob(jobId, {
      status: 'running', containerNumber: nextContainerNumber(), driverId: driverA.id, vehicleId: truckA.id,
      driver: driverA.name, plateNumber: truckA.plate_number, runningAt: hoursAgo(72), updatedBy: 'Ops E2E',
    });
    const storePayload = { status: 'repo_stored', repoStoredAt: hoursAgo(70), repoLocation: 'Depo E2E', repoEirNumber: `EIR-E2E-${tag}`, updatedBy: 'Ops E2E' };
    await Promise.allSettled([updateContainerJob(jobId, storePayload), updateContainerJob(jobId, storePayload)]);
    assert.equal((await query('select status from container_jobs where id = $1', [jobId])).rows[0].status, 'repo_stored');
    assert.equal((await storageFees(order.id)).length, 1, 'request bersamaan tidak menggandakan Biaya Titip');

    // SO lain: Debit Note sudah terbit sebelum container dititip (mis. data lama).
    const [driverC, truckC] = [await createDriver('C'), await createVehicle('C')];
    const issued = await createVerifiedSalesOrder(customer);
    const issuedJobId = issued.containers[0].id;
    await updateContainerJob(issuedJobId, {
      status: 'running', containerNumber: nextContainerNumber(), driverId: driverC.id, vehicleId: truckC.id,
      driver: driverC.name, plateNumber: truckC.plate_number, runningAt: hoursAgo(72), updatedBy: 'Ops E2E',
    });
    await query("update sales_orders set debit_note_number = $2, debit_note_issued_at = now() where id = $1", [issued.id, `DN-E2E-${tag}-OLD`]);
    const before = await getInvoiceOrderDetail(issued.id).catch(() => null);
    const saved = await updateContainerJob(issuedJobId, { ...storePayload, repoEirNumber: `EIR-E2E-${tag}-2` });
    assert.equal(saved.status, 'repo_stored');
    assert.equal(saved.updateWarnings?.[0]?.code, 'REPO_STORAGE_FEE_DEBIT_NOTE_ISSUED');
    assert.match(saved.updateWarnings[0].message, /Perlu Klarifikasi/);
    assert.equal((await storageFees(issued.id)).length, 0, 'Debit Note terbit tidak diubah otomatis');
    // Pengecualian tercatat persisten dan ditemukan Finance lewat Rekonsiliasi Biaya (Perlu Klarifikasi).
    const pending = await getContainerJobExpensesReconciliationPage({ financeCheckStatus: 'perlu_klarifikasi', query: saved.containerNumber, pageSize: 20 });
    assert.equal(pending.rows.length, 1);
    assert.equal(Number(pending.rows[0].amount), 300000);
    assert.equal(pending.rows[0].paymentStatus, 'batal');
    assert.match(pending.rows[0].financeNote || '', /keputusan Finance/);
    // Penitipan disimpan ulang: tidak membuat tagihan otomatis kedua.
    await updateContainerJob(issuedJobId, { status: 'repo_stored', repoNotes: `Simpan ulang ${tag}`, updatedBy: 'Ops E2E' });
    assert.equal((await query("select count(*)::int as total from container_job_expenses where container_job_id = $1 and source = 'repo_storage_fee'", [issuedJobId])).rows[0].total, 1);
    const after = await getInvoiceOrderDetail(issued.id).catch(() => null);
    assert.equal(after?.debitNoteAmount ?? 0, before?.debitNoteAmount ?? 0);
    assert.equal((await query('select debit_note_number from sales_orders where id = $1', [issued.id])).rows[0].debit_note_number, `DN-E2E-${tag}-OLD`);
  });

  test('koreksi Admin: penerima komisi dikoreksi ke A tanpa mengganti assignment B; B ditolak; batch approved terlindungi', async () => {
    const customer = await templateCustomer();
    const [driverA, truckA, driverB, truckB] = [await createDriver('A'), await createVehicle('A'), await createDriver('B'), await createVehicle('B')];
    const noAccount = await createDriver('C', { withAccount: false });
    const order = await createVerifiedSalesOrder(customer);
    const { jobId, storedAt } = await runAndStoreWithDriverA(order, driverA, truckA);
    const picked = await pickupByDriverB(jobId, driverB, truckB);
    await complete(jobId);
    // Data lama: penerima komisi terlanjur tercatat sebagai B (rekening & plat B).
    await query(
      `update container_jobs set commission_driver_id = $2, commission_driver_name = $3, commission_driver_snapshot = $4::jsonb where id = $1`,
      [jobId, driverB.id, driverB.name, JSON.stringify({ driver: driverB.name, driverBankAccountNumber: driverB.bank_account_number, plateNumber: truckB.plate_number })],
    );
    const held = await commissionRowsFor(jakartaDate(storedAt), jobId);
    assert.equal(held.rows.length, 0, 'pembayaran ditahan');
    assert.deepEqual(held.review[0]?.reviewReasons, ['Penerima komisi tercatat sebagai sopir Ambil Titip']);

    await assert.rejects(
      correctContainerJobCommissionRecipient(jobId, { driverId: driverB.id, reason: 'Coba alihkan ke B', actorName: 'Admin E2E' }),
      { code: 'COMMISSION_RECIPIENT_IS_REPO_PICKUP_DRIVER' },
    );
    await assert.rejects(
      correctContainerJobCommissionRecipient(jobId, { driverId: noAccount.id, reason: 'Sopir tanpa rekening', actorName: 'Admin E2E' }),
      { code: 'COMMISSION_RECIPIENT_PAYMENT_INFO_MISSING' },
    );

    const assignmentBefore = (await query('select driver_id, vehicle_id, assignment_snapshot from container_jobs where id = $1', [jobId])).rows[0];
    const corrected = await correctContainerJobCommissionRecipient(jobId, { driverId: driverA.id, reason: 'Sopir penitip terverifikasi dari SPK', actorName: 'Admin E2E' });
    assert.deepEqual(corrected.after, { driverId: driverA.id, driverName: driverA.name });
    const assignmentAfter = (await query('select driver_id, vehicle_id, assignment_snapshot from container_jobs where id = $1', [jobId])).rows[0];
    assert.deepEqual(assignmentAfter, assignmentBefore, 'assignment aktual sopir/truck B tidak berubah');

    const fixed = await commissionRowsFor(jakartaDate(storedAt), jobId);
    assert.equal(fixed.review.length, 0);
    assert.equal(fixed.rows.length, 1);
    assert.equal(fixed.rows[0].driverId, driverA.id);
    assert.equal(fixed.rows[0].bankAccountNumber, driverA.bank_account_number);
    assert.equal(fixed.rows[0].truckPlateNumber, truckA.plate_number);

    // Batch approved: koreksi penerima ditolak, pembayaran tidak berubah.
    await query("update container_jobs set repo_stored_at = '2033-03-08T03:00:00.000Z', completed_at = '2033-03-10T08:00:00.000Z' where id = $1", [jobId]);
    const batch = await createDriverCommissionBatch(BATCH_PERIOD, { name: 'Ops E2E' });
    await approveDriverCommissionBatch(batch.id, { name: 'Finance E2E' });
    await assert.rejects(
      correctContainerJobCommissionRecipient(jobId, { driverId: noAccount.id, reason: 'Coba ubah setelah approved', actorName: 'Admin E2E' }),
      (error) => ['COMMISSION_RECIPIENT_PAYMENT_INFO_MISSING', 'CONTAINER_JOB_COMMISSION_BATCH_LOCKED'].includes(error.code),
    );
    const otherDriver = await createDriver('D');
    await assert.rejects(
      correctContainerJobCommissionRecipient(jobId, { driverId: otherDriver.id, reason: 'Coba ubah setelah approved', actorName: 'Admin E2E' }),
      { code: 'CONTAINER_JOB_COMMISSION_BATCH_LOCKED' },
    );
    const item = (await query('select driver_id from driver_commission_items where container_job_id = $1 and voided_at is null', [jobId])).rows[0];
    assert.equal(item.driver_id, driverA.id);
  });
}
