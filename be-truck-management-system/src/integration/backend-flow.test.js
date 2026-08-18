import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  const { closePool, query } = await import('../db/client.js');
  const { hashPassword } = await import('../modules/auth/auth.utils.js');

  const runId = `sprint-2c-${Date.now()}`;
  const password = 'TestPassword123!';
  const users = {
    admin: { name: `Sprint2C Admin ${runId}`, email: `${runId}.admin@example.test`, role: 'admin' },
    sales: { name: `Sprint2C Sales ${runId}`, email: `${runId}.sales@example.test`, role: 'sales' },
    finance: { name: `Sprint2C Finance ${runId}`, email: `${runId}.finance@example.test`, role: 'finance' },
    observer: { name: `Sprint2C Observer ${runId}`, email: `${runId}.observer@example.test`, role: 'pengamat' },
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
      assert.equal(salesLogin.status, 200);
      assert.equal(financeLogin.status, 200);
      assert.equal(observerLogin.status, 200);
      salesToken = salesLogin.body.data.token;
      financeToken = financeLogin.body.data.token;
      observerToken = observerLogin.body.data.token;

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

      const blockedRunningBeforeRpujApproval = await api(`/api/container-jobs/${created.jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          driver: driverName,
          plateNumber: plate20,
          status: 'running',
          runningAt: '2026-07-11T08:00:00.000Z',
          rpujStatus: 'submitted',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(blockedRunningBeforeRpujApproval.status, 409);
      assert.equal(blockedRunningBeforeRpujApproval.body.error.code, 'TRIP_WAITING_RPUJ_APPROVAL');

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

      const prematureSpk = await api(`/api/container-jobs/${created.jobId}/spk`, {
        method: 'POST',
        token: adminToken,
        body: { updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(prematureSpk.status, 409);
      assert.equal(prematureSpk.body.error.code, 'SPK_WAITING_FINANCE_APPROVAL');

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
}
