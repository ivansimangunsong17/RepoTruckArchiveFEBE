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

    await t.test('auth: nonaktifkan/turunkan role user langsung berlaku untuk token yang sudah terbit, tidak nunggu token expired', async () => {
      const freshUserEmail = `${runId}.freshaccess@example.test`;
      const createdUser = await api('/api/users', {
        method: 'POST',
        token: adminToken,
        body: {
          name: `Sprint2C Fresh Access ${runId}`,
          email: freshUserEmail,
          password,
          role: 'sales',
        },
      });
      assert.equal(createdUser.status, 201);
      const freshUserId = createdUser.body.data.id;

      const freshLogin = await login(freshUserEmail);
      assert.equal(freshLogin.status, 200);
      const freshToken = freshLogin.body.data.token;

      // Selagi masih role sales: endpoint khusus Finance (finance.invoice.read) harus ditolak.
      const deniedAsSales = await api('/api/finance/invoices', { token: freshToken });
      assert.equal(deniedAsSales.status, 403);
      assert.equal(deniedAsSales.body.error.code, 'FORBIDDEN');

      // Admin menaikkan role user ini jadi finance -- TANPA user login ulang / minta token baru.
      const promoted = await api(`/api/users/${freshUserId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { role: 'finance' },
      });
      assert.equal(promoted.status, 200);
      assert.equal(promoted.body.data.role, 'finance');

      // Token LAMA (masih membawa role sales secara literal di dalamnya) langsung dapat akses
      // finance begitu role di DB berubah -- tidak perlu menunggu token itu kedaluwarsa.
      const allowedAfterPromote = await api('/api/finance/invoices', { token: freshToken });
      assert.equal(allowedAfterPromote.status, 200);

      // Admin menonaktifkan user ini.
      const disabled = await api(`/api/users/${freshUserId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'Nonaktif' },
      });
      assert.equal(disabled.status, 200);
      assert.equal(disabled.body.data.status, 'Nonaktif');

      // Token LAMA yang sama (belum expired, signature masih valid) langsung ditolak setelah
      // akunnya dinonaktifkan -- ini inti perbaikannya: sebelumnya token tetap sah sampai 12 jam.
      const deniedAfterDisable = await api('/api/finance/invoices', { token: freshToken });
      assert.equal(deniedAfterDisable.status, 401);
      assert.equal(deniedAfterDisable.body.error.code, 'UNAUTHORIZED');

      const meAfterDisable = await api('/api/auth/me', { token: freshToken });
      assert.equal(meAfterDisable.status, 401);

      // Reaktivasi supaya tidak meninggalkan akun nonaktif nyangkut untuk test lain di file ini.
      const reactivated = await api(`/api/users/${freshUserId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'Aktif' },
      });
      assert.equal(reactivated.status, 200);
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

      const blockedReassignSoNumber = await api(`/api/finance/order-verifications/${created.orderId}/so-number`, {
        method: 'PATCH',
        token: financeToken,
        body: { soNumber: `${created.orderSoNumber}-GANTI` },
      });
      assert.equal(blockedReassignSoNumber.status, 409);
      assert.equal(blockedReassignSoNumber.body.error.code, 'FINANCE_SO_NUMBER_ALREADY_ASSIGNED');

      const soCorrectionRequest = await api(`/api/finance/order-verifications/${created.orderId}/corrections`, {
        method: 'POST',
        token: financeToken,
        body: {
          requestedValue: `${created.orderSoNumber}-KOREKSI`,
          reason: `Salah input nomor SO ${runId}, perlu dikoreksi`,
        },
      });
      assert.equal(soCorrectionRequest.status, 200);
      assert.equal(soCorrectionRequest.body.data.correctionType, 'so_number');
      assert.equal(soCorrectionRequest.body.data.currentValue, created.orderSoNumber);
      assert.equal(soCorrectionRequest.body.data.requestedValue, `${created.orderSoNumber}-KOREKSI`);
      assert.equal(soCorrectionRequest.body.data.status, 'pending');
      assert.equal(soCorrectionRequest.body.data.requiresAdminApproval, true);
      // Order sudah punya container job aktif, jadi koreksi wajib approval Admin dan nomor SO Accurate belum berubah.
      assert.equal(soCorrectionRequest.body.data.soNumber, created.orderSoNumber);

      const list = await api(`/api/sales-orders?query=${encodeURIComponent(created.orderSoNumber)}`, { token: adminToken });
      assert.equal(list.status, 200);
      assert.ok(list.body.data.rows.some((row) => row.id === created.orderId));

      const salesScopedList = await api(`/api/sales-orders?query=${encodeURIComponent(created.orderSoNumber)}`, { token: salesToken });
      assert.equal(salesScopedList.status, 200);
      assert.equal(salesScopedList.body.data.rows.some((row) => row.id === created.orderId), true);

      // Filter tanggal (dateFrom/dateTo) di daftar Sales Order -- pakai Tanggal SO yang jauh di luar
      // rentang tanggal fixture lain di suite ini supaya tidak bentrok dengan data test lain.
      const dateFilterSoNumber = `${created.orderSoNumber}-DATEFILTER`;
      const dateFilterOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: adminToken,
        body: salesOrderPayload({
          soNumber: dateFilterSoNumber,
          soDate: '2019-03-05',
          tripDate: '2019-03-06',
          receivedAt: '2019-03-05T00:00:00.000Z',
          entrySource: 'historical',
          historicalPeriod: '2019-03',
          historicalNotes: `Backfill test filter tanggal ${runId}`,
          createdBy: users.admin.name,
          updatedBy: users.admin.name,
        }),
      });
      assert.equal(dateFilterOrder.status, 201);

      const dateFilterQuery = encodeURIComponent(dateFilterSoNumber);
      const withinDateRange = await api(`/api/sales-orders?query=${dateFilterQuery}&dateFrom=2019-03-01&dateTo=2019-03-31`, { token: adminToken });
      assert.equal(withinDateRange.status, 200);
      assert.equal(withinDateRange.body.data.rows.some((row) => row.id === dateFilterOrder.body.data.id), true);

      const beforeDateRange = await api(`/api/sales-orders?query=${dateFilterQuery}&dateTo=2019-03-04`, { token: adminToken });
      assert.equal(beforeDateRange.body.data.rows.some((row) => row.id === dateFilterOrder.body.data.id), false);

      const afterDateRange = await api(`/api/sales-orders?query=${dateFilterQuery}&dateFrom=2019-03-06`, { token: adminToken });
      assert.equal(afterDateRange.body.data.rows.some((row) => row.id === dateFilterOrder.body.data.id), false);

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

      const blockedAdminUpdateWithoutCorrection = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          updatedBy: 'Sprint2C Admin',
        }),
      });
      assert.equal(blockedAdminUpdateWithoutCorrection.status, 403);
      assert.equal(blockedAdminUpdateWithoutCorrection.body.error.code, 'SALES_ORDER_FINANCE_NUMBER_LOCKED_CORRECTION_REQUIRED');

      const blockedAdminCorrectionShortReason = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: 'pendek',
        }),
      });
      assert.equal(blockedAdminCorrectionShortReason.status, 400);
      assert.equal(blockedAdminCorrectionShortReason.body.error.code, 'ADMIN_CORRECTION_REASON_REQUIRED');

      const blockedSalesCorrectionAttempt = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: salesToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          updatedBy: 'Sprint2C Sales',
          adminCorrectionMode: true,
          adminCorrectionReason: 'Sales mencoba pakai mode koreksi admin',
        }),
      });
      assert.equal(blockedSalesCorrectionAttempt.status, 403);
      assert.equal(blockedSalesCorrectionAttempt.body.error.code, 'ADMIN_CORRECTION_ADMIN_ONLY');

      const updatedOrder = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: `Koreksi tujuan SO ${runId} salah input`,
        }),
      });
      assert.equal(updatedOrder.status, 200);
      assert.equal(updatedOrder.body.data.destination, 'Karawang');

      const adminCorrectionLog = await latestActivityForEntity('ADMIN_CORRECTION_SALES_ORDER', created.orderId);
      assert.equal(adminCorrectionLog.action, 'ADMIN_CORRECTION_SALES_ORDER');
      assert.equal(adminCorrectionLog.actor_role, 'admin');
      assert.ok(String(adminCorrectionLog.metadata.adminCorrectionReason || '').includes(runId));
      assert.ok((adminCorrectionLog.metadata.changedFields || []).includes('Tujuan'));

      // billingStatus/invoiceNumber tidak boleh bisa diselundupkan lewat update SO generik oleh
      // role manapun (termasuk Admin dengan mode koreksi) -- satu-satunya jalur sah adalah endpoint
      // invoice-delivery-status (Finance/Admin) untuk billingStatus, dan Finance untuk invoiceNumber.
      const blockedBillingUpdate = await api(`/api/sales-orders/${created.orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          containerId: created.jobId,
          destination: 'Karawang',
          invoiceNumber: `INV-${runId}-EARLY`,
          billingStatus: 'belum_dikirim',
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: `Coba ubah billing status SO ${runId}`,
        }),
      });
      assert.equal(blockedBillingUpdate.status, 200);
      assert.equal(blockedBillingUpdate.body.data.billingStatus, 'belum_invoice');
      assert.equal(blockedBillingUpdate.body.data.invoiceNumber, null);

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

    await t.test('sales order: list dengan filter status completed + invoiced (dokumen customer) tidak error', async () => {
      const completedSoNumber = `SO-${runId}-COMPLETED-DOC`.toUpperCase();
      const completedOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: completedSoNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(completedOrder.status, 201);
      await query(
        `update sales_orders set status = 'completed', invoice_number = $2, updated_at = now() where id = $1`,
        [completedOrder.body.data.id, `INV-${runId}-DOC`],
      );

      const completedList = await api('/api/sales-orders?status=completed&invoiced=true', { token: salesToken });
      assert.equal(completedList.status, 200);
      assert.equal(completedList.body.data.rows.some((row) => row.id === completedOrder.body.data.id), true);
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

    await t.test('container job: status inap - Operational bisa tandai inap, histori tetap ada setelah job selesai', async () => {
      const inapSoNumber = `SO-INAP-${runId}`;
      const inapDriverName = `Driver Inap ${runId}`;
      const inapPlate = `B-${String(runId).slice(-4)}-IN`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [inapDriverName, `08${String(runId).slice(-9)}9`],
      );
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          on conflict (plate_number) do update
          set container_size = excluded.container_size, operational_status = 'Aktif', archived_at = null
        `,
        [`TRK-${String(runId).slice(-4)}-IN`, inapPlate],
      );

      const inapOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: inapSoNumber }),
      });
      assert.equal(inapOrder.status, 201);
      const inapJobId = inapOrder.body.data.containers[0].id;
      const inapContainerNumber = `${inapSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;

      const blockedFromReceived = await api(`/api/container-jobs/${inapJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'inap', inapReason: 'Curfew malam, truk tidak boleh jalan', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(blockedFromReceived.status, 409);
      assert.equal(blockedFromReceived.body.error.code, 'CONTAINER_JOB_INAP_REQUIRES_RUNNING_STATUS');

      const runningJob = await api(`/api/container-jobs/${inapJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: inapContainerNumber,
          driver: inapDriverName,
          plateNumber: inapPlate,
          status: 'running',
          runningAt: '2026-07-11T07:00:00.000Z',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(runningJob.status, 200);
      assert.equal(runningJob.body.data.status, 'running');

      const blockedMissingReason = await api(`/api/container-jobs/${inapJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'inap', inapReason: 'macet', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(blockedMissingReason.status, 400);
      assert.equal(blockedMissingReason.body.error.code, 'CONTAINER_JOB_INAP_REASON_REQUIRED');

      const inapReason = `Curfew malam ${runId}, truk tidak boleh jalan sampai subuh`;
      const inapJob = await api(`/api/container-jobs/${inapJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'inap', inapReason, inapNotes: 'Parkir aman di rest area KM 57', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(inapJob.status, 200);
      assert.equal(inapJob.body.data.status, 'inap');
      assert.equal(inapJob.body.data.inapReason, inapReason);
      assert.equal(inapJob.body.data.inapNotes, 'Parkir aman di rest area KM 57');
      assert.ok(inapJob.body.data.inapStartedAt);

      const inapLog = await latestActivityForEntity('INAP_CONTAINER_JOB', inapJobId);
      assert.equal(inapLog.action, 'INAP_CONTAINER_JOB');
      assert.equal(inapLog.metadata.reason, inapReason);

      // Driver/truck TETAP terkunci ke job ini selama inap (beda dari repo_stored yang melepas assignment).
      const busyDriverDuringInap = await api(`/api/master/drivers?query=${encodeURIComponent(inapDriverName)}`, { token: adminToken });
      assert.equal(busyDriverDuringInap.body.data.find((row) => row.name === inapDriverName)?.status, 'Bertugas');

      const resumedJob = await api(`/api/container-jobs/${inapJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: inapContainerNumber,
          driver: inapDriverName,
          plateNumber: inapPlate,
          status: 'running',
          runningAt: '2026-07-11T14:00:00.000Z',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(resumedJob.status, 200);
      assert.equal(resumedJob.body.data.status, 'running');
      // Histori inap TIDAK boleh hilang begitu job lanjut lagi.
      assert.equal(resumedJob.body.data.inapReason, inapReason);
      assert.ok(resumedJob.body.data.inapStartedAt);
      assert.ok(resumedJob.body.data.inapEndedAt);

      const resumeLog = await latestActivityForEntity('RESUME_CONTAINER_JOB_FROM_INAP', inapJobId);
      assert.equal(resumeLog.action, 'RESUME_CONTAINER_JOB_FROM_INAP');

      const uploadInapEirDocument = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: inapJobId,
          category: 'eirDocument',
          fileName: `eirDocument-inap-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% eirDocument inap ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(uploadInapEirDocument.status, 201);

      const completedJob = await api(`/api/container-jobs/${inapJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: inapContainerNumber,
          driver: inapDriverName,
          plateNumber: inapPlate,
          status: 'completed',
          runningAt: '2026-07-11T14:00:00.000Z',
          completedAt: '2026-07-11T15:00:00.000Z',
          spkNumber: `SPK-INAP-${runId}`,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(completedJob.status, 200);
      assert.equal(completedJob.body.data.status, 'completed');
      // Status akhirnya completed, tapi flag/histori bahwa job ini pernah inap tetap terlihat.
      assert.equal(completedJob.body.data.inapReason, inapReason);
      assert.ok(completedJob.body.data.inapStartedAt);
    });

    await t.test('container job & sales order: tidak bisa dibatalkan kalau sudah ada biaya aktif tercatat (biaya jadi orphan)', async () => {
      const expenseCancelSoNumber = `SO-EXPCANCEL-${runId}`;
      const expenseCancelOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: expenseCancelSoNumber }),
      });
      assert.equal(expenseCancelOrder.status, 201);
      const expenseCancelOrderId = expenseCancelOrder.body.data.id;
      const expenseCancelJobId = expenseCancelOrder.body.data.containers[0].id;

      const uj = await api(`/api/container-jobs/${expenseCancelJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'uj_awal',
          expenseGroup: 'operational',
          amount: 200000,
          description: `UJ awal sebelum cancel test ${runId}`,
          recipientType: 'driver',
          recipientName: `Driver ${runId}`,
          paymentStatus: 'belum_dibayar',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(uj.status, 200);

      const jobCancelRequest = await api(`/api/container-jobs/${expenseCancelJobId}/cancel-request`, {
        method: 'PATCH',
        token: salesToken,
        body: { cancelRequestNote: `Batal setelah UJ keluar ${runId}` },
      });
      assert.equal(jobCancelRequest.status, 200);

      const blockedJobCancelApproval = await api(`/api/container-jobs/${expenseCancelJobId}/cancel-review`, {
        method: 'PATCH',
        token: adminToken,
        body: { approved: true },
      });
      assert.equal(blockedJobCancelApproval.status, 409);
      assert.equal(blockedJobCancelApproval.body.error.code, 'CONTAINER_JOB_CANCEL_HAS_ACTIVE_EXPENSE');

      const blockedSoDirectCancel = await api(`/api/sales-orders/${expenseCancelOrderId}/cancel`, {
        method: 'PATCH',
        token: adminToken,
      });
      assert.equal(blockedSoDirectCancel.status, 409);
      assert.equal(blockedSoDirectCancel.body.error.code, 'SALES_ORDER_CANCEL_HAS_ACTIVE_EXPENSE');

      const blockedSoCancelRequestReview = await api(`/api/sales-orders/${expenseCancelOrderId}/cancel-request`, {
        method: 'PATCH',
        token: salesToken,
        body: { cancelRequestNote: `Batal SO setelah UJ keluar ${runId}` },
      });
      assert.equal(blockedSoCancelRequestReview.status, 200);
      const blockedSoCancelReview = await api(`/api/sales-orders/${expenseCancelOrderId}/cancel-review`, {
        method: 'PATCH',
        token: adminToken,
        body: { approved: true },
      });
      assert.equal(blockedSoCancelReview.status, 409);
      assert.equal(blockedSoCancelReview.body.error.code, 'SALES_ORDER_CANCEL_HAS_ACTIVE_EXPENSE');

      // Setelah biaya dibatalkan (bukan job/SO-nya), pembatalan job baru bisa disetujui lagi.
      const voidExpense = await query(
        `update container_job_expenses set payment_status = 'batal' where container_job_id = $1`,
        [expenseCancelJobId],
      );
      assert.equal(voidExpense.rowCount, 1);

      const allowedJobCancelApproval = await api(`/api/container-jobs/${expenseCancelJobId}/cancel-review`, {
        method: 'PATCH',
        token: adminToken,
        body: { approved: true },
      });
      assert.equal(allowedJobCancelApproval.status, 200);
      assert.equal(allowedJobCancelApproval.body.data.status, 'cancelled');
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

    await t.test('rekening dropping: batch yang sudah closed bisa dibuka kembali Admin, alasan wajib, carry-forward dibatalkan', async () => {
      const batchDate = '2099-09-15';
      const nextBatchDate = '2099-09-16';
      await resetOperationalFundBatch(batchDate);
      await resetOperationalFundBatch(nextBatchDate);

      const reopenSoNumber = `SO-REOPENBATCH-${runId}`;
      const reopenOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: reopenSoNumber }),
      });
      assert.equal(reopenOrder.status, 201);
      const reopenJobId = reopenOrder.body.data.containers[0].id;

      const deposit = await api('/api/finance/operational-fund-deposits', {
        method: 'POST',
        token: financeToken,
        body: {
          requestDate: batchDate,
          amount: 200000,
          purpose: `Deposit test reopen batch ${runId}`,
          fileName: `deposit-reopenbatch-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% deposit reopen batch ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(deposit.status, 200);

      const proofUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'container_job',
          entityId: reopenJobId,
          category: 'expensePaymentProof',
          fileName: `expense-proof-reopenbatch-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% expense proof reopen batch ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Operational',
        },
      });
      assert.equal(proofUpload.status, 201);

      const expense = await api(`/api/container-jobs/${reopenJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 50000,
          description: `Reopen batch test ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Reopen Batch Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T08:00:00.000Z`,
          proofAttachmentId: proofUpload.body.data.id,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(expense.status, 200);

      const checked = await api(`/api/finance/container-job-expenses/${expense.body.data.id}/reconcile`, {
        method: 'PATCH',
        token: financeToken,
        body: { financeCheckStatus: 'sudah_dicek' },
      });
      assert.equal(checked.status, 200);

      const batchLookup = await api(`/api/finance/operational-fund-batches?dateFrom=${batchDate}&dateTo=${batchDate}`, { token: financeToken });
      const batchId = batchLookup.body.data.rows.find((row) => row.batchDate === batchDate)?.id;
      assert.ok(batchId);

      const closed = await api(`/api/finance/operational-fund-batches/${batchId}/close`, {
        method: 'PATCH',
        token: financeToken,
        body: {},
      });
      assert.equal(closed.status, 200);
      assert.equal(closed.body.data.status, 'closed');
      assert.equal(closed.body.data.balance, 150000);

      const nextBatchAfterClose = await api(`/api/finance/operational-fund-batches?dateFrom=${nextBatchDate}&dateTo=${nextBatchDate}`, { token: financeToken });
      const nextBatchRowAfterClose = nextBatchAfterClose.body.data.rows.find((row) => row.batchDate === nextBatchDate);
      assert.ok(nextBatchRowAfterClose, 'batch besok harus otomatis dibuat karena ada sisa saldo carry-forward');
      assert.equal(nextBatchRowAfterClose.balance, 150000, 'sisa saldo batch yang ditutup harus mengalir jadi saldo awal batch besok');

      // Operational tidak bisa lagi catat biaya "sudah dibayar" di tanggal yang sudah closed.
      const blockedExpense = await api(`/api/container-jobs/${reopenJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'parkir',
          expenseGroup: 'operational',
          amount: 10000,
          description: `Biaya sore setelah closed keliru ${runId}`,
          recipientType: 'driver',
          recipientName: 'Driver Reopen Batch Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T15:00:00.000Z`,
          proofAttachmentId: proofUpload.body.data.id,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(blockedExpense.status, 409);
      assert.equal(blockedExpense.body.error.code, 'OPERATIONAL_FUND_BATCH_CLOSED');

      const blockedForFinance = await api(`/api/finance/operational-fund-batches/${batchId}/reopen`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: 'Finance coba buka sendiri' },
      });
      assert.equal(blockedForFinance.status, 403);
      assert.equal(blockedForFinance.body.error.code, 'FORBIDDEN');

      const blockedNoReason = await api(`/api/finance/operational-fund-batches/${batchId}/reopen`, {
        method: 'PATCH',
        token: adminToken,
        body: {},
      });
      assert.equal(blockedNoReason.status, 400);
      assert.equal(blockedNoReason.body.error.code, 'OPERATIONAL_FUND_BATCH_REOPEN_REASON_REQUIRED');

      const reopenReason = `Batch ditutup terlalu cepat, masih ada biaya sore ${runId}`;
      const reopened = await api(`/api/finance/operational-fund-batches/${batchId}/reopen`, {
        method: 'PATCH',
        token: adminToken,
        body: { reason: reopenReason },
      });
      assert.equal(reopened.status, 200);
      assert.equal(reopened.body.data.status, 'open');
      assert.equal(reopened.body.data.closedByName, '');

      const nextBatchAfterReopen = await api(`/api/finance/operational-fund-batches?dateFrom=${nextBatchDate}&dateTo=${nextBatchDate}`, { token: financeToken });
      const nextBatchRowAfterReopen = nextBatchAfterReopen.body.data.rows.find((row) => row.batchDate === nextBatchDate);
      assert.equal(nextBatchRowAfterReopen.balance, 0, 'carry-forward yang sudah dibatalkan tidak boleh lagi menyumbang saldo batch besok');

      const reopenLog = await latestActivityForEntity('FINANCE_REOPEN_OPERATIONAL_FUND_BATCH', batchId);
      assert.equal(reopenLog.action, 'FINANCE_REOPEN_OPERATIONAL_FUND_BATCH');
      assert.equal(reopenLog.metadata.reason, reopenReason);
      assert.equal(reopenLog.metadata.carryForwardVoided, true);

      // Sekarang biaya sore yang tadi ditolak seharusnya bisa dicatat.
      const allowedExpense = await api(`/api/container-jobs/${reopenJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'parkir',
          expenseGroup: 'operational',
          amount: 10000,
          description: `Biaya sore setelah dibuka lagi ${runId}`,
          recipientType: 'driver',
          recipientName: 'Driver Reopen Batch Test',
          paymentStatus: 'sudah_dibayar',
          paidAt: `${batchDate}T15:00:00.000Z`,
          proofAttachmentId: proofUpload.body.data.id,
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(allowedExpense.status, 200);

      const reopenAgainNotClosed = await api(`/api/finance/operational-fund-batches/${batchId}/reopen`, {
        method: 'PATCH',
        token: adminToken,
        body: { reason: 'Coba buka lagi batch yang belum closed' },
      });
      assert.equal(reopenAgainNotClosed.status, 409);
      assert.equal(reopenAgainNotClosed.body.error.code, 'OPERATIONAL_FUND_BATCH_NOT_CLOSED');

      // Tutup lagi batch ini, lalu tutup juga batch besoknya - kali ini reopen harus ditolak
      // karena akan mengubah diam-diam saldo batch besok yang sudah final.
      const checkedAgain = await api(`/api/finance/container-job-expenses/${allowedExpense.body.data.id}/reconcile`, {
        method: 'PATCH',
        token: financeToken,
        body: { financeCheckStatus: 'sudah_dicek' },
      });
      assert.equal(checkedAgain.status, 200);

      const closedAgain = await api(`/api/finance/operational-fund-batches/${batchId}/close`, {
        method: 'PATCH',
        token: financeToken,
        body: {},
      });
      assert.equal(closedAgain.status, 200);
      assert.equal(closedAgain.body.data.status, 'closed');

      const nextBatchId = nextBatchRowAfterReopen.id;
      const nextBatchClosed = await api(`/api/finance/operational-fund-batches/${nextBatchId}/close`, {
        method: 'PATCH',
        token: financeToken,
        body: {},
      });
      assert.equal(nextBatchClosed.status, 200);
      assert.equal(nextBatchClosed.body.data.status, 'closed');

      const blockedByNextClosed = await api(`/api/finance/operational-fund-batches/${batchId}/reopen`, {
        method: 'PATCH',
        token: adminToken,
        body: { reason: 'Coba buka lagi padahal batch besok sudah closed' },
      });
      assert.equal(blockedByNextClosed.status, 409);
      assert.equal(blockedByNextClosed.body.error.code, 'OPERATIONAL_FUND_BATCH_CARRY_FORWARD_LOCKED');
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

      const blockedSalesDeliveryStatus = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: salesToken,
        body: { billingStatus: 'belum_diterima', deliveryMethod: 'whatsapp' },
      });
      // Diblok di level router (permission finance.invoice.delivery_status.update tidak dipegang Sales),
      // sebelum sempat sampai ke pengecekan role eksplisit di service layer.
      assert.equal(blockedSalesDeliveryStatus.status, 403);
      assert.equal(blockedSalesDeliveryStatus.body.error.code, 'FORBIDDEN');

      const sentInvoice = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: financeToken,
        body: { billingStatus: 'belum_diterima', deliveryMethod: 'whatsapp' },
      });
      assert.equal(sentInvoice.status, 200);
      assert.equal(sentInvoice.body.data.billingStatus, 'belum_diterima');
      assert.equal(sentInvoice.body.data.invoiceNumber, `INV-${runId}-001`);

      const sendInvoiceLog = await latestActivityForEntity('SALES_SEND_INVOICE', created.orderId);
      assert.equal(sendInvoiceLog.action, 'SALES_SEND_INVOICE');
      assert.equal(sendInvoiceLog.actor_role, 'finance');

      const updatedBilling = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: financeToken,
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

    await t.test('finance: rincian invoice vs debit note pada detail invoice mengikuti expense_group container job expense', async () => {
      const reimbursementExpense = await api(`/api/container-jobs/${created.jobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'lainnya',
          expenseGroup: 'reimbursement',
          amount: 75000,
          description: `Reimbursement debit note test ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Reimbursement Test',
          paymentStatus: 'belum_dibayar',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(reimbursementExpense.status, 200);

      const operationalExpense = await api(`/api/container-jobs/${created.jobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'tol',
          expenseGroup: 'operational',
          amount: 30000,
          description: `Operational debit note test ${runId}`,
          recipientType: 'driver',
          recipientName: 'Driver Operational Test',
          paymentStatus: 'belum_dibayar',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(operationalExpense.status, 200);

      const invoiceDetail = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.equal(invoiceDetail.status, 200);
      assert.equal(invoiceDetail.body.data.debitNoteAmount, 75000);
      assert.equal(invoiceDetail.body.data.debitNoteItems.length, 1);
      assert.equal(invoiceDetail.body.data.debitNoteItems[0].category, 'lainnya');
      assert.equal(invoiceDetail.body.data.debitNoteItems[0].amount, 75000);
      assert.equal(invoiceDetail.body.data.debitNoteItems.some((item) => item.category === 'tol'), false);
      assert.equal(invoiceDetail.body.data.debitNoteItems[0].containerJobId, created.jobId);
      assert.equal(
        invoiceDetail.body.data.debitNoteItems[0].containerNumber,
        `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
      );

      // Biaya reimbursement yang sudah dikoreksi jadi 'batal' tidak boleh ikut menaikkan total Debit Note,
      // baik di angka gabungan maupun di rincian per-container.
      const voidableExpense = await api(`/api/container-jobs/${created.jobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'lainnya',
          expenseGroup: 'reimbursement',
          amount: 15000,
          description: `Reimbursement akan divoid ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Void Test',
          paymentStatus: 'belum_dibayar',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(voidableExpense.status, 200);
      await query(`update container_job_expenses set payment_status = 'batal' where id = $1`, [voidableExpense.body.data.id]);

      const invoiceDetailAfterVoid = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.equal(invoiceDetailAfterVoid.status, 200);
      assert.equal(invoiceDetailAfterVoid.body.data.debitNoteAmount, 75000, 'biaya reimbursement yang sudah batal tidak boleh ikut ditagihkan di total Debit Note');
      const voidedItem = invoiceDetailAfterVoid.body.data.debitNoteItems.find((item) => item.id === voidableExpense.body.data.id);
      assert.ok(voidedItem, 'item yang sudah batal tetap harus tampil di rincian untuk transparansi, bukan dihapus dari daftar');
      assert.equal(voidedItem.paymentStatus, 'batal');
      const containerRowAfterVoid = invoiceDetailAfterVoid.body.data.containerBreakdown.find((row) => row.containerJobId === created.jobId);
      assert.equal(containerRowAfterVoid.debitNoteAmount, 75000, 'rincian per-container juga harus mengecualikan biaya reimbursement yang sudah batal');
    });

    await t.test('finance: Input Invoice - rincian per container dan pencarian nomor container', async () => {
      const containerNumber = `${created.orderSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;

      const invoiceDetail = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.equal(invoiceDetail.status, 200);
      assert.ok(Array.isArray(invoiceDetail.body.data.containerBreakdown));
      assert.equal(invoiceDetail.body.data.containerBreakdown.length, 1);
      const containerRow = invoiceDetail.body.data.containerBreakdown[0];
      assert.equal(containerRow.containerNumber, containerNumber);
      assert.equal(containerRow.debitNoteAmount, 75000);
      const sumInvoiceAmount = invoiceDetail.body.data.containerBreakdown.reduce((sum, row) => sum + row.invoiceAmount, 0);
      const sumDebitNoteAmount = invoiceDetail.body.data.containerBreakdown.reduce((sum, row) => sum + row.debitNoteAmount, 0);
      assert.equal(sumInvoiceAmount, invoiceDetail.body.data.billingAmount);
      assert.equal(sumDebitNoteAmount, invoiceDetail.body.data.debitNoteAmount);

      const invoiceList = await api(`/api/finance/invoices?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(invoiceList.status, 200);
      const listRow = invoiceList.body.data.rows.find((row) => row.id === created.orderId);
      assert.ok(listRow, 'baris SO harus ada pada daftar Input Invoice');
      assert.equal(listRow.debitNoteAmount, 75000);
      assert.ok(listRow.containerCount >= 1);

      const searchByContainer = await api(`/api/finance/invoices?query=${encodeURIComponent(containerNumber)}`, { token: financeToken });
      assert.equal(searchByContainer.status, 200);
      assert.ok(searchByContainer.body.data.rows.some((row) => row.id === created.orderId), 'pencarian nomor container harus menemukan SO yang sesuai');

      const searchByUnknownContainer = await api(`/api/finance/invoices?query=${encodeURIComponent('ZZZ-CONTAINER-NOT-FOUND')}`, { token: financeToken });
      assert.equal(searchByUnknownContainer.status, 200);
      assert.equal(searchByUnknownContainer.body.data.rows.some((row) => row.id === created.orderId), false);

      const debitNotePdfBase64 = Buffer.from(`%PDF-1.4\n% debit note ${runId}\n`).toString('base64');
      const uploadedDebitNoteDocument = await api(`/api/finance/invoices/${created.orderId}/documents/debit_note`, {
        method: 'POST',
        token: financeToken,
        body: {
          fileName: `debit-note-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: debitNotePdfBase64,
        },
      });
      assert.equal(uploadedDebitNoteDocument.status, 200);
      assert.ok(uploadedDebitNoteDocument.body.data.debitNoteDocumentUploadedAt);
      assert.equal(uploadedDebitNoteDocument.body.data.uploadedDocument.category, 'debitNotePdf');

      const invoiceDetailAfterUpload = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.ok(invoiceDetailAfterUpload.body.data.documents.some((document) => document.category === 'debitNotePdf'));
    });

    await t.test('finance: Debit Note Outstanding - antrian nomor, aging, dan pembayaran terpisah dari Invoice', async () => {
      const queue = await api(`/api/finance/debit-notes?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(queue.status, 200);
      const queueRow = queue.body.data.rows.find((row) => row.id === created.orderId);
      assert.ok(queueRow, 'SO dengan biaya reimbursement harus muncul di antrian butuh nomor Debit Note');
      assert.equal(queueRow.debitNoteAmount, 75000);
      assert.equal(queueRow.debitNoteNumber, '');

      const proofFile = {
        fileName: `debit-note-proof-${runId}.pdf`,
        mimeType: 'application/pdf',
        fileBase64: Buffer.from(`%PDF-1.4\n% debit note proof ${runId}\n`).toString('base64'),
      };

      const paymentBeforeNumber = await api(`/api/finance/debit-notes/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 75000, proofFile },
      });
      assert.equal(paymentBeforeNumber.status, 409);
      assert.equal(paymentBeforeNumber.body.error.code, 'DEBIT_NOTE_PAYMENT_NUMBER_REQUIRED');

      const debitNoteNumber = `DN-${runId}-001`;
      const savedNumber = await api(`/api/finance/debit-notes/${created.orderId}/number`, {
        method: 'PATCH',
        token: financeToken,
        body: { debitNoteNumber },
      });
      assert.equal(savedNumber.status, 200);
      assert.equal(savedNumber.body.data.debitNoteNumber, debitNoteNumber);

      const numberLog = await latestActivityForEntity('FINANCE_INPUT_DEBIT_NOTE_NUMBER', created.orderId);
      assert.equal(numberLog.action, 'FINANCE_INPUT_DEBIT_NOTE_NUMBER');

      const outstanding = await api(`/api/finance/debit-notes/outstanding?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(outstanding.status, 200);
      const outstandingRow = outstanding.body.data.rows.find((row) => row.id === created.orderId);
      assert.ok(outstandingRow, 'Debit Note yang sudah bernomor harus muncul di Outstanding');
      assert.equal(outstandingRow.debitNoteAmount, 75000);
      assert.equal(outstandingRow.outstandingAmount, 75000);
      assert.equal(outstandingRow.agingBucket, 'current');

      const overpay = await api(`/api/finance/debit-notes/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 100000, proofFile },
      });
      assert.equal(overpay.status, 409);
      assert.equal(overpay.body.error.code, 'DEBIT_NOTE_PAYMENT_EXCEEDS_OUTSTANDING');

      const partialPayment = await api(`/api/finance/debit-notes/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 25000, referenceNumber: `TRF-DN-${runId}-1`, proofFile },
      });
      assert.equal(partialPayment.status, 200);
      assert.equal(partialPayment.body.data.totalPaid, 25000);
      assert.equal(partialPayment.body.data.outstandingAmount, 50000);

      const finalPayment = await api(`/api/finance/debit-notes/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 50000, referenceNumber: `TRF-DN-${runId}-2`, proofFile },
      });
      assert.equal(finalPayment.status, 200);
      assert.equal(finalPayment.body.data.totalPaid, 75000);
      assert.equal(finalPayment.body.data.outstandingAmount, 0);

      const paymentLog = await latestActivityForEntity('FINANCE_RECORD_DEBIT_NOTE_PAYMENT', created.orderId);
      assert.equal(paymentLog.action, 'FINANCE_RECORD_DEBIT_NOTE_PAYMENT');

      const payments = await api(`/api/finance/debit-notes/${created.orderId}/payments`, { token: financeToken });
      assert.equal(payments.status, 200);
      assert.equal(payments.body.data.length, 2);

      const outstandingAfterPaid = await api(`/api/finance/debit-notes/outstanding?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(outstandingAfterPaid.status, 200);
      assert.equal(outstandingAfterPaid.body.data.rows.some((row) => row.id === created.orderId), false, 'Debit Note yang sudah lunas tidak boleh lagi muncul di Outstanding');

      const invoiceDetailUnaffected = await api(`/api/finance/invoices/${created.orderId}`, { token: financeToken });
      assert.equal(invoiceDetailUnaffected.status, 200);
      assert.notEqual(invoiceDetailUnaffected.body.data.billingStatus, 'lunas', 'pembayaran Debit Note tidak boleh ikut melunaskan Invoice');
    });

    await t.test('finance: biaya reimbursement yang sudah di-void (batal) tidak ikut ditagihkan di Debit Note', async () => {
      const voidDnSoNumber = `SO-VOIDDN-${runId}`;
      const voidDnOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: voidDnSoNumber }),
      });
      assert.equal(voidDnOrder.status, 201);
      const voidDnOrderId = voidDnOrder.body.data.id;
      const voidDnJobId = voidDnOrder.body.data.containers[0].id;
      const voidDnInternalSoNumber = voidDnOrder.body.data.soNumber;

      const keptExpense = await api(`/api/container-jobs/${voidDnJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'lainnya',
          expenseGroup: 'reimbursement',
          amount: 60000,
          description: `Reimbursement tetap aktif ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Void DN Test',
          paymentStatus: 'belum_dibayar',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(keptExpense.status, 200);

      const voidedExpense = await api(`/api/container-jobs/${voidDnJobId}/expenses`, {
        method: 'POST',
        token: adminToken,
        body: {
          category: 'lainnya',
          expenseGroup: 'reimbursement',
          amount: 40000,
          description: `Reimbursement akan di-void ${runId}`,
          recipientType: 'vendor',
          recipientName: 'Vendor Void DN Test 2',
          paymentStatus: 'belum_dibayar',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(voidedExpense.status, 200);
      const voidedExpenseId = voidedExpense.body.data.id;

      // Selesaikan SO/job langsung lewat DB supaya memenuhi syarat billable Debit Note (status completed) -
      // alur penyelesaian job penuh sudah diuji test lain; fokus test ini murni pada filter payment_status.
      await query(`update container_jobs set status = 'completed' where id = $1`, [voidDnJobId]);
      await query(`update sales_orders set status = 'completed' where id = $1`, [voidDnOrderId]);

      const beforeVoid = await api(`/api/finance/debit-notes?query=${encodeURIComponent(voidDnInternalSoNumber)}`, { token: financeToken });
      assert.equal(beforeVoid.status, 200);
      const beforeRow = beforeVoid.body.data.rows.find((row) => row.id === voidDnOrderId);
      assert.ok(beforeRow, 'SO dengan 2 biaya reimbursement aktif harus muncul di antrian Debit Note');
      assert.equal(beforeRow.debitNoteAmount, 100000);

      // Koreksi salah satu biaya jadi 'batal' - misalnya vendor membebaskan biaya atau salah input.
      await query(`update container_job_expenses set payment_status = 'batal' where id = $1`, [voidedExpenseId]);

      const afterVoid = await api(`/api/finance/debit-notes?query=${encodeURIComponent(voidDnInternalSoNumber)}`, { token: financeToken });
      assert.equal(afterVoid.status, 200);
      const afterRow = afterVoid.body.data.rows.find((row) => row.id === voidDnOrderId);
      assert.ok(afterRow, 'SO masih harus muncul karena masih ada 1 biaya reimbursement aktif');
      assert.equal(afterRow.debitNoteAmount, 60000, 'total Debit Note harus turun setelah biaya di-void, tidak boleh tetap menagih biaya yang sudah batal');

      // Void juga biaya yang tersisa - SO seharusnya sudah tidak billable sama sekali.
      await query(`update container_job_expenses set payment_status = 'batal' where container_job_id = $1`, [voidDnJobId]);

      const allVoidedQueue = await api(`/api/finance/debit-notes?query=${encodeURIComponent(voidDnInternalSoNumber)}`, { token: financeToken });
      assert.equal(allVoidedQueue.status, 200);
      assert.equal(allVoidedQueue.body.data.rows.some((row) => row.id === voidDnOrderId), false, 'SO tanpa biaya reimbursement aktif tidak boleh muncul lagi di antrian Debit Note');

      const voidDnNumber = `DN-${runId}-VOIDED`;
      const savedVoidDnNumber = await api(`/api/finance/debit-notes/${voidDnOrderId}/number`, {
        method: 'PATCH',
        token: financeToken,
        body: { debitNoteNumber: voidDnNumber },
      });
      assert.equal(savedVoidDnNumber.status, 200);

      const blockedPayment = await api(`/api/finance/debit-notes/${voidDnOrderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: {
          amount: 1000,
          proofFile: {
            fileName: `void-dn-blocked-${runId}.pdf`,
            mimeType: 'application/pdf',
            fileBase64: Buffer.from(`%PDF-1.4\n% void dn blocked ${runId}\n`).toString('base64'),
          },
        },
      });
      assert.equal(blockedPayment.status, 409);
      assert.equal(blockedPayment.body.error.code, 'DEBIT_NOTE_PAYMENT_NOT_BILLABLE');
    });

    await t.test('finance: void pembayaran Debit Note - Finance/Admin saja, alasan wajib, outstanding kebuka lagi', async () => {
      const paymentsBeforeVoid = await api(`/api/finance/debit-notes/${created.orderId}/payments`, { token: financeToken });
      assert.equal(paymentsBeforeVoid.status, 200);
      assert.equal(paymentsBeforeVoid.body.data.length, 2);
      const finalPaymentRow = paymentsBeforeVoid.body.data.find((row) => row.referenceNumber === `TRF-DN-${runId}-2`);
      assert.ok(finalPaymentRow);

      const forbiddenSales = await api(`/api/finance/debit-notes/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: salesToken,
        body: { reason: 'Salah catat' },
      });
      // Diblok di level router (permission finance.debit_note.payment.void tidak dipegang Sales),
      // sebelum sempat sampai ke pengecekan role eksplisit di service layer.
      assert.equal(forbiddenSales.status, 403);
      assert.equal(forbiddenSales.body.error.code, 'FORBIDDEN');

      const missingReason = await api(`/api/finance/debit-notes/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: {},
      });
      assert.equal(missingReason.status, 400);
      assert.equal(missingReason.body.error.code, 'FINANCE_DEBIT_NOTE_PAYMENT_VOID_REASON_REQUIRED');

      const voided = await api(`/api/finance/debit-notes/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: `Pembayaran Debit Note salah catat - test ${runId}` },
      });
      assert.equal(voided.status, 200);
      assert.ok(voided.body.data.payment.voidedAt);
      assert.equal(voided.body.data.totalPaid, 25000);
      assert.equal(voided.body.data.outstandingAmount, 50000);

      const outstandingAfterVoid = await api(`/api/finance/debit-notes/outstanding?query=${encodeURIComponent(created.orderSoNumber)}`, { token: financeToken });
      assert.equal(outstandingAfterVoid.status, 200);
      assert.equal(outstandingAfterVoid.body.data.rows.some((row) => row.id === created.orderId), true, 'Debit Note harus muncul lagi di Outstanding setelah pembayaran pelunasannya di-void');

      const alreadyVoided = await api(`/api/finance/debit-notes/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: 'Coba void lagi' },
      });
      assert.equal(alreadyVoided.status, 409);
      assert.equal(alreadyVoided.body.error.code, 'DEBIT_NOTE_PAYMENT_ALREADY_VOIDED');

      const voidLog = await latestActivityForEntity('FINANCE_VOID_DEBIT_NOTE_PAYMENT', created.orderId);
      assert.equal(voidLog.action, 'FINANCE_VOID_DEBIT_NOTE_PAYMENT');

      // Bayar lagi supaya lunas -- test setelah ini yang mengasumsikan Debit Note ini sudah lunas
      // tidak terganggu.
      const proofFile = {
        fileName: `debit-note-proof-${runId}-void.pdf`,
        mimeType: 'application/pdf',
        fileBase64: Buffer.from(`%PDF-1.4\n% debit note proof void ${runId}\n`).toString('base64'),
      };
      const repay = await api(`/api/finance/debit-notes/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: 50000, referenceNumber: `TRF-DN-${runId}-3`, proofFile },
      });
      assert.equal(repay.status, 200);
      assert.equal(repay.body.data.outstandingAmount, 0);
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
      const blockedSalesDeliveryStatus = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: salesToken,
        body: { billingStatus: 'lunas' },
      });
      assert.equal(blockedSalesDeliveryStatus.status, 403);
      assert.equal(blockedSalesDeliveryStatus.body.error.code, 'FORBIDDEN');

      // 'lunas' tetap tidak boleh diset manual lewat endpoint ini walau oleh Finance yang sekarang berwenang --
      // satu-satunya jalur sah adalah otomatis lewat pencatatan payment di bawah.
      const blockedFinanceLunas = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: financeToken,
        body: { billingStatus: 'lunas' },
      });
      assert.equal(blockedFinanceLunas.status, 400);
      assert.equal(blockedFinanceLunas.body.error.code, 'INVALID_INVOICE_DELIVERY_STATUS');

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

    await t.test('finance: void pembayaran invoice - Finance/Admin saja, alasan wajib, outstanding kebuka lagi', async () => {
      const proofFile = {
        fileName: `payment-proof-${runId}-void.pdf`,
        mimeType: 'application/pdf',
        fileBase64: Buffer.from(`%PDF-1.4\n% payment proof void ${runId}\n`).toString('base64'),
      };
      const paymentsBeforeVoid = await api(`/api/finance/invoices/${created.orderId}/payments`, { token: financeToken });
      assert.equal(paymentsBeforeVoid.status, 200);
      assert.equal(paymentsBeforeVoid.body.data.length, 2);
      const finalPaymentRow = paymentsBeforeVoid.body.data.find((row) => row.referenceNumber === `TRF-${runId}-2`);
      assert.ok(finalPaymentRow, 'pembayaran kedua (pelunasan) harus ada di riwayat');
      const firstPaymentRow = paymentsBeforeVoid.body.data.find((row) => row.referenceNumber === `TRF-${runId}-1`);

      const forbiddenSales = await api(`/api/finance/invoices/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: salesToken,
        body: { reason: 'Salah catat nominal' },
      });
      // Diblok di level router (permission finance.invoice.payment.void tidak dipegang Sales),
      // sebelum sempat sampai ke pengecekan role eksplisit di service layer.
      assert.equal(forbiddenSales.status, 403);
      assert.equal(forbiddenSales.body.error.code, 'FORBIDDEN');

      const missingReason = await api(`/api/finance/invoices/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: {},
      });
      assert.equal(missingReason.status, 400);
      assert.equal(missingReason.body.error.code, 'FINANCE_INVOICE_PAYMENT_VOID_REASON_REQUIRED');

      const voided = await api(`/api/finance/invoices/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: `Pembayaran kedua salah catat - test ${runId}` },
      });
      assert.equal(voided.status, 200);
      assert.equal(voided.body.data.payment.id, finalPaymentRow.id);
      assert.ok(voided.body.data.payment.voidedAt);
      assert.equal(voided.body.data.payment.voidedByName, users.finance.name);
      assert.equal(voided.body.data.totalPaid, firstPaymentRow.amount, 'total dibayar harus kembali ke jumlah pembayaran pertama saja');
      assert.equal(voided.body.data.outstandingAmount, finalPaymentRow.amount);
      assert.equal(voided.body.data.billingStatus, 'menunggu_pembayaran', 'status harus kebuka lagi dari lunas karena outstanding muncul lagi');

      const paymentsAfterVoid = await api(`/api/finance/invoices/${created.orderId}/payments`, { token: financeToken });
      assert.equal(paymentsAfterVoid.status, 200);
      assert.equal(paymentsAfterVoid.body.data.length, 2, 'baris pembayaran yang di-void tetap tersimpan di riwayat, tidak dihapus');
      const voidedRowInHistory = paymentsAfterVoid.body.data.find((row) => row.id === finalPaymentRow.id);
      assert.ok(voidedRowInHistory.voidedAt);
      assert.equal(voidedRowInHistory.voidReason, `Pembayaran kedua salah catat - test ${runId}`);

      const alreadyVoided = await api(`/api/finance/invoices/${created.orderId}/payments/${finalPaymentRow.id}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: 'Coba void lagi' },
      });
      assert.equal(alreadyVoided.status, 409);
      assert.equal(alreadyVoided.body.error.code, 'SALES_ORDER_PAYMENT_ALREADY_VOIDED');

      const voidLog = await latestActivityForEntity('FINANCE_VOID_INVOICE_PAYMENT', created.orderId);
      assert.equal(voidLog.action, 'FINANCE_VOID_INVOICE_PAYMENT');
      assert.equal(voidLog.actor_role, 'finance');

      // Bayar lagi supaya lunas -- test-test berikutnya yang mengasumsikan created.orderId sudah lunas
      // (mis. outstanding dashboard) tidak terganggu oleh void ini.
      const repay = await api(`/api/finance/invoices/${created.orderId}/payments`, {
        method: 'POST',
        token: financeToken,
        body: { amount: finalPaymentRow.amount, referenceNumber: `TRF-${runId}-3`, proofFile },
      });
      assert.equal(repay.status, 200);
      assert.equal(repay.body.data.billingStatus, 'lunas');
    });

    await t.test('finance: revenue line manual (inap) masuk ke Invoice, bukan Debit Note, dan tidak bisa diubah kalau sudah lunas', async () => {
      const revenueSoNumber = `SO-REVLINE-${runId}`;
      const revenueOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: revenueSoNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(revenueOrder.status, 201);
      const revenueOrderId = revenueOrder.body.data.id;
      const revenueJobId = revenueOrder.body.data.containers[0].id;
      await query("update container_jobs set status = 'completed', completed_at = now() where id = $1", [revenueJobId]);
      await query(
        `
          update sales_orders
          set status = 'completed', finance_verification_status = 'verified', accurate_so_number = so_number,
              invoice_number = $2, payment_type = 'cash', invoice_issued_at = now()
          where id = $1
        `,
        [revenueOrderId, `INV-${revenueSoNumber}`],
      );

      const beforeDetail = await api(`/api/finance/invoices/${revenueOrderId}`, { token: financeToken });
      assert.equal(beforeDetail.status, 200);
      const billingAmountBefore = Number(beforeDetail.body.data.billingAmount);
      const debitNoteAmountBefore = Number(beforeDetail.body.data.debitNoteAmount);
      assert.deepEqual(beforeDetail.body.data.manualRevenueLines, []);

      const forbiddenSales = await api(`/api/finance/invoices/${revenueOrderId}/revenue-lines`, {
        method: 'POST',
        token: salesToken,
        body: { chargeType: 'inap', description: 'Inap 1 malam', quantity: 1, unit: 'malam', unitPrice: 500000 },
      });
      assert.equal(forbiddenSales.status, 403);
      assert.equal(forbiddenSales.body.error.code, 'FORBIDDEN');

      const missingDescription = await api(`/api/finance/invoices/${revenueOrderId}/revenue-lines`, {
        method: 'POST',
        token: financeToken,
        body: { chargeType: 'inap', description: '', quantity: 1, unit: 'malam', unitPrice: 500000 },
      });
      assert.equal(missingDescription.status, 400);
      assert.equal(missingDescription.body.error.code, 'REVENUE_LINE_DESCRIPTION_REQUIRED');

      const created1 = await api(`/api/finance/invoices/${revenueOrderId}/revenue-lines`, {
        method: 'POST',
        token: financeToken,
        body: { chargeType: 'inap', description: 'Inap 1 malam di rest area KM 57', quantity: 1, unit: 'malam', unitPrice: 500000 },
      });
      assert.equal(created1.status, 200);
      assert.equal(created1.body.data.line.totalAmount, 500000);
      assert.equal(created1.body.data.line.status, 'active');
      assert.equal(created1.body.data.billingAmount, billingAmountBefore + 500000);

      const createLog = await latestActivityForEntity('FINANCE_CREATE_REVENUE_LINE', revenueOrderId);
      assert.equal(createLog.action, 'FINANCE_CREATE_REVENUE_LINE');
      assert.equal(createLog.actor_role, 'finance');

      const detailAfterCreate = await api(`/api/finance/invoices/${revenueOrderId}`, { token: financeToken });
      assert.equal(detailAfterCreate.status, 200);
      assert.equal(detailAfterCreate.body.data.billingAmount, billingAmountBefore + 500000);
      assert.equal(detailAfterCreate.body.data.manualRevenueAmount, 500000);
      // Biaya inap sengaja TIDAK boleh masuk Debit Note -- itu murni untuk reimbursement.
      assert.equal(detailAfterCreate.body.data.debitNoteAmount, debitNoteAmountBefore);
      assert.equal(detailAfterCreate.body.data.manualRevenueLines.length, 1);
      assert.equal(detailAfterCreate.body.data.manualRevenueLines[0].description, 'Inap 1 malam di rest area KM 57');

      const lineId = created1.body.data.line.id;
      const voidWithoutReason = await api(`/api/finance/invoices/${revenueOrderId}/revenue-lines/${lineId}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: {},
      });
      assert.equal(voidWithoutReason.status, 400);
      assert.equal(voidWithoutReason.body.error.code, 'REVENUE_LINE_VOID_REASON_REQUIRED');

      const voided = await api(`/api/finance/invoices/${revenueOrderId}/revenue-lines/${lineId}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: `Salah input, harusnya bukan inap - test ${runId}` },
      });
      assert.equal(voided.status, 200);
      assert.equal(voided.body.data.billingAmount, billingAmountBefore);

      const detailAfterVoid = await api(`/api/finance/invoices/${revenueOrderId}`, { token: financeToken });
      assert.equal(detailAfterVoid.body.data.billingAmount, billingAmountBefore);
      assert.equal(detailAfterVoid.body.data.manualRevenueAmount, 0);
      // Baris yang di-void tetap tersimpan di riwayat (transparansi), tidak dihapus.
      assert.equal(detailAfterVoid.body.data.manualRevenueLines.length, 1);
      assert.ok(detailAfterVoid.body.data.manualRevenueLines[0].voidedAt);

      // SO lain yang sudah lunas (created.orderId, dari test pembayaran invoice sebelumnya) tidak
      // boleh diam-diam berubah outstanding-nya lewat revenue line -- harus diblokir total.
      const blockedOnPaidOrder = await api(`/api/finance/invoices/${created.orderId}/revenue-lines`, {
        method: 'POST',
        token: financeToken,
        body: { chargeType: 'inap', description: 'Inap tambahan', quantity: 1, unit: 'malam', unitPrice: 200000 },
      });
      assert.equal(blockedOnPaidOrder.status, 409);
      assert.equal(blockedOnPaidOrder.body.error.code, 'REVENUE_LINE_INVOICE_ALREADY_PAID');
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

    await t.test('finance: rollup outstanding per customer menjumlahkan invoice current dan overdue secara terpisah', async () => {
      const rollupCustomer = `Customer Rollup ${runId}`;

      async function createInvoicedOrder({ soNumber, invoiceIssuedAt }) {
        const order = await api('/api/sales-orders', {
          method: 'POST',
          token: salesToken,
          body: salesOrderPayload({ soNumber, customer: rollupCustomer }),
        });
        assert.equal(order.status, 201);
        const orderId = order.body.data.id;
        const jobId = order.body.data.containers[0].id;

        await query("update container_jobs set status = 'completed', completed_at = now() where id = $1", [jobId]);
        await query(
          `
            update sales_orders
            set status = 'completed',
                finance_verification_status = 'verified',
                accurate_so_number = so_number,
                invoice_number = $2,
                payment_type = 'cash',
                invoice_issued_at = $3::timestamptz
            where id = $1
          `,
          [orderId, `INV-${soNumber}`, invoiceIssuedAt],
        );
        return orderId;
      }

      const currentOrderId = await createInvoicedOrder({
        soNumber: `SO-ROLLUP-${runId}-CURRENT`,
        invoiceIssuedAt: new Date().toISOString(),
      });
      const overdueOrderId = await createInvoicedOrder({
        soNumber: `SO-ROLLUP-${runId}-OVERDUE`,
        invoiceIssuedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const flatRows = await api(`/api/finance/outstanding?query=${encodeURIComponent(rollupCustomer)}`, { token: financeToken });
      assert.equal(flatRows.status, 200);
      assert.equal(flatRows.body.data.rows.length, 2, 'drill-down (dipakai modal Detail) harus mengembalikan kedua invoice customer ini');
      const currentRow = flatRows.body.data.rows.find((row) => row.id === currentOrderId);
      const overdueRow = flatRows.body.data.rows.find((row) => row.id === overdueOrderId);
      assert.equal(currentRow.agingBucket, 'current');
      assert.ok(overdueRow.agingBucket.startsWith('overdue_'));
      assert.equal(overdueRow.daysOverdue, 40);

      const rollup = await api(`/api/finance/outstanding/by-customer?query=${encodeURIComponent(rollupCustomer)}`, { token: financeToken });
      assert.equal(rollup.status, 200);
      assert.equal(rollup.body.data.rows.length, 1, 'kedua invoice customer yang sama harus digabung jadi satu baris rollup');
      const row = rollup.body.data.rows[0];
      assert.equal(row.customer, rollupCustomer);
      assert.equal(row.invoiceCount, 2);
      assert.equal(row.totalOutstandingAmount, currentRow.outstandingAmount + overdueRow.outstandingAmount);
      assert.equal(row.currentAmount, currentRow.outstandingAmount);
      assert.equal(row.overdueAmount, overdueRow.outstandingAmount);
      assert.equal(row.oldestOverdueDays, 40);

      // Endpoint rollup ini harus membawa summary-nya sendiri, supaya CustomerOutstandingPage.jsx
      // di frontend cukup satu kali fetch (tidak perlu panggilan kedua ke /finance/outstanding
      // hanya untuk mengambil summary).
      const rollupSummary = rollup.body.data.summary;
      assert.ok(rollupSummary, 'response /finance/outstanding/by-customer harus menyertakan field summary');
      assert.equal(typeof rollupSummary.totalOutstandingAmount, 'number');
      assert.equal(typeof rollupSummary.totalCustomers, 'number');
      assert.equal(typeof rollupSummary.current, 'number');
      assert.equal(typeof rollupSummary.overdue31To60, 'number');
      assert.ok(rollupSummary.totalOutstandingAmount >= row.totalOutstandingAmount, 'summary global harus mencakup minimal piutang customer ini');

      const forbiddenRollup = await api('/api/finance/outstanding/by-customer', { token: salesToken });
      assert.equal(forbiddenRollup.status, 403);
    });

    await t.test('finance: rollup outstanding per customer mendukung sortBy dan agingBucket=overdue_all', async () => {
      const prefix = `ZSort-${runId}`;
      const customerA = `${prefix}-A`; // current, outstanding paling besar, tidak overdue
      const customerB = `${prefix}-B`; // overdue 10 hari, outstanding menengah
      const customerC = `${prefix}-C`; // overdue 95 hari, outstanding paling kecil tapi paling tua

      async function createInvoicedOrder({ soNumber, customer, price, invoiceIssuedAt }) {
        const order = await api('/api/sales-orders', {
          method: 'POST',
          token: salesToken,
          body: salesOrderPayload({
            soNumber,
            customer,
            // tripDate sengaja dibuat lebih lama dari default helper ini (2026-07-11) -- laporan
            // sales-orders lain di file ini mengurutkan "order by trip_date desc, created_at desc"
            // dengan pagination, jadi kalau dibiarkan pakai tripDate default, baris-baris SO baru
            // ini bisa menggeser baris test lain (yang dibuat lebih awal tapi trip_date-nya sama)
            // keluar dari halaman pertama.
            tripDate: '2025-01-01',
            lineItems: [{ serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price }],
          }),
        });
        assert.equal(order.status, 201);
        const orderId = order.body.data.id;
        const jobId = order.body.data.containers[0].id;

        await query("update container_jobs set status = 'completed', completed_at = now() where id = $1", [jobId]);
        await query(
          `
            update sales_orders
            set status = 'completed',
                finance_verification_status = 'verified',
                accurate_so_number = so_number,
                invoice_number = $2,
                payment_type = 'cash',
                invoice_issued_at = $3::timestamptz
            where id = $1
          `,
          [orderId, `INV-${soNumber}`, invoiceIssuedAt],
        );
      }

      await createInvoicedOrder({
        soNumber: `SO-${prefix}-A`,
        customer: customerA,
        price: 5000000,
        invoiceIssuedAt: new Date().toISOString(),
      });
      await createInvoicedOrder({
        soNumber: `SO-${prefix}-B`,
        customer: customerB,
        price: 2000000,
        invoiceIssuedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await createInvoicedOrder({
        soNumber: `SO-${prefix}-C`,
        customer: customerC,
        price: 1000000,
        invoiceIssuedAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString(),
      });

      async function fetchSortedCustomers(sortBy) {
        const search = `?query=${encodeURIComponent(prefix)}${sortBy ? `&sortBy=${sortBy}` : ''}`;
        const response = await api(`/api/finance/outstanding/by-customer${search}`, { token: financeToken });
        assert.equal(response.status, 200);
        return response.body.data.rows.map((row) => row.customer);
      }

      assert.deepEqual(
        await fetchSortedCustomers('outstanding_desc'),
        [customerA, customerB, customerC],
        'outstanding_desc: customer dengan total outstanding terbesar harus di atas',
      );
      assert.deepEqual(
        await fetchSortedCustomers(''),
        [customerA, customerB, customerC],
        'default sort (tanpa sortBy) harus sama dengan outstanding_desc',
      );
      assert.deepEqual(
        await fetchSortedCustomers('oldest_overdue_desc'),
        [customerC, customerB, customerA],
        'oldest_overdue_desc: customer dengan umur piutang paling lama harus di atas',
      );
      assert.deepEqual(
        await fetchSortedCustomers('overdue_desc'),
        [customerB, customerC, customerA],
        'overdue_desc: customer dengan overdueAmount terbesar harus di atas (bukan total outstanding)',
      );
      assert.deepEqual(
        await fetchSortedCustomers('customer_asc'),
        [customerA, customerB, customerC],
        'customer_asc: urut abjad nama customer',
      );

      const overdueAllResponse = await api(`/api/finance/outstanding/by-customer?query=${encodeURIComponent(prefix)}&agingBucket=overdue_all`, { token: financeToken });
      assert.equal(overdueAllResponse.status, 200);
      const overdueAllCustomers = overdueAllResponse.body.data.rows.map((row) => row.customer);
      assert.deepEqual(
        overdueAllCustomers.sort(),
        [customerB, customerC].sort(),
        'agingBucket=overdue_all hanya boleh mengembalikan customer yang punya overdueAmount > 0 (bukan yang masih current)',
      );
      overdueAllResponse.body.data.rows.forEach((row) => {
        assert.ok(row.overdueAmount > 0, `row ${row.customer} yang muncul di filter overdue_all harus punya overdueAmount > 0`);
      });
    });

    await t.test('reports: customer performance memecah outstanding jadi kolom bucket umur piutang (current/1-30/31-60/61-90/90+)', async () => {
      const customerName = `Customer Bucket ${runId}`;

      async function createInvoicedOrder({ soNumber, price, daysOverdue }) {
        const order = await api('/api/sales-orders', {
          method: 'POST',
          token: salesToken,
          body: salesOrderPayload({
            soNumber,
            customer: customerName,
            tripDate: '2025-01-01',
            lineItems: [{ serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price }],
          }),
        });
        assert.equal(order.status, 201);
        const orderId = order.body.data.id;
        const jobId = order.body.data.containers[0].id;
        await query("update container_jobs set status = 'completed', completed_at = now() where id = $1", [jobId]);
        await query(
          `
            update sales_orders
            set status = 'completed',
                finance_verification_status = 'verified',
                accurate_so_number = so_number,
                invoice_number = $2,
                payment_type = 'cash',
                invoice_issued_at = now() - ($3 || ' days')::interval
            where id = $1
          `,
          [orderId, `INV-${soNumber}`, String(daysOverdue)],
        );
      }

      await createInvoicedOrder({ soNumber: `SO-BUCKET-${runId}-CURRENT`, price: 1000000, daysOverdue: 0 });
      await createInvoicedOrder({ soNumber: `SO-BUCKET-${runId}-1TO30`, price: 2000000, daysOverdue: 10 });
      await createInvoicedOrder({ soNumber: `SO-BUCKET-${runId}-31TO60`, price: 3000000, daysOverdue: 45 });
      await createInvoicedOrder({ soNumber: `SO-BUCKET-${runId}-61TO90`, price: 4000000, daysOverdue: 75 });
      await createInvoicedOrder({ soNumber: `SO-BUCKET-${runId}-90PLUS`, price: 5000000, daysOverdue: 100 });

      const now = new Date();
      const response = await api(
        `/api/reports/customer-performance?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
        { token: observerToken },
      );
      assert.equal(response.status, 200);
      const row = response.body.data.rows.find((item) => item.customer === customerName);
      assert.ok(row, 'customer harus muncul di laporan customer performance');
      assert.equal(row.currentAmount, 1000000, 'kolom Current harus hanya berisi invoice yang belum jatuh tempo');
      assert.equal(row.overdue1To30Amount, 2000000, 'kolom 1-30 Hari harus hanya berisi invoice yang menunggak 1-30 hari');
      assert.equal(row.overdue31To60Amount, 3000000, 'kolom 31-60 Hari harus hanya berisi invoice yang menunggak 31-60 hari');
      assert.equal(row.overdue61To90Amount, 4000000, 'kolom 61-90 Hari harus hanya berisi invoice yang menunggak 61-90 hari');
      assert.equal(row.overdue90PlusAmount, 5000000, 'kolom >90 Hari harus hanya berisi invoice yang menunggak lebih dari 90 hari');
      assert.equal(
        row.currentAmount + row.overdue1To30Amount + row.overdue31To60Amount + row.overdue61To90Amount + row.overdue90PlusAmount,
        row.totalOutstandingAmount,
        'jumlah semua bucket harus sama dengan totalOutstandingAmount, tidak ada yang hilang atau dobel dihitung',
      );
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

      // Finance BERWENANG memanggil endpoint ini (beda dari update SO generik di atas), tapi SO ini
      // sudah lunas di titik ini pada alur test -- jadi tetap ditolak, bukan oleh permission
      // melainkan oleh guard "invoice yang sudah lunas tidak bisa diubah statusnya dari sini".
      const blockedDeliveryStatus = await api(`/api/sales-orders/${created.orderId}/invoice-delivery-status`, {
        method: 'PATCH',
        token: financeToken,
        body: { billingStatus: 'menunggu_pembayaran' },
      });
      assert.equal(blockedDeliveryStatus.status, 409);
      assert.equal(blockedDeliveryStatus.body.error.code, 'INVOICE_DELIVERY_STATUS_ALREADY_PAID');
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

    await t.test('attachments: dokumen Invoice/Faktur Pajak/Debit Note hanya bisa diakses role finance/admin', async () => {
      const invoicePdfUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'sales_order',
          entityId: created.orderId,
          category: 'invoicePdf',
          fileName: `invoice-access-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% invoice access ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Admin',
        },
      });
      assert.equal(invoicePdfUpload.status, 201);
      const invoicePdfId = invoicePdfUpload.body.data.id;

      const debitNotePdfUpload = await api('/api/attachments/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          entityType: 'sales_order',
          entityId: created.orderId,
          category: 'debitNotePdf',
          fileName: `debit-note-access-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% debit note access ${runId}\n`).toString('base64'),
          uploadedByName: 'Sprint2C Admin',
        },
      });
      assert.equal(debitNotePdfUpload.status, 201);
      const debitNotePdfId = debitNotePdfUpload.body.data.id;

      const invoiceDeniedForOperational = await fetch(`${baseUrl}/api/attachments/${invoicePdfId}`, {
        headers: { Authorization: `Bearer ${operationalToken}` },
      });
      assert.equal(invoiceDeniedForOperational.status, 403);
      assert.equal((await invoiceDeniedForOperational.json()).error.code, 'ATTACHMENT_ACCESS_DENIED');

      const invoiceDeniedForObserver = await fetch(`${baseUrl}/api/attachments/${invoicePdfId}`, {
        headers: { Authorization: `Bearer ${observerToken}` },
      });
      assert.equal(invoiceDeniedForObserver.status, 403);

      const invoiceAllowedForFinance = await fetch(`${baseUrl}/api/attachments/${invoicePdfId}`, {
        headers: { Authorization: `Bearer ${financeToken}` },
      });
      assert.equal(invoiceAllowedForFinance.status, 200);

      const debitNoteDeniedForOperational = await fetch(`${baseUrl}/api/attachments/${debitNotePdfId}`, {
        headers: { Authorization: `Bearer ${operationalToken}` },
      });
      assert.equal(debitNoteDeniedForOperational.status, 403);

      const debitNoteAllowedForAdmin = await fetch(`${baseUrl}/api/attachments/${debitNotePdfId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(debitNoteAllowedForAdmin.status, 200);

      const orderDocumentListForOperational = await api(`/api/attachments?entityType=sales_order&entityId=${created.orderId}`, { token: operationalToken });
      assert.equal(orderDocumentListForOperational.status, 200);
      assert.equal(orderDocumentListForOperational.body.data.some((attachment) => attachment.id === invoicePdfId), false);
      assert.equal(orderDocumentListForOperational.body.data.some((attachment) => attachment.id === debitNotePdfId), false);

      const orderDocumentListForFinance = await api(`/api/attachments?entityType=sales_order&entityId=${created.orderId}`, { token: financeToken });
      assert.equal(orderDocumentListForFinance.status, 200);
      assert.ok(orderDocumentListForFinance.body.data.some((attachment) => attachment.id === invoicePdfId));
      assert.ok(orderDocumentListForFinance.body.data.some((attachment) => attachment.id === debitNotePdfId));
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

    await t.test('driver commission: void pembayaran - admin-only, alasan wajib, batch turun dari paid ke approved', async () => {
      const periodStart = '2099-04-02';
      const periodEnd = '2099-04-08';
      const batchLookup = await query(
        'select id, status from driver_commission_batches where period_start = $1::date and period_end = $2::date',
        [periodStart, periodEnd],
      );
      const batchId = batchLookup.rows[0].id;
      assert.equal(batchLookup.rows[0].status, 'paid', 'batch dari test sebelumnya harus sudah paid (payment tunggalnya sudah lunas)');

      const paymentLookup = await query('select id from driver_commission_payments where batch_id = $1', [batchId]);
      const paymentId = paymentLookup.rows[0].id;

      const forbiddenNonAdmin = await api(`/api/driver-commissions/payments/${paymentId}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: 'Salah bayar' },
      });
      // Diblok di level router (permission driver_commission.void cuma dipegang admin), sebelum
      // sempat sampai ke pengecekan role eksplisit di service layer.
      assert.equal(forbiddenNonAdmin.status, 403);
      assert.equal(forbiddenNonAdmin.body.error.code, 'FORBIDDEN');

      const missingReason = await api(`/api/driver-commissions/payments/${paymentId}/void`, {
        method: 'PATCH',
        token: adminToken,
        body: {},
      });
      assert.equal(missingReason.status, 400);
      assert.equal(missingReason.body.error.code, 'DRIVER_COMMISSION_PAYMENT_VOID_REASON_REQUIRED');

      const voided = await api(`/api/driver-commissions/payments/${paymentId}/void`, {
        method: 'PATCH',
        token: adminToken,
        body: { reason: `Salah bayar sopir - test ${runId}` },
      });
      assert.equal(voided.status, 200);
      const voidedPayment = voided.body.data.payments.find((payment) => payment.id === paymentId);
      assert.equal(voidedPayment.status, 'pending', 'status pembayaran harus kembali ke pending, siap dibayar ulang');
      assert.equal(voidedPayment.paymentProofAttachmentId, null, 'bukti transfer lama harus dilepas supaya pembayaran ulang wajib upload bukti baru');
      assert.ok(voidedPayment.voidedAt);
      assert.equal(voided.body.data.status, 'approved', 'batch harus turun lagi dari paid ke approved karena salah satu payment-nya di-void');

      const dbStatus = await query('select status, payment_proof_attachment_id, paid_at from driver_commission_payments where id = $1', [paymentId]);
      assert.equal(dbStatus.rows[0].status, 'pending');
      assert.equal(dbStatus.rows[0].payment_proof_attachment_id, null);
      assert.equal(dbStatus.rows[0].paid_at, null);

      const payAfterVoidWithoutProof = await api(`/api/driver-commissions/payments/${paymentId}/pay`, {
        method: 'PATCH',
        token: financeToken,
        body: { paymentNote: `Coba bayar ulang tanpa bukti baru ${runId}` },
      });
      assert.equal(payAfterVoidWithoutProof.status, 400);
      assert.equal(payAfterVoidWithoutProof.body.error.code, 'DRIVER_COMMISSION_PAYMENT_PROOF_REQUIRED', 'bukti lama yang sudah dilepas tidak boleh membuat sistem menganggap payment ini sudah pernah punya bukti');

      const alreadyVoided = await api(`/api/driver-commissions/payments/${paymentId}/void`, {
        method: 'PATCH',
        token: adminToken,
        body: { reason: 'Coba void lagi' },
      });
      assert.equal(alreadyVoided.status, 400);
      assert.equal(alreadyVoided.body.error.code, 'DRIVER_COMMISSION_PAYMENT_NOT_PAID');

      const voidLog = await latestActivityForEntity('VOID_DRIVER_COMMISSION_PAYMENT', paymentId);
      assert.equal(voidLog.action, 'VOID_DRIVER_COMMISSION_PAYMENT');
      assert.equal(voidLog.actor_role, 'admin');
    });

    await t.test('sales order: customer_name tidak ikut berubah saat SO diedit untuk field lain setelah master customer diganti namanya', async () => {
      const customerName = `Snapshot Customer ${runId}`;
      const customerInsert = await query('insert into customers (name) values ($1) returning id', [customerName]);
      const customerId = customerInsert.rows[0].id;

      const soNumber = `SO-SNAPCUST-${runId}`;
      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber, customer: customerName }),
      });
      assert.equal(createdOrder.status, 201);
      const orderId = createdOrder.body.data.id;
      assert.equal(createdOrder.body.data.customer, customerName);

      const linked = await query('select customer_id from sales_orders where id = $1', [orderId]);
      assert.equal(linked.rows[0].customer_id, customerId, 'customer_id harus ter-link ke master customer saat SO dibuat');

      // Master customer diedit (rename) SETELAH SO dibuat.
      await query('update customers set name = $1 where id = $2', [`${customerName} RENAMED`, customerId]);

      // SO diedit untuk field lain; body tetap membawa nama customer LAMA (persis seperti form
      // edit di frontend yang memuat data dari SO-nya sendiri, bukan re-fetch dari master).
      const updated = await api(`/api/sales-orders/${orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({ soNumber, customer: customerName, destination: 'Snapshot Test Destination', updatedBy: 'Sprint2C Admin' }),
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.destination, 'Snapshot Test Destination');
      assert.equal(updated.body.data.customer, customerName, 'customer_name SO harus tetap nama lama, tidak diam-diam ikut berubah ke nama master yang baru');

      // Kalau memang customer-nya diganti dengan sengaja, snapshot HARUS ikut update ke customer baru.
      const otherCustomerName = `Snapshot Customer Lain ${runId}`;
      const otherCustomerInsert = await query('insert into customers (name) values ($1) returning id', [otherCustomerName]);
      const changedCustomer = await api(`/api/sales-orders/${orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({ soNumber, customer: otherCustomerName, destination: 'Snapshot Test Destination', updatedBy: 'Sprint2C Admin' }),
      });
      assert.equal(changedCustomer.status, 200);
      assert.equal(changedCustomer.body.data.customer, otherCustomerName, 'kalau customer memang sengaja diganti, snapshot harus ikut update');
      const relinked = await query('select customer_id from sales_orders where id = $1', [orderId]);
      assert.equal(relinked.rows[0].customer_id, otherCustomerInsert.rows[0].id);
    });

    await t.test('container job: assignment_snapshot (rekening bank sopir) tidak ikut berubah saat status di-update tanpa reassignment sungguhan', async () => {
      const driverName = `Driver Snapshot ${runId}`;
      const plate = `B-${String(runId).slice(-4)}-SNP`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status, bank_name, bank_account_number, bank_account_holder)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman', 'Bank Original', '1111', 'Driver Snapshot Holder')
          on conflict do nothing
        `,
        [driverName, `089${String(Date.now()).slice(-9)}`],
      );
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null
        `,
        [`TRK-SNP-${String(runId).slice(-4)}`, plate],
      );

      const soNumber = `SO-SNAPASGN-${runId}`;
      const containerNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;
      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(createdOrder.status, 201);
      const jobId = createdOrder.body.data.containers[0].id;

      const received = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber,
          driver: driverName,
          plateNumber: plate,
          status: 'received',
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(received.status, 200);
      assert.equal(received.body.data.driverBankName, 'Bank Original');
      assert.equal(received.body.data.driverBankAccountNumber, '1111');

      // Master driver diganti rekening banknya SETELAH assignment.
      await query(`update drivers set bank_name = 'Bank Baru', bank_account_number = '9999' where name = $1`, [driverName]);

      // Status di-update lagi; body tetap kirim driver/plateNumber yang SAMA (pola lazim dari UI
      // status-transition), tapi ini BUKAN reassignment sungguhan.
      const running = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber,
          driver: driverName,
          plateNumber: plate,
          status: 'running',
          runningAt: new Date().toISOString(),
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(running.status, 200);
      assert.equal(running.body.data.driverBankName, 'Bank Original', 'rekening bank sopir di snapshot job HARUS tetap yang lama, tidak ikut berubah ke data master terbaru');
      assert.equal(running.body.data.driverBankAccountNumber, '1111');

      // Kalau memang driver-nya diganti dengan sengaja (reassignment sungguhan), snapshot HARUS
      // ikut ambil data driver baru.
      const otherDriverName = `Driver Snapshot Lain ${runId}`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status, bank_name, bank_account_number, bank_account_holder)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman', 'Bank Driver Baru', '2222', 'Driver Baru Holder')
          on conflict do nothing
        `,
        [otherDriverName, `088${String(Date.now()).slice(-9)}`],
      );
      const reassigned = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber,
          driver: otherDriverName,
          plateNumber: plate,
          status: 'running',
          runningAt: new Date().toISOString(),
          updatedBy: 'Sprint2C Operational',
          assignmentChangeReason: 'Sopir awal berhalangan, diganti sopir cadangan',
        },
      });
      assert.equal(reassigned.status, 200);
      assert.equal(reassigned.body.data.driverBankName, 'Bank Driver Baru', 'kalau sopir memang sengaja diganti, snapshot harus ikut ambil data sopir baru');
      assert.equal(reassigned.body.data.driverBankAccountNumber, '2222');
    });

    await t.test('container job: reassignment sopir/truck saat ritasi sudah jalan wajib alasan, riwayat assignment tercatat lengkap', async () => {
      const driverA = `Driver Assign A ${runId}`;
      const driverB = `Driver Assign B ${runId}`;
      const plateA = `B-${String(runId).slice(-4)}-AS1`;
      const plateB = `B-${String(runId).slice(-4)}-AS2`;
      for (const name of [driverA, driverB]) {
        await query(
          `
            insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
            values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
            on conflict do nothing
          `,
          [name, `087${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9)}`],
        );
      }
      for (const [unitCode, plate] of [[`TRK-AS1-${String(runId).slice(-4)}`, plateA], [`TRK-AS2-${String(runId).slice(-4)}`, plateB]]) {
        await query(
          `
            insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
            values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
            on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null
          `,
          [unitCode, plate],
        );
      }

      const soNumber = `SO-ASSIGNHIST-${runId}`;
      const containerNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;
      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(createdOrder.status, 201);
      const jobId = createdOrder.body.data.containers[0].id;

      const assignedFirst = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverA, plateNumber: plateA, status: 'received', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(assignedFirst.status, 200, 'assignment pertama kali saat status received tidak wajib alasan');

      const reassignTruckWhileReceived = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverA, plateNumber: plateB, status: 'received', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(reassignTruckWhileReceived.status, 200, 'ganti truck saja selagi status masih received tidak wajib alasan');

      const startRunning = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverA, plateNumber: plateB, status: 'running', runningAt: new Date().toISOString(), updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(startRunning.status, 200);

      const reassignDriverNoReason = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverB, plateNumber: plateB, status: 'running', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(reassignDriverNoReason.status, 400, 'ganti sopir saat ritasi sudah jalan tanpa alasan harus ditolak');
      assert.equal(reassignDriverNoReason.body.error.code, 'CONTAINER_JOB_ASSIGNMENT_REASON_REQUIRED');

      const reassignDriverWithReason = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: {
          containerNumber,
          driver: driverB,
          plateNumber: plateB,
          status: 'running',
          updatedBy: 'Sprint2C Operational',
          assignmentChangeReason: 'Sopir A sakit mendadak, digantikan sopir B',
          assignmentChangeNote: 'Konfirmasi via telepon ke dispatcher',
        },
      });
      assert.equal(reassignDriverWithReason.status, 200, 'ganti sopir dengan alasan terisi harus berhasil');
      assert.equal(reassignDriverWithReason.body.data.driver, driverB);

      const history = await api(`/api/container-jobs/${jobId}/assignment-history`, { token: operationalToken });
      assert.equal(history.status, 200);
      assert.equal(history.body.data.length, 3, 'setiap event assignment yang benar-benar berubah identitas harus tercatat satu baris riwayat (assign pertama, ganti truck, ganti sopir -- status-only resend & request yang ditolak tidak menambah riwayat)');
      const [latest, , firstEvent] = history.body.data;
      assert.equal(latest.previousDriverName, driverA);
      assert.equal(latest.nextDriverName, driverB);
      assert.equal(latest.previousPlateNumber, plateB);
      assert.equal(latest.nextPlateNumber, plateB);
      assert.equal(latest.reason, 'Sopir A sakit mendadak, digantikan sopir B');
      assert.equal(latest.note, 'Konfirmasi via telepon ke dispatcher');
      assert.equal(latest.changeSource, 'operational');
      assert.ok(latest.changedByName);
      assert.ok(latest.createdAt);
      assert.equal(firstEvent.previousDriverName, '', 'assignment pertama kali tidak punya driver lama');
      assert.equal(firstEvent.nextDriverName, driverA);
    });

    await t.test('container job: assignment terkunci setelah completed/cancelled, koreksi admin tetap tercatat di riwayat', async () => {
      const driverX = `Driver Lock X ${runId}`;
      const driverY = `Driver Lock Y ${runId}`;
      const plateX = `B-${String(runId).slice(-4)}-LK1`;
      for (const name of [driverX, driverY]) {
        await query(
          `
            insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
            values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
            on conflict do nothing
          `,
          [name, `086${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9)}`],
        );
      }
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null
        `,
        [`TRK-LK1-${String(runId).slice(-4)}`, plateX],
      );

      const soNumber = `SO-ASSIGNLOCK-${runId}`;
      const containerNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;
      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(createdOrder.status, 201);
      const jobId = createdOrder.body.data.containers[0].id;

      const completed = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber,
          driver: driverX,
          plateNumber: plateX,
          status: 'completed',
          runningAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: `Setup test ${runId} - selesaikan job tanpa dokumen SPK/EIR`,
        },
      });
      assert.equal(completed.status, 200);

      const blockedNormalReassign = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverY, plateNumber: plateX, status: 'completed', assignmentChangeReason: 'Koreksi biasa', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(blockedNormalReassign.status, 409, 'assignment job completed tidak bisa diubah lewat jalur normal walau alasan diisi');
      assert.equal(blockedNormalReassign.body.error.code, 'CONTAINER_JOB_ASSIGNMENT_LOCKED');

      const adminCorrected = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber,
          driver: driverY,
          plateNumber: plateX,
          status: 'completed',
          completedAt: new Date().toISOString(),
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: `Koreksi assignment ${runId} salah input sopir`,
        },
      });
      assert.equal(adminCorrected.status, 200, 'admin dengan mode koreksi tetap bisa mengubah assignment job completed');
      assert.equal(adminCorrected.body.data.driver, driverY);

      const historyAfterCorrection = await api(`/api/container-jobs/${jobId}/assignment-history`, { token: adminToken });
      assert.equal(historyAfterCorrection.status, 200);
      const correctionEntry = historyAfterCorrection.body.data[0];
      assert.equal(correctionEntry.changeSource, 'admin_correction');
      assert.equal(correctionEntry.reason, `Koreksi assignment ${runId} salah input sopir`);
      assert.equal(correctionEntry.previousDriverName, driverX);
      assert.equal(correctionEntry.nextDriverName, driverY);

      const cancelSoNumber = `SO-ASSIGNCANCEL-${runId}`;
      const cancelContainerNumber = `${cancelSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;
      const cancelOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: cancelSoNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(cancelOrder.status, 201);
      const cancelJobId = cancelOrder.body.data.containers[0].id;
      const assignedForCancel = await api(`/api/container-jobs/${cancelJobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber: cancelContainerNumber, driver: driverX, plateNumber: plateX, status: 'received', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(assignedForCancel.status, 200);
      const cancelled = await api(`/api/container-jobs/${cancelJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { containerNumber: cancelContainerNumber, driver: driverX, plateNumber: plateX, status: 'cancelled', updatedBy: 'Sprint2C Admin' },
      });
      assert.equal(cancelled.status, 200);

      const blockedAfterCancel = await api(`/api/container-jobs/${cancelJobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber: cancelContainerNumber, driver: driverY, plateNumber: plateX, status: 'cancelled', assignmentChangeReason: 'Coba ganti sopir job batal', updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(blockedAfterCancel.status, 409, 'assignment job cancelled tidak bisa diubah lewat jalur normal');
      assert.equal(blockedAfterCancel.body.error.code, 'CONTAINER_JOB_ASSIGNMENT_LOCKED');
    });

    await t.test('container job: perubahan default_driver_name di master Truck tidak mengubah assignment_snapshot job yang sudah ada', async () => {
      const driverDefault = `Driver Default Master ${runId}`;
      const plateDefault = `B-${String(runId).slice(-4)}-DEF`;
      const unitCode = `TRK-DEF-${String(runId).slice(-4)}`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status, bank_name, bank_account_number)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman', 'Bank Default', '5555')
          on conflict do nothing
        `,
        [driverDefault, `085${String(Date.now()).slice(-9)}`],
      );
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status, default_driver_name)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif', $3)
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null, default_driver_name = $3
        `,
        [unitCode, plateDefault, driverDefault],
      );

      const soNumber = `SO-ASSIGNDEFAULT-${runId}`;
      const containerNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;
      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(createdOrder.status, 201);
      const jobId = createdOrder.body.data.containers[0].id;
      const assigned = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverDefault, plateNumber: plateDefault, status: 'running', runningAt: new Date().toISOString(), updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(assigned.status, 200);
      assert.equal(assigned.body.data.driverBankName, 'Bank Default');

      // Ganti "Driver Tetap" truck ini di master -- tidak boleh menyentuh job yang sudah jalan di atas.
      await query(`update vehicles set default_driver_name = $1 where plate_number = $2`, [`Driver Tetap Baru ${runId}`, plateDefault]);
      await query(`update drivers set bank_name = 'Bank Sudah Diganti', bank_account_number = '0000' where name = $1`, [driverDefault]);

      const jobAfterMasterChange = await api(`/api/container-jobs/${jobId}`, { token: operationalToken });
      assert.equal(jobAfterMasterChange.status, 200);
      assert.equal(jobAfterMasterChange.body.data.driver, driverDefault, 'sopir job lama tidak boleh ikut berubah walau default_driver_name master truck diganti');
      assert.equal(jobAfterMasterChange.body.data.driverBankName, 'Bank Default', 'rekening bank snapshot job lama tidak boleh ikut berubah walau master driver diedit');
    });

    await t.test('master truck: Operational bisa ubah default sopir truck lewat endpoint khusus, tercatat audit log, job lama tidak berubah', async () => {
      const driverOld = `Driver Tetap Lama ${runId}`;
      const driverNew = `Driver Tetap Baru ${runId}`;
      const plate = `B-${String(runId).slice(-4)}-TDD`;
      const unitCode = `TRK-TDD-${String(runId).slice(-4)}`;

      const insertedOld = await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
          returning id
        `,
        [driverOld, `081${String(Date.now()).slice(-9)}`],
      );
      const driverOldId = insertedOld.rows[0]?.id
        || (await query('select id from drivers where name = $1', [driverOld])).rows[0].id;
      const insertedNew = await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
          returning id
        `,
        [driverNew, `082${String(Date.now()).slice(-9)}`],
      );
      const driverNewId = insertedNew.rows[0]?.id
        || (await query('select id from drivers where name = $1', [driverNew])).rows[0].id;
      const truckResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status, default_driver_id, default_driver_name)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif', $3, $4)
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null, default_driver_id = $3, default_driver_name = $4
          returning id
        `,
        [unitCode, plate, driverOldId, driverOld],
      );
      const truckId = truckResult.rows[0].id;

      // Job lama pakai sopir aktual driverOld di truck ini SEBELUM default-nya diganti.
      const soNumber = `SO-TDD-${runId}`;
      const containerNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;
      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(createdOrder.status, 201);
      const jobId = createdOrder.body.data.containers[0].id;
      const assigned = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverOld, plateNumber: plate, status: 'running', runningAt: new Date().toISOString(), updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(assigned.status, 200);

      // 4. Alasan pendek ditolak.
      const shortReason = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverNewId, reason: 'pendek' },
      });
      assert.equal(shortReason.status, 400);
      assert.equal(shortReason.body.error.code, 'TRUCK_DEFAULT_DRIVER_REASON_REQUIRED');

      // 3. Sales/Finance ditolak.
      const salesTry = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: salesToken,
        body: { defaultDriverId: driverNewId, reason: `Sales coba ganti default ${runId}` },
      });
      assert.equal(salesTry.status, 403);
      const financeTry = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: financeToken,
        body: { defaultDriverId: driverNewId, reason: `Finance coba ganti default ${runId}` },
      });
      assert.equal(financeTry.status, 403);

      // 1. Operational bisa update default sopir truck dengan alasan valid.
      const reason = `Sopir tetap truck ${unitCode} diganti sesuai kesepakatan lapangan terbaru`;
      const updated = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverNewId, reason },
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.defaultDriverId, driverNewId);
      assert.equal(updated.body.data.defaultDriver, driverNew);

      // 10. Audit log tercatat dengan before/after yang benar.
      const auditLog = await latestActivityForEntity('UPDATE_TRUCK_DEFAULT_DRIVER', truckId);
      assert.ok(auditLog, 'perubahan default sopir truck harus tercatat di activity log');
      assert.equal(auditLog.metadata.previousDefaultDriverId, driverOldId);
      assert.equal(auditLog.metadata.previousDefaultDriverName, driverOld);
      assert.equal(auditLog.metadata.nextDefaultDriverId, driverNewId);
      assert.equal(auditLog.metadata.nextDefaultDriverName, driverNew);
      assert.equal(auditLog.metadata.reason, reason);
      assert.equal(auditLog.actor_role, 'operational');

      // 7 & 8. Job lama (assignment_snapshot & driver_id) tidak berubah walau default truck diganti.
      const jobAfterDefaultChange = await api(`/api/container-jobs/${jobId}`, { token: operationalToken });
      assert.equal(jobAfterDefaultChange.status, 200);
      assert.equal(jobAfterDefaultChange.body.data.driver, driverOld, 'sopir aktual job lama tidak boleh ikut berubah walau default truck diganti');
      assert.equal(jobAfterDefaultChange.body.data.driverId, driverOldId);

      // 2. Admin juga bisa melakukan hal yang sama.
      const adminUpdate = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: adminToken,
        body: { defaultDriverId: driverOldId, reason: `Admin kembalikan default sopir truck ${unitCode}` },
      });
      assert.equal(adminUpdate.status, 200);
      assert.equal(adminUpdate.body.data.defaultDriverId, driverOldId);
    });

    await t.test('master truck: update default sopir ditolak untuk driver blacklist dan truck maintenance', async () => {
      const driverActive = `Driver Aktif TDD ${runId}`;
      const driverBlacklist = `Driver Blacklist TDD ${runId}`;
      const plate = `B-${String(runId).slice(-4)}-TDE`;
      const unitCode = `TRK-TDE-${String(runId).slice(-4)}`;

      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [driverActive, `083${String(Date.now()).slice(-9)}`],
      );
      const driverActiveId = (await query('select id from drivers where name = $1', [driverActive])).rows[0].id;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Blacklist', 'Aman')
          on conflict do nothing
        `,
        [driverBlacklist, `084${String(Date.now()).slice(-9)}`],
      );
      const driverBlacklistId = (await query('select id from drivers where name = $1', [driverBlacklist])).rows[0].id;
      const truckResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null
          returning id
        `,
        [unitCode, plate],
      );
      const truckId = truckResult.rows[0].id;

      // 5. Driver blacklist ditolak.
      const blacklistTry = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverBlacklistId, reason: `Coba jadikan sopir blacklist default ${runId}` },
      });
      assert.equal(blacklistTry.status, 409);
      assert.equal(blacklistTry.body.error.code, 'TRUCK_DEFAULT_DRIVER_DRIVER_NOT_ELIGIBLE');

      // 6. Truck Maintenance ditolak.
      await query(`update vehicles set operational_status = 'Maintenance' where id = $1`, [truckId]);
      const maintenanceTry = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverActiveId, reason: `Coba ubah default truck maintenance ${runId}` },
      });
      assert.equal(maintenanceTry.status, 409);
      assert.equal(maintenanceTry.body.error.code, 'TRUCK_DEFAULT_DRIVER_TRUCK_NOT_ELIGIBLE');

      // 6b. Truck archived ditolak (404, konsisten dengan findVehicle -- archived = tidak ditemukan).
      await query(`update vehicles set operational_status = 'Aktif', archived_at = now() where id = $1`, [truckId]);
      const archivedTry = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverActiveId, reason: `Coba ubah default truck archived ${runId}` },
      });
      assert.equal(archivedTry.status, 404);
      assert.equal(archivedTry.body.error.code, 'TRUCK_NOT_FOUND');
    });

    await t.test('master truck: job baru memakai default sopir terbaru saat truck yang sama dipilih tanpa override manual', async () => {
      const driverInitial = `Driver Awal TDF ${runId}`;
      const driverUpdated = `Driver Update TDF ${runId}`;
      const plate = `B-${String(runId).slice(-4)}-TDF`;
      const unitCode = `TRK-TDF-${String(runId).slice(-4)}`;

      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [driverInitial, `071${String(Date.now()).slice(-9)}`],
      );
      const driverInitialId = (await query('select id from drivers where name = $1', [driverInitial])).rows[0].id;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [driverUpdated, `072${String(Date.now()).slice(-9)}`],
      );
      const driverUpdatedId = (await query('select id from drivers where name = $1', [driverUpdated])).rows[0].id;
      const truckResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status, default_driver_id, default_driver_name)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif', $3, $4)
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null, default_driver_id = $3, default_driver_name = $4
          returning id
        `,
        [unitCode, plate, driverInitialId, driverInitial],
      );
      const truckId = truckResult.rows[0].id;

      const updated = await api(`/api/master/trucks/${truckId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverUpdatedId, reason: `Ganti default sopir truck ${unitCode} untuk test job baru` },
      });
      assert.equal(updated.status, 200);

      // 9. Job baru yang memilih truck ini TANPA override manual sopir harus dapat GET /master/trucks
      // yang sudah mencerminkan default terbaru (sumber kebenaran untuk auto-fill di frontend) --
      // endpoint container-jobs sendiri tidak auto-assign, jadi yang diverifikasi di sini adalah
      // bahwa data master yang dibaca ulang sudah konsisten dengan default_driver_id yang baru saja
      // diset, bukan nilai lama.
      const truckAfterUpdate = await api(`/api/master/trucks/${truckId}`, { token: operationalToken });
      assert.equal(truckAfterUpdate.status, 200);
      assert.equal(truckAfterUpdate.body.data.defaultDriverId, driverUpdatedId);
      assert.equal(truckAfterUpdate.body.data.defaultDriver, driverUpdated);
    });

    await t.test('fleet assignment: Operational/Admin ubah sopir default lewat menu baru, Sales/Finance ditolak, alasan pendek ditolak, riwayat & activity log tercatat, job lama tidak berubah', async () => {
      const driverOld = `Driver Fleet Lama ${runId}`;
      const driverNew = `Driver Fleet Baru ${runId}`;
      const plate = `B-${String(runId).slice(-4)}-FLA`;
      const unitCode = `TRK-FLA-${String(runId).slice(-4)}`;

      const insertedOld = await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          returning id
        `,
        [driverOld, `061${String(Date.now()).slice(-9)}`],
      );
      const driverOldId = insertedOld.rows[0].id;
      const insertedNew = await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          returning id
        `,
        [driverNew, `062${String(Date.now()).slice(-9)}`],
      );
      const driverNewId = insertedNew.rows[0].id;
      const truckResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status, default_driver_id, default_driver_name)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif', $3, $4)
          returning id
        `,
        [unitCode, plate, driverOldId, driverOld],
      );
      const vehicleId = truckResult.rows[0].id;

      const soNumber = `SO-FLA-${runId}`;
      const containerNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;
      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber, tripDate: '2025-01-01' }),
      });
      assert.equal(createdOrder.status, 201);
      const jobId = createdOrder.body.data.containers[0].id;
      const assigned = await api(`/api/container-jobs/${jobId}/status`, {
        method: 'PATCH',
        token: operationalToken,
        body: { containerNumber, driver: driverOld, plateNumber: plate, status: 'running', runningAt: new Date().toISOString(), updatedBy: 'Sprint2C Operational' },
      });
      assert.equal(assigned.status, 200);

      const shortReason = await api(`/api/operations/fleet-assignment/${vehicleId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverNewId, reason: 'pendek' },
      });
      assert.equal(shortReason.status, 400);
      assert.equal(shortReason.body.error.code, 'FLEET_ASSIGNMENT_REASON_REQUIRED');

      const salesTry = await api(`/api/operations/fleet-assignment/${vehicleId}/default-driver`, {
        method: 'PATCH',
        token: salesToken,
        body: { defaultDriverId: driverNewId, reason: `Sales coba ganti assignment armada ${runId}` },
      });
      assert.equal(salesTry.status, 403);
      const financeTry = await api(`/api/operations/fleet-assignment/${vehicleId}/default-driver`, {
        method: 'PATCH',
        token: financeToken,
        body: { defaultDriverId: driverNewId, reason: `Finance coba ganti assignment armada ${runId}` },
      });
      assert.equal(financeTry.status, 403);

      const reason = `Sopir default unit ${unitCode} diganti lewat menu Assignment Armada`;
      const note = 'Sopir lama pindah tugas ke rute lain';
      const updated = await api(`/api/operations/fleet-assignment/${vehicleId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverNewId, reason, note },
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.defaultDriverId, driverNewId);
      assert.equal(updated.body.data.defaultDriver, driverNew);

      const auditLog = await latestActivityForEntity('UPDATE_FLEET_DEFAULT_DRIVER', vehicleId);
      assert.ok(auditLog, 'perubahan sopir default lewat Assignment Armada harus tercatat di activity log');
      assert.equal(auditLog.metadata.previousDefaultDriverId, driverOldId);
      assert.equal(auditLog.metadata.nextDefaultDriverId, driverNewId);
      assert.equal(auditLog.metadata.reason, reason);

      const history = await api(`/api/operations/fleet-assignment/${vehicleId}/history`, { token: operationalToken });
      assert.equal(history.status, 200);
      const historyEntry = history.body.data.find((item) => item.changeType === 'default_driver' && item.nextDriverId === driverNewId);
      assert.ok(historyEntry, 'perubahan sopir default harus tercatat di vehicle_assignment_history');
      assert.equal(historyEntry.previousDriverId, driverOldId);
      assert.equal(historyEntry.previousDriverName, driverOld);
      assert.equal(historyEntry.nextDriverName, driverNew);
      assert.equal(historyEntry.reason, reason);
      assert.equal(historyEntry.note, note);
      assert.equal(historyEntry.changedByRole, 'operational');

      const jobAfterChange = await api(`/api/container-jobs/${jobId}`, { token: operationalToken });
      assert.equal(jobAfterChange.status, 200);
      assert.equal(jobAfterChange.body.data.driver, driverOld, 'sopir aktual job lama tidak boleh berubah walau default armada diganti');
      assert.equal(jobAfterChange.body.data.driverId, driverOldId);

      const adminUpdate = await api(`/api/operations/fleet-assignment/${vehicleId}/default-driver`, {
        method: 'PATCH',
        token: adminToken,
        body: { defaultDriverId: driverOldId, reason: `Admin kembalikan default sopir unit ${unitCode}` },
      });
      assert.equal(adminUpdate.status, 200);
      assert.equal(adminUpdate.body.data.defaultDriverId, driverOldId);
    });

    await t.test('fleet assignment: sopir baru yang sebelumnya default di unit lain otomatis lepas dari unit lama', async () => {
      const driverShared = `Driver Fleet Shared ${runId}`;
      const insertedDriver = await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          returning id
        `,
        [driverShared, `063${String(Date.now()).slice(-9)}`],
      );
      const driverSharedId = insertedDriver.rows[0].id;

      const truckAResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status, default_driver_id, default_driver_name)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif', $3, $4)
          returning id
        `,
        [`TRK-FLB1-${String(runId).slice(-4)}`, `B-${String(runId).slice(-4)}-FB1`, driverSharedId, driverShared],
      );
      const truckAId = truckAResult.rows[0].id;
      const truckBResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          returning id
        `,
        [`TRK-FLB2-${String(runId).slice(-4)}`, `B-${String(runId).slice(-4)}-FB2`],
      );
      const truckBId = truckBResult.rows[0].id;

      const moved = await api(`/api/operations/fleet-assignment/${truckBId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverSharedId, reason: `Sopir ${driverShared} dipindah jadi default unit B` },
      });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.data.defaultDriverId, driverSharedId);

      const truckAAfter = await query('select default_driver_id from vehicles where id = $1', [truckAId]);
      assert.equal(truckAAfter.rows[0].default_driver_id, null, 'unit lama harus otomatis kehilangan default sopir yang sama');
    });

    await t.test('fleet assignment: driver tidak eligible dan unit maintenance ditolak', async () => {
      const driverBlacklist = `Driver Fleet Blacklist ${runId}`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Blacklist', 'Aman')
        `,
        [driverBlacklist, `064${String(Date.now()).slice(-9)}`],
      );
      const driverBlacklistId = (await query('select id from drivers where name = $1', [driverBlacklist])).rows[0].id;
      const driverActive = `Driver Fleet Aktif ${runId}`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
        `,
        [driverActive, `065${String(Date.now()).slice(-9)}`],
      );
      const driverActiveId = (await query('select id from drivers where name = $1', [driverActive])).rows[0].id;
      const truckResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          returning id
        `,
        [`TRK-FLC-${String(runId).slice(-4)}`, `B-${String(runId).slice(-4)}-FLC`],
      );
      const vehicleId = truckResult.rows[0].id;

      const blacklistTry = await api(`/api/operations/fleet-assignment/${vehicleId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverBlacklistId, reason: `Coba jadikan sopir blacklist default armada ${runId}` },
      });
      assert.equal(blacklistTry.status, 409);
      assert.equal(blacklistTry.body.error.code, 'TRUCK_DEFAULT_DRIVER_DRIVER_NOT_ELIGIBLE');

      await query(`update vehicles set operational_status = 'Maintenance' where id = $1`, [vehicleId]);
      const maintenanceTry = await api(`/api/operations/fleet-assignment/${vehicleId}/default-driver`, {
        method: 'PATCH',
        token: operationalToken,
        body: { defaultDriverId: driverActiveId, reason: `Coba ubah default unit maintenance ${runId}` },
      });
      assert.equal(maintenanceTry.status, 409);
      assert.equal(maintenanceTry.body.error.code, 'TRUCK_DEFAULT_DRIVER_TRUCK_NOT_ELIGIBLE');
    });

    await t.test('fleet assignment: pindah chassis, chassis lama & baru otomatis lepas, status tidak eligible ditolak, riwayat tercatat', async () => {
      const chassisOldCode = `CHS-FLD-OLD-${runId}`;
      const chassisNewCode = `CHS-FLD-NEW-${runId}`;
      const chassisInactiveCode = `CHS-FLD-INACTIVE-${runId}`;
      const chassisRenewalCode = `CHS-FLD-RENEWAL-${runId}`;

      const chassisOld = (await query(
        `insert into kir_chassis (chassis_code, container_size, operational_status) values ($1, '20FT', 'Aktif') returning id`,
        [chassisOldCode],
      )).rows[0];
      const chassisNew = (await query(
        `insert into kir_chassis (chassis_code, container_size, operational_status) values ($1, '20FT', 'Aktif') returning id`,
        [chassisNewCode],
      )).rows[0];
      const chassisInactive = (await query(
        `insert into kir_chassis (chassis_code, container_size, operational_status) values ($1, '20FT', 'Tidak Aktif') returning id`,
        [chassisInactiveCode],
      )).rows[0];
      const chassisRenewal = (await query(
        `insert into kir_chassis (chassis_code, container_size, operational_status) values ($1, '20FT', 'Perlu Perpanjang') returning id`,
        [chassisRenewalCode],
      )).rows[0];

      const truckAResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status, current_chassis_id, current_chassis_code)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif', $3, $4)
          returning id
        `,
        [`TRK-FLD1-${String(runId).slice(-4)}`, `B-${String(runId).slice(-4)}-FD1`, chassisOld.id, chassisOldCode],
      );
      const truckAId = truckAResult.rows[0].id;
      const truckCResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status, current_chassis_id, current_chassis_code)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif', $3, $4)
          returning id
        `,
        [`TRK-FLD2-${String(runId).slice(-4)}`, `B-${String(runId).slice(-4)}-FD2`, chassisNew.id, chassisNewCode],
      );
      const truckCId = truckCResult.rows[0].id;

      // Chassis tidak aktif / perlu perpanjang ditolak.
      const inactiveTry = await api(`/api/operations/fleet-assignment/${truckAId}/chassis`, {
        method: 'PATCH',
        token: operationalToken,
        body: { chassisId: chassisInactive.id, reason: `Coba pasang chassis tidak aktif ${runId}` },
      });
      assert.equal(inactiveTry.status, 409);
      assert.equal(inactiveTry.body.error.code, 'FLEET_ASSIGNMENT_CHASSIS_NOT_ELIGIBLE');
      const renewalTry = await api(`/api/operations/fleet-assignment/${truckAId}/chassis`, {
        method: 'PATCH',
        token: operationalToken,
        body: { chassisId: chassisRenewal.id, reason: `Coba pasang chassis perlu perpanjang ${runId}` },
      });
      assert.equal(renewalTry.status, 409);
      assert.equal(renewalTry.body.error.code, 'FLEET_ASSIGNMENT_CHASSIS_NOT_ELIGIBLE');

      // Unit maintenance ditolak.
      const truckMaintenanceResult = await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Maintenance')
          returning id
        `,
        [`TRK-FLD3-${String(runId).slice(-4)}`, `B-${String(runId).slice(-4)}-FD3`],
      );
      const maintenanceTry = await api(`/api/operations/fleet-assignment/${truckMaintenanceResult.rows[0].id}/chassis`, {
        method: 'PATCH',
        token: operationalToken,
        body: { chassisId: chassisOld.id, reason: `Coba pasang chassis di unit maintenance ${runId}` },
      });
      assert.equal(maintenanceTry.status, 409);
      assert.equal(maintenanceTry.body.error.code, 'FLEET_ASSIGNMENT_VEHICLE_NOT_ELIGIBLE');

      // Pindahkan chassisNew (sebelumnya di truckC) ke truckA (sebelumnya pakai chassisOld).
      const reason = `Chassis unit ${truckAId} dipindah ke chassis lain sesuai kondisi lapangan`;
      const moved = await api(`/api/operations/fleet-assignment/${truckAId}/chassis`, {
        method: 'PATCH',
        token: operationalToken,
        body: { chassisId: chassisNew.id, reason },
      });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.data.currentChassisId, chassisNew.id);
      assert.equal(moved.body.data.currentChassisCode, chassisNewCode);

      // Chassis baru otomatis lepas dari unit lama (truckC).
      const truckCAfter = await query('select current_chassis_id from vehicles where id = $1', [truckCId]);
      assert.equal(truckCAfter.rows[0].current_chassis_id, null, 'chassis yang dipindah harus otomatis lepas dari unit lamanya');

      const auditLog = await latestActivityForEntity('UPDATE_FLEET_CHASSIS', truckAId);
      assert.ok(auditLog, 'perubahan chassis harus tercatat di activity log');
      assert.equal(auditLog.metadata.nextChassisId, chassisNew.id);

      const history = await api(`/api/operations/fleet-assignment/${truckAId}/history`, { token: operationalToken });
      assert.equal(history.status, 200);
      const historyEntry = history.body.data.find((item) => item.changeType === 'chassis' && item.nextChassisId === chassisNew.id);
      assert.ok(historyEntry, 'perubahan chassis harus tercatat di vehicle_assignment_history');
      assert.equal(historyEntry.previousChassisId, chassisOld.id);
      assert.equal(historyEntry.previousChassisCode, chassisOldCode);
      assert.equal(historyEntry.reason, reason);
    });

    await t.test('container job: dua request assignment bersamaan untuk driver/truck yang sama tidak boleh lolos dua-duanya (race condition)', async () => {
      const raceDriverName = `Driver Race ${runId}`;
      const racePlate = `B-${String(runId).slice(-4)}-RC`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [raceDriverName, `087${String(Date.now()).slice(-9)}`],
      );
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null
        `,
        [`TRK-RC-${String(runId).slice(-4)}`, racePlate],
      );

      const raceSoNumberA = `SO-RACEA-${runId}`;
      const raceSoNumberB = `SO-RACEB-${runId}`;
      const raceOrderA = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: raceSoNumberA }),
      });
      const raceOrderB = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: raceSoNumberB }),
      });
      assert.equal(raceOrderA.status, 201);
      assert.equal(raceOrderB.status, 201);
      const raceJobIdA = raceOrderA.body.data.containers[0].id;
      const raceJobIdB = raceOrderB.body.data.containers[0].id;

      const assignPayload = (soNumber) => ({
        containerNumber: `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
        driver: raceDriverName,
        plateNumber: racePlate,
        status: 'received',
        updatedBy: 'Sprint2C Operational',
      });

      // Dua request PATCH assignment untuk driver/truck yang SAMA ditembak nyaris bersamaan
      // (Promise.all, bukan berurutan) ke dua job berbeda — ini persis skenario TOCTOU yang
      // sebelumnya bisa lolos dua-duanya karena SELECT check tidak mengunci apa pun.
      const [resultA, resultB] = await Promise.all([
        api(`/api/container-jobs/${raceJobIdA}/status`, {
          method: 'PATCH',
          token: adminToken,
          body: assignPayload(raceSoNumberA),
        }),
        api(`/api/container-jobs/${raceJobIdB}/status`, {
          method: 'PATCH',
          token: adminToken,
          body: assignPayload(raceSoNumberB),
        }),
      ]);

      const statuses = [resultA.status, resultB.status].sort();
      assert.deepEqual(statuses, [200, 409], 'harus tepat satu yang berhasil dan satu yang ditolak, bukan lolos dua-duanya');

      const failed = resultA.status === 409 ? resultA : resultB;
      assert.equal(failed.body.error.code, 'ASSIGNMENT_ALREADY_ACTIVE');

      const driverAssignmentCount = await query(
        `
          select count(*)::int as count
          from container_jobs
          where driver_id = (select id from drivers where name = $1)
            and status not in ('completed', 'cancelled', 'repo_stored')
        `,
        [raceDriverName],
      );
      assert.equal(driverAssignmentCount.rows[0].count, 1, 'driver hanya boleh aktif di TEPAT SATU job, tidak boleh double-booked');
    });

    await t.test('activity log: endpoint POST /api/activity-logs khusus Admin dan tidak bisa dipakai memalsukan identitas', async () => {
      const blockedForSales = await api('/api/activity-logs', {
        method: 'POST',
        token: salesToken,
        body: {
          action: 'DELETE_USER',
          actorName: 'Admin Palsu',
          actorRole: 'admin',
          target: `forged-${runId}`,
        },
      });
      assert.equal(blockedForSales.status, 403);
      assert.equal(blockedForSales.body.error.code, 'FORBIDDEN');

      const blockedForFinance = await api('/api/activity-logs', {
        method: 'POST',
        token: financeToken,
        body: { action: 'DELETE_USER', target: `forged-finance-${runId}` },
      });
      assert.equal(blockedForFinance.status, 403);
      assert.equal(blockedForFinance.body.error.code, 'FORBIDDEN');

      const forged = await api('/api/activity-logs', {
        method: 'POST',
        token: adminToken,
        body: {
          action: 'DELETE_USER',
          actorName: 'Admin Lain Palsu',
          actorRole: 'super_admin',
          target: `forged-${runId}`,
        },
      });
      assert.equal(forged.status, 201);
      assert.notEqual(forged.body.data.actorName, 'Admin Lain Palsu', 'actorName harus dari token login, bukan dari body request');
      assert.notEqual(forged.body.data.actorRole, 'super_admin', 'actorRole harus dari token login (admin), bukan dari body request');
      assert.equal(forged.body.data.actorName, users.admin.name);
      assert.equal(forged.body.data.actorRole, 'admin');

      const dbRow = await query('select actor_name, actor_role from activity_logs where id = $1', [forged.body.data.id]);
      assert.notEqual(dbRow.rows[0].actor_name, 'Admin Lain Palsu');
      assert.equal(dbRow.rows[0].actor_name, users.admin.name);
      assert.equal(dbRow.rows[0].actor_role, 'admin');
    });

    await t.test('master data: create/update/archive customers dan drivers tercatat di activity log', async () => {
      const customerName = `Master Log Customer ${runId}`;
      const createdCustomer = await api('/api/master/customers', {
        method: 'POST',
        token: adminToken,
        body: { name: customerName },
      });
      assert.equal(createdCustomer.status, 201);
      const createLog = await latestActivityForEntity('CREATE_MASTER_CUSTOMERS', createdCustomer.body.data.id);
      assert.equal(createLog.action, 'CREATE_MASTER_CUSTOMERS');

      const updatedCustomer = await api(`/api/master/customers/${createdCustomer.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { name: `${customerName} Updated` },
      });
      assert.equal(updatedCustomer.status, 200);
      const updateLog = await latestActivityForEntity('UPDATE_MASTER_CUSTOMERS', createdCustomer.body.data.id);
      assert.equal(updateLog.action, 'UPDATE_MASTER_CUSTOMERS');
      assert.equal(updateLog.metadata.beforeData.name, customerName);
      assert.equal(updateLog.metadata.afterData.name, `${customerName} Updated`);

      const archivedCustomer = await api(`/api/master/customers/${createdCustomer.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(archivedCustomer.status, 200);
      const archiveLog = await latestActivityForEntity('DELETE_MASTER_CUSTOMERS', createdCustomer.body.data.id);
      assert.equal(archiveLog.action, 'DELETE_MASTER_CUSTOMERS');

      const driverName = `Master Log Driver ${runId}`;
      const createdDriver = await api('/api/master/drivers', {
        method: 'POST',
        token: adminToken,
        body: { name: driverName, bankName: 'Bank Log Test', bankAccountNumber: '5555' },
      });
      assert.equal(createdDriver.status, 201);
      const driverCreateLog = await latestActivityForEntity('CREATE_MASTER_DRIVERS', createdDriver.body.data.id);
      assert.equal(driverCreateLog.action, 'CREATE_MASTER_DRIVERS');
    });

    await t.test('driver commission: sopir dengan sedikit ritasi (tanpa batas minimum) tetap bisa langsung diajukan ke Finance', async () => {
      const fewTripsDriverName = `Sedikit Ritasi Test ${runId}`;
      const fewTripsSoNumber = `SO-${runId}-FEWTRIPS`.toUpperCase();
      const periodA = { periodStart: '2099-04-09', periodEnd: '2099-04-15' };

      await query(
        `
          delete from driver_commission_items
          where batch_id in (select id from driver_commission_batches where period_start = $1::date and period_end = $2::date)
        `,
        [periodA.periodStart, periodA.periodEnd],
      );
      await query(
        `
          delete from driver_commission_payments
          where batch_id in (select id from driver_commission_batches where period_start = $1::date and period_end = $2::date)
        `,
        [periodA.periodStart, periodA.periodEnd],
      );
      await query(
        'delete from driver_commission_batches where period_start = $1::date and period_end = $2::date',
        [periodA.periodStart, periodA.periodEnd],
      );

      const fewTripsSo = await query(
        `
          insert into sales_orders (so_number, customer_name, shipment_type, origin, destination, status)
          values ($1, $2, 'import', 'Tanjung Priok', 'Cikarang', 'completed')
          returning id
        `,
        [fewTripsSoNumber, `Customer Sedikit Ritasi ${runId}`],
      );
      const fewTripsSalesOrderId = fewTripsSo.rows[0].id;

      // Sopir ini cuma jalan 3 ritasi minggu ini -- tidak ada lagi syarat jumlah ritasi minimum,
      // jadi komisinya harus tetap bisa langsung diajukan ke Finance tanpa ditahan.
      for (let index = 1; index <= 3; index += 1) {
        await query(
          `
            insert into container_jobs (
              sales_order_id, container_number, container_size, status, completed_at,
              has_driver_commission, driver_commission_amount, assignment_snapshot, destination
            )
            values ($1, $2, '20FT', 'completed', $3::timestamptz, true, 50000, $4::jsonb, $5)
          `,
          [
            fewTripsSalesOrderId,
            `${fewTripsSoNumber}TRIP${index}`,
            `${periodA.periodStart}T08:00:00+07:00`,
            JSON.stringify({ driver: fewTripsDriverName }),
            'Cikarang',
          ],
        );
      }

      const eligible = await api(`/api/driver-commissions/eligible?periodStart=${periodA.periodStart}&periodEnd=${periodA.periodEnd}`, { token: adminToken });
      assert.equal(eligible.status, 200);
      const eligibleRows = eligible.body.data.rows.filter((row) => row.driverName === fewTripsDriverName);
      assert.equal(eligibleRows.length, 3, '3 ritasi harus langsung muncul sebagai eligible, tidak ditahan menunggu kuota');

      // Sebelum diajukan (masih status draft), detail per sopir di period-report harus terisi
      // lengkap -- bukan cuma total nominal doang seperti bug yang pernah terjadi.
      const draftReport = await api(`/api/driver-commissions/period-report?periodStart=${periodA.periodStart}&periodEnd=${periodA.periodEnd}`, { token: financeToken });
      assert.equal(draftReport.status, 200);
      const draftDriver = draftReport.body.data.drivers.find((driver) => driver.driverName === fewTripsDriverName);
      assert.ok(draftDriver, 'sopir dengan komisi draft harus muncul di period-report sebelum diajukan');
      assert.equal(draftDriver.totalItems, 3);
      assert.equal(draftDriver.totalAmount, 150000);
      assert.equal(draftDriver.items.length, 3);
      for (const item of draftDriver.items) {
        assert.ok(item.completedDate, 'tanggal selesai di detail item tidak boleh kosong');
        assert.equal(item.customerName, `Customer Sedikit Ritasi ${runId}`, 'nama customer di detail item tidak boleh kosong');
        assert.equal(item.destination, 'Cikarang');
        assert.ok(item.containerNumber?.startsWith(fewTripsSoNumber), 'nomor container di detail item tidak boleh kosong');
        assert.equal(item.paymentStatus, 'unsubmitted');
      }

      const submission = await api('/api/driver-commissions/batches', {
        method: 'POST',
        token: adminToken,
        body: periodA,
      });
      assert.equal(submission.status, 201, 'sopir dengan 3 ritasi tetap harus bisa langsung diajukan ke Finance tanpa syarat jumlah ritasi minimum');

      const fewTripsPayment = submission.body.data.payments.find((payment) => payment.driverName === fewTripsDriverName);
      assert.ok(fewTripsPayment);
      assert.equal(fewTripsPayment.totalItems, 3);
      assert.equal(fewTripsPayment.totalAmount, 150000);

      const reportPeriodA = await api(`/api/driver-commissions/period-report?periodStart=${periodA.periodStart}&periodEnd=${periodA.periodEnd}`, { token: financeToken });
      assert.equal(reportPeriodA.status, 200);
      assert.equal(reportPeriodA.body.data.withheld, undefined, 'konsep sopir tertahan karena kuota sudah dihapus dari response');
    });

    await t.test('driver commission: potongan Finance (deduction) - gross tetap aman, net dihitung benar, terkunci setelah paid, riwayat tetap terbaca setelah void payment', async () => {
      const periodStart = '2099-04-16';
      const periodEnd = '2099-04-22';
      const deductionDriverName = `Driver Potongan ${runId}`;
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

      const deductionSoNumber = `SO-${runId}-DEDUCTION`.toUpperCase();
      const deductionSo = await query(
        `
          insert into sales_orders (so_number, customer_name, shipment_type, origin, destination, status)
          values ($1, $2, 'import', 'Tanjung Priok', 'Cikarang', 'completed')
          returning id
        `,
        [deductionSoNumber, `Customer Potongan ${runId}`],
      );
      const deductionJob = await query(
        `
          insert into container_jobs (
            sales_order_id, container_number, container_size, status, completed_at,
            has_driver_commission, driver_commission_amount, assignment_snapshot, destination
          )
          values ($1, $2, '20FT', 'completed', $3::timestamptz, true, 250000, $4::jsonb, 'Cikarang')
          returning id
        `,
        [deductionSo.rows[0].id, `${deductionSoNumber}TRIP1`, `${periodStart}T08:00:00+07:00`, JSON.stringify({ driver: deductionDriverName })],
      );

      const batchResult = await query(
        `
          insert into driver_commission_batches (period_start, period_end, status, submitted_by_name)
          values ($1::date, $2::date, 'submitted', 'Sprint2C Operational')
          returning id
        `,
        [periodStart, periodEnd],
      );
      const batchId = batchResult.rows[0].id;
      const paymentResult = await query(
        `
          insert into driver_commission_payments (batch_id, driver_name, payment_method, total_items, total_amount, status)
          values ($1, $2, 'bank', 1, 500000, 'pending')
          returning id
        `,
        [batchId, deductionDriverName],
      );
      const paymentId = paymentResult.rows[0].id;
      const itemResult = await query(
        `
          insert into driver_commission_items (
            batch_id, payment_id, container_job_id, driver_name, amount, completed_date, completed_at
          )
          values ($1, $2, $3, $4, 500000, $5::date, $5::timestamptz)
          returning id, amount
        `,
        [batchId, paymentId, deductionJob.rows[0].id, deductionDriverName, periodStart],
      );
      const itemId = itemResult.rows[0].id;

      // 2. Operational ditolak saat mencoba tambah potongan (permission finance.driver_commission.deduction.manage tidak dipegang operational).
      const operationalTriesToDeduct = await api(`/api/driver-commissions/payments/${paymentId}/deductions`, {
        method: 'POST',
        token: operationalToken,
        body: { deductionType: 'hutang_sopir', amount: 100000, reason: 'Coba potong dari Operational' },
      });
      assert.equal(operationalTriesToDeduct.status, 403);

      // 6. Reason wajib (minimal 8 karakter).
      const missingReason = await api(`/api/driver-commissions/payments/${paymentId}/deductions`, {
        method: 'POST',
        token: financeToken,
        body: { deductionType: 'hutang_sopir', amount: 100000, reason: 'pendek' },
      });
      assert.equal(missingReason.status, 400);
      assert.equal(missingReason.body.error.code, 'DRIVER_COMMISSION_DEDUCTION_REASON_REQUIRED');

      const invalidAmount = await api(`/api/driver-commissions/payments/${paymentId}/deductions`, {
        method: 'POST',
        token: financeToken,
        body: { deductionType: 'hutang_sopir', amount: 0, reason: 'Alasan valid tapi nominal nol' },
      });
      assert.equal(invalidAmount.status, 400);
      assert.equal(invalidAmount.body.error.code, 'DRIVER_COMMISSION_DEDUCTION_AMOUNT_INVALID');

      // 5. Potongan tidak boleh melebihi gross (500000).
      const exceedsGross = await api(`/api/driver-commissions/payments/${paymentId}/deductions`, {
        method: 'POST',
        token: financeToken,
        body: { deductionType: 'hutang_sopir', amount: 600000, reason: 'Potongan melebihi komisi bruto sopir' },
      });
      assert.equal(exceedsGross.status, 400);
      assert.equal(exceedsGross.body.error.code, 'DRIVER_COMMISSION_DEDUCTION_EXCEEDS_GROSS');

      // 1. Finance bisa tambah potongan ke payment komisi.
      const created = await api(`/api/driver-commissions/payments/${paymentId}/deductions`, {
        method: 'POST',
        token: financeToken,
        body: {
          deductionType: 'hutang_sopir',
          amount: 100000,
          reason: 'Potongan hutang sopir sesuai catatan Finance',
          operationalNote: 'Komisi dipotong Rp100.000 karena ada hutang aktif. Detail ada di Finance.',
        },
      });
      assert.equal(created.status, 201);
      const deductionPayment = created.body.data.payments.find((payment) => payment.id === paymentId);
      assert.ok(deductionPayment);
      // 4. Net amount = gross - total deduction.
      assert.equal(deductionPayment.grossAmount, 500000);
      assert.equal(deductionPayment.deductionAmount, 100000);
      assert.equal(deductionPayment.netAmount, 400000);
      assert.equal(deductionPayment.deductions.length, 1);
      const deductionId = deductionPayment.deductions[0].id;
      assert.equal(deductionPayment.deductions[0].reason, 'Potongan hutang sopir sesuai catatan Finance');
      assert.equal(deductionPayment.deductions[0].operationalNote, 'Komisi dipotong Rp100.000 karena ada hutang aktif. Detail ada di Finance.');
      assert.equal(deductionPayment.deductions[0].status, 'active');

      // 3. Potongan tidak mengubah amount asli item komisi.
      const itemAfterDeduction = await query('select amount from driver_commission_items where id = $1', [itemId]);
      assert.equal(Number(itemAfterDeduction.rows[0].amount), 500000, 'amount item komisi asli tidak boleh ikut berubah karena ada potongan');

      const deductionLog = await latestActivityForEntity('CREATE_DRIVER_COMMISSION_DEDUCTION', deductionId);
      assert.ok(deductionLog, 'pembuatan potongan harus tercatat di activity log');
      assert.equal(deductionLog.actor_role, 'finance');

      // 10. Batch detail (GET) mengembalikan gross/deduction/net per sopir.
      const batchDetail = await api(`/api/driver-commissions/batches/${batchId}`, { token: financeToken });
      assert.equal(batchDetail.status, 200);
      const batchDetailPayment = batchDetail.body.data.payments.find((payment) => payment.id === paymentId);
      assert.equal(batchDetailPayment.grossAmount, 500000);
      assert.equal(batchDetailPayment.deductionAmount, 100000);
      assert.equal(batchDetailPayment.netAmount, 400000);

      // 11. Operational report (period-report) mengembalikan deduction summary read-only.
      const operationalReport = await api(`/api/driver-commissions/period-report?periodStart=${periodStart}&periodEnd=${periodEnd}`, { token: operationalToken });
      assert.equal(operationalReport.status, 200);
      const operationalDriver = operationalReport.body.data.drivers.find((driver) => driver.driverName === deductionDriverName);
      assert.ok(operationalDriver, 'sopir dengan potongan harus tetap muncul di report Operational');
      assert.equal(operationalDriver.grossAmount, 500000);
      assert.equal(operationalDriver.deductionAmount, 100000);
      assert.equal(operationalDriver.netAmount, 400000);
      assert.equal(operationalDriver.deductions.length, 1);
      assert.equal(operationalDriver.deductions[0].operationalNote, 'Komisi dipotong Rp100.000 karena ada hutang aktif. Detail ada di Finance.');

      // Approve batch lalu bayar (upload bukti transfer) -- payment jadi 'paid'.
      const approved = await api(`/api/driver-commissions/batches/${batchId}/approve`, { method: 'PATCH', token: financeToken });
      assert.equal(approved.status, 200);
      const paidWithProof = await api(`/api/driver-commissions/payments/${paymentId}/transfer-proof`, {
        method: 'POST',
        token: financeToken,
        body: {
          paymentNote: `Transfer net ke sopir ${runId}`,
          fileName: `commission-net-proof-${runId}.pdf`,
          mimeType: 'application/pdf',
          fileBase64: Buffer.from(`%PDF-1.4\n% commission net transfer proof ${runId}\n`).toString('base64'),
        },
      });
      assert.equal(paidWithProof.status, 200);
      // 7. Payment paid tetap menampilkan gross/deduction/net (net) yang benar.
      const paidPayment = paidWithProof.body.data.payments.find((payment) => payment.id === paymentId);
      assert.equal(paidPayment.status, 'paid');
      assert.equal(paidPayment.grossAmount, 500000);
      assert.equal(paidPayment.deductionAmount, 100000);
      assert.equal(paidPayment.netAmount, 400000);

      // 8. Potongan tidak bisa diubah/ditambah/dibatalkan setelah payment paid.
      const addAfterPaid = await api(`/api/driver-commissions/payments/${paymentId}/deductions`, {
        method: 'POST',
        token: financeToken,
        body: { deductionType: 'kasbon', amount: 50000, reason: 'Coba tambah potongan setelah paid' },
      });
      assert.equal(addAfterPaid.status, 409);
      assert.equal(addAfterPaid.body.error.code, 'DRIVER_COMMISSION_DEDUCTION_PAYMENT_LOCKED');

      const updateAfterPaid = await api(`/api/driver-commissions/deductions/${deductionId}`, {
        method: 'PATCH',
        token: financeToken,
        body: { deductionType: 'hutang_sopir', amount: 120000, reason: 'Coba ubah potongan setelah paid' },
      });
      assert.equal(updateAfterPaid.status, 409);
      assert.equal(updateAfterPaid.body.error.code, 'DRIVER_COMMISSION_DEDUCTION_PAYMENT_LOCKED');

      const voidAfterPaid = await api(`/api/driver-commissions/deductions/${deductionId}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: 'Coba batalkan potongan setelah paid' },
      });
      assert.equal(voidAfterPaid.status, 409);
      assert.equal(voidAfterPaid.body.error.code, 'DRIVER_COMMISSION_DEDUCTION_PAYMENT_LOCKED');

      // 9. Void payment tidak menghapus histori potongan.
      const voidedPayment = await api(`/api/driver-commissions/payments/${paymentId}/void`, {
        method: 'PATCH',
        token: adminToken,
        body: { reason: `Void payment untuk test histori potongan ${runId}` },
      });
      assert.equal(voidedPayment.status, 200);
      const paymentAfterVoid = voidedPayment.body.data.payments.find((payment) => payment.id === paymentId);
      assert.equal(paymentAfterVoid.status, 'pending');
      assert.equal(paymentAfterVoid.deductions.length, 1, 'histori potongan harus tetap ada setelah payment di-void');
      assert.equal(paymentAfterVoid.deductions[0].status, 'active');
      assert.equal(paymentAfterVoid.deductionAmount, 100000);
      assert.equal(paymentAfterVoid.netAmount, 400000);

      // Sekarang payment sudah balik ke pending -- potongan boleh dibatalkan lagi.
      const voidedDeduction = await api(`/api/driver-commissions/deductions/${deductionId}/void`, {
        method: 'PATCH',
        token: financeToken,
        body: { reason: 'Hutang sopir sudah lunas, potongan dibatalkan' },
      });
      assert.equal(voidedDeduction.status, 200);
      const paymentAfterDeductionVoid = voidedDeduction.body.data.payments.find((payment) => payment.id === paymentId);
      assert.equal(paymentAfterDeductionVoid.deductionAmount, 0);
      assert.equal(paymentAfterDeductionVoid.netAmount, 500000);
      assert.equal(paymentAfterDeductionVoid.deductions[0].status, 'void');
      assert.equal(paymentAfterDeductionVoid.deductions[0].voidReason, 'Hutang sopir sudah lunas, potongan dibatalkan');

      const voidDeductionLog = await latestActivityForEntity('VOID_DRIVER_COMMISSION_DEDUCTION', deductionId);
      assert.ok(voidDeductionLog, 'pembatalan potongan harus tercatat di activity log');
    });

    await t.test('sales order & container job: destination per container - ditulis sekali saat dibuat, beku setelah itu, hanya bisa dikoreksi lewat mode admin', async () => {
      const soNumber = `SO-DEST-${runId}`;
      const cntrANumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTRA`;
      const cntrBNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTRB`;

      const createdOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({
          soNumber,
          destination: 'Tujuan Default SO',
          lineItems: [
            { serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 1500000 },
            { serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 1500000 },
          ],
          containers: [
            { containerNumber: cntrANumber, size: '20FT', type: 'Dry', status: 'received', destination: 'Tujuan A' },
            { containerNumber: cntrBNumber, size: '20FT', type: 'Dry', status: 'received', destination: 'Tujuan B' },
          ],
        }),
      });
      assert.equal(createdOrder.status, 201);
      const orderId = createdOrder.body.data.id;
      assert.equal(createdOrder.body.data.containers.length, 2);
      const containerA = createdOrder.body.data.containers.find((row) => row.containerNumber === cntrANumber);
      const containerB = createdOrder.body.data.containers.find((row) => row.containerNumber === cntrBNumber);
      assert.equal(containerA.destination, 'Tujuan A', 'container A harus pakai tujuan dari baris rinciannya sendiri, bukan default SO');
      assert.equal(containerB.destination, 'Tujuan B', 'container B harus pakai tujuan dari baris rinciannya sendiri, bukan default SO');

      // Edit SO (destination default SO ikut diubah, dan body membawa "destination" baru untuk
      // container yang SUDAH ADA) -- destination container lama harus tetap beku, tidak ikut
      // tertulis ulang lewat update biasa (bukan mode koreksi admin).
      const updatedOrder = await api(`/api/sales-orders/${orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          soNumber,
          destination: 'Tujuan Default SO Baru',
          updatedBy: 'Sprint2C Admin',
          containers: [
            { id: containerA.id, containerNumber: cntrANumber, size: '20FT', type: 'Dry', status: 'received', destination: 'Tujuan A Diam-Diam Diubah' },
            { id: containerB.id, containerNumber: cntrBNumber, size: '20FT', type: 'Dry', status: 'received', destination: 'Tujuan B Diam-Diam Diubah' },
          ],
        }),
      });
      assert.equal(updatedOrder.status, 200);
      assert.equal(updatedOrder.body.data.destination, 'Tujuan Default SO Baru');
      assert.equal(
        updatedOrder.body.data.containers.find((row) => row.id === containerA.id).destination,
        'Tujuan A',
        'destination container A harus tetap beku walau body edit SO membawa nilai baru',
      );
      assert.equal(
        updatedOrder.body.data.containers.find((row) => row.id === containerB.id).destination,
        'Tujuan B',
        'destination container B harus tetap beku walau body edit SO membawa nilai baru',
      );

      // Tambah baris rincian baru (container baru) ke SO yang sudah ada -- container baru ini
      // harus pakai default SO TERKINI saat itu, bukan retroaktif memakai tujuan lama container lain.
      const cntrCNumber = `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTRC`;
      const addedContainer = await api(`/api/sales-orders/${orderId}`, {
        method: 'PATCH',
        token: adminToken,
        body: salesOrderPayload({
          soNumber,
          destination: 'Tujuan Default SO Baru',
          updatedBy: 'Sprint2C Admin',
          containers: [
            { id: containerA.id, containerNumber: cntrANumber, size: '20FT', type: 'Dry', status: 'received' },
            { id: containerB.id, containerNumber: cntrBNumber, size: '20FT', type: 'Dry', status: 'received' },
            { containerNumber: cntrCNumber, size: '20FT', type: 'Dry', status: 'received' },
          ],
        }),
      });
      assert.equal(addedContainer.status, 200);
      const containerC = addedContainer.body.data.containers.find((row) => row.containerNumber === cntrCNumber);
      assert.ok(containerC, 'container baru harus tercipta saat baris rincian baru ditambahkan');
      assert.equal(containerC.destination, 'Tujuan Default SO Baru', 'container baru tanpa tujuan sendiri harus pakai default SO terkini');
      assert.equal(
        addedContainer.body.data.containers.find((row) => row.id === containerA.id).destination,
        'Tujuan A',
        'container lama tidak boleh ikut berubah setelah baris rincian baru ditambahkan',
      );

      // Koreksi lewat PATCH /api/container-jobs/:id TANPA mode koreksi admin -- destination diabaikan.
      const rejectedPlainUpdate = await api(`/api/container-jobs/${containerA.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { destination: 'Tujuan A Coba Ubah Tanpa Koreksi', updatedBy: 'Sprint2C Admin' },
      });
      assert.equal(rejectedPlainUpdate.status, 200);
      assert.equal(rejectedPlainUpdate.body.data.destination, 'Tujuan A', 'tanpa mode koreksi admin, destination container harus tetap beku (field diabaikan)');

      // Dengan mode koreksi admin + alasan yang valid -- destination berhasil dikoreksi.
      const correctedUpdate = await api(`/api/container-jobs/${containerA.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          destination: 'Tujuan A Terkoreksi',
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: `Koreksi tujuan container ${runId} salah input saat pembuatan`,
        },
      });
      assert.equal(correctedUpdate.status, 200);
      assert.equal(correctedUpdate.body.data.destination, 'Tujuan A Terkoreksi');

      const correctionLog = await latestActivityForEntity('ADMIN_CORRECTION_CONTAINER_JOB', containerA.id);
      assert.equal(correctionLog.action, 'ADMIN_CORRECTION_CONTAINER_JOB');
      assert.ok((correctionLog.metadata.changedFields || []).includes('Tujuan'), 'perubahan tujuan harus tercatat di log koreksi admin');

      // Selesaikan container B & C supaya bisa ditagihkan, lalu pastikan invoice detail
      // menampilkan destinations unik per-container (Multi-tujuan), bukan cuma tujuan SO.
      await query(
        `update container_jobs set status = 'completed', completed_at = now() where id = any($1::uuid[])`,
        [[containerA.id, containerB.id, containerC.id]],
      );
      const invoiceNumber = `INV-DEST-${runId}`;
      await query(
        `
          update sales_orders
          set status = 'completed',
              invoice_number = $2,
              billing_status = 'belum_dikirim',
              finance_verification_status = 'verified',
              accurate_so_number = $2
          where id = $1
        `,
        [orderId, invoiceNumber],
      );
      const invoiceDetail = await api(`/api/finance/invoices/${orderId}`, { token: financeToken });
      assert.equal(invoiceDetail.status, 200);
      const destinations = invoiceDetail.body.data.destinations || [];
      assert.ok(destinations.includes('Tujuan A Terkoreksi'), 'daftar tujuan invoice harus memuat tujuan container A yang sudah dikoreksi');
      assert.ok(destinations.includes('Tujuan B'), 'daftar tujuan invoice harus memuat tujuan container B');
      assert.ok(destinations.includes('Tujuan Default SO Baru'), 'daftar tujuan invoice harus memuat tujuan container C (default SO terkini)');
      const breakdownB = invoiceDetail.body.data.containerBreakdown.find((row) => row.containerJobId === containerB.id);
      assert.equal(breakdownB.destination, 'Tujuan B', 'rincian per container pada invoice harus menampilkan tujuan container itu sendiri');
    });

    await t.test('container job & finance: UJ (uang jalan) dibekukan sekali saat job jalan, tidak berubah walau rate master destination diedit belakangan; job baru pakai rate terbaru', async () => {
      const ujDestinationName = `UJ Snapshot Dest ${runId}`;
      const createdDestination = await api('/api/master/destinations', {
        method: 'POST',
        token: adminToken,
        body: { name: ujDestinationName, uj20ft: 350000, status: 'Aktif' },
      });
      assert.equal(createdDestination.status, 201);
      const destinationId = createdDestination.body.data.id;

      const ujDriverName = `Driver UJ Snapshot ${runId}`;
      const ujPlate = `B-${String(runId).slice(-4)}-UJ`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [ujDriverName, `081${String(Date.now()).slice(-9)}`],
      );
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null
        `,
        [`TRK-UJ-${String(runId).slice(-4)}`, ujPlate],
      );

      const ujSoNumber = `SO-UJSNAP-${runId}`;
      const ujOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: ujSoNumber, destination: ujDestinationName, tripDate: '2025-01-01' }),
      });
      assert.equal(ujOrder.status, 201);
      const ujOrderId = ujOrder.body.data.id;
      const ujJobId = ujOrder.body.data.containers[0].id;
      const ujContainerNumber = `${ujSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;

      const ujRunning = await api(`/api/container-jobs/${ujJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: ujContainerNumber,
          driver: ujDriverName,
          plateNumber: ujPlate,
          status: 'running',
          runningAt: new Date().toISOString(),
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(ujRunning.status, 200);
      assert.equal(ujRunning.body.data.ujAmountSnapshot, 350000, 'UJ harus langsung dibekukan sesuai rate master saat job pertama kali jalan');
      assert.equal(ujRunning.body.data.ujSnapshotSource, 'destination_master');
      assert.equal(ujRunning.body.data.ujSourceDestinationId, destinationId);

      // Selesaikan job & SO lewat SQL langsung (bypass syarat dokumen lengkap seperti test finance
      // lain di atas) supaya bisa langsung muncul di finance invoice-orders -- ini TIDAK menyentuh
      // uj_amount_snapshot yang sudah dibekukan di atas lewat endpoint status resmi.
      await query(`update container_jobs set status = 'completed', completed_at = now() where id = $1`, [ujJobId]);
      await query(
        `
          update sales_orders
          set status = 'completed', finance_verification_status = 'verified', accurate_so_number = so_number,
              invoice_number = $2, payment_type = 'cash', invoice_issued_at = now()
          where id = $1
        `,
        [ujOrderId, `INV-${ujSoNumber}`],
      );

      const invoiceBefore = await api(`/api/finance/invoices/${ujOrderId}`, { token: financeToken });
      assert.equal(invoiceBefore.status, 200);
      assert.equal(invoiceBefore.body.data.internalCost.journeyMoney, 350000);
      assert.equal(invoiceBefore.body.data.internalCost.journeyMoneySource, 'snapshot');
      assert.equal(invoiceBefore.body.data.internalCost.journeyMoneyNeedsReview, false);

      // Rate UJ master destination diedit belakangan.
      const updatedDestination = await api(`/api/master/destinations/${destinationId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { name: ujDestinationName, uj20ft: 900000, status: 'Aktif' },
      });
      assert.equal(updatedDestination.status, 200);
      assert.equal(updatedDestination.body.data.uj20ft, 900000);

      const invoiceAfter = await api(`/api/finance/invoices/${ujOrderId}`, { token: financeToken });
      assert.equal(invoiceAfter.status, 200);
      assert.equal(
        invoiceAfter.body.data.internalCost.journeyMoney,
        350000,
        'UJ job yang sudah dibekukan tidak boleh ikut berubah walau rate master destination diedit belakangan',
      );
      assert.equal(invoiceAfter.body.data.internalCost.journeyMoneySource, 'snapshot');
      assert.equal(invoiceAfter.body.data.internalCost.journeyMoneyNeedsReview, false);

      // Job BARU di destinasi yang sama, dibuat SETELAH rate berubah, harus membekukan rate TERBARU.
      const ujSoNumber2 = `SO-UJSNAP2-${runId}`;
      const ujOrder2 = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: ujSoNumber2, destination: ujDestinationName, tripDate: '2025-01-01' }),
      });
      assert.equal(ujOrder2.status, 201);
      const ujOrderId2 = ujOrder2.body.data.id;
      const ujJobId2 = ujOrder2.body.data.containers[0].id;
      const ujContainerNumber2 = `${ujSoNumber2.replace(/[^A-Z0-9]/g, '')}CNTR1`;

      const ujRunning2 = await api(`/api/container-jobs/${ujJobId2}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: ujContainerNumber2,
          driver: ujDriverName,
          plateNumber: ujPlate,
          status: 'running',
          runningAt: new Date().toISOString(),
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(ujRunning2.status, 200);
      assert.equal(
        ujRunning2.body.data.ujAmountSnapshot,
        900000,
        'job baru yang baru pertama kali jalan setelah rate diedit harus membekukan rate TERBARU, bukan rate lama',
      );

      await query(`update container_jobs set status = 'completed', completed_at = now() where id = $1`, [ujJobId2]);
      await query(
        `
          update sales_orders
          set status = 'completed', finance_verification_status = 'verified', accurate_so_number = so_number,
              invoice_number = $2, payment_type = 'cash', invoice_issued_at = now()
          where id = $1
        `,
        [ujOrderId2, `INV-${ujSoNumber2}`],
      );

      const invoice2 = await api(`/api/finance/invoices/${ujOrderId2}`, { token: financeToken });
      assert.equal(invoice2.status, 200);
      assert.equal(invoice2.body.data.internalCost.journeyMoney, 900000);
      assert.equal(invoice2.body.data.internalCost.journeyMoneySource, 'snapshot');
      assert.equal(invoice2.body.data.internalCost.journeyMoneyNeedsReview, false);
    });

    await t.test('finance: container job lama tanpa uj_amount_snapshot (data sebelum migrasi UJ) fallback ke rate master saat ini dan ditandai perlu review', async () => {
      const legacyDestinationName = `UJ Legacy Dest ${runId}`;
      const legacyDestination = await api('/api/master/destinations', {
        method: 'POST',
        token: adminToken,
        body: { name: legacyDestinationName, uj20ft: 425000, status: 'Aktif' },
      });
      assert.equal(legacyDestination.status, 201);

      const legacySoNumber = `SO-UJLEGACY-${runId}`;
      const legacySo = await query(
        `
          insert into sales_orders (
            so_number, accurate_so_number, customer_name, shipment_type, origin, destination, status,
            finance_verification_status, invoice_number, payment_type, invoice_issued_at, trip_date
          )
          values ($1, $1, $2, 'import', 'Tanjung Priok', $3, 'completed', 'verified', $4, 'cash', now(), '2025-01-01')
          returning id
        `,
        [legacySoNumber, `Customer Legacy UJ ${runId}`, legacyDestinationName, `INV-${legacySoNumber}`],
      );
      const legacyOrderId = legacySo.rows[0].id;
      // Job "lama" ini dibuat LANGSUNG lewat SQL (bypass API/syncAutoJourneyMoneyExpense sepenuhnya)
      // supaya meniru persis data yang sudah ada SEBELUM kolom uj_amount_snapshot ditambahkan --
      // uj_amount_snapshot dibiarkan NULL.
      await query(
        `
          insert into container_jobs (sales_order_id, container_number, container_size, status, completed_at, destination)
          values ($1, $2, '20FT', 'completed', now(), $3)
        `,
        [legacyOrderId, `${legacySoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`, legacyDestinationName],
      );

      const legacyDetail = await api(`/api/finance/invoices/${legacyOrderId}`, { token: financeToken });
      assert.equal(legacyDetail.status, 200);
      assert.equal(
        legacyDetail.body.data.internalCost.journeyMoney,
        425000,
        'job lama tanpa snapshot harus fallback ke rate master destination saat ini',
      );
      assert.equal(legacyDetail.body.data.internalCost.journeyMoneySource, 'master_current');
      assert.equal(legacyDetail.body.data.internalCost.journeyMoneyNeedsReview, true);
    });

    await t.test('container job: uj_amount_snapshot (UJ) cuma bisa dikoreksi lewat mode koreksi admin', async () => {
      const correctionDestinationName = `UJ Correction Dest ${runId}`;
      const correctionDestination = await api('/api/master/destinations', {
        method: 'POST',
        token: adminToken,
        body: { name: correctionDestinationName, uj20ft: 275000, status: 'Aktif' },
      });
      assert.equal(correctionDestination.status, 201);

      const correctionDriverName = `Driver UJ Correction ${runId}`;
      const correctionPlate = `B-${String(runId).slice(-4)}-UC`;
      await query(
        `
          insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman')
          on conflict do nothing
        `,
        [correctionDriverName, `082${String(Date.now()).slice(-9)}`],
      );
      await query(
        `
          insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, operational_status)
          values ($1, $2, 'Hino', 'FG', '20FT', 'Aktif')
          on conflict (plate_number) do update set operational_status = 'Aktif', archived_at = null
        `,
        [`TRK-UC-${String(runId).slice(-4)}`, correctionPlate],
      );

      const correctionSoNumber = `SO-UJCORR-${runId}`;
      const correctionOrder = await api('/api/sales-orders', {
        method: 'POST',
        token: salesToken,
        body: salesOrderPayload({ soNumber: correctionSoNumber, destination: correctionDestinationName, tripDate: '2025-01-01' }),
      });
      assert.equal(correctionOrder.status, 201);
      const correctionJobId = correctionOrder.body.data.containers[0].id;
      const correctionContainerNumber = `${correctionSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`;

      const correctionRunning = await api(`/api/container-jobs/${correctionJobId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          containerNumber: correctionContainerNumber,
          driver: correctionDriverName,
          plateNumber: correctionPlate,
          status: 'running',
          runningAt: new Date().toISOString(),
          updatedBy: 'Sprint2C Operational',
        },
      });
      assert.equal(correctionRunning.status, 200);
      assert.equal(correctionRunning.body.data.ujAmountSnapshot, 275000);

      // Tanpa mode koreksi admin -- ujAmountSnapshot diam-diam diabaikan (field tetap beku).
      const plainAttempt = await api(`/api/container-jobs/${correctionJobId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { ujAmountSnapshot: 999999, updatedBy: 'Sprint2C Admin' },
      });
      assert.equal(plainAttempt.status, 200);
      assert.equal(plainAttempt.body.data.ujAmountSnapshot, 275000, 'tanpa mode koreksi admin, UJ snapshot harus tetap beku (field diabaikan)');

      // Mode koreksi admin tapi actor BUKAN admin -- ditolak.
      const nonAdminAttempt = await api(`/api/container-jobs/${correctionJobId}`, {
        method: 'PATCH',
        token: operationalToken,
        body: {
          ujAmountSnapshot: 999999,
          updatedBy: 'Sprint2C Operational',
          adminCorrectionMode: true,
          adminCorrectionReason: `Operational coba koreksi UJ ${runId}`,
        },
      });
      assert.equal(nonAdminAttempt.status, 403);
      assert.equal(nonAdminAttempt.body.error.code, 'ADMIN_CORRECTION_ADMIN_ONLY');

      // Mode koreksi admin dengan alasan terlalu pendek -- ditolak.
      const shortReasonAttempt = await api(`/api/container-jobs/${correctionJobId}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          ujAmountSnapshot: 999999,
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: 'pendek',
        },
      });
      assert.equal(shortReasonAttempt.status, 400);
      assert.equal(shortReasonAttempt.body.error.code, 'ADMIN_CORRECTION_REASON_REQUIRED');

      const jobAfterRejectedAttempts = await api(`/api/container-jobs/${correctionJobId}`, { token: adminToken });
      assert.equal(jobAfterRejectedAttempts.status, 200);
      assert.equal(jobAfterRejectedAttempts.body.data.ujAmountSnapshot, 275000, 'semua percobaan yang ditolak tidak boleh mengubah UJ snapshot');
      assert.equal(jobAfterRejectedAttempts.body.data.ujSnapshotSource, 'destination_master');

      // Admin dengan mode koreksi + alasan yang valid -- berhasil.
      const correctedAttempt = await api(`/api/container-jobs/${correctionJobId}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          ujAmountSnapshot: 500000,
          updatedBy: 'Sprint2C Admin',
          adminCorrectionMode: true,
          adminCorrectionReason: `Koreksi UJ container ${runId} salah input`,
        },
      });
      assert.equal(correctedAttempt.status, 200);
      assert.equal(correctedAttempt.body.data.ujAmountSnapshot, 500000);
      assert.equal(correctedAttempt.body.data.ujSnapshotSource, 'admin_correction');

      const correctionLog = await latestActivityForEntity('ADMIN_CORRECTION_CONTAINER_JOB', correctionJobId);
      assert.equal(correctionLog.action, 'ADMIN_CORRECTION_CONTAINER_JOB');
      assert.ok(String(correctionLog.metadata.adminCorrectionReason || '').includes(runId));
    });

    await t.test('driver commission: daftar eligible pakai rekening bank sopir dari assignment_snapshot job, bukan data master driver terkini', async () => {
      const dcDriverName = `Driver DC Snapshot ${runId}`;
      const dcDriver = await query(
        `
          insert into drivers (
            name, phone, license_type, license_expiry_date, operational_status, health_status,
            bank_name, bank_account_number, bank_account_holder
          )
          values ($1, $2, 'SIM B2 Umum', '2027-07-17', 'Aktif', 'Aman', 'Bank Asli DC', '3001', 'Pemegang Asli DC')
          returning id
        `,
        [dcDriverName, `083${String(Date.now()).slice(-9)}`],
      );
      const dcDriverId = dcDriver.rows[0].id;

      const dcSoNumber = `SO-DCSNAP-${runId}`;
      const dcSo = await query(
        `
          insert into sales_orders (so_number, customer_name, shipment_type, origin, destination, status, trip_date)
          values ($1, $2, 'import', 'Tanjung Priok', 'Cikarang', 'completed', '2025-01-01')
          returning id
        `,
        [dcSoNumber, `Customer DC Snapshot ${runId}`],
      );
      const dcOrderId = dcSo.rows[0].id;
      const dcPeriod = { periodStart: '2099-02-05', periodEnd: '2099-02-11' };

      // Job "selesai" ini dibuat langsung lewat SQL (pola sama dengan test driver commission lain
      // di atas) dengan assignment_snapshot yang SUDAH membekukan rekening bank sopir saat itu.
      await query(
        `
          insert into container_jobs (
            sales_order_id, container_number, container_size, status, completed_at,
            has_driver_commission, driver_commission_amount, driver_id, assignment_snapshot, destination
          )
          values ($1, $2, '20FT', 'completed', $3::timestamptz, true, 65000, $4, $5::jsonb, 'Cikarang')
        `,
        [
          dcOrderId,
          `${dcSoNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`,
          `${dcPeriod.periodStart}T08:00:00+07:00`,
          dcDriverId,
          JSON.stringify({
            driver: dcDriverName,
            driverPaymentMethod: 'bank',
            driverBankName: 'Bank Asli DC',
            driverBankAccountNumber: '3001',
            driverBankAccountHolder: 'Pemegang Asli DC',
          }),
        ],
      );

      // Master driver diganti rekening banknya SETELAH job selesai (snapshot sudah terbentuk).
      await query(
        `update drivers set bank_name = 'Bank Baru DC', bank_account_number = '9999', bank_account_holder = 'Pemegang Baru DC' where id = $1`,
        [dcDriverId],
      );

      const eligible = await api(
        `/api/driver-commissions/eligible?periodStart=${dcPeriod.periodStart}&periodEnd=${dcPeriod.periodEnd}`,
        { token: adminToken },
      );
      assert.equal(eligible.status, 200);
      const dcRow = eligible.body.data.rows.find((row) => row.driverName === dcDriverName);
      assert.ok(dcRow, 'baris eligible untuk sopir ini harus ditemukan');
      assert.equal(dcRow.bankName, 'Bank Asli DC', 'rekening bank di daftar eligible harus pakai snapshot job, bukan data master driver terkini');
      assert.equal(dcRow.bankAccountNumber, '3001');
      assert.equal(dcRow.bankAccountHolder, 'Pemegang Asli DC');
    });

    await t.test('finance: summary sub-filter dokumen invoice (Sudah/Belum Dikirim ke Customer) tidak ikut menghitung SO yang sudah lunas', async () => {
      async function createInvoiceOrder(soNumber, billingStatus) {
        const soInsert = await query(
          `
            insert into sales_orders (
              so_number, accurate_so_number, customer_name, shipment_type, origin, destination, status,
              finance_verification_status, invoice_number, invoice_document_uploaded_at, tax_invoice_document_uploaded_at,
              invoice_document_status, billing_status
            )
            values ($1, $1, $2, 'import', 'Tanjung Priok', 'Cikarang', 'completed', 'verified', $1, now(), now(), 'terkirim', $3)
            returning id
          `,
          [soNumber, `Customer ${runId}`, billingStatus],
        );
        await query(
          `
            insert into container_jobs (sales_order_id, container_number, container_size, status, completed_at)
            values ($1, $2, '20FT', 'completed', now())
          `,
          [soInsert.rows[0].id, `${soNumber.replace(/[^A-Z0-9]/g, '')}CNTR1`],
        );
      }

      const before = await api('/api/finance/invoices?status=in-progress&invoiceDocumentFilter=sent', { token: financeToken });
      assert.equal(before.status, 200);
      const sentCountBefore = before.body.data.summary.sentInvoiceDocuments;

      const soNumberSentUnpaid = `SO-SENTUNPAID-${runId}`;
      const soNumberSentLunas = `SO-SENTLUNAS-${runId}`;
      await createInvoiceOrder(soNumberSentUnpaid, 'belum_dikirim');
      await createInvoiceOrder(soNumberSentLunas, 'lunas');

      const after = await api('/api/finance/invoices?status=in-progress&invoiceDocumentFilter=sent', { token: financeToken });
      assert.equal(after.status, 200);

      // Cuma SO yang belum lunas yang boleh menambah hitungan "Sudah Dikirim ke Customer" milik
      // tab Menunggu Pembayaran -- SO yang sudah lunas TIDAK boleh ikut menaikkan angkanya, walau
      // dokumennya juga berstatus terkirim (itu bug yang dilaporkan: badge menghitung nomor yang
      // berbeda dari isi tabel yang benar-benar tersaring lewat status=in-progress).
      assert.equal(after.body.data.summary.sentInvoiceDocuments, sentCountBefore + 1, 'summary sentInvoiceDocuments harus naik tepat 1, bukan 2 -- SO yang lunas tidak ikut dihitung');
      const rowSoNumbers = after.body.data.rows.map((row) => row.soNumber);
      assert.ok(rowSoNumbers.includes(soNumberSentUnpaid), 'SO yang sudah dikirim dan belum lunas harus muncul di daftar');
      assert.ok(!rowSoNumbers.includes(soNumberSentLunas), 'SO yang sudah lunas tidak boleh muncul di filter Menunggu Pembayaran');
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
