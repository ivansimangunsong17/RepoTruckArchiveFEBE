import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import test, { after } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
process.env.PASSWORD_HASH_COST ||= '4';
process.env.UPLOAD_DIR ||= 'uploads/test';

await import('dotenv/config');

const hasDatabase = Boolean(process.env.DATABASE_URL);

if (!hasDatabase) {
  test('backend integration flow skipped without DATABASE_URL', { skip: 'DATABASE_URL belum dikonfigurasi.' }, () => {});
} else {
  const { createApp } = await import('../app.js');
  const { closePool, pool, query } = await import('../db/client.js');
  const { hashPassword } = await import('../modules/auth/auth.utils.js');

  const runId = `sprint-2c-${Date.now()}`;
  const password = 'TestPassword123!';
  const users = {
    admin: { name: `Sprint2C Admin ${runId}`, email: `${runId}.admin@example.test`, role: 'admin' },
    sales: { name: `Sprint2C Sales ${runId}`, email: `${runId}.sales@example.test`, role: 'sales' },
    finance: { name: `Sprint2C Finance ${runId}`, email: `${runId}.finance@example.test`, role: 'finance' },
    observer: { name: `Sprint2C Observer ${runId}`, email: `${runId}.observer@example.test`, role: 'pengamat' },
    operational: { name: `Sprint2C Operational ${runId}`, email: `${runId}.operational@example.test`, role: 'operational' },
    legacy: { name: `Sprint2C Legacy ${runId}`, email: `${runId}.legacy@example.test`, role: 'sales' },
    locked: { name: `Sprint2C Locked ${runId}`, email: `${runId}.locked@example.test`, role: 'sales' },
  };
  const created = {
    orderId: '',
    orderSoNumber: `SO-${runId}-MAIN`.toUpperCase(),
    cancelOrderId: '',
    cancelSoNumber: `SO-${runId}-CANCEL`.toUpperCase(),
    cancelJobSoNumber: `SO-${runId}-CANCELJOB`.toUpperCase(),
    historicalOrderId: '',
    historicalJobId: '',
    historicalSoNumber: `SO-${runId}-HIST`.toUpperCase(),
    jobId: '',
    attachmentId: '',
    vehicleHeadId: '',
    vehicleChassisId: '',
    kirHeadDocumentId: '',
    kirBuntutDocumentId: '',
  };

  const server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const backupLockPath = resolve(
    process.env.UPLOAD_DIR,
    'File Sementara',
    'backup-in-progress.lock',
  );

  after(async () => {
    await rm(backupLockPath, { force: true }).catch(() => {});
    await cleanupTestData().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  async function ensureHistoricalPeriodTable() {
    await query(`
      create table if not exists historical_entry_periods (
        period text primary key,
        status text not null default 'draft',
        notes text,
        locked_by_name text,
        locked_at timestamptz,
        unlocked_by_name text,
        unlocked_at timestamptz,
        updated_by_name text,
        updated_at timestamptz not null default now(),
        created_at timestamptz not null default now(),
        constraint historical_entry_periods_status_check
          check (status in ('draft', 'locked'))
      )
    `);
  }

  async function cleanupTestData() {
    await ensureHistoricalPeriodTable();
    const attachments = await query(
      `
        select storage_path
        from attachments
        where entity_id in (
          select id from sales_orders where so_number ilike $1 or notes ilike $3 or customer_name ilike $3
          union
          select cj.id from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          where so.so_number ilike $1 or so.notes ilike $3 or so.customer_name ilike $3
        )
        or storage_path ilike $2
      `,
      [`SO-${runId}%`, `%${runId}%`, `%${runId}%`],
    );
    const vehicleDocuments = await query(
      `
        select vd.relative_path
        from vehicle_documents vd
        join vehicles v on v.id = vd.vehicle_id
        where v.unit_code like $1 or v.plate_number like $2
      `,
      [`%${runId}%`, `B-${String(runId).slice(-4)}%`],
    );
    const storageTrash = await query(
      `
        select id, trash_relative_path
        from storage_trash
        where record_data::text ilike $1
           or coalesce(original_relative_path, '') ilike $1
           or coalesce(trash_relative_path, '') ilike $1
      `,
      [`%${runId}%`],
    );

    await query('delete from activity_logs where metadata::text ilike $1 or actor_name ilike $2 or target ilike $2', [`%${runId}%`, `%${runId}%`]);
    await query('delete from historical_entry_periods where notes ilike $1', [`%${runId}%`]);
    await query('delete from storage_trash where record_data::text ilike $1 or coalesce(original_relative_path, \'\') ilike $1 or coalesce(trash_relative_path, \'\') ilike $1', [`%${runId}%`]);
    await query('delete from attachments where storage_path ilike $1 or entity_id in (select id from sales_orders where so_number ilike $2 or notes ilike $1 or customer_name ilike $1)', [`%${runId}%`, `SO-${runId}%`]);
    await query('delete from sales_orders where so_number ilike $1 or notes ilike $2 or customer_name ilike $2', [`SO-${runId}%`, `%${runId}%`]);
    await query('delete from vehicles where plate_number like $1', [`B-${String(runId).slice(-4)}%`]);
    await query('delete from users where email like $1', [`${runId}.%@example.test`]);

    await Promise.all(attachments.rows.map((row) => (
      row.storage_path
        ? rm(`${process.env.UPLOAD_DIR}/${row.storage_path}`, { force: true }).catch(() => {})
        : Promise.resolve()
    )));
    await Promise.all(vehicleDocuments.rows.map((row) => (
      row.relative_path
        ? rm(`${process.env.UPLOAD_DIR}/${row.relative_path}`, { force: true }).catch(() => {})
        : Promise.resolve()
    )));
    await Promise.all(storageTrash.rows.map((row) => (
      row.trash_relative_path
        ? rm(`${process.env.UPLOAD_DIR}/${row.trash_relative_path}`, { force: true }).catch(() => {})
        : Promise.resolve()
    )));
  }

  async function seedUsers() {
    await cleanupTestData();
    await Promise.all(Object.values(users).map((user) => {
      const passwordHash = user === users.legacy
        ? createHash('sha256').update(password).digest('hex')
        : hashPassword(password);
      return query(
      `
        insert into users (name, email, password_hash, role, status)
        values ($1, $2, $3, $4, 'Aktif')
        on conflict (email) do update
        set name = excluded.name,
            password_hash = excluded.password_hash,
            role = excluded.role,
            status = 'Aktif',
            updated_at = now()
      `,
      [user.name, user.email, passwordHash, user.role],
      );
    }));
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  }

  async function login(email, pass = password) {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password: pass },
      headers: { 'User-Agent': 'backend-flow-test' },
    });
    return response;
  }

  function salesOrderPayload(overrides = {}) {
    const soNumber = overrides.soNumber || created.orderSoNumber;
    return {
      soNumber,
      doNumber: `${soNumber}-DO`,
      soDate: '2026-07-10',
      tripDate: '2026-07-11',
      customer: `Customer ${runId}`,
      shipment: 'import',
      jobType: 'Trucking Container',
      origin: 'Tanjung Priok',
      destination: 'Cikarang',
      paymentType: 'tempo',
      paymentTermDays: 14,
      salesName: 'Sprint2C Sales',
      createdBy: 'Sprint2C Sales',
      lineItems: [
        { serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 1500000 },
      ],
      containers: [
        {
          id: overrides.containerId || '',
          containerNumber: overrides.containerNumber || `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          size: '20FT',
          type: 'Dry',
          status: 'received',
        },
      ],
      notes: `Automated test ${runId}`,
      ...overrides,
    };
  }

  async function latestActivity(action) {
    const result = await query(
      `
        select action, actor_name, actor_role, target, metadata
        from activity_logs
        where action = $1
          and (metadata::text like $2 or actor_name like $3)
        order by created_at desc
        limit 1
      `,
      [action, `%${runId}%`, `%${runId}%`],
    );
    return result.rows[0] || null;
  }

  async function latestActivityForEntity(action, entityId) {
    const result = await query(
      `
        select action, actor_name, actor_role, target, metadata
        from activity_logs
        where action = $1
          and metadata->>'entityId' = $2
        order by created_at desc
        limit 1
      `,
      [action, entityId],
    );
    return result.rows[0] || null;
  }

  async function resetOperationalFundBatch(batchDate) {
    await query(
      `
        delete from operational_fund_transactions
        where batch_id in (select id from operational_fund_batches where batch_date = $1::date)
      `,
      [batchDate],
    );
    await query('delete from operational_fund_batches where batch_date = $1::date', [batchDate]);
  }

  async function latestLoginActivity(action, email) {
    const result = await query(
      `
        select action, actor_name, actor_role, target, metadata
        from activity_logs
        where action = $1
          and metadata->>'email' = $2
        order by created_at desc
        limit 1
      `,
      [action, email],
    );
    return result.rows[0] || null;
  }

  test('backend API flow utama terlindungi oleh automated tests', async (t) => {
    await seedUsers();
    let adminToken = '';
    let salesToken = '';
    let financeToken = '';
    let legacyToken = '';
    let observerToken = '';
    let operationalToken = '';

    await t.test('auth: login sukses, login gagal, me valid, me tanpa token ditolak', async () => {
      const adminLogin = await login(users.admin.email);
      assert.equal(adminLogin.status, 200);
      assert.equal(adminLogin.body.data.user.email, users.admin.email);
      assert.ok(adminLogin.body.data.token);
      adminToken = adminLogin.body.data.token;

      const failedLogin = await login(users.admin.email, 'wrong-password');
      assert.equal(failedLogin.status, 401);
      assert.equal(failedLogin.body.error.code, 'INVALID_CREDENTIALS');

      const me = await api('/api/auth/me', { token: adminToken });
      assert.equal(me.status, 200);
      assert.equal(me.body.data.email, users.admin.email);

      const meWithoutToken = await api('/api/auth/me');
      assert.equal(meWithoutToken.status, 401);

      const legacyBefore = await query('select password_hash from users where email = $1', [users.legacy.email]);
      assert.match(legacyBefore.rows[0].password_hash, /^[a-f0-9]{64}$/i);

      const legacyLogin = await login(users.legacy.email);
      assert.equal(legacyLogin.status, 200);
      legacyToken = legacyLogin.body.data.token;
      const legacyAfter = await query('select password_hash from users where email = $1', [users.legacy.email]);
      assert.match(legacyAfter.rows[0].password_hash, /^\$2[aby]\$/);

      for (let index = 0; index < 5; index += 1) {
        const failedAttempt = await login(users.locked.email, `wrong-password-${index}`);
        assert.equal(failedAttempt.status, 401);
      }
      const lockedAttempt = await login(users.locked.email, 'wrong-password-lockout');
      assert.equal(lockedAttempt.status, 429);
      assert.equal(lockedAttempt.body.error.code, 'LOGIN_LOCKED');
    });

    await t.test('activity log: login sukses dan gagal tercatat', async () => {
      const successLog = await latestLoginActivity('LOGIN_SUCCESS', users.admin.email);
      assert.equal(successLog.action, 'LOGIN_SUCCESS');
      assert.equal(successLog.metadata.email, users.admin.email);

      const failedLog = await latestLoginActivity('LOGIN_FAILED', users.admin.email);
      assert.equal(failedLog.action, 'LOGIN_FAILED');
      assert.equal(failedLog.metadata.email, users.admin.email);
      assert.equal(failedLog.metadata.code, 'INVALID_CREDENTIALS');

      const lockoutLog = await latestLoginActivity('LOGIN_FAILED', users.locked.email);
      assert.equal(lockoutLog.action, 'LOGIN_FAILED');
      assert.equal(lockoutLog.metadata.code, 'LOGIN_LOCKED');
    });

    await t.test('permission: role tanpa permission ditolak dan role dengan permission diterima', async () => {
      const salesLogin = await login(users.sales.email);
      const financeLogin = await login(users.finance.email);
      const observerLogin = await login(users.observer.email);
      const operationalLogin = await login(users.operational.email);
      assert.equal(salesLogin.status, 200);
      assert.equal(financeLogin.status, 200);
      assert.equal(observerLogin.status, 200);
      assert.equal(operationalLogin.status, 200);
      salesToken = salesLogin.body.data.token;
      financeToken = financeLogin.body.data.token;
      observerToken = observerLogin.body.data.token;
      operationalToken = operationalLogin.body.data.token;

      const allowed = await api('/api/sales-orders?pageSize=1', { token: salesToken });
      assert.equal(allowed.status, 200);
      assert.ok(Array.isArray(allowed.body.data.rows));

      const salesDashboard = await api('/api/reports/dashboard', { token: salesToken });
      assert.equal(salesDashboard.status, 200);
      assert.ok(Array.isArray(salesDashboard.body.data.trucks));

      const salesReport = await api('/api/reports/sales-orders?pageSize=1', { token: salesToken });
      assert.equal(salesReport.status, 403);
      assert.equal(salesReport.body.error.code, 'FORBIDDEN');

      const forbidden = await api('/api/sales-orders', {
        method: 'POST',
        token: observerToken,
        body: salesOrderPayload(),
      });
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.body.error.code, 'FORBIDDEN');

      const financeSalesOrderList = await api('/api/sales-orders?pageSize=1', { token: financeToken });
      assert.equal(financeSalesOrderList.status, 200);
      assert.ok(Array.isArray(financeSalesOrderList.body.data.rows));
    });

    await t.test('backup lokal: mutasi diblokir tetapi akses baca tetap tersedia', async () => {
      await mkdir(dirname(backupLockPath), { recursive: true });
      await writeFile(backupLockPath, JSON.stringify({
        backupId: `TEST-${runId}`,
        computerName: hostname(),
        processId: process.pid,
      }), { flag: 'wx' });
      try {
        const blockedMutation = await api('/api/master/trucks', {
          method: 'POST',
          token: adminToken,
          body: {},
        });
        assert.equal(blockedMutation.status, 503);
        assert.equal(blockedMutation.body.error.code, 'BACKUP_IN_PROGRESS');

        const allowedRead = await api('/api/reports/dashboard', { token: observerToken });
        assert.equal(allowedRead.status, 200);
      } finally {
        await rm(backupLockPath, { force: true });
      }
    });

    await t.test('backup lokal: lock dari proses yang sudah mati diarsipkan', async () => {
      const staleLockArchive = resolve(process.env.UPLOAD_DIR, 'File Karantina', 'Storage Audit');
      await mkdir(dirname(backupLockPath), { recursive: true });
      await writeFile(backupLockPath, JSON.stringify({
        backupId: `STALE-${runId}`,
        computerName: hostname(),
        processId: 2147483647,
      }), { flag: 'wx' });
      try {
        const mutationAfterStaleLock = await api('/api/master/trucks', {
          method: 'POST',
          token: adminToken,
          body: {},
        });
        assert.notEqual(mutationAfterStaleLock.status, 503);
        assert.equal(
          await stat(backupLockPath).then(() => true, (error) => {
            if (error.code === 'ENOENT') return false;
            throw error;
          }),
          false,
        );
        const archivedLocks = await readdir(staleLockArchive);
        assert.ok(archivedLocks.some((name) => name.startsWith('stale-backup-lock-')));
      } finally {
        await rm(backupLockPath, { force: true });
        const archivedLocks = await readdir(staleLockArchive).catch(() => []);
        await Promise.all(archivedLocks
          .filter((name) => name.startsWith('stale-backup-lock-'))
          .map((name) => rm(resolve(staleLockArchive, name), { force: true })));
      }
    });

    await t.test('sales order: list, create, update, cancel', async () => {
      const blockedAdminCreate = await api('/api/sales-orders', {
        method: 'POST',
        token: adminToken,
        body: salesOrderPayload({ soNumber: `SO-${runId}-ADMIN-CREATE`.toUpperCase() }),
      });
      assert.equal(blockedAdminCreate.status, 403);
      assert.equal(blockedAdminCreate.body.error.code, 'SALES_ORDER_CREATE_SALES_ONLY');

      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload(),
      });
      assert.equal(createdOrder.status, 201);
      assert.match(createdOrder.body.data.soNumber, /^SO-ARM-\d{6}-\d{4}$/);
      assert.equal(createdOrder.body.data.internalSoNumber, createdOrder.body.data.soNumber);
      assert.equal(createdOrder.body.data.accurateSoNumber, '');
      assert.equal(createdOrder.body.data.financeVerificationStatus, 'pending_so');
      assert.equal(createdOrder.body.data.billingStatus, 'belum_invoice');
      assert.equal(createdOrder.body.data.paymentType, 'tempo');
      assert.equal(createdOrder.body.data.paymentTermDays, 14);
      assert.equal(createdOrder.body.data.paymentTerms, 'Tempo 14 hari');
      assert.equal(createdOrder.body.data.containers.length, 1);
      created.orderId = createdOrder.body.data.id;
      created.jobId = createdOrder.body.data.containers[0].id;
      created.internalSoNumber = createdOrder.body.data.soNumber;

      const visibleFromOperational = await api(`/api/container-jobs?query=${encodeURIComponent(created.internalSoNumber)}`, { token: adminToken });
      assert.equal(visibleFromOperational.status, 200);
      assert.equal(visibleFromOperational.body.data.rows.some((row) => row.id === created.jobId), true);

      const financeQueue = await api(`/api/finance/order-verifications?query=${encodeURIComponent(runId)}`, { token: financeToken });
      assert.equal(financeQueue.status, 200);
      assert.equal(financeQueue.body.data.rows.some((row) => row.id === created.orderId && row.verificationStatus === 'pending_so'), true);
      assert.equal(financeQueue.body.data.rows.find((row) => row.id === created.orderId)?.paymentTerms, 'Tempo 14 hari');

      const financeVerified = await api(`/api/finance/order-verifications/${created.orderId}/so-number`, {
        method: 'PATCH',
        token: financeToken,
        body: { soNumber: created.orderSoNumber },
      });
      assert.equal(financeVerified.status, 200);
      assert.equal(financeVerified.body.data.soNumber, created.orderSoNumber);
      assert.equal(financeVerified.body.data.internalSoNumber, created.internalSoNumber);
      assert.equal(financeVerified.body.data.accurateSoNumber, created.orderSoNumber);
      assert.equal(financeVerified.body.data.verificationStatus, 'verified');

      const rejectedReimbursementLineItem = await api(`/api/finance/order-verifications/${created.orderId}/line-items`, {
        method: 'POST',
        token: financeToken,
        body: { serviceName: 'Bon Muat/Bongkar', qty: 1, price: 50000 },
      });
      assert.equal(rejectedReimbursementLineItem.status, 400);

      const addedRevenueLineItem = await api(`/api/finance/order-verifications/${created.orderId}/line-items`, {
        method: 'POST',
        token: financeToken,
        body: { serviceName: 'Handling', qty: 2, price: 150000 },
      });
      assert.equal(addedRevenueLineItem.status, 200);
      assert.equal(addedRevenueLineItem.body.data.lineItems.some((item) => item.serviceName === 'Handling' && item.qty === 2 && item.total === 300000), true);

      const list = await api(`/api/sales-orders?query=${encodeURIComponent(created.orderSoNumber)}`, { token: adminToken });
      assert.equal(list.status, 200);
      assert.ok(list.body.data.rows.some((row) => row.id === created.orderId));

      const salesScopedList = await api(`/api/sales-orders?query=${encodeURIComponent(created.orderSoNumber)}`, { token: salesToken });
      assert.equal(salesScopedList.status, 200);
      assert.equal(salesScopedList.body.data.rows.some((row) => row.id === created.orderId), true);

      const historicalOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: adminToken,
        body: salesOrderPayload({
          soNumber: created.historicalSoNumber,
          entrySource: 'historical',
          historicalPeriod: '2026-07',
          historicalNotes: `Backfill test Juli 2026 ${runId}`,
          tripDate: '2026-07-09',
          receivedAt: '2026-07-09T00:00:00.000Z',
          createdBy: users.admin.name,
          updatedBy: users.admin.name,
        }),
      });
      assert.equal(historicalOrder.status, 201);
      assert.equal(historicalOrder.body.data.entrySource, 'historical');
      assert.equal(historicalOrder.body.data.historicalPeriod, '2026-07');
      created.historicalOrderId = historicalOrder.body.data.id;
      created.historicalJobId = historicalOrder.body.data.containers[0].id;

      const blockedSalesUpdate = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: legacyToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Bekasi',
          updatedBy: 'Sprint2C Legacy',
        }),
      });
      assert.equal(blockedSalesUpdate.status, 403);
      assert.equal(blockedSalesUpdate.body.error.code, 'SALES_ORDER_OWNER_FORBIDDEN');

      const updatedOrder = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          updatedBy: 'Sprint2C Admin',
        }),
      });
      assert.equal(updatedOrder.status, 200);
      assert.equal(updatedOrder.body.data.destination, 'Karawang');

      const blockedBillingUpdate = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          invoiceNumber: `INV-${runId}-EARLY`,
          billingStatus: 'belum_dikirim',
          updatedBy: 'Sprint2C Admin',
        }),
      });
      assert.equal(blockedBillingUpdate.status, 400);
      assert.equal(blockedBillingUpdate.body.error.code, 'VALIDATION_ERROR');

      const cancelCandidate = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: created.cancelSoNumber }),
      });
      assert.equal(cancelCandidate.status, 201);
      created.cancelOrderId = cancelCandidate.body.data.id;

      const cancelled = await api(`/api/sales-orders/${created.cancelOrderId}/cancel`, {
        method: 'PATCH',
        token: adminToken,
      });
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.data.id, created.cancelOrderId);
    });

    await t.test('activity log: create/update/cancel sales order tercatat', async () => {
      const createLog = await latestActivity('CREATE_SALES_ORDER');
      assert.equal(createLog.action, 'CREATE_SALES_ORDER');
      assert.equal(createLog.metadata.entityType, 'sales_order');

      const updateLog = await latestActivity('UPDATE_SALES_ORDER');
      assert.equal(updateLog.action, 'UPDATE_SALES_ORDER');
      assert.equal(updateLog.metadata.entityId, created.orderId);

      const cancelLog = await latestActivity('CANCEL_SALES_ORDER');
      assert.equal(cancelLog.action, 'CANCEL_SALES_ORDER');
      assert.equal(cancelLog.metadata.entityId, created.cancelOrderId);

      const financeInputLog = await latestActivityForEntity('FINANCE_INPUT_SO_NUMBER', created.orderId);
      assert.equal(financeInputLog.action, 'FINANCE_INPUT_SO_NUMBER');
      assert.equal(financeInputLog.actor_role, 'finance');

      const financeApproveLog = await latestActivityForEntity('FINANCE_APPROVE_ORDER', created.orderId);
      assert.equal(financeApproveLog.action, 'FINANCE_APPROVE_ORDER');
      assert.equal(financeApproveLog.actor_role, 'finance');

      const historicalOrderLog = await latestActivityForEntity('CREATE_HISTORICAL_SALES_ORDER', created.historicalOrderId);
      assert.equal(historicalOrderLog.action, 'CREATE_HISTORICAL_SALES_ORDER');
      assert.equal(historicalOrderLog.actor_role, 'admin');
      assert.equal(historicalOrderLog.metadata.historicalPeriod, '2026-07');

      const historicalJobLog = await latestActivityForEntity('CREATE_HISTORICAL_CONTAINER_JOB', created.historicalJobId);
      assert.equal(historicalJobLog.action, 'CREATE_HISTORICAL_CONTAINER_JOB');
      assert.equal(historicalJobLog.metadata.soNumber, created.historicalSoNumber);
    });

    await t.test('sales order: cancel langsung meng-cascade container job received dan melepas driver/truck', async () => {
      const cascadeDriverName = `Driver Cascade ${runId}`;
      const cascadePlate = `B-${String(runId).slice(-4)}-CC`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Bertugas', 'Aman')
          on conflict do nothing
        `,
        [cascadeDriverName, `081${String(Date.now()).slice(-9)}`],
      );
      const cascadeDriverRow = await query('select id from drivers where name = $1', [cascadeDriverName]);
      const cascadeDriverId = cascadeDriverRow.rows[0].id;

      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Bertugas')
          on conflict (plate_number) do update set operational_status = 'Bertugas'
        `,
        [`TRK-CC-${String(runId).slice(-4)}`, cascadePlate],
      );
      const cascadeVehicleRow = await query('select id from vehicles where plate_number = $1', [cascadePlate]);
      const cascadeVehicleId = cascadeVehicleRow.rows[0].id;

      const cascadeSoNumber = `SO-CASCADECANCEL-${runId}`;
      const cascadeOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: cascadeSoNumber }),
      });
      assert.equal(cascadeOrder.status, 201);
      const cascadeJobId = cascadeOrder.body.data.containers[0].id;

      await query(
        `
          update container_jobs
          set driver_id = $1,
              vehicle_id = $2,
              assignment_snapshot = jsonb_build_object('driver', $3::text, 'plateNumber', $4::text)
          where id = $5
        `,
        [cascadeDriverId, cascadeVehicleId, cascadeDriverName, cascadePlate, cascadeJobId],
      );

      const cascadeCancelResult = await api(`/api/sales-orders/${cascadeOrder.body.data.id}/cancel`, {
        method: 'PATCH',
        token: adminToken,
      });
      assert.equal(cascadeCancelResult.status, 200);

      const jobAfterCascadeCancel = await query(
        'select status, cancel_reason, cancel_source from container_jobs where id = $1',
        [cascadeJobId],
      );
      assert.equal(jobAfterCascadeCancel.rows[0].status, 'cancelled');
      assert.equal(jobAfterCascadeCancel.rows[0].cancel_source, 'sales');
      assert.ok(jobAfterCascadeCancel.rows[0].cancel_reason);

      const driverAfterCascadeCancel = await query('select operational_status from drivers where id = $1', [cascadeDriverId]);
      assert.equal(driverAfterCascadeCancel.rows[0].operational_status, 'Aktif');

      const vehicleAfterCascadeCancel = await query('select operational_status from vehicles where id = $1', [cascadeVehicleId]);
      assert.equal(vehicleAfterCascadeCancel.rows[0].operational_status, 'Aktif');

      const reassignSoNumber = `SO-CASCADEREASSIGN-${runId}`;
      const reassignOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: reassignSoNumber }),
      });
      assert.equal(reassignOrder.status, 201);
      const reassignJobId = reassignOrder.body.data.containers[0].id;

      const reassignResult = await api(`/api/container-jobs/${reassignJobId}/assignment`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: `${reassignSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          driver: cascadeDriverName,
          plateNumber: cascadePlate,
          status: 'received',
          updatedBy: 'Sprint2C Admin',
        },
      });
      assert.equal(reassignResult.status, 200, 'truck/driver seharusnya bisa di-assign ulang ke job lain setelah SO lamanya di-cancel');
    });

    await t.test('sales order: approve permintaan cancel meng-cascade container job received dan melepas driver/truck', async () => {
      const cascadeApproveDriverName = `Driver Cascade Approve ${runId}`;
      const cascadeApprovePlate = `B-${String(runId).slice(-4)}-CA`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Bertugas', 'Aman')
          on conflict do nothing
        `,
        [cascadeApproveDriverName, `082${String(Date.now()).slice(-9)}`],
      );
      const cascadeApproveDriverRow = await query('select id from drivers where name = $1', [cascadeApproveDriverName]);
      const cascadeApproveDriverId = cascadeApproveDriverRow.rows[0].id;

      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Bertugas')
          on conflict (plate_number) do update set operational_status = 'Bertugas'
        `,
        [`TRK-CA-${String(runId).slice(-4)}`, cascadeApprovePlate],
      );
      const cascadeApproveVehicleRow = await query('select id from vehicles where plate_number = $1', [cascadeApprovePlate]);
      const cascadeApproveVehicleId = cascadeApproveVehicleRow.rows[0].id;

      const cascadeApproveSoNumber = `SO-CASCADEAPPROVE-${runId}`;
      const cascadeApproveOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: cascadeApproveSoNumber }),
      });
      assert.equal(cascadeApproveOrder.status, 201);
      const cascadeApproveJobId = cascadeApproveOrder.body.data.containers[0].id;
      const cascadeApproveOrderId = cascadeApproveOrder.body.data.id;

      await query(
        `
          update container_jobs
          set driver_id = $1,
              vehicle_id = $2,
              assignment_snapshot = jsonb_build_object('driver', $3::text, 'plateNumber', $4::text)
          where id = $5
        `,
        [cascadeApproveDriverId, cascadeApproveVehicleId, cascadeApproveDriverName, cascadeApprovePlate, cascadeApproveJobId],
      );

      const cascadeApproveRequest = await api(`/api/sales-orders/${cascadeApproveOrderId}/cancel-request`, {
        method: 'PATCH',
        token: salesToken,
        body: { cancelRequestNote: `Cascade approve test ${runId}` },
      });
      assert.equal(cascadeApproveRequest.status, 200);

      const cascadeApproveReview = await api(`/api/sales-orders/${cascadeApproveOrderId}/cancel-review`, {
        method: 'PATCH',
        token: adminToken,
        body: { approved: true },
      });
      assert.equal(cascadeApproveReview.status, 200);
      assert.equal(cascadeApproveReview.body.data.status, 'cancelled');

      const jobAfterCascadeApprove = await query(
        'select status, cancel_reason, cancel_source from container_jobs where id = $1',
        [cascadeApproveJobId],
      );
      assert.equal(jobAfterCascadeApprove.rows[0].status, 'cancelled');
      assert.equal(jobAfterCascadeApprove.rows[0].cancel_source, 'sales');
      assert.equal(jobAfterCascadeApprove.rows[0].cancel_reason, `Cascade approve test ${runId}`);

      const driverAfterCascadeApprove = await query('select operational_status from drivers where id = $1', [cascadeApproveDriverId]);
      assert.equal(driverAfterCascadeApprove.rows[0].operational_status, 'Aktif');

      const vehicleAfterCascadeApprove = await query('select operational_status from vehicles where id = $1', [cascadeApproveVehicleId]);
      assert.equal(vehicleAfterCascadeApprove.rows[0].operational_status, 'Aktif');
    });

    await t.test('historical entry: periode bisa dikunci dan mencegah perubahan data lama', async () => {
      const period = await api('/api/historical-entry/periods/2026-07', { token: adminToken });
      assert.equal(period.status, 200);
      assert.equal(period.body.data.status, 'draft');

      const locked = await api('/api/historical-entry/periods/2026-07', {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'locked', notes: `Kunci periode ${runId}` },
      });
      assert.equal(locked.status, 200);
      assert.equal(locked.body.data.status, 'locked');

      const blockedUpdate = await api(`/api/sales-orders/${created.historicalOrderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          soNumber: created.historicalSoNumber,
          entrySource: 'historical',
          historicalPeriod: '2026-07',
          destination: 'Tujuan Ditolak',
          updatedBy: users.admin.name,
        }),
      });
      assert.equal(blockedUpdate.status, 409);
      assert.equal(blockedUpdate.body.error.code, 'HISTORICAL_PERIOD_LOCKED');

      const unlocked = await api('/api/historical-entry/periods/2026-07', {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'draft', notes: `Buka periode ${runId}` },
      });
      assert.equal(unlocked.status, 200);
      assert.equal(unlocked.body.data.status, 'draft');

      const lockLog = await latestActivity('LOCK_HISTORICAL_PERIOD');
      assert.equal(lockLog.action, 'LOCK_HISTORICAL_PERIOD');
      assert.equal(lockLog.actor_role, 'admin');
    });

    await t.test('container job: list, create via sales order, update, update status', async () => {
      const list = await api(`/api/container-jobs?query=${encodeURIComponent(created.orderSoNumber)}`, { token: adminToken });
      assert.equal(list.status, 200);
      assert.ok(list.body.data.rows.some((row) => row.id === created.jobId));

      const createJobLog = await latestActivityForEntity('CREATE_CONTAINER_JOB', created.jobId);
      assert.equal(createJobLog.action, 'CREATE_CONTAINER_JOB');
      assert.equal(createJobLog.metadata.entityId, created.jobId);

      const plate20 = `B-${String(runId).slice(-4)}-20T`;
      const plate40 = `B-${String(runId).slice(-4)}-40T`;
      const driverName = `Driver ${runId}`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [driverName, `08${String(runId).slice(-10)}`],
      );
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif'),
                 ($3, $4, 'Fuso', 'FN', '40FT', 'Aktif')
          on conflict (plate_number) do update
          set container_size = excluded.container_size,
              operational_status = 'Aktif',
              archived_at = null
        `,
        [`TRK-${String(runId).slice(-4)}-20`, plate20, `TRK-${String(runId).slice(-4)}-40`, plate40],
      );

      const mismatchedJob = await api(`/api/container-jobs/${created.jobId}/assignment`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          driver: driverName,
          plateNumber: plate40,
          status: 'running',
          runningAt: '2026-07-11T07:00:00.000Z',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(mismatchedJob.status, 400);
      assert.equal(mismatchedJob.body.error.code, 'VEHICLE_SIZE_MISMATCH');

      const submittedRpujJob = await api(`/api/container-jobs/${created.jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          driver: driverName,
          plateNumber: plate20,
          status: 'received',
          rpujStatus: 'submitted',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(submittedRpujJob.status, 200);
      assert.equal(submittedRpujJob.body.data.status, 'received');
      assert.equal(submittedRpujJob.body.data.rpujStatus, 'submitted');

      const updateLog = await latestActivity('UPDATE_CONTAINER_JOB');
      assert.equal(updateLog.action, 'UPDATE_CONTAINER_JOB');
      assert.equal(updateLog.metadata.entityId, created.jobId);

      const rpujRequestLog = await latestActivityForEntity('OPERATIONAL_REQUEST_RPUJ', created.jobId);
      assert.equal(rpujRequestLog.action, 'OPERATIONAL_REQUEST_RPUJ');

      const rpujQueue = await api(`/api/finance/rpuj-requests?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(rpujQueue.status, 200);
      assert.equal(rpujQueue.body.data.rows.some((row) => row.id === created.jobId && row.rpujStatus === 'submitted'), true);

      const approvedRpuj = await api(`/api/finance/rpuj-requests/${created.jobId}/approve`, {
        method: 'PATCH',
        token: financeToken,
      });
      assert.equal(approvedRpuj.status, 200);
      assert.equal(approvedRpuj.body.data.rpujStatus, 'approved');

      const updatedJob = await api(`/api/container-jobs/${created.jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          driver: driverName,
          plateNumber: plate20,
          status: 'running',
          runningAt: '2026-07-11T08:00:00.000Z',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(updatedJob.status, 200);
      assert.equal(updatedJob.body.data.status, 'running');

      const busyDriverMaster = await api(`/api/master/drivers?query=${encodeURIComponent(driverName)}`, { token: adminToken });
      assert.equal(busyDriverMaster.status, 200);
      assert.equal(busyDriverMaster.body.data.find((row) => row.name === driverName)?.status, 'Bertugas');
      const busyTruckMaster = await api(`/api/master/trucks?query=${encodeURIComponent(plate20)}`, { token: adminToken });
      assert.equal(busyTruckMaster.status, 200);
      assert.equal(busyTruckMaster.body.data.find((row) => row.plateNumber === plate20)?.status, 'Bertugas');

      const busyAssignmentSoNumber = `SO-BUSY-${runId}`;
      const busyAssignmentOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: busyAssignmentSoNumber }),
      });
      assert.equal(busyAssignmentOrder.status, 201);

      const busyAssignmentVerified = await api(`/api/finance/order-verifications/${busyAssignmentOrder.body.data.id}/so-number`, {
        method: 'PATCH',
        token: financeToken,
        body: { soNumber: busyAssignmentSoNumber },
      });
      assert.equal(busyAssignmentVerified.status, 200);

      const blockedBusyAssignment = await api(`/api/container-jobs/${busyAssignmentOrder.body.data.containers[0].id}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: `${busyAssignmentSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          driver: driverName,
          plateNumber: plate20,
          status: 'received',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(blockedBusyAssignment.status, 409);
      assert.equal(blockedBusyAssignment.body.error.code, 'ASSIGNMENT_ALREADY_ACTIVE');

      const statusLog = await latestActivity('UPDATE_JOB_STATUS');
      assert.equal(statusLog.action, 'UPDATE_JOB_STATUS');
      assert.equal(statusLog.metadata.fromStatus, 'received');
      assert.equal(statusLog.metadata.toStatus, 'running');

      const generatedSpk = await api(`/api/container-jobs/${created.jobId}/spk`, {
        method: 'POST',
        token: adminToken,
        body: { updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(generatedSpk.status, 200);
      assert.ok(generatedSpk.body.data.spkNumber);

      const transferProof = await api(`/api/finance/rpuj-requests/${created.jobId}/transfer-proof`, {
        method: 'POST',
        token: financeToken,
        body: {
          fileName: `transfer-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% transfer ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(transferProof.status, 200);
      assert.equal(transferProof.body.data.rpujStatus, 'paid');

      const approveRpujLog = await latestActivityForEntity('FINANCE_APPROVE_RPUJ', created.jobId);
      assert.equal(approveRpujLog.action, 'FINANCE_APPROVE_RPUJ');

      const uploadTransferLog = await latestActivityForEntity('FINANCE_UPLOAD_TRANSFER_PROOF', created.jobId);
      assert.equal(uploadTransferLog.action, 'FINANCE_UPLOAD_TRANSFER_PROOF');

      const generateSpkLog = await latestActivityForEntity('GENERATE_SPK', created.jobId);
      assert.equal(generateSpkLog.action, 'GENERATE_SPK');

      const requiredDocumentCategories = [
        'spkDocument',
        'eirDocument',
        'loadingVoucherDocument',
        'tilaGatepassDocumentFile',
        'travelDocumentFile',
      ];
      for (const category of requiredDocumentCategories) {
        const uploadRequiredDocument = await api('/api/attachments/upload', {
          method: 'POST',
          token: adminToken,
          body: {
            entityType: 'container_job',
            entityId: created.jobId,
            category,
            fileName: `${category}-${runId}.pdf`,
            mimeType: 'application/pdf',
            fileBase64: Buffer.from(`%PDF-1.4\n% ${category} ${runId}\n`).toString('base64'),
            uploadedByName: 'Sprint2C Operational',
          },
        });
        assert.equal(uploadRequiredDocument.status, 201);
      }

      const completedJob = await api(`/api/container-jobs/${created.jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          driver: driverName,
          plateNumber: plate20,
          status: 'completed',
          runningAt: '2026-07-11T08:00:00.000Z',
          completedAt: '2026-07-11T15:00:00.000Z',
          rpujStatus: 'approved',
          spkNumber: `SPK-${runId}`,
          eirNumber: `EIR-${runId}`,
          loadingVoucher: `BM-${runId}`,
          tilaGatepassDocument: `TILA-GP-${runId}`,
          travelDocument: `SJ-${runId}`,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(completedJob.status, 200);
      assert.equal(completedJob.body.data.status, 'completed');

      const releasedDriverMaster = await api(`/api/master/drivers?query=${encodeURIComponent(driverName)}`, { token: adminToken });
      assert.equal(releasedDriverMaster.body.data.find((row) => row.name === driverName)?.status, 'Aktif');
      const releasedTruckMaster = await api(`/api/master/trucks?query=${encodeURIComponent(plate20)}`, { token: adminToken });
      assert.equal(releasedTruckMaster.body.data.find((row) => row.plateNumber === plate20)?.status, 'Aktif');

      const completedOrder = await api(`/api/sales-orders/${created.orderId}`, { token: adminToken });
      assert.equal(completedOrder.status, 200);
      assert.equal(completedOrder.body.data.status, 'completed');

      const completedOperationsReport = await api(
        `/api/reports/operations?status=completed&dateFrom=2026-07-01&dateTo=2026-07-31&query=${encodeURIComponent(created.orderSoNumber)}`,
        { token: observerToken },
      );
      assert.equal(completedOperationsReport.status, 200);
      assert.ok(Array.isArray(completedOperationsReport.body.data.rows));
      assert.equal(
        completedOperationsReport.body.data.rows.some((row) => row.id === created.jobId),
        true,
      );

      const cannotCancelCompletedJob = await api(`/api/container-jobs/${created.jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          status: 'cancelled',
          cancelReason: 'Customer membatalkan setelah selesai',
          cancelSource: 'customer',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(cannotCancelCompletedJob.status, 409);
      assert.equal(cannotCancelCompletedJob.body.error.code, 'CONTAINER_JOB_COMPLETED_CANNOT_CANCEL');

      const cancelJobOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: created.cancelJobSoNumber }),
      });
      assert.equal(cancelJobOrder.status, 201);
      const cancelJobId = cancelJobOrder.body.data.containers[0].id;

      const cancelJobVerified = await api(`/api/finance/order-verifications/${cancelJobOrder.body.data.id}/so-number`, {
        method: 'PATCH',
        token: financeToken,
        body: { soNumber: created.cancelJobSoNumber },
      });
      assert.equal(cancelJobVerified.status, 200);

      const cancelledJob = await api(`/api/container-jobs/${cancelJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          status: 'cancelled',
          cancelReason: 'Customer hanya menjalankan sebagian container',
          cancelSource: 'customer',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(cancelledJob.status, 200);
      assert.equal(cancelledJob.body.data.status, 'cancelled');
      assert.equal(cancelledJob.body.data.cancelReason, 'Customer hanya menjalankan sebagian container');
      assert.equal(cancelledJob.body.data.cancelSource, 'customer');
      assert.equal(cancelledJob.body.data.cancelledByName, 'Sprint2C Operational');

      const cancelledOrder = await api(`/api/sales-orders/${cancelJobOrder.body.data.id}`, { token: adminToken });
      assert.equal(cancelledOrder.status, 200);
      assert.equal(cancelledOrder.body.data.status, 'cancelled');

      const cancelContainerLog = await latestActivityForEntity('CANCEL_CONTAINER_JOB', cancelJobId);
      assert.equal(cancelContainerLog.action, 'CANCEL_CONTAINER_JOB');
      assert.equal(cancelContainerLog.metadata.reason, 'Customer hanya menjalankan sebagian container');
      assert.equal(cancelContainerLog.metadata.source, 'customer');

      const requestedCancelSoNumber = `SO-${runId}-CANCEL-REQUEST`.toUpperCase();
      const cancelRequestOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: requestedCancelSoNumber }),
      });
      assert.equal(cancelRequestOrder.status, 201);
      const requestedCancelJobId = cancelRequestOrder.body.data.containers[0].id;
      const requestedCancelReason = 'Customer hanya menjalankan 2 dari 3 container';

      const requestedCancel = await api(`/api/container-jobs/${requestedCancelJobId}/cancel-request`, {
        method: 'PATCH',
        token: salesToken,
        body: { cancelRequestNote: requestedCancelReason },
      });
      assert.equal(requestedCancel.status, 200);
      assert.equal(requestedCancel.body.data.cancelRequestStatus, 'submitted');
      assert.equal(requestedCancel.body.data.cancelRequestNote, requestedCancelReason);

      const approvedCancel = await api(`/api/container-jobs/${requestedCancelJobId}/cancel-review`, {
        method: 'PATCH',
        token: adminToken,
        body: { approved: true, cancelSource: 'customer' },
      });
      assert.equal(approvedCancel.status, 200);
      assert.equal(approvedCancel.body.data.status, 'cancelled');
      assert.equal(approvedCancel.body.data.cancelReason, requestedCancelReason);
      assert.equal(approvedCancel.body.data.cancelSource, 'customer');
      assert.equal(approvedCancel.body.data.cancelledByName, users.admin.name);

      const approvedCancelLog = await latestActivityForEntity('CANCEL_CONTAINER_JOB', requestedCancelJobId);
      assert.equal(approvedCancelLog.action, 'CANCEL_CONTAINER_JOB');
      assert.equal(approvedCancelLog.metadata.reason, requestedCancelReason);
      assert.equal(approvedCancelLog.metadata.source, 'customer');

      const cancelRequestOrderDetail = await api(`/api/sales-orders/${cancelRequestOrder.body.data.id}`, { token: adminToken });
      assert.equal(cancelRequestOrderDetail.status, 200);
      assert.equal(cancelRequestOrderDetail.body.data.containers[0].status, 'cancelled');
      assert.equal(cancelRequestOrderDetail.body.data.containers[0].cancelReason, requestedCancelReason);
      assert.equal(cancelRequestOrderDetail.body.data.containers[0].cancelSource, 'customer');

      const cancelRequestOrderList = await api(`/api/sales-orders?status=cancelled&query=${encodeURIComponent(requestedCancelSoNumber)}`, { token: adminToken });
      assert.equal(cancelRequestOrderList.status, 200);
      assert.equal(cancelRequestOrderList.body.data.summary.cancelledContainers, 1);
    });

    await t.test('rekening dropping: biaya yang melebihi sisa saldo batch ditolak', async () => {
      const overspendSoNumber = `SO-OVERSPEND-${runId}`;
      const overspendOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: overspendSoNumber }),
      });
      assert.equal(overspendOrder.status, 201);
      const overspendJobId = overspendOrder.body.data.containers[0].id;
      const batchDate = '2099-12-31';
      await resetOperationalFundBatch(batchDate);

      const deposit = await api('/api/finance/operational-fund-deposits', {
        method: 'POST',
        token: financeToken,
        body: {
          requestDate: batchDate,
          amount: 100000,
          purpose: `Deposit test overspend ${runId}`,
          fileName: `deposit-overspend-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit overspend ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(deposit.status, 200);

      const proofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: overspendJobId,
          category: 'expenseProof',
          fileName: `expense-proof-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(proofUpload.status, 201);
      const proofAttachmentId = proofUpload.body.data.id;

      const tooExpensive = await api(`/api/container-jobs/${overspendJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 5000000,
          description: `Overspend test ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(tooExpensive.status, 409);
      assert.equal(tooExpensive.body.error.code, 'OPERATIONAL_FUND_INSUFFICIENT_BALANCE');

      const batchAfterRejection = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      assert.equal(batchAfterRejection.status, 200);
      assert.equal(Number(batchAfterRejection.body.data.rows.find((row) => row.batchDate === batchDate)?.balance), 100000);

      const withinBudget = await api(`/api/container-jobs/${overspendJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 40000,
          description: `Within budget test ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(withinBudget.status, 200);

      const batchAfterSuccess = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      assert.equal(batchAfterSuccess.status, 200);
      assert.equal(Number(batchAfterSuccess.body.data.rows.find((row) => row.batchDate === batchDate)?.balance), 60000);
    });

    await t.test('rekening dropping: idempotency key mencegah biaya tercatat dobel saat submit ulang', async () => {
      const idempotentSoNumber = `SO-IDEMPOTENT-${runId}`;
      const idempotentOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: idempotentSoNumber }),
      });
      assert.equal(idempotentOrder.status, 201);
      const idempotentJobId = idempotentOrder.body.data.containers[0].id;
      const batchDate = '2099-11-30';
      await resetOperationalFundBatch(batchDate);

      const deposit = await api('/api/finance/operational-fund-deposits', {
        method: 'POST',
        token: financeToken,
        body: {
          requestDate: batchDate,
          amount: 200000,
          purpose: `Deposit test idempotent ${runId}`,
          fileName: `deposit-idempotent-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit idempotent ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(deposit.status, 200);

      const proofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: idempotentJobId,
          category: 'expenseProof',
          fileName: `expense-proof-idempotent-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof idempotent ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(proofUpload.status, 201);
      const proofAttachmentId = proofUpload.body.data.id;

      const idempotencyKey = `idem-test-${runId}`;
      const expensePayload = {
        category: 'tol',
        expenseGroup: 'operational',
        amount: 50000,
        description: `Idempotent test ${runId}`,
        recipientType: 'vendor',
        recipientName: 'Vendor Test',
        paymentStatus: 'sudah_dibayar',
        paidAt: `${batchDate}T08:00:00.000Z`,
        proofAttachmentId,
        idempotencyKey,
        updatedBy: 'Sprint2C Operational',
      };

      const firstSubmit = await api(`/api/container-jobs/${idempotentJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: expensePayload,
      });
      assert.equal(firstSubmit.status, 200);

      const retrySubmit = await api(`/api/container-jobs/${idempotentJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: expensePayload,
      });
      assert.equal(retrySubmit.status, 200);
      assert.equal(retrySubmit.body.data.id, firstSubmit.body.data.id);

      const batchAfterRetry = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      assert.equal(batchAfterRetry.status, 200);
      assert.equal(Number(batchAfterRetry.body.data.rows.find((row) => row.batchDate === batchDate)?.balance), 150000);

      const jobExpenses = await api(`/api/container-jobs/${idempotentJobId}/expenses`, { token: adminToken });
      assert.equal(jobExpenses.status, 200);
      assert.equal(jobExpenses.body.data.filter((expense) => expense.description === expensePayload.description).length, 1);
    });

    await t.test('rekening dropping: kunci idempotency yang sama tapi datanya beda ditolak, tidak diam-diam pakai data lama', async () => {
      const mismatchSoNumber = `SO-IDEMMISMATCH-${runId}`;
      const mismatchOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: mismatchSoNumber }),
      });
      assert.equal(mismatchOrder.status, 201);
      const mismatchJobId = mismatchOrder.body.data.containers[0].id;
      const batchDate = '2099-05-31';
      await resetOperationalFundBatch(batchDate);

      const deposit = await api('/api/finance/operational-fund-deposits', {
        method: 'POST',
        token: financeToken,
        body: {
          requestDate: batchDate,
          amount: 200000,
          purpose: `Deposit test idempotency mismatch ${runId}`,
          fileName: `deposit-idemmismatch-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit idempotency mismatch ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(deposit.status, 200);

      const proofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: mismatchJobId,
          category: 'expensePaymentProof',
          fileName: `expense-proof-idemmismatch-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof idempotency mismatch ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(proofUpload.status, 201);
      const proofAttachmentId = proofUpload.body.data.id;

      const idempotencyKey = `idem-mismatch-test-${runId}`;
      const firstSubmit = await api(`/api/container-jobs/${mismatchJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 50000,
          description: `Idempotency mismatch original ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId,
          idempotencyKey,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(firstSubmit.status, 200);
      assert.equal(firstSubmit.body.data.amount, 50000);

      const mismatchedRetry = await api(`/api/container-jobs/${mismatchJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 90000,
          description: `Idempotency mismatch edited ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId,
          idempotencyKey,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(mismatchedRetry.status, 409);
      assert.equal(mismatchedRetry.body.error.code, 'CONTAINER_JOB_EXPENSE_IDEMPOTENCY_KEY_MISMATCH');

      const batchAfterMismatch = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      assert.equal(batchAfterMismatch.status, 200);
      assert.equal(Number(batchAfterMismatch.body.data.rows.find((row) => row.batchDate === batchDate)?.balance), 150000);
    });

    await t.test('rekening dropping: koreksi biaya menyimpan nilai sebelum diubah di activity log', async () => {
      const auditSoNumber = `SO-AUDITTRAIL-${runId}`;
      const auditOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: auditSoNumber }),
      });
      assert.equal(auditOrder.status, 201);
      const auditJobId = auditOrder.body.data.containers[0].id;
      const batchDate = '2099-10-31';
      await resetOperationalFundBatch(batchDate);

      const deposit = await api('/api/finance/operational-fund-deposits', {
        method: 'POST',
        token: financeToken,
        body: {
          requestDate: batchDate,
          amount: 2000000,
          purpose: `Deposit test audit trail ${runId}`,
          fileName: `deposit-audit-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit audit ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(deposit.status, 200);

      const proofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: auditJobId,
          category: 'expenseProof',
          fileName: `expense-proof-audit-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof audit ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(proofUpload.status, 201);
      const proofAttachmentId = proofUpload.body.data.id;

      const created = await api(`/api/container-jobs/${auditJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 800000,
          description: `Audit trail test ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(created.status, 200);
      const auditExpenseId = created.body.data.id;

      const flaggedForClarification = await api(`/api/finance/container-job-expenses/${auditExpenseId}/reconcile`, {
        method: 'PATCH',
        token: financeToken,
        body: {
          financeCheckStatus: 'perlu_klarifikasi',
          financeNote: `Nominal kurang wajar ${runId}`,
        },
      });
      assert.equal(flaggedForClarification.status, 200);

      const reconcileLog = await latestActivityForEntity('FINANCE_RECONCILE_CONTAINER_JOB_EXPENSE', auditExpenseId);
      assert.equal(reconcileLog.metadata.beforeData.financeCheckStatus, 'belum_dicek');
      assert.equal(reconcileLog.metadata.afterData.financeCheckStatus, 'perlu_klarifikasi');

      const corrected = await api(`/api/container-jobs/${auditJobId}/expenses/${auditExpenseId}/correction`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          category: 'tol',
          amount: 300000,
          description: `Audit trail test dikoreksi ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(corrected.status, 200);
      assert.equal(corrected.body.data.amount, 300000);

      const correctionLog = await latestActivityForEntity('OPERATIONAL_CORRECT_CONTAINER_JOB_EXPENSE', auditExpenseId);
      assert.equal(correctionLog.metadata.beforeData.amount, 800000);
      assert.equal(correctionLog.metadata.beforeData.description, `Audit trail test ${runId}`);
      assert.equal(correctionLog.metadata.afterData.amount, 300000);

      const batchAfterCorrection = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      assert.equal(batchAfterCorrection.status, 200);
      assert.equal(Number(batchAfterCorrection.body.data.rows.find((row) => row.batchDate === batchDate)?.balance), 1700000);
    });

    await t.test('rekening dropping: status cek biaya tidak bisa diubah lagi setelah batch ditutup', async () => {
      const closedSoNumber = `SO-CLOSEDCHECK-${runId}`;
      const closedOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: closedSoNumber }),
      });
      assert.equal(closedOrder.status, 201);
      const closedJobId = closedOrder.body.data.containers[0].id;
      const batchDate = '2099-07-31';
      await resetOperationalFundBatch(batchDate);

      const deposit = await api('/api/finance/operational-fund-deposits', {
        method: 'POST',
        token: financeToken,
        body: {
          requestDate: batchDate,
          amount: 100000,
          purpose: `Deposit test closed check ${runId}`,
          fileName: `deposit-closedcheck-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit closed check ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(deposit.status, 200);

      const proofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: closedJobId,
          category: 'expenseProof',
          fileName: `expense-proof-closedcheck-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof closed check ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(proofUpload.status, 201);
      const proofAttachmentId = proofUpload.body.data.id;

      const created = await api(`/api/container-jobs/${closedJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 50000,
          description: `Closed check test ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(created.status, 200);
      const closedExpenseId = created.body.data.id;

      const checked = await api(`/api/finance/container-job-expenses/${closedExpenseId}/reconcile`, {
        method: 'PATCH',
        token: financeToken,
        body: { financeCheckStatus: 'sudah_dicek' },
      });
      assert.equal(checked.status, 200);

      const batchBeforeClose = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      assert.equal(batchBeforeClose.status, 200);
      const batchId = batchBeforeClose.body.data.rows.find((row) => row.batchDate === batchDate)?.id;
      assert.ok(batchId);

      const closed = await api(`/api/finance/operational-fund-batches/${batchId}/close`, {
        method: 'PATCH',
        token: financeToken,
        body: {},
      });
      assert.equal(closed.status, 200);
      assert.equal(closed.body.data.status, 'closed');

      const reopenAttempt = await api(`/api/finance/container-job-expenses/${closedExpenseId}/reconcile`, {
        method: 'PATCH',
        token: financeToken,
        body: { financeCheckStatus: 'perlu_klarifikasi', financeNote: `Coba buka lagi ${runId}` },
      });
      assert.equal(reopenAttempt.status, 409);
      assert.equal(reopenAttempt.body.error.code, 'OPERATIONAL_FUND_BATCH_CLOSED');
    });

    await t.test('rekening dropping: cek status biaya mengunci baris batch agar tidak balapan dengan tutup batch', async () => {
      const reconcileLockSoNumber = `SO-RECONCILELOCK-${runId}`;
      const reconcileLockOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: reconcileLockSoNumber }),
      });
      assert.equal(reconcileLockOrder.status, 201);
      const reconcileLockJobId = reconcileLockOrder.body.data.containers[0].id;
      const batchDate = '2099-06-30';
      await resetOperationalFundBatch(batchDate);

      const deposit = await api('/api/finance/operational-fund-deposits', {
        method: 'POST',
        token: financeToken,
        body: {
          requestDate: batchDate,
          amount: 100000,
          purpose: `Deposit test reconcile lock ${runId}`,
          fileName: `deposit-reconcilelock-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit reconcile lock ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(deposit.status, 200);

      const proofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: reconcileLockJobId,
          category: 'expensePaymentProof',
          fileName: `expense-proof-reconcilelock-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof reconcile lock ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(proofUpload.status, 201);

      const created = await api(`/api/container-jobs/${reconcileLockJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 50000,
          description: `Reconcile lock test ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId: proofUpload.body.data.id,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(created.status, 200);
      const reconcileLockExpenseId = created.body.data.id;

      const batchLookup = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      assert.equal(batchLookup.status, 200);
      const batchId = batchLookup.body.data.rows.find((row) => row.batchDate === batchDate)?.id;
      assert.ok(batchId);

      const holderClient = await pool.connect();
      const waiterClient = await pool.connect();
      try {
        await holderClient.query('begin');
        await holderClient.query('select id, status from operational_fund_batches where id = $1 for update', [batchId]);

        await waiterClient.query('begin');
        const waiterQuery = waiterClient.query(
          `
            select batch.status
            from operational_fund_transactions oft
            join operational_fund_batches batch on batch.id = oft.batch_id
            where oft.container_job_expense_id = $1
              and oft.transaction_type = 'debit'
              and oft.status = 'posted'
            limit 1
            for update of batch
          `,
          [reconcileLockExpenseId],
        );

        const stillBlocked = await Promise.race([
          waiterQuery.then(() => 'resolved'),
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 300)),
        ]);
        assert.equal(stillBlocked, 'timeout', 'cek status biaya seharusnya menunggu selama batch sedang ditutup');

        await holderClient.query('commit');

        const releasedInTime = await Promise.race([
          waiterQuery.then(() => 'resolved'),
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 2000)),
        ]);
        assert.equal(releasedInTime, 'resolved', 'cek status biaya seharusnya lanjut begitu penutupan batch commit atau gagal');

        await waiterClient.query('commit');
      } finally {
        holderClient.release();
        waiterClient.release();
      }
    });

    await t.test('sales order: billing status workflow bisa disimpan setelah operational selesai', async () => {
      const invoiceQueue = await api(`/api/finance/invoices?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(invoiceQueue.status, 200);
      assert.ok(invoiceQueue.body.data.rows.some((row) => row.id === created.orderId));

      const financeInvoice = await api(`/api/finance/invoices/${created.orderId}/number`, {
        method: 'PATCH',
        token: financeToken,
        body: {
          invoiceNumber: `INV-${runId}-001`,
        },
      });
      assert.equal(financeInvoice.status, 200);
      assert.equal(financeInvoice.body.data.invoiceNumber, `INV-${runId}-001`);
      assert.equal(financeInvoice.body.data.invoiceStatus, 'Butuh Nomor Invoice');
      assert.ok(financeInvoice.body.data.invoiceDate);
      assert.ok(financeInvoice.body.data.dueDate);
      assert.equal(
        Math.round((new Date(financeInvoice.body.data.dueDate) - new Date(financeInvoice.body.data.invoiceDate)) / 86400000),
        14,
      );

      const invoiceLog = await latestActivityForEntity('FINANCE_INPUT_INVOICE_NUMBER', created.orderId);
      assert.equal(invoiceLog.action, 'FINANCE_INPUT_INVOICE_NUMBER');
      const invoicePdfBase64 = Buffer.from(`%PDF-1.4\n% invoice ${runId}\n`).toString('base64');
      const uploadedInvoiceDocument = await api(`/api/finance/invoices/${created.orderId}/documents/invoice`, {
        method: 'POST',
        token: financeToken,
        body: {
          fileName: `invoice-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: invoicePdfBase64,
        },
      });
      assert.equal(uploadedInvoiceDocument.status, 200);
      assert.equal(uploadedInvoiceDocument.body.data.invoiceDocumentStatus, 'belum_upload');

      const uploadedTaxInvoiceDocument = await api(`/api/finance/invoices/${created.orderId}/documents/tax_invoice`, {
        method: 'POST',
        token: financeToken,
        body: {
          fileName: `faktur-pajak-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: invoicePdfBase64,
        },
      });
      assert.equal(uploadedTaxInvoiceDocument.status, 200);
      assert.equal(uploadedTaxInvoiceDocument.body.data.invoiceDocumentStatus, 'siap_dikirim');

      const sentInvoice = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: salesToken,
        body: { billingStatus: 'belum_diterima', deliveryMethod: 'whatsapp' },
      });
      assert.equal(sentInvoice.status, 200);
      assert.equal(sentInvoice.body.data.billingStatus, 'belum_diterima');
      assert.equal(sentInvoice.body.data.invoiceNumber, `INV-${runId}-001`);

      const sendInvoiceLog = await latestActivityForEntity('SALES_SEND_INVOICE', created.orderId);
      assert.equal(sendInvoiceLog.action, 'SALES_SEND_INVOICE');

      const updatedBilling = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: salesToken,
        body: { billingStatus: 'menunggu_pembayaran', deliveryMethod: 'whatsapp' },
      });
      assert.equal(updatedBilling.status, 200);
      assert.equal(updatedBilling.body.data.billingStatus, 'menunggu_pembayaran');

      const deliveryStatusLog = await latestActivityForEntity('SALES_UPDATE_INVOICE_DELIVERY_STATUS', created.orderId);
      assert.equal(deliveryStatusLog.action, 'SALES_UPDATE_INVOICE_DELIVERY_STATUS');

      const blockedInvoiceNumberMutation = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: salesToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          status: 'completed',
          invoiceNumber: `INV-${runId}-SALES-BLOCKED`,
          billingStatus: 'lunas',
          updatedBy: 'Sprint2C Sales',
          containers: [
            {
              id: created.jobId,
              containerNumber: `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
              size: '20FT',
              type: 'Dry',
              status: 'completed',
              driver: `Driver ${runId}`,
              plateNumber: `B-${String(runId).slice(-4)}-20T`,
              rpujStatus: 'paid',
              spkNumber: `SPK-${runId}`,
              loadingVoucher: `BM-${runId}`,
              tilaGatepassDocument: `TILA-GP-${runId}`,
              travelDocument: `SJ-${runId}`,
              runningAt: '2026-07-11T08:00:00.000Z',
              completedAt: '2026-07-11T15:00:00.000Z',
            },
          ],
        }),
      });
      assert.equal(blockedInvoiceNumberMutation.status, 403);
      assert.equal(blockedInvoiceNumberMutation.body.error.code, 'SALES_ORDER_FINANCE_NUMBER_LOCKED_ADMIN_ONLY');

      const blockedCancellationAfterRpuj = await api(`/api/sales-orders/${created.orderId}/cancel-request`, {
        method: 'PATCH',
        token: salesToken,
        body: { cancelRequestNote: 'Customer meminta pembatalan setelah RPUJ dikirim' },
      });
      assert.equal(blockedCancellationAfterRpuj.status, 403);
      assert.equal(blockedCancellationAfterRpuj.body.error.code, 'SALES_ORDER_FINANCE_NUMBER_LOCKED_ADMIN_ONLY');

      const blockedDirectCancellationAfterRpuj = await api(`/api/sales-orders/${created.orderId}/cancel`, {
        method: 'PATCH',
        token: salesToken,
        body: {},
      });
      assert.equal(blockedDirectCancellationAfterRpuj.status, 403);
      assert.equal(blockedDirectCancellationAfterRpuj.body.error.code, 'SALES_ORDER_FINANCE_NUMBER_LOCKED_ADMIN_ONLY');

      const blockedContainerCancellationAfterRpuj = await api(`/api/container-jobs/${created.jobId}/cancel-request`, {
        method: 'PATCH',
        token: salesToken,
        body: { cancelRequestNote: 'Container dibatalkan setelah RPUJ dikirim' },
      });
      assert.equal(blockedContainerCancellationAfterRpuj.status, 403);
      assert.equal(blockedContainerCancellationAfterRpuj.body.error.code, 'CONTAINER_JOB_RPUJ_LOCKED_ADMIN_ONLY');
    });

    await t.test('sales order: customer_id tetap terhubung meski nama customer beda huruf besar/kecil atau ada spasi ekstra', async () => {
      const customerName = `Customer TZ ${runId}`;
      const insertedCustomer = await query(
        "insert into customers (name) values ($1) returning id",
        [customerName],
      );
      const customerId = insertedCustomer.rows[0].id;

      const messyNameOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({
          soNumber: `${created.orderSoNumber}-CUSTFIX`,
          customer: `  ${customerName.toUpperCase()}  `,
        }),
      });
      assert.equal(messyNameOrder.status, 201);
      assert.equal(messyNameOrder.body.data.customerId, customerId);
    });

    await t.test('sales order: ringkasan outstanding customer dihitung dari nama yang dinormalisasi', async () => {
      const invoiceDetail = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.equal(invoiceDetail.status, 200);
      const billingAmount = Number(invoiceDetail.body.data.billingAmount);
      assert.ok(billingAmount > 0);

      const forbiddenOperational = await api(`/api/sales-orders/customer-outstanding?customer=${encodeURIComponent(`Customer ${runId}`)}`, { token: operationalToken });
      assert.equal(forbiddenOperational.status, 403, 'Operational tidak boleh melihat ringkasan outstanding customer (visibility ini untuk Sales/Finance/Admin/Observer)');
      assert.equal(forbiddenOperational.body.error.code, 'FORBIDDEN');

      const orderCustomer = `Customer ${runId}`;
      const exactMatch = await api(`/api/sales-orders/customer-outstanding?customer=${encodeURIComponent(orderCustomer)}`, { token: salesToken });
      assert.equal(exactMatch.status, 200);
      assert.equal(exactMatch.body.data.openInvoiceCount, 1);
      assert.equal(exactMatch.body.data.totalOutstandingAmount, billingAmount);
      assert.equal(exactMatch.body.data.overdueCount, 0);

      const messyQuery = await api(`/api/sales-orders/customer-outstanding?customer=${encodeURIComponent(`  ${orderCustomer.toUpperCase()}  `)}`, { token: salesToken });
      assert.equal(messyQuery.status, 200);
      assert.equal(messyQuery.body.data.totalOutstandingAmount, billingAmount);

      const noSuchCustomer = await api(`/api/sales-orders/customer-outstanding?customer=${encodeURIComponent(`Tidak Ada ${runId}`)}`, { token: salesToken });
      assert.equal(noSuchCustomer.status, 200);
      assert.equal(noSuchCustomer.body.data.totalOutstandingAmount, 0);
      assert.equal(noSuchCustomer.body.data.openInvoiceCount, 0);
    });

    await t.test('finance: pembayaran invoice dicatat Finance dan menutup outstanding jadi lunas', async () => {
      const blockedSalesLunas = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: salesToken,
        body: { billingStatus: 'lunas' },
      });
      assert.equal(blockedSalesLunas.status, 400);
      assert.equal(blockedSalesLunas.body.error.code, 'INVALID_INVOICE_DELIVERY_STATUS');

      const forbiddenPayment = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: salesToken,
        body: { amount: 1000 },
      });
      assert.equal(forbiddenPayment.status, 403);
      assert.equal(forbiddenPayment.body.error.code, 'FORBIDDEN');

      const emptyPayments = await api(`/api/finance/invoices/${created.orderId}/payments`, { token: financeToken });
      assert.equal(emptyPayments.status, 200);
      assert.deepEqual(emptyPayments.body.data, []);

      const invoiceDetail = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.equal(invoiceDetail.status, 200);
      const billingAmount = Number(invoiceDetail.body.data.billingAmount);
      assert.ok(billingAmount > 0);

      const proofFile = {
        fileName: `payment-proof-${runId}-1.pdf`,
        mimeType: 'application/pdf',
        fileBase64: Buffer.from(`%PDF-1.4\n% payment proof 1 ${runId}\n`).toString('base64'),
      };

      const missingProof = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 1000 },
      });
      assert.equal(missingProof.status, 400);
      assert.equal(missingProof.body.error.code, 'SALES_ORDER_PAYMENT_PROOF_REQUIRED');

      const invalidAmount = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 0, proofFile },
      });
      assert.equal(invalidAmount.status, 400);
      assert.equal(invalidAmount.body.error.code, 'SALES_ORDER_PAYMENT_AMOUNT_INVALID');

      const overpay = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: billingAmount + 1000, proofFile },
      });
      assert.equal(overpay.status, 409);
      assert.equal(overpay.body.error.code, 'SALES_ORDER_PAYMENT_EXCEEDS_OUTSTANDING');

      const partialAmount = Math.max(1, Math.floor(billingAmount / 2));
      const partialIdempotencyKey = randomUUID();
      const partialPaymentBody = {
        amount: partialAmount,
        referenceNumber: `TRF-${runId}-1`,
        note: 'Pembayaran termin pertama',
        proofFile,
        idempotencyKey: partialIdempotencyKey,
      };
      const partialPayment = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: partialPaymentBody,
      });
      assert.equal(partialPayment.status, 200);
      assert.equal(partialPayment.body.data.totalPaid, partialAmount);
      assert.equal(partialPayment.body.data.outstandingAmount, billingAmount - partialAmount);
      assert.notEqual(partialPayment.body.data.billingStatus, 'lunas');

      const mismatchedRetry = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { ...partialPaymentBody, amount: partialAmount + 1 },
      });
      assert.equal(mismatchedRetry.status, 409);
      assert.equal(mismatchedRetry.body.error.code, 'SALES_ORDER_PAYMENT_IDEMPOTENCY_KEY_MISMATCH');

      const replayedPayment = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: partialPaymentBody,
      });
      assert.equal(replayedPayment.status, 200);
      assert.equal(replayedPayment.body.data.totalPaid, partialAmount);
      assert.equal(replayedPayment.body.data.outstandingAmount, billingAmount - partialAmount);

      const paymentsAfterPartial = await api(`/api/finance/invoices/${created.orderId}/payments`, { token: financeToken });
      assert.equal(paymentsAfterPartial.status, 200);
      assert.equal(paymentsAfterPartial.body.data.length, 1, 'replay dengan idempotency key yang sama tidak boleh menghasilkan baris pembayaran dobel');
      assert.equal(paymentsAfterPartial.body.data[0].amount, partialAmount);
      assert.equal(paymentsAfterPartial.body.data[0].referenceNumber, `TRF-${runId}-1`);

      const remainingAmount = billingAmount - partialAmount;
      const finalPayment = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: remainingAmount, referenceNumber: `TRF-${runId}-2`, proofFile },
      });
      assert.equal(finalPayment.status, 200);
      assert.equal(finalPayment.body.data.totalPaid, billingAmount);
      assert.equal(finalPayment.body.data.outstandingAmount, 0);
      assert.equal(finalPayment.body.data.billingStatus, 'lunas');

      const paymentLog = await latestActivityForEntity('FINANCE_RECORD_INVOICE_PAYMENT', created.orderId);
      assert.equal(paymentLog.action, 'FINANCE_RECORD_INVOICE_PAYMENT');
      assert.equal(paymentLog.actor_role, 'finance');

      const invoiceAfterPaid = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.equal(invoiceAfterPaid.status, 200);

      const alreadyPaid = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 1000, proofFile },
      });
      assert.equal(alreadyPaid.status, 409);
      assert.equal(alreadyPaid.body.error.code, 'SALES_ORDER_PAYMENT_ALREADY_PAID');
    });

    await t.test('finance: customer outstanding dashboard hanya menampilkan SO yang belum lunas', async () => {
      const forbiddenOutstanding = await api('/api/finance/outstanding', { token: salesToken });
      assert.equal(forbiddenOutstanding.status, 403);
      assert.equal(forbiddenOutstanding.body.error.code, 'FORBIDDEN');

      const outstanding = await api(`/api/finance/outstanding?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(outstanding.status, 200);
      assert.ok(Array.isArray(outstanding.body.data.rows));
      assert.equal(outstanding.body.data.rows.some((row) => row.id === created.orderId), false);
      assert.equal(typeof outstanding.body.data.summary.totalOutstandingAmount, 'number');
      assert.equal(typeof outstanding.body.data.summary.needsReview, 'number');
    });

    await t.test('finance: SO yang kebuka lagi setelah koreksi tetap muncul di outstanding walau billing_status masih tersimpan lunas', async () => {
      // Simulasikan koreksi (pembayaran dihapus/dibatalkan lewat perbaikan data) sehingga sisa
      // outstanding riil kembali positif, tapi kolom billing_status di sales_orders belum
      // diperbarui otomatis oleh siapa pun (persis skenario yang diperbaiki: dashboard dan
      // pencatatan pembayaran harus mengikuti sisa yang dihitung ulang, bukan flag yang tersimpan).
      const paymentsBefore = await api(`/api/finance/invoices/${created.orderId}/payments`, { token: financeToken });
      assert.equal(paymentsBefore.status, 200);
      const lastPayment = paymentsBefore.body.data[0];
      assert.ok(lastPayment);

      await query('delete from sales_order_payments where id = $1', [lastPayment.id]);

      const statusStillLunas = await query('select billing_status from sales_orders where id = $1', [created.orderId]);
      assert.equal(statusStillLunas.rows[0].billing_status, 'lunas', 'billing_status seharusnya belum berubah otomatis setelah koreksi manual ini');

      const outstandingAfterCorrection = await api(`/api/finance/outstanding?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(outstandingAfterCorrection.status, 200);
      const reopenedRow = outstandingAfterCorrection.body.data.rows.find((row) => row.id === created.orderId);
      assert.ok(reopenedRow, 'SO yang sisa outstanding-nya kembali positif harus muncul lagi di dashboard walau billing_status masih lunas di database');
      assert.equal(reopenedRow.outstandingAmount, Number(lastPayment.amount));

      const reopenedPayment = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: {
          amount: lastPayment.amount,
          referenceNumber: lastPayment.referenceNumber,
          proofFile: {
            fileName: `payment-proof-${runId}-reopen.pdf`,
            mimeType: 'application/pdf',
            fileBase64: Buffer.from(`%PDF-1.4\n% payment proof reopen ${runId}\n`).toString('base64'),
          },
        },
      });
      assert.equal(reopenedPayment.status, 200, 'pembayaran baru harus tetap bisa dicatat meski billing_status tersimpan masih lunas, karena sisa riilnya positif');
      assert.equal(reopenedPayment.body.data.billingStatus, 'lunas');
      assert.equal(reopenedPayment.body.data.outstandingAmount, 0);
    });

    await t.test('finance: perhitungan umur piutang memakai kalender Asia/Jakarta, bukan timezone sesi koneksi DB', async () => {
      // 2026-08-02 03:00 WIB jatuh di tanggal 2026-08-01 kalau di-cast pakai UTC,
      // jadi kalau kode aging pernah balik pakai due_date::date polos, test ini akan gagal
      // begitu koneksi DB berjalan di server dengan session timezone selain Asia/Jakarta.
      const client = await pool.connect();
      try {
        await client.query("set time zone 'UTC'");
        const underUtcSession = await client.query(`
          select
            $1::timestamptz::date::text as naive_cast,
            (($1::timestamptz at time zone 'Asia/Jakarta')::date)::text as explicit_jakarta_cast
        `, ['2026-08-02T03:00:00+07:00']);
        assert.equal(underUtcSession.rows[0].naive_cast, '2026-08-01');
        assert.equal(underUtcSession.rows[0].explicit_jakarta_cast, '2026-08-02');

        await client.query("set time zone 'Asia/Jakarta'");
        const underJakartaSession = await client.query(`
          select
            $1::timestamptz::date::text as naive_cast,
            (($1::timestamptz at time zone 'Asia/Jakarta')::date)::text as explicit_jakarta_cast
        `, ['2026-08-02T03:00:00+07:00']);
        assert.equal(underJakartaSession.rows[0].naive_cast, '2026-08-02');
        assert.equal(underJakartaSession.rows[0].explicit_jakarta_cast, '2026-08-02');
      } finally {
        await client.query('reset time zone');
        client.release();
      }
    });

    await t.test('finance: dashboard dan perjalanan selesai read-only', async () => {
      const dashboard = await api(`/api/finance/dashboard?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(dashboard.status, 200);
      assert.equal(typeof dashboard.body.data.totalCompletedTrips, 'number');
      assert.ok(dashboard.body.data.totalCompletedTrips >= 1);
      assert.equal(typeof dashboard.body.data.queues, 'object');
      assert.equal(typeof dashboard.body.data.queues.pendingSo, 'number');
      assert.equal(typeof dashboard.body.data.queues.rpujSubmitted, 'number');
      assert.equal(typeof dashboard.body.data.queues.invoiceWaitingSales, 'number');

      const completedTrips = await api(`/api/finance/completed-trips?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(completedTrips.status, 200);
      assert.ok(Array.isArray(completedTrips.body.data.rows));
      assert.equal(completedTrips.body.data.rows.some((row) => row.id === created.jobId), true);
      assert.equal(completedTrips.body.data.rows.every((row) => row.completedAt), true);
      const recapRow = completedTrips.body.data.rows.find((row) => row.id === created.jobId);
      assert.ok(['LENGKAP', 'SIAP_DITAGIHKAN'].includes(recapRow.documentStatus));
      assert.equal(recapRow.documents.hasSpk, true);
      assert.equal(recapRow.documents.hasLoadingVoucher, true);
      assert.equal(recapRow.documents.hasTilaGatepass, true);
      assert.equal(recapRow.documents.hasTravelDocument, true);

      const detail = await api(`/api/finance/completed-trips/${created.jobId}`, { token: financeToken });
      assert.equal(detail.status, 200);
      assert.equal(detail.body.data.id, created.jobId);
      assert.ok(Array.isArray(detail.body.data.attachments));

      const blockedUpdate = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: financeToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          invoiceNumber: `INV-${runId}-FINANCE-BLOCKED`,
          billingStatus: 'lunas',
        }),
      });
      assert.equal(blockedUpdate.status, 403);
      assert.equal(blockedUpdate.body.error.code, 'FORBIDDEN');

      const blockedDeliveryStatus = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: financeToken,
        body: { billingStatus: 'lunas' },
      });
      assert.equal(blockedDeliveryStatus.status, 403);
      assert.equal(blockedDeliveryStatus.body.error.code, 'FORBIDDEN');
    });

    await t.test('attachments: upload, list, delete, fileBase64 tidak masuk activity log metadata', async () => {
      const invalidUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: created.jobId,
          category: 'otherDocument',
          fileName: `${runId}.exe`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from('%PDF-1.4\n% Invalid extension\n').toString('base64'),
        },
      });
      assert.equal(invalidUpload.status, 400);
      assert.equal(invalidUpload.body.error.code, 'INVALID_FILE_EXTENSION');

      const upload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: created.jobId,
          category: 'otherDocument',
          referenceNumber: `REF-${runId}`,
          documentDate: '2026-07-10',
          fileName: `${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from('%PDF-1.4\n% Sprint 2C test\n').toString('base64'),
          notes: `Attachment ${runId}`,
          uploadedByName: 'Sprint2C Admin',
        },
      });
      assert.equal(upload.status, 201);
      assert.equal(upload.body.data.entityId, created.jobId);
      assert.match(upload.body.data.storagePath, /^Sales Order[\\/]+\d{4}[\\/]+\d{2} - [^\\/]+[\\/]+SO-/);
      assert.match(upload.body.data.storagePath, /[\\/]+02 - Dokumen Container[\\/]+JOB-[A-F0-9]{8}[\\/]+Dokumen Lainnya[\\/]+/);
      created.attachmentId = upload.body.data.id;
      const temporaryFiles = await readdir(`${process.env.UPLOAD_DIR}/File Sementara/File yang sedang diproses`);
      assert.equal(temporaryFiles.length, 0);

      const list = await api(`/api/attachments?entityType=container_job&entityId=${created.jobId}`, { token: adminToken });
      assert.equal(list.status, 200);
      assert.ok(list.body.data.some((attachment) => attachment.id === created.attachmentId));

      const downloaded = await fetch(`${baseUrl}/api/attachments/${created.attachmentId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(downloaded.status, 200);
      assert.equal(downloaded.headers.get('content-type'), 'application/pdf');

      const uploadLog = await latestActivity('UPLOAD_ATTACHMENT');
      assert.equal(uploadLog.action, 'UPLOAD_ATTACHMENT');
      assert.equal(JSON.stringify(uploadLog.metadata).includes('fileBase64'), false);
      assert.equal(JSON.stringify(uploadLog.metadata).includes('%PDF'), false);

      const deleted = await api(`/api/attachments/${created.attachmentId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(deleted.status, 200);
      assert.equal(deleted.body.data.id, created.attachmentId);
      assert.ok(deleted.body.data.trashId);

      const deletedDownload = await fetch(`${baseUrl}/api/attachments/${created.attachmentId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(deletedDownload.status, 404);

      const forbiddenTrash = await api('/api/storage/trash', { token: observerToken });
      assert.equal(forbiddenTrash.status, 403);

      const trashList = await api(`/api/storage/trash?sourceId=${created.attachmentId}`, { token: adminToken });
      assert.equal(trashList.status, 200);
      assert.equal(trashList.body.data.total, 1);
      const trashId = trashList.body.data.rows[0].id;

      const restored = await api(`/api/storage/trash/${trashId}/restore`, {
        method: 'POST',
        token: adminToken,
      });
      assert.equal(restored.status, 200);

      const restoredDownload = await fetch(`${baseUrl}/api/attachments/${created.attachmentId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(restoredDownload.status, 200);

      const deletedAgain = await api(`/api/attachments/${created.attachmentId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(deletedAgain.status, 200);
      const purged = await api(`/api/storage/trash/${deletedAgain.body.data.trashId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(purged.status, 200);

      const emptyTrash = await api(`/api/storage/trash?sourceId=${created.attachmentId}`, { token: adminToken });
      assert.equal(emptyTrash.status, 200);
      assert.equal(emptyTrash.body.data.total, 0);
    });

    await t.test('attachments: bukti finance tidak bisa diunduh role tanpa izin finance', async () => {
      const expenseProofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: created.jobId,
          category: 'expensePaymentProof',
          fileName: `expense-proof-access-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof access ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Admin',
        },
      });
      assert.equal(expenseProofUpload.status, 201);
      const expenseProofId = expenseProofUpload.body.data.id;

      const expenseProofDeniedForSales = await fetch(`${baseUrl}/api/attachments/${expenseProofId}`, {
        headers: { Authorization: `Bearer ${salesToken}` },
      });
      assert.equal(expenseProofDeniedForSales.status, 403);
      assert.equal((await expenseProofDeniedForSales.json()).error.code, 'ATTACHMENT_ACCESS_DENIED');

      const expenseProofAllowedForFinance = await fetch(`${baseUrl}/api/attachments/${expenseProofId}`, {
        headers: { Authorization: `Bearer ${financeToken}` },
      });
      assert.equal(expenseProofAllowedForFinance.status, 200);

      const expenseProofAllowedForAdmin = await fetch(`${baseUrl}/api/attachments/${expenseProofId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(expenseProofAllowedForAdmin.status, 200);

      const otherDocumentUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: created.jobId,
          category: 'eirDocument',
          fileName: `eir-access-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% eir access ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Admin',
        },
      });
      assert.equal(otherDocumentUpload.status, 201);

      const eirAllowedForSales = await fetch(`${baseUrl}/api/attachments/${otherDocumentUpload.body.data.id}`, {
        headers: { Authorization: `Bearer ${salesToken}` },
      });
      assert.equal(eirAllowedForSales.status, 200);

      const depositProofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'operational_fund_transaction',
          entityId: randomUUID(),
          category: 'transferProof',
          fileName: `deposit-proof-access-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit proof access ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Admin',
        },
      });
      assert.equal(depositProofUpload.status, 201);

      const depositProofDeniedForObserver = await fetch(`${baseUrl}/api/attachments/${depositProofUpload.body.data.id}`, {
        headers: { Authorization: `Bearer ${observerToken}` },
      });
      assert.equal(depositProofDeniedForObserver.status, 403);
      assert.equal((await depositProofDeniedForObserver.json()).error.code, 'ATTACHMENT_ACCESS_DENIED');
    });

    await t.test('attachments: daftar dokumen finance juga dibatasi izin, dokumen operasional tetap terbuka', async () => {
      const commissionPaymentEntityId = randomUUID();
      const commissionProofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'driver_commission_payment',
          entityId: commissionPaymentEntityId,
          category: 'driverCommissionTransferProof',
          fileName: `commission-proof-list-access-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% commission proof list access ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Admin',
        },
      });
      assert.equal(commissionProofUpload.status, 201);

      const commissionListDeniedForSales = await api(`/api/attachments?entityType=driver_commission_payment&entityId=${commissionPaymentEntityId}`, { token: salesToken });
      assert.equal(commissionListDeniedForSales.status, 403);
      assert.equal(commissionListDeniedForSales.body.error.code, 'ATTACHMENT_ACCESS_DENIED');

      const commissionListDeniedForObserver = await api(`/api/attachments?entityType=driver_commission_payment&entityId=${commissionPaymentEntityId}`, { token: observerToken });
      assert.equal(commissionListDeniedForObserver.status, 403);

      const commissionListAllowedForFinance = await api(`/api/attachments?entityType=driver_commission_payment&entityId=${commissionPaymentEntityId}`, { token: financeToken });
      assert.equal(commissionListAllowedForFinance.status, 200);
      assert.ok(commissionListAllowedForFinance.body.data.some((attachment) => attachment.id === commissionProofUpload.body.data.id));

      const commissionListAllowedForAdmin = await api(`/api/attachments?entityType=driver_commission_payment&entityId=${commissionPaymentEntityId}`, { token: adminToken });
      assert.equal(commissionListAllowedForAdmin.status, 200);

      const jobDocumentListAllowedForSales = await api(`/api/attachments?entityType=container_job&entityId=${created.jobId}`, { token: salesToken });
      assert.equal(jobDocumentListAllowedForSales.status, 200);
    });

    await t.test('driver commission: pembayaran wajib ada bukti transfer sebelum ditandai paid', async () => {
      const periodStart = '2099-04-02';
      const periodEnd = '2099-04-08';
      await query(
        `
          delete from driver_commission_payments
          where batch_id in (select id from driver_commission_batches where period_start = $1::date and period_end = $2::date)
        `,
        [periodStart, periodEnd],
      );
      await query(
        'delete from driver_commission_batches where period_start = $1::date and period_end = $2::date',
        [periodStart, periodEnd],
      );

      const batchResult = await query(
        `
          insert into driver_commission_batches (period_start, period_end, status, submitted_by_name, reviewed_by_name)
          values ($1::date, $2::date, 'approved', 'Sprint2C Operational', 'Sprint2C Finance')
          returning id
        `,
        [periodStart, periodEnd],
      );
      const batchId = batchResult.rows[0].id;
      const paymentResult = await query(
        `
          insert into driver_commission_payments (batch_id, driver_name, payment_method, total_items, total_amount, status)
          values ($1, $2, 'bank', 1, 150000, 'pending')
          returning id
        `,
        [batchId, `Driver Proof Test ${runId}`],
      );
      const paymentId = paymentResult.rows[0].id;

      const payWithoutProof = await api(`/api/driver-commissions/payments/${paymentId}/pay`, {
        method: 'PATCH',
        token: financeToken,
        body: { paymentNote: `Coba bayar tanpa bukti ${runId}` },
      });
      assert.equal(payWithoutProof.status, 400);
      assert.equal(payWithoutProof.body.error.code, 'DRIVER_COMMISSION_PAYMENT_PROOF_REQUIRED');

      const paidStatusCheck = await query('select status from driver_commission_payments where id = $1', [paymentId]);
      assert.equal(paidStatusCheck.rows[0].status, 'pending');

      const payWithProof = await api(`/api/driver-commissions/payments/${paymentId}/transfer-proof`, {
        method: 'POST',
        token: financeToken,
        body: {
          paymentNote: `Bayar dengan bukti ${runId}`,
          fileName: `commission-transfer-proof-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% commission transfer proof ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(payWithProof.status, 200);

      const paidStatusAfterProof = await query(
        'select status, payment_proof_attachment_id from driver_commission_payments where id = $1',
        [paymentId],
      );
      assert.equal(paidStatusAfterProof.rows[0].status, 'paid');
      assert.ok(paidStatusAfterProof.rows[0].payment_proof_attachment_id);
    });

    await t.test('driver commission: sopir di bawah kuota mingguan ditahan, cair sekaligus begitu kumulatif tembus 7 ritasi', async () => {
      const quotaDriverName = `Kuota Test ${runId}`;
      const quotaSoNumber = `SO-${runId}-QUOTA`.toUpperCase();
      const periodA = { periodStart: '2099-04-09', periodEnd: '2099-04-15' };
      const periodB = { periodStart: '2099-04-16', periodEnd: '2099-04-22' };

      for (const period of [periodA, periodB]) {
        await query(
          `
            delete from driver_commission_items
            where batch_id in (select id from driver_commission_batches where period_start = $1::date and period_end = $2::date)
          `,
          [period.periodStart, period.periodEnd],
        );
        await query(
          `
            delete from driver_commission_payments
            where batch_id in (select id from driver_commission_batches where period_start = $1::date and period_end = $2::date)
          `,
          [period.periodStart, period.periodEnd],
        );
        await query(
          'delete from driver_commission_batches where period_start = $1::date and period_end = $2::date',
          [period.periodStart, period.periodEnd],
        );
      }

      const quotaSo = await query(
        `
          insert into sales_orders (so_number, customer_name, shipment_type, origin, destination, status)
          values ($1, $2, 'import', 'Tanjung Priok', 'Cikarang', 'completed')
          returning id
        `,
        [quotaSoNumber, `Customer Kuota ${runId}`],
      );
      const quotaSalesOrderId = quotaSo.rows[0].id;

      async function insertQuotaJob(containerSuffix, completedDate) {
        await query(
          `
            insert into container_jobs (
              sales_order_id, container_number, container_size, status, completed_at,
              has_driver_commission, driver_commission_amount, assignment_snapshot
            )
            values ($1, $2, '20FT', 'completed', $3::timestamptz, true, 50000, $4::jsonb)
          `,
          [
            quotaSalesOrderId,
            `${quotaSoNumber}QUOTA${containerSuffix}`,
            `${completedDate}T08:00:00+07:00`,
            JSON.stringify({ driver: quotaDriverName }),
          ],
        );
      }

      for (let index = 1; index <= 3; index += 1) {
        await insertQuotaJob(`A${index}`, periodA.periodStart);
      }

      const belowQuota = await api('/api/driver-commissions/batches', {
        method: 'POST',
        token: adminToken,
        body: periodA,
      });
      assert.equal(belowQuota.status, 400, 'sopir baru jalan 3 kali, di bawah kuota minimum 6, batch minggu ini seharusnya kosong');
      assert.equal(belowQuota.body.error.code, 'NO_ELIGIBLE_DRIVER_COMMISSION');

      const reportPeriodA = await api(`/api/driver-commissions/period-report?periodStart=${periodA.periodStart}&periodEnd=${periodA.periodEnd}`, { token: financeToken });
      assert.equal(reportPeriodA.status, 200);
      const withheldA = reportPeriodA.body.data.withheld.find((row) => row.driverName === quotaDriverName);
      assert.ok(withheldA, 'sopir yang ditahan harus muncul di daftar withheld periode ini');
      assert.equal(withheldA.pendingItems, 3);
      assert.equal(withheldA.target, 6);
      assert.equal(withheldA.remaining, 3);

      for (let index = 1; index <= 4; index += 1) {
        await insertQuotaJob(`B${index}`, periodB.periodStart);
      }

      const stillBelowIfCheckedAlone = await api(`/api/driver-commissions/period-report?periodStart=${periodB.periodStart}&periodEnd=${periodB.periodEnd}`, { token: financeToken });
      assert.equal(stillBelowIfCheckedAlone.status, 200);
      assert.equal(
        stillBelowIfCheckedAlone.body.data.withheld.find((row) => row.driverName === quotaDriverName),
        undefined,
        'begitu kumulatif (3 tunggakan + 4 minggu ini = 7) tembus target, sopir ini seharusnya sudah lolos (released), bukan withheld lagi',
      );

      const releaseSubmission = await api('/api/driver-commissions/batches', {
        method: 'POST',
        token: adminToken,
        body: periodB,
      });
      assert.equal(releaseSubmission.status, 201, 'begitu kumulatif tembus 7, submit periode ini harus berhasil membawa serta tunggakan minggu lalu');

      const quotaDriverPayment = releaseSubmission.body.data.payments.find((payment) => payment.driverName === quotaDriverName);
      assert.ok(quotaDriverPayment);
      assert.equal(quotaDriverPayment.totalItems, 7, 'batch yang cair harus berisi 3 ritasi tunggakan minggu lalu + 4 ritasi minggu ini');
      assert.equal(quotaDriverPayment.totalAmount, 350000);
      assert.ok(
        quotaDriverPayment.items.some((item) => item.completedDate === periodA.periodStart),
        'ritasi minggu lama yang sempat tertahan harus ikut masuk batch yang cair ini',
      );

      const reportPeriodAAfterRelease = await api(`/api/driver-commissions/period-report?periodStart=${periodA.periodStart}&periodEnd=${periodA.periodEnd}`, { token: financeToken });
      assert.equal(reportPeriodAAfterRelease.status, 200);
      assert.equal(
        reportPeriodAAfterRelease.body.data.withheld.find((row) => row.driverName === quotaDriverName),
        undefined,
        'setelah cair, sopir ini tidak lagi berstatus tertahan',
      );
    });

    await t.test('vehicle documents: create vehicles, upload KIR, list, download, safe path', async () => {
      const dateFromToday = (offsetDays) => {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() + offsetDays);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const head = await api('/api/master/trucks', {
        method: 'POST',
        token: adminToken,
        body: {
          unitCode: `HEAD-${runId}`,
          plateNumber: `B-${String(runId).slice(-4)}-HD`,
          unitKind: 'HEAD',
          capacity: '20FT',
          brand: 'Hino',
          type: 'Tractor Head',
          vin: `VIN-HEAD-${runId}`,
          engineNumber: `ENG-HEAD-${runId}`,
          status: 'Aktif',
        },
      });
      assert.equal(head.status, 201);
      assert.equal(head.body.data.unitKind, 'HEAD');
      created.vehicleHeadId = head.body.data.id;

      const chassis = await api('/api/master/trucks', {
        method: 'POST',
        token: adminToken,
        body: {
          unitCode: `CHS-${runId}`,
          plateNumber: `B-${String(runId).slice(-4)}-CH`,
          unitKind: 'CHASSIS',
          chassisSize: 'COMBO',
          capacity: 'COMBO',
          brand: 'Local',
          type: 'Chassis',
          vin: `VIN-CHS-${runId}`,
          engineNumber: `ENG-CHS-${runId}`,
          status: 'Aktif',
        },
      });
      assert.equal(chassis.status, 201);
      assert.equal(chassis.body.data.unitKind, 'CHASSIS');
      assert.equal(chassis.body.data.chassisSize, 'COMBO');
      created.vehicleChassisId = chassis.body.data.id;

      const pdfBase64 = Buffer.from('%PDF-1.4\n% Vehicle document test\n').toString('base64');
      const kirHead = await api(`/api/vehicles/${created.vehicleHeadId}/documents`, {
        method: 'POST',
        token: adminToken,
        body: {
          documentType: 'KIR_HEAD',
          documentNumber: `KIR-H-${runId}`,
          issuedDate: dateFromToday(-30),
          expiredDate: dateFromToday(20),
          fileName: `kir-head-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: pdfBase64,
          notes: `KIR Head ${runId}`,
        },
      });
      assert.equal(kirHead.status, 201);
      assert.equal(kirHead.body.data.documentType, 'KIR_HEAD');
      assert.equal(kirHead.body.data.status, 'Akan Habis');
      assert.match(kirHead.body.data.relativePath, /^Master Data[\\/]+Truck[\\/]+[^\\/]+[\\/]+KIR dan Uji Berkala[\\/]+/);
      assert.match(kirHead.body.data.relativePath.split(/[\\/]+/)[2], /^HEAD-.+__[0-9a-f]{8}$/);
      assert.equal(kirHead.body.data.relativePath.includes('..'), false);
      created.kirHeadDocumentId = kirHead.body.data.id;

      const kirBuntut = await api(`/api/vehicles/${created.vehicleChassisId}/documents`, {
        method: 'POST',
        token: adminToken,
        body: {
          documentType: 'KIR_BUNTUT',
          documentNumber: `KIR-B-${runId}`,
          issuedDate: dateFromToday(-30),
          expiredDate: dateFromToday(7),
          fileName: `kir-buntut-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: pdfBase64,
          notes: `KIR Buntut ${runId}`,
        },
      });
      assert.equal(kirBuntut.status, 201);
      assert.equal(kirBuntut.body.data.documentType, 'KIR_BUNTUT');
      assert.equal(kirBuntut.body.data.status, 'Segera Habis');
      assert.match(kirBuntut.body.data.relativePath, /^Master Data[\\/]+Chassis[\\/]+[^\\/]+[\\/]+KIR dan Uji Berkala[\\/]+/);
      created.kirBuntutDocumentId = kirBuntut.body.data.id;

      const list = await api(`/api/vehicles/${created.vehicleChassisId}/documents`, { token: adminToken });
      assert.equal(list.status, 200);
      assert.ok(list.body.data.some((document) => document.id === created.kirBuntutDocumentId));

      const downloaded = await fetch(`${baseUrl}/api/vehicles/${created.vehicleHeadId}/documents/${created.kirHeadDocumentId}/download`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(downloaded.status, 200);
      assert.equal(downloaded.headers.get('content-type'), 'application/pdf');

      const deletedDocument = await api(`/api/vehicles/${created.vehicleHeadId}/documents/${created.kirHeadDocumentId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(deletedDocument.status, 200);
      assert.ok(deletedDocument.body.data.trashId);

      const deletedDocumentDownload = await fetch(`${baseUrl}/api/vehicles/${created.vehicleHeadId}/documents/${created.kirHeadDocumentId}/download`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(deletedDocumentDownload.status, 404);

      const restoredDocument = await api(`/api/storage/trash/${deletedDocument.body.data.trashId}/restore`, {
        method: 'POST',
        token: adminToken,
      });
      assert.equal(restoredDocument.status, 200);

      const restoredDocumentDownload = await fetch(`${baseUrl}/api/vehicles/${created.vehicleHeadId}/documents/${created.kirHeadDocumentId}/download`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(restoredDocumentDownload.status, 200);

      const createLog = await latestActivityForEntity('CREATE_VEHICLE_DOCUMENT', created.kirHeadDocumentId);
      assert.equal(createLog.action, 'CREATE_VEHICLE_DOCUMENT');
      assert.equal(JSON.stringify(createLog.metadata).includes('fileBase64'), false);
      assert.equal(JSON.stringify(createLog.metadata).includes('%PDF'), false);
    });

    await t.test('reports: dashboard, sales-orders, operations, driver-performance', async () => {
      const dashboard = await api('/api/reports/dashboard', { token: observerToken });
      assert.equal(dashboard.status, 200);
      assert.ok(Array.isArray(dashboard.body.data.trucks));
      assert.ok(Array.isArray(dashboard.body.data.activeJobs));
      assert.ok(Array.isArray(dashboard.body.data.upcomingJobs));

      const salesReport = await api(`/api/reports/sales-orders?query=${encodeURIComponent(runId)}`, { token: observerToken });
      assert.equal(salesReport.status, 200);
      assert.ok(Array.isArray(salesReport.body.data.rows));
      assert.equal(typeof salesReport.body.data.total, 'number');
      assert.ok(salesReport.body.data.summary);
      assert.ok(salesReport.body.data.summary.cancelledContainers >= 1);
      assert.equal(
        salesReport.body.data.rows.some((row) => row.cancelledContainers >= 1),
        true,
      );

      const monthlyRevenue = await api('/api/reports/monthly-revenue?year=2026&month=7', { token: observerToken });
      assert.equal(monthlyRevenue.status, 200);
      const mainRevenueRow = monthlyRevenue.body.data.rows.find((row) => row.jobId === created.jobId);
      assert.ok(mainRevenueRow);
      assert.equal(mainRevenueRow.totalContainers, 1);

      const operationsReport = await api(`/api/reports/operations?query=${encodeURIComponent(runId)}`, { token: observerToken });
      assert.equal(operationsReport.status, 200);
      assert.ok(Array.isArray(operationsReport.body.data.rows));
      assert.equal(typeof operationsReport.body.data.total, 'number');
      assert.ok(operationsReport.body.data.summary);

      const driverReport = await api('/api/reports/driver-performance?month=all', { token: observerToken });
      assert.equal(driverReport.status, 200);
      assert.ok(Array.isArray(driverReport.body.data.rows));
      assert.equal(typeof driverReport.body.data.total, 'number');
      assert.ok(Array.isArray(driverReport.body.data.months));
    });
  });

  test('rekening dropping: tutup batch mengunci baris batch agar tidak balapan dengan pencatatan biaya baru', async () => {
    const lockBatchDate = '2099-08-31';
    await query(
      `
        delete from operational_fund_transactions
        where batch_id in (select id from operational_fund_batches where batch_date = $1::date)
      `,
      [lockBatchDate],
    );
    await query('delete from operational_fund_batches where batch_date = $1::date', [lockBatchDate]);

    const bootstrap = await query(
      `
        insert into operational_fund_batches (batch_date, status, created_by_name, updated_by_name)
        values ($1::date, 'open', 'Lock Test Bootstrap', 'Lock Test Bootstrap')
        returning id
      `,
      [lockBatchDate],
    );
    const batchId = bootstrap.rows[0].id;

    const holderClient = await pool.connect();
    const waiterClient = await pool.connect();
    try {
      await holderClient.query('begin');
      await holderClient.query(
        `
          insert into operational_fund_batches (batch_date, status, created_by_name, updated_by_name)
          values ($1::date, 'open', 'Lock Test Holder', 'Lock Test Holder')
          on conflict (batch_date) do update set updated_at = operational_fund_batches.updated_at
          returning id
        `,
        [lockBatchDate],
      );

      await waiterClient.query('begin');
      const waiterQuery = waiterClient.query('select id, status from operational_fund_batches where id = $1 for update', [batchId]);

      const stillBlocked = await Promise.race([
        waiterQuery.then(() => 'resolved'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 300)),
      ]);
      assert.equal(stillBlocked, 'timeout', 'select for update seharusnya menunggu selama holder belum commit');

      await holderClient.query('commit');

      const releasedInTime = await Promise.race([
        waiterQuery.then(() => 'resolved'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 2000)),
      ]);
      assert.equal(releasedInTime, 'resolved', 'select for update seharusnya lanjut begitu holder commit');

      await waiterClient.query('commit');
    } finally {
      holderClient.release();
      waiterClient.release();
    }
  });
}
