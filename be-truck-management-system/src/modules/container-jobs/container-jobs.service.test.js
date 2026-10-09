import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  adminCorrectionReason,
  backdateReason,
  canUseAdminCorrection,
  createContainerJobExpense,
  correctContainerJobExpense,
  ensureInapPayload,
  ensureCompletedCommissionDriverAction,
  ensureRepoStoragePayload,
  hasCompletedTimelineChange,
  hasDriverCommissionChange,
  hasDriverIdentityChange,
  hasVehicleIdentityChange,
  hasOperationalDocumentChange,
  isAdminCorrectionMode,
  isBackdateEntryPayload,
  isContainerNumberLockedForOperational,
  isDriverCommissionLockedForOperational,
  isDocumentOnlyContainerJobUpdateActor,
  isInitialContainerNumberInput,
  isOtherCostLockedForRepoPickup,
  isRepoCancellationLockedForOperational,
  resetMisassignedContainerJob,
  updateContainerJobExpenseProof,
} = await import('./container-jobs.service.js');
const {
  assertDocumentOnlyPayload,
} = await import('./container-jobs.controller.js');
const {
  buildAutoJourneyMoneyDescription,
  ensureDriverCommissionIsNotPosted,
  findJourneyMoneyAmount,
  hasCompleteOperationalAssignment,
  hasRequiredRepoCompletionDocuments,
  isRepoShipment,
  normalizeCompletedAtForSave,
  resolveCompletedAtForSave,
  resolveDriverCommissionUpdate,
  resolveCompletedCommissionDriverCorrection,
  resolveJourneyMoneyAmountForSize,
  assertVehicleCanPickupRepo,
  isVehicleSizeAllowedForContainer,
  shouldValidateVehicleContainerSize,
  shouldPreserveOriginalRunningAt,
  shouldRequireAssignmentAfterVendorRevert,
  syncAutoJourneyMoneyExpense,
} = await import('./container-jobs.repository.js');

test('pickup single container 20FT memperbolehkan truck 40FT (kapasitas hierarkis)', () => {
  assert.doesNotThrow(() => assertVehicleCanPickupRepo(
    { chassis_size: '40FT', container_size: '40FT', plate_number: 'B 9001 TEST' },
    [{ container_size: '20FT' }],
    'single',
  ));
});

test('matriks kapasitas truck untuk job biasa (A-F)', () => {
  assert.equal(isVehicleSizeAllowedForContainer('20FT', '20FT'), true); // A
  assert.equal(isVehicleSizeAllowedForContainer('40FT', '20FT'), true); // B
  assert.equal(isVehicleSizeAllowedForContainer('COMBO', '20FT'), true); // C
  assert.equal(isVehicleSizeAllowedForContainer('20FT', '40FT'), false); // D
  assert.equal(isVehicleSizeAllowedForContainer('40FT', '40FT'), true); // E
  assert.equal(isVehicleSizeAllowedForContainer('COMBO', '40FT'), true); // F
});

test('matriks ukuran truck pickup Repo single dan combo', () => {
  const truck = (size) => ({ chassis_size: null, container_size: size, plate_number: `B ${size}` });
  const allowed = (vehicle, sizes, type) => {
    try { assertVehicleCanPickupRepo(vehicle, sizes.map((size) => ({ container_size: size })), type); return true; } catch { return false; }
  };
  // Single 20FT: 20FT/40FT/COMBO boleh (G-I).
  assert.equal(allowed(truck('20FT'), ['20FT'], 'single'), true);
  assert.equal(allowed(truck('40FT'), ['20FT'], 'single'), true);
  assert.equal(allowed(truck('COMBO'), ['20FT'], 'single'), true);
  // Single 40FT: 40FT/COMBO boleh, 20FT ditolak.
  assert.equal(allowed(truck('40FT'), ['40FT'], 'single'), true);
  assert.equal(allowed(truck('COMBO'), ['40FT'], 'single'), true);
  assert.equal(allowed(truck('20FT'), ['40FT'], 'single'), false);
  // Combo 2x20: 40FT/COMBO boleh, 20FT ditolak.
  assert.equal(allowed(truck('40FT'), ['20FT', '20FT'], 'combo_2x20'), true);
  assert.equal(allowed(truck('COMBO'), ['20FT', '20FT'], 'combo_2x20'), true);
  assert.equal(allowed(truck('20FT'), ['20FT', '20FT'], 'combo_2x20'), false);
  // Ukuran chassis terpasang lebih diutamakan dari kapasitas truck.
  assert.equal(allowed({ chassis_size: '20FT', container_size: '40FT' }, ['40FT'], 'single'), false);
});

test('pickup container titip menolak container 40FT diambil truck 20FT', () => {
  assert.throws(
    () => assertVehicleCanPickupRepo(
      { chassis_size: '20FT', container_size: '20FT', plate_number: 'B 9002 TEST' },
      [{ container_size: '40FT' }],
      'single',
    ),
    (error) => error.code === 'REPO_PICKUP_REQUIRES_40FT',
  );
});

test('combo pickup titip hanya valid untuk dua container 20FT memakai truck 40FT', () => {
  assert.doesNotThrow(() => assertVehicleCanPickupRepo(
    { chassis_size: '40FT', container_size: '40FT', plate_number: 'B 9003 TEST' },
    [{ container_size: '20FT' }, { container_size: '20FT' }],
    'combo_2x20',
  ));
  assert.throws(
    () => assertVehicleCanPickupRepo(
      { chassis_size: '20FT', container_size: '20FT', plate_number: 'B 9004 TEST' },
      [{ container_size: '20FT' }, { container_size: '20FT' }],
      'combo_2x20',
    ),
    (error) => error.code === 'REPO_PICKUP_COMBO_REQUIRES_40FT',
  );
  assert.throws(
    () => assertVehicleCanPickupRepo(
      { chassis_size: '40FT', container_size: '40FT', plate_number: 'B 9005 TEST' },
      [{ container_size: '20FT' }, { container_size: '40FT' }],
      'combo_2x20',
    ),
    (error) => error.code === 'REPO_PICKUP_COMBO_INVALID_JOBS',
  );
});

test('vendor yang dikembalikan menjadi internal wajib melewati validasi assignment', () => {
  assert.equal(shouldRequireAssignmentAfterVendorRevert('vendor', 'internal'), true);
  assert.equal(shouldRequireAssignmentAfterVendorRevert('vendor', 'vendor'), false);
  assert.equal(shouldRequireAssignmentAfterVendorRevert('internal', 'internal'), false);
  assert.equal(shouldRequireAssignmentAfterVendorRevert('vendor', 'internal', true), false);
});

test('koreksi sopir job selesai berkomisi wajib memilih tindakan komisi', () => {
  const job = {
    status: 'completed',
    hasDriverCommission: true,
    driverId: 'driver-old',
    driver: 'Sopir Lama',
  };

  assert.throws(
    () => ensureCompletedCommissionDriverAction(job, {
      adminCorrectionMode: true,
      driverId: 'driver-new',
      driver: 'Sopir Baru',
    }),
    (error) => error.code === 'CONTAINER_JOB_COMMISSION_DRIVER_ACTION_REQUIRED' && error.statusCode === 400,
  );
  assert.doesNotThrow(() => ensureCompletedCommissionDriverAction(job, {
    driverId: 'driver-new',
    driver: 'Sopir Baru',
    adminCorrectionMode: true,
    commissionDriverAction: 'move',
  }));
  assert.doesNotThrow(() => ensureCompletedCommissionDriverAction(
    { ...job, hasDriverCommission: false },
    { adminCorrectionMode: true, driverId: 'driver-new', driver: 'Sopir Baru' },
  ));
  assert.doesNotThrow(() => ensureCompletedCommissionDriverAction(job, {
    driverId: 'driver-new',
    driver: 'Sopir Baru',
  }));
});

test('identitas sopir dibandingkan lewat driver_id, bukan nama', () => {
  const job = { driverId: 'driver-1', driver: 'Budi Lama', assignment_snapshot: { driver: 'Budi Lama' } };

  // Rename di master driver: id sama, nama payload ikut nama baru -> bukan reassignment.
  assert.equal(hasDriverIdentityChange(job, { driverId: 'driver-1', driver: 'Budi Baru' }), false);
  // Id berubah -> reassignment.
  assert.equal(hasDriverIdentityChange(job, { driverId: 'driver-2', driver: 'Andi' }), true);
  // Dua sopir bernama sama tetap berbeda kalau id-nya beda.
  assert.equal(hasDriverIdentityChange(job, { driverId: 'driver-2', driver: 'Budi Lama' }), true);
  // Tanpa driverId (data lama/free text): fallback ke nama snapshot.
  assert.equal(hasDriverIdentityChange(job, { driver: 'Budi Lama' }), false);
  assert.equal(hasDriverIdentityChange(job, { driver: 'Andi' }), true);
  assert.equal(hasDriverIdentityChange(job, {}), false);
  // Snapshot job tidak diubah oleh pengecekan.
  assert.deepEqual(job, { driverId: 'driver-1', driver: 'Budi Lama', assignment_snapshot: { driver: 'Budi Lama' } });
});

test('identitas truck dibandingkan lewat vehicle_id, bukan plat nomor', () => {
  const job = { vehicleId: 'truck-1', plateNumber: 'B 1000 AA', assignment_snapshot: { plateNumber: 'B 1000 AA' } };

  // Plat diganti di master truck: id sama -> bukan reassignment.
  assert.equal(hasVehicleIdentityChange(job, { vehicleId: 'truck-1', plateNumber: 'B 2000 BB' }), false);
  // Id berubah -> reassignment.
  assert.equal(hasVehicleIdentityChange(job, { vehicleId: 'truck-2', plateNumber: 'B 3000 CC' }), true);
  // Plat lama sekarang dipakai truck lain: tetap dibedakan lewat id.
  assert.equal(hasVehicleIdentityChange(job, { vehicleId: 'truck-2', plateNumber: 'B 1000 AA' }), true);
  // Data lama tanpa vehicleId: fallback ke plat snapshot.
  assert.equal(hasVehicleIdentityChange(job, { plateNumber: 'B 1000 AA' }), false);
  assert.equal(hasVehicleIdentityChange(job, { plateNumber: 'B 3000 CC' }), true);
  assert.equal(hasVehicleIdentityChange(job, {}), false);
  // Snapshot job tidak diubah oleh pengecekan.
  assert.deepEqual(job, { vehicleId: 'truck-1', plateNumber: 'B 1000 AA', assignment_snapshot: { plateNumber: 'B 1000 AA' } });
});

test('rename sopir (id sama) pada job selesai berkomisi tidak memaksa tindakan komisi', () => {
  const job = { status: 'completed', hasDriverCommission: true, driverId: 'driver-1', driver: 'Budi Lama' };

  assert.doesNotThrow(() => ensureCompletedCommissionDriverAction(job, {
    adminCorrectionMode: true,
    driverId: 'driver-1',
    driver: 'Budi Baru',
  }));
  assert.throws(
    () => ensureCompletedCommissionDriverAction(job, {
      adminCorrectionMode: true,
      driverId: 'driver-2',
      driver: 'Budi Lama',
    }),
    (error) => error.code === 'CONTAINER_JOB_COMMISSION_DRIVER_ACTION_REQUIRED',
  );
});

test('keep mengunci penerima komisi lama pada data legacy tanpa commission_driver_id', async () => {
  const result = await resolveCompletedCommissionDriverCorrection({ query: async () => assert.fail('tidak boleh query') }, {
    job: {
      id: 'job-legacy',
      driver_id: 'driver-old',
      assignment_snapshot: { driver: 'Sopir Lama', driverBankName: 'BCA', driverBankAccountNumber: '123' },
      commission_driver_snapshot: {},
    },
    action: 'keep',
    driverId: 'driver-new',
    assignment: { driver: 'Sopir Baru' },
  });

  assert.equal(result.driverId, 'driver-old');
  assert.equal(result.driverName, 'Sopir Lama');
  assert.equal(result.snapshot.driverBankAccountNumber, '123');
});

test('move mengganti penerima komisi yang belum masuk batch', async () => {
  const client = { query: async () => ({ rows: [] }) };
  const result = await resolveCompletedCommissionDriverCorrection(client, {
    job: { id: 'job-draft', driver_id: 'driver-old', assignment_snapshot: { driver: 'Sopir Lama' } },
    action: 'move',
    driverId: 'driver-new',
    assignment: { driver: 'Sopir Baru', driverBankName: 'MANDIRI', driverBankAccountNumber: '456' },
  });

  assert.equal(result.batchStatus, 'unsubmitted');
  assert.equal(result.driverId, 'driver-new');
  assert.equal(result.driverName, 'Sopir Baru');
  assert.equal(result.snapshot.driverBankAccountNumber, '456');
});

test('move menolak batch komisi approved atau paid', async () => {
  for (const status of ['approved', 'paid']) {
    const client = {
      query: async () => ({
        rows: [{
          id: 'item-1',
          batch_id: 'batch-1',
          payment_id: 'payment-old',
          batch_status: status,
          payment_status: status === 'paid' ? 'paid' : 'pending',
          payment_proof_attachment_id: null,
        }],
      }),
    };

    await assert.rejects(
      resolveCompletedCommissionDriverCorrection(client, {
        job: { id: 'job-locked', driver_id: 'driver-old', assignment_snapshot: { driver: 'Sopir Lama' } },
        action: 'move',
        driverId: 'driver-new',
        assignment: { driver: 'Sopir Baru' },
      }),
      (error) => error.code === 'CONTAINER_JOB_COMMISSION_BATCH_LOCKED'
        && error.details.batchStatus === status,
    );
  }
});

test('move memindahkan item pada batch submitted dan menghitung ulang payment', async () => {
  const calls = [];
  const client = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('from driver_commission_items dci')) {
        return { rows: [{
          id: 'item-1',
          batch_id: 'batch-1',
          payment_id: 'payment-old',
          batch_status: 'submitted',
          payment_status: 'pending',
          payment_proof_attachment_id: null,
        }] };
      }
      if (sql.startsWith('select exists')) return { rows: [{ exists: false }] };
      if (sql.includes('from driver_commission_payments') && sql.includes('driver_id = $2')) {
        return { rows: [{ id: 'payment-new', status: 'pending', payment_proof_attachment_id: null }] };
      }
      return { rows: [] };
    },
  };

  const result = await resolveCompletedCommissionDriverCorrection(client, {
    job: { id: 'job-submitted', driver_id: 'driver-old', assignment_snapshot: { driver: 'Sopir Lama' } },
    action: 'move',
    driverId: 'driver-new',
    assignment: { driver: 'Sopir Baru', driverBankAccountNumber: '789' },
  });

  assert.equal(result.batchStatus, 'submitted');
  assert.ok(calls.some(({ sql, params }) => (
    sql.includes('update driver_commission_items')
    && params[1] === 'payment-new'
    && params[2] === 'driver-new'
  )));
  assert.ok(calls.some(({ sql }) => sql.includes('update driver_commission_payments payment')));
  assert.ok(calls.some(({ sql }) => sql.includes('update driver_commission_batches batch')));
});

test('auto UJ memprioritaskan destination_id dan hanya fallback ke nama untuk data lama', async () => {
  const destinationId = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: destinationId, uj_20ft: 250000, uj_40ft: 400000 }] };
    },
  };

  const byId = await findJourneyMoneyAmount(client, {
    destination_id: destinationId,
    destination: 'Nama snapshot lama',
    container_size: '20FT',
  });
  assert.equal(byId.amount, 250000);
  assert.deepEqual(calls[0].params, [destinationId, 'Nama snapshot lama']);

  await findJourneyMoneyAmount(client, { destination: 'Bekasi', container_size: '40FT' });
  assert.deepEqual(calls[1].params, [null, 'Bekasi']);
});

test('auto UJ menambahkan Rp100.000 untuk container Reefer', async () => {
  const client = {
    query: async () => ({ rows: [{ id: 'destination-reefer', uj_20ft: 600000, uj_40ft: 750000 }] }),
  };

  const reefer = await findJourneyMoneyAmount(client, {
    destination: 'Cikarang',
    container_size: '40FT',
    container_type: 'Reefer',
  });
  const dry = await findJourneyMoneyAmount(client, {
    destination: 'Cikarang',
    container_size: '40FT',
    container_type: 'Dry',
  });

  assert.equal(reefer.amount, 850000);
  assert.equal(dry.amount, 750000);
});

test('auto UJ Repo Reefer tidak menambahkan surcharge', async () => {
  const client = {
    query: async () => ({ rows: [{ id: 'destination-repo', uj_20ft: 600000, uj_40ft: 750000 }] }),
  };

  const repoReefer = await findJourneyMoneyAmount(client, {
    destination: 'Cikarang',
    container_size: '40FT',
    container_type: 'Reefer',
    shipment_type: 'repo_full',
  });

  assert.equal(repoReefer.amount, 750000);
});

test('ritasi vendor tidak membuat auto UJ atau transaksi rekening dropping', async () => {
  const calls = [];
  const client = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };

  const result = await syncAutoJourneyMoneyExpense(client, {
    job: {
      id: 'job-vendor',
      execution_source: 'vendor',
      rpuj_status: 'pending',
    },
    nextStatus: 'running',
    nextEntrySource: 'realtime',
    nextDriverId: null,
    runningAt: '2026-09-25T08:00:00.000Z',
    assignment: { driver: 'VENDOR', plateNumber: 'VENDOR' },
    actorName: 'Operational Test',
  });

  assert.equal(result, undefined);
  assert.equal(calls.length, 0);
});

test('posted driver commission can only be changed after void/correction', async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'posted-item-1' }] };
    },
  };

  await ensureDriverCommissionIsNotPosted(client, 'job-1', false);
  assert.equal(queries.length, 0);

  await assert.rejects(
    ensureDriverCommissionIsNotPosted(client, 'job-1', true),
    (error) => error.code === 'CONTAINER_JOB_COMMISSION_ALREADY_POSTED' && error.statusCode === 409,
  );
  assert.deepEqual(queries[0].params, ['job-1']);
});

const existingCommission = {
  has_driver_commission: true,
  driver_commission_amount: 100000,
  driver_commission_source_destination_id: null,
  driver_commission_note: 'Komisi tujuan',
};

test('update nonkomisi mempertahankan snapshot komisi lama', () => {
  for (const payload of [
    { travelDocument: 'SJ-001' },
    { containerNumber: 'IAAU2879845' },
    { runningAt: '2026-07-20T08:00:00+07:00' },
    { driverId: 'driver-2', vehicleId: 'vehicle-2' },
    { entrySource: 'historical', historicalPeriod: '2026-07' },
    { isBackdateEntry: true, backdateReason: 'Input susulan dari lapangan' },
    // Phase 6: memilih/mengganti Lokasi Gudang (dan destination_id ikutannya) BUKAN input komisi --
    // tidak boleh mereset atau menghitung ulang komisi yang sudah dibekukan.
    { warehouseLocationId: 'location-2' },
    { warehouseLocationId: 'location-2', destinationId: 'destination-2' },
  ]) {
    assert.deepEqual(resolveDriverCommissionUpdate(existingCommission, payload), {
      updateRequested: false,
      hasCommission: true,
      amount: 100000,
      sourceDestinationId: null,
      note: 'Komisi tujuan',
    });
  }
});

test('document-only mengabaikan default false dan nol', () => {
  assert.deepEqual(resolveDriverCommissionUpdate(existingCommission, {
    travelDocument: 'SJ-001',
    hasDriverCommission: false,
    driverCommissionAmount: 0,
    driverCommissionSourceDestinationId: '',
    driverCommissionNote: '',
    driverCommissionEdited: true,
  }, { documentOnlyUpdate: true }), {
    updateRequested: false,
    hasCommission: true,
    amount: 100000,
    sourceDestinationId: null,
    note: 'Komisi tujuan',
  });
});

test('jenis shipment repo dikenali untuk menonaktifkan komisi sopir', () => {
  assert.equal(isRepoShipment({ shipment_type: 'repo_empty' }), true);
  assert.equal(isRepoShipment({ shipmentType: 'Repo Full' }), true);
  assert.equal(isRepoShipment({ shipment: 'repo-full' }), true);
  assert.equal(isRepoShipment({ shipment_type: 'import' }), false);
});

test('koreksi eksplisit dapat menonaktifkan komisi', () => {
  assert.deepEqual(resolveDriverCommissionUpdate(existingCommission, {
    hasDriverCommission: false,
    driverCommissionAmount: 0,
    driverCommissionEdited: true,
  }), {
    updateRequested: true,
    hasCommission: false,
    amount: 0,
    sourceDestinationId: null,
    note: null,
  });
});

test('mengenali pengisian pertama nomor container setelah UJ dikirim', () => {
  assert.equal(isInitialContainerNumberInput(
    { containerNumber: '', status: 'running', rpujStatus: 'paid' },
    { containerNumber: 'TCLU1234567' },
  ), true);
});

test('completed_at wajib berupa tanggal dan jam yang valid', () => {
  assert.equal(normalizeCompletedAtForSave(''), null);
  assert.equal(normalizeCompletedAtForSave('08:30'), null);
  assert.equal(normalizeCompletedAtForSave({}), null);
  assert.equal(normalizeCompletedAtForSave('2026-09-09'), null);
  assert.equal(normalizeCompletedAtForSave('2026-99-99T08:30'), null);
  assert.equal(normalizeCompletedAtForSave('2026-09-09T08:30')?.startsWith('2026-09-09'), true);
});

test('completed_at job selesai dipertahankan saat payload mengirim null atau nilai invalid', () => {
  const existing = {
    status: 'completed',
    completed_at: '2026-09-08T03:30:00.000Z',
  };

  assert.equal(resolveCompletedAtForSave({ completedAt: null }, existing, 'completed'), existing.completed_at);
  assert.equal(resolveCompletedAtForSave({ completedAt: '08:30' }, existing, 'completed'), existing.completed_at);
  assert.equal(resolveCompletedAtForSave({ completedAt: {} }, existing, 'completed'), existing.completed_at);
});

test('completed_at otomatis diisi saat status berubah ke completed tanpa timestamp valid', () => {
  const before = Date.now();
  const resolved = resolveCompletedAtForSave({ status: 'completed', completedAt: null }, { status: 'running' }, 'completed');
  const after = Date.now();
  const resolvedTime = new Date(resolved).getTime();

  assert.ok(resolved);
  assert.ok(resolvedTime >= before - 1000);
  assert.ok(resolvedTime <= after + 1000);
});

test('tidak menganggap perubahan nomor tersimpan sebagai pengisian pertama', () => {
  assert.equal(isInitialContainerNumberInput(
    { containerNumber: 'TCLU1234567', status: 'running', rpujStatus: 'paid' },
    { containerNumber: 'TCLU7654321' },
  ), false);
});

test('mengunci perubahan nomor container saat container dititipkan', () => {
  assert.equal(isContainerNumberLockedForOperational(
    { containerNumber: 'TCLU1234567', status: 'repo_stored', rpujStatus: 'approved' },
    { containerNumber: 'TCLU7654321', status: 'running' },
  ), true);
});

test('mengunci perubahan biaya lainnya saat ambil container titip', () => {
  assert.equal(isOtherCostLockedForRepoPickup(
    { status: 'repo_stored', rpujNotes: '{"amount":150000,"notes":"Parkir"}' },
    { status: 'running', rpujNotes: '{"amount":250000,"notes":"Parkir tambahan"}' },
  ), true);
  assert.equal(isOtherCostLockedForRepoPickup(
    { status: 'repo_stored', rpujNotes: '{"amount":150000,"notes":"Parkir"}' },
    { status: 'running', rpujNotes: '{"amount":150000,"notes":"Parkir"}' },
  ), false);
});

test('mengenali perubahan snapshot komisi sopir', () => {
  assert.equal(hasDriverCommissionChange(
    { hasDriverCommission: false, driverCommissionAmount: 0 },
    { hasDriverCommission: true, driverCommissionAmount: 50000, driverCommissionEdited: true },
  ), true);
  assert.equal(hasDriverCommissionChange(
    { hasDriverCommission: true, driverCommissionAmount: 50000, driverCommissionNote: 'Komisi Bandung' },
    { hasDriverCommission: true, driverCommissionAmount: 50000, driverCommissionNote: 'Komisi Bandung', driverCommissionEdited: true },
  ), false);
  assert.equal(hasDriverCommissionChange(
    { hasDriverCommission: true, driverCommissionAmount: 100000 },
    { hasDriverCommission: false, driverCommissionAmount: 0 },
  ), false);
});

test('mengunci perubahan komisi sopir operational setelah RPUJ disetujui atau dibayar', () => {
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'operational' },
    { rpujStatus: 'approved', status: 'running', hasDriverCommission: true, driverCommissionAmount: 50000 },
    { hasDriverCommission: true, driverCommissionAmount: 75000, driverCommissionEdited: true },
  ), true);
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'admin' },
    { rpujStatus: 'paid', status: 'running', hasDriverCommission: true, driverCommissionAmount: 50000 },
    { hasDriverCommission: true, driverCommissionAmount: 75000, driverCommissionEdited: true },
  ), true);
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'admin' },
    { rpujStatus: 'paid', status: 'running', hasDriverCommission: true, driverCommissionAmount: 50000 },
    { hasDriverCommission: true, driverCommissionAmount: 75000, driverCommissionEdited: true, adminCorrectionMode: true, adminCorrectionReason: 'Salah input komisi' },
  ), false);
});

test('reset komisi job selesai membutuhkan intent eksplisit dan koreksi admin valid', () => {
  const job = { status: 'completed', rpujStatus: 'paid', hasDriverCommission: true, driverCommissionAmount: 100000 };
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'admin' },
    job,
    { hasDriverCommission: false, driverCommissionAmount: 0 },
  ), false);
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'admin' },
    job,
    { hasDriverCommission: false, driverCommissionAmount: 0, driverCommissionEdited: true },
  ), true);
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'admin' },
    job,
    {
      hasDriverCommission: false,
      driverCommissionAmount: 0,
      driverCommissionEdited: true,
      adminCorrectionMode: true,
      adminCorrectionReason: 'Koreksi komisi salah input',
    },
  ), false);
});

test('mengunci pembatalan operational setelah container pernah dititipkan', () => {
  assert.equal(isRepoCancellationLockedForOperational(
    { role: 'operational' },
    { status: 'running', repoStoredAt: '2026-07-23T09:00:00.000Z', repoPickedUpAt: '2026-07-23T10:00:00.000Z' },
    { status: 'cancelled' },
  ), true);
  assert.equal(isRepoCancellationLockedForOperational(
    { role: 'admin' },
    { status: 'running', repoStoredAt: '2026-07-23T09:00:00.000Z' },
    { status: 'cancelled' },
  ), true);
  assert.equal(isRepoCancellationLockedForOperational(
    { role: 'admin' },
    { status: 'running', repoStoredAt: '2026-07-23T09:00:00.000Z' },
    { status: 'cancelled', adminCorrectionMode: true, adminCorrectionReason: 'Pembatalan koreksi admin' },
  ), false);
});

test('mode koreksi admin membutuhkan role admin dan alasan', () => {
  assert.equal(isAdminCorrectionMode({ adminCorrectionMode: true }), true);
  assert.equal(isAdminCorrectionMode({ adminCorrectionMode: 'true' }), true);
  assert.equal(adminCorrectionReason({ adminCorrectionReason: ' Salah tanggal selesai ' }), 'Salah tanggal selesai');
  assert.equal(canUseAdminCorrection(
    { role: 'admin' },
    { adminCorrectionMode: true, adminCorrectionReason: 'Salah tanggal selesai' },
  ), true);
  assert.equal(canUseAdminCorrection(
    { role: 'operational' },
    { adminCorrectionMode: true, adminCorrectionReason: 'Salah tanggal selesai' },
  ), false);
  assert.equal(canUseAdminCorrection(
    { role: 'admin' },
    { adminCorrectionMode: true, adminCorrectionReason: 'pendek' },
  ), false);
});

test('ritasi susulan/backdate: penanda dan alasan dibaca dari payload, jatuh ke data existing kalau tidak dikirim', () => {
  assert.equal(isBackdateEntryPayload({ isBackdateEntry: true }), true);
  assert.equal(isBackdateEntryPayload({ isBackdateEntry: 'true' }), true);
  assert.equal(isBackdateEntryPayload({}, { isBackdateEntry: true }), true);
  assert.equal(isBackdateEntryPayload({ isBackdateEntry: false }, { isBackdateEntry: true }), false);
  assert.equal(backdateReason({ backdateReason: ' Telat input dari lapangan ' }), 'Telat input dari lapangan');
  assert.equal(backdateReason({}, { backdateReason: 'Alasan tersimpan' }), 'Alasan tersimpan');
});

test('mengizinkan pengisian awal dokumen kosong setelah job selesai', () => {
  assert.equal(hasOperationalDocumentChange(
    { eirNumber: '', loadingVoucher: '' },
    { eirNumber: 'EIR-001', loadingVoucher: 'BON-001' },
  ), false);
});

test('mengenali revisi dokumen yang sudah tersimpan', () => {
  assert.equal(hasOperationalDocumentChange(
    { eirNumber: 'EIR-001' },
    { eirNumber: 'EIR-REVISI' },
  ), true);
});

test('mengenali revisi timeline job selesai', () => {
  assert.equal(hasCompletedTimelineChange(
    {
      runningAt: '2026-06-29T06:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
    {
      runningAt: '2026-06-29T06:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
  ), false);
  assert.equal(hasCompletedTimelineChange(
    {
      runningAt: '2026-06-29T06:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
    {
      runningAt: '2026-06-29T07:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
  ), true);
});

test('assignment operational belum lengkap jika truck atau driver kosong', () => {
  assert.equal(hasCompleteOperationalAssignment({ plateNumber: 'B 1234 XYZ', driver: '' }), false);
  assert.equal(hasCompleteOperationalAssignment({ plateNumber: '', driver: 'Budi' }), false);
});

test('assignment operational lengkap dari payload atau snapshot tersimpan', () => {
  assert.equal(hasCompleteOperationalAssignment({ plateNumber: 'B 1234 XYZ', driver: 'Budi' }), true);
  assert.equal(hasCompleteOperationalAssignment({}, null, null, {
    assignment_snapshot: {
      plateNumber: 'B 1234 XYZ',
      driver: 'Budi',
    },
  }), true);
});

test('Phase 8: assignment operational tetap lengkap tanpa lokasi gudang -- job bisa jalan/selesai walau lokasi kosong', () => {
  assert.equal(hasCompleteOperationalAssignment({
    plateNumber: 'B 1234 XYZ',
    driver: 'Budi',
    warehouseLocationId: '',
  }), true);
  assert.equal(hasCompleteOperationalAssignment({ plateNumber: 'B 1234 XYZ', driver: 'Budi' }, null, null, {
    assignment_snapshot: { plateNumber: 'B 1234 XYZ', driver: 'Budi' },
    warehouse_location_id: null,
  }), true);
});

test('auto UJ memilih tarif sesuai ukuran container dan membuat keterangan ledger', () => {
  assert.equal(resolveJourneyMoneyAmountForSize({ uj_20ft: '600000', uj_40ft: '1200000' }, '20FT'), 600000);
  assert.equal(resolveJourneyMoneyAmountForSize({ uj_20ft: '600000', uj_40ft: '1200000' }, '40FT'), 1200000);
  assert.equal(resolveJourneyMoneyAmountForSize({ uj_20ft: null, uj_40ft: null }, '20FT'), 0);
  assert.equal(buildAutoJourneyMoneyDescription(
    {
      customer_name: 'Revo',
      destination: 'Patimban',
      container_size: '50X40',
      assignment_snapshot: { plateNumber: 'B9180BEL' },
    },
    { driver: 'Randi', plateNumber: 'B9180BEL' },
  ), 'UJ Revo Patimban 50X40 B9180BEL');
});

test('Phase 8: UJ yang sudah dibekukan tidak dihitung ulang ke Master Tujuan sama sekali (tidak reset oleh perubahan lokasi/tujuan)', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("coalesce(source, 'manual') <> 'auto_uj_order'")) return { rows: [] };
      if (sql.includes('left join operational_fund_transactions oft')) return { rows: [] };
      if (sql.includes('insert into container_job_expenses')) return { rows: [{ id: 'expense-frozen' }] };
      if (sql.includes('insert into operational_fund_batches')) {
        return { rows: [{ id: 'batch-frozen', batch_date: params[0], status: 'open' }] };
      }
      if (sql.includes('insert into operational_fund_transactions')) return { rows: [] };
      // Kalau kode ini SAMPAI query destination_locations, berarti UJ yang sudah beku dihitung
      // ulang -- persis pelanggaran yang harus dicegah (Phase 6/8). Gagalkan test dengan tegas.
      throw new Error(`UJ seharusnya tidak query ulang ke Master Tujuan, tapi ada query: ${sql}`);
    },
  };

  await syncAutoJourneyMoneyExpense(client, {
    job: {
      id: 'job-frozen',
      sales_order_id: 'order-frozen',
      customer_name: 'PT Beku',
      destination: 'Cikarang',
      container_size: '20FT',
      // Nilai ini SENGAJA tidak konsisten dengan tarif 20FT Cikarang manapun -- kalau kode diam-diam
      // menghitung ulang dari destination_locations, nilai yang tersimpan akan beda dari ini.
      uj_amount_snapshot: 777777,
      rpuj_status: 'draft',
      assignment_snapshot: { plateNumber: 'B 7777 XYZ' },
    },
    nextStatus: 'running',
    nextEntrySource: 'realtime',
    nextDriverId: 'driver-frozen',
    runningAt: '2026-09-10T08:00:00.000Z',
    assignment: { driver: 'Sopir Beku', plateNumber: 'B 7777 XYZ' },
    actorName: 'Operational Test',
  });

  const expenseInsert = calls.find((call) => call.sql.includes('insert into container_job_expenses'));
  assert.equal(expenseInsert.params[3], 777777);
  assert.equal(calls.some((call) => call.sql.includes('destination_locations')), false);
});

test('sales document-only dikenali untuk upload dokumen container job historical', () => {
  assert.equal(isDocumentOnlyContainerJobUpdateActor({
    role: 'sales',
    permissions: ['container_job.read', 'container_job.document.update', 'document.upload'],
  }), true);
  assert.equal(isDocumentOnlyContainerJobUpdateActor({
    role: 'admin',
    permissions: ['container_job.update', 'container_job.document.update', 'historical_entry.manage'],
  }), false);
});

test('reset ritasi salah assign hanya untuk operational/admin dan wajib alasan', () => {
  assert.throws(
    () => resetMisassignedContainerJob('job-1', { reason: 'Salah party' }, { role: 'sales', name: 'Sales Test' }),
    (error) => error.code === 'CONTAINER_JOB_RESET_FORBIDDEN' && error.statusCode === 403,
  );
  assert.throws(
    () => resetMisassignedContainerJob('job-1', { reason: 'pendek' }, { role: 'operational', name: 'Ops Test' }),
    (error) => error.code === 'CONTAINER_JOB_RESET_REASON_REQUIRED' && error.statusCode === 400,
  );
});

test('sales document-only hanya boleh mengirim field dokumen container job', () => {
  const salesActor = {
    role: 'sales',
    permissions: ['container_job.read', 'container_job.document.update', 'document.upload'],
  };

  assert.doesNotThrow(() => assertDocumentOnlyPayload(salesActor, {
    travelDocument: 'SJ-001',
    travelDocumentFile: { path: 'surat-jalan.pdf' },
    loadingVoucher: 'BON-001',
    otherDocuments: [{ name: 'Foto bongkar', file: { path: 'foto.jpg' } }],
    hasDriverCommission: false,
    driverCommissionAmount: 0,
    driverCommissionSourceDestinationId: '',
    driverCommissionNote: '',
  }));
  assert.throws(
    () => assertDocumentOnlyPayload(salesActor, {
      travelDocument: 'SJ-001',
      status: 'completed',
      driver: 'Driver Baru',
      plateNumber: 'B 1234 XYZ',
      destination: 'Tujuan Baru',
      containerNumber: 'MSCU1234567',
      ujAmountSnapshot: 100000,
    }),
    (error) => (
      error.code === 'CONTAINER_JOB_DOCUMENT_UPDATE_ONLY'
      && error.statusCode === 403
      && error.details.disallowedFields.includes('status')
      && error.details.disallowedFields.includes('driver')
      && error.details.disallowedFields.includes('ujAmountSnapshot')
    ),
  );
});

test('admin tetap boleh mengirim payload lengkap container job', () => {
  assert.doesNotThrow(() => assertDocumentOnlyPayload({
    role: 'admin',
    permissions: ['container_job.update', 'container_job.update_status', 'container_job.document.update', 'historical_entry.manage'],
  }, {
    status: 'completed',
    travelDocument: 'SJ-001',
    driver: 'Driver Admin',
    plateNumber: 'B 1234 XYZ',
  }));
});

test('auto UJ saat closing tidak menggagalkan ritasi jika batch rekening dropping sudah ditutup', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("coalesce(source, 'manual') <> 'auto_uj_order'")) return { rows: [] };
      if (sql.includes('left join operational_fund_transactions oft')) return { rows: [] };
      if (sql.includes('insert into container_job_expenses')) return { rows: [{ id: 'expense-1' }] };
      if (sql.includes('insert into operational_fund_batches')) {
        return { rows: [{ id: 'batch-1', batch_date: '2026-08-31', status: 'closed' }] };
      }
      if (sql.includes("set finance_check_status = 'perlu_klarifikasi'")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const result = await syncAutoJourneyMoneyExpense(client, {
    job: {
      id: 'job-1',
      sales_order_id: 'order-1',
      customer_name: 'Customer A',
      destination: 'Cikarang',
      container_size: '20FT',
      uj_amount_snapshot: 60000,
      rpuj_status: 'draft',
      assignment_snapshot: { plateNumber: 'B 1234 XYZ' },
    },
    nextStatus: 'completed',
    nextEntrySource: 'realtime',
    nextDriverId: 'driver-1',
    runningAt: '2026-08-31T12:00:00.000Z',
    assignment: { driver: 'Budi', plateNumber: 'B 1234 XYZ' },
    actorName: 'Operational Test',
    allowOperationalFundPending: true,
  });

  assert.equal(result.code, 'AUTO_UJ_PENDING_FINANCE_REVIEW');
  assert.match(result.message, /belum masuk Catatan Saldo/);
  const insertExpense = calls.find((call) => call.sql.includes('insert into container_job_expenses'));
  assert.ok(insertExpense.sql.includes("'belum_dicek', null, null"));
  assert.equal(calls.some((call) => call.sql.includes('insert into operational_fund_transactions')), false);
  const reviewUpdate = calls.find((call) => call.sql.includes("set finance_check_status = 'perlu_klarifikasi'"));
  assert.ok(reviewUpdate);
  assert.equal(reviewUpdate.params[1], 'Operational Test');
  assert.equal(reviewUpdate.params[2], 'expense-1');
});

test('auto UJ memakai tanggal running_at WIB untuk batch walau trip_date berbeda', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("coalesce(source, 'manual') <> 'auto_uj_order'")) return { rows: [] };
      if (sql.includes('left join operational_fund_transactions oft')) return { rows: [] };
      if (sql.includes('insert into container_job_expenses')) return { rows: [{ id: 'expense-uj-running' }] };
      if (sql.includes('insert into operational_fund_batches')) {
        return { rows: [{ id: 'batch-running', batch_date: params[0], status: 'open' }] };
      }
      if (sql.includes('insert into operational_fund_transactions')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await syncAutoJourneyMoneyExpense(client, {
    job: {
      id: 'job-running',
      sales_order_id: 'order-running',
      customer_name: 'MILENIA ARMADA EKSPRES',
      destination: 'Dadap',
      container_size: '40FT',
      trip_date: '2026-09-07',
      uj_amount_snapshot: 950000,
      rpuj_status: 'draft',
      assignment_snapshot: { plateNumber: 'B 9207 BEL' },
    },
    nextStatus: 'running',
    nextEntrySource: 'realtime',
    nextDriverId: 'driver-agus',
    runningAt: '2026-09-07T17:00:00.000Z',
    assignment: { driver: 'AGUS SOPIAN', plateNumber: 'B 9207 BEL' },
    actorName: 'Operational Test',
  });

  const batchInsert = calls.find((call) => call.sql.includes('insert into operational_fund_batches'));
  assert.equal(batchInsert.params[0], '2026-09-08');
  const ledgerInsert = calls.find((call) => call.sql.includes('insert into operational_fund_transactions'));
  assert.equal(ledgerInsert.params[3], '2026-09-08');
});

test('auto UJ saat completed tetap memakai running_at, bukan completed_at atau trip_date', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("coalesce(source, 'manual') <> 'auto_uj_order'")) return { rows: [] };
      if (sql.includes('left join operational_fund_transactions oft')) return { rows: [] };
      if (sql.includes('insert into container_job_expenses')) return { rows: [{ id: 'expense-uj-completed' }] };
      if (sql.includes('insert into operational_fund_batches')) {
        return { rows: [{ id: 'batch-completed', batch_date: params[0], status: 'open' }] };
      }
      if (sql.includes('insert into operational_fund_transactions')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await syncAutoJourneyMoneyExpense(client, {
    job: {
      id: 'job-completed',
      sales_order_id: 'order-completed',
      customer_name: 'MILENIA ARMADA EKSPRES',
      destination: 'Dadap',
      container_size: '40FT',
      trip_date: '2026-09-07',
      completed_at: '2026-09-09T03:00:00.000Z',
      uj_amount_snapshot: 950000,
      rpuj_status: 'draft',
      assignment_snapshot: { plateNumber: 'B 9207 BEL' },
    },
    nextStatus: 'completed',
    nextEntrySource: 'realtime',
    nextDriverId: 'driver-agus',
    runningAt: '2026-09-07T17:00:00.000Z',
    assignment: { driver: 'AGUS SOPIAN', plateNumber: 'B 9207 BEL' },
    actorName: 'Operational Test',
  });

  const batchInsert = calls.find((call) => call.sql.includes('insert into operational_fund_batches'));
  assert.equal(batchInsert.params[0], '2026-09-08');
  const ledgerInsert = calls.find((call) => call.sql.includes('insert into operational_fund_transactions'));
  assert.equal(ledgerInsert.params[3], '2026-09-08');
});

test('data lama tidak mengunci mismatch ukuran truck dan container', () => {
  assert.equal(shouldValidateVehicleContainerSize({ entrySource: 'historical' }, { entry_source: 'realtime' }), false);
  assert.equal(shouldValidateVehicleContainerSize({}, { entry_source: 'historical' }), false);
  assert.equal(shouldValidateVehicleContainerSize({}, { entry_source: 'realtime' }), true);
});

test('completion job biasa tidak membutuhkan EIR Titip', () => {
  assert.equal(hasRequiredRepoCompletionDocuments({}, new Set(['eirDocument'])), true);
});

test('completion job titip membutuhkan nomor dan dokumen EIR Titip', () => {
  assert.equal(hasRequiredRepoCompletionDocuments(
    { repo_location: 'Depo Marunda', repo_eir_number: 'EIR-TITIP-001' },
    new Set(['repoEirDocument']),
  ), true);
  assert.equal(hasRequiredRepoCompletionDocuments(
    { repo_location: 'Depo Marunda', repo_eir_number: 'EIR-TITIP-001' },
    new Set(['eirDocument']),
  ), false);
  assert.equal(hasRequiredRepoCompletionDocuments(
    { repo_location: 'Depo Marunda' },
    new Set(['repoEirDocument']),
  ), false);
});

test('menolak titip container jika job belum sedang jalan', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'received',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoEirNumber: 'EIR-TITIP-001',
      repoContainerCondition: 'empty',
    },
  ), /Sedang Jalan/);
});

test('mengizinkan titip container jika job sedang jalan dan syarat lengkap', () => {
  assert.doesNotThrow(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoEirNumber: 'EIR-TITIP-001',
      repoContainerCondition: 'empty',
    },
  ));
});

test('menolak titip ulang setelah container pernah dititipkan', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoLocation: 'Depo Marunda',
      repoStoredAt: '2026-07-23T09:00:00.000Z',
      repoPickedUpAt: '2026-07-23T10:00:00.000Z',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Cakung',
      repoReason: 'Menunggu ulang',
      repoEirNumber: 'EIR-TITIP-002',
      repoContainerCondition: 'empty',
    },
  ), /tidak bisa dititipkan ulang/);
});

test('menolak titip container tanpa nomor EIR Titip', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoContainerCondition: 'empty',
    },
  ), /Nomor EIR Titip/);
});

test('menolak titip container jika hanya EIR akhir yang tersedia', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      eirDocument: { path: 'eir-akhir.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoEirNumber: 'EIR-TITIP-001',
      repoContainerCondition: 'empty',
    },
  ), /EIR Titip/);
});

test('menolak inap jika job belum sedang jalan', () => {
  assert.throws(() => ensureInapPayload(
    { status: 'received' },
    { status: 'inap', inapReason: 'Curfew malam, tidak boleh jalan' },
  ), /Sedang Jalan/);
});

test('mengizinkan inap jika job sedang jalan dan alasan terisi', () => {
  assert.doesNotThrow(() => ensureInapPayload(
    { status: 'running' },
    { status: 'inap', inapReason: 'Curfew malam, tidak boleh jalan' },
  ));
});

test('menolak inap tanpa alasan yang cukup panjang', () => {
  assert.throws(() => ensureInapPayload(
    { status: 'running' },
    { status: 'inap', inapReason: 'macet' },
  ), /Alasan inap wajib diisi minimal 8 karakter/);
});

test('tidak memvalidasi apa pun kalau status yang dikirim bukan inap', () => {
  assert.doesNotThrow(() => ensureInapPayload(
    { status: 'received' },
    { status: 'running' },
  ));
});

test('create expense menolak kategori, nominal, dan jenis biaya yang tidak valid', () => {
  assert.throws(
    () => createContainerJobExpense('job-1', { category: 'solar', amount: 100000, expenseGroup: 'operational' }, { name: 'Operational Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_CATEGORY_INVALID' && error.statusCode === 400,
  );
  assert.throws(
    () => createContainerJobExpense('job-1', { category: 'tol', amount: 100000 }, { name: 'Operational Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_GROUP_INVALID' && error.statusCode === 400,
  );
  assert.throws(
    () => createContainerJobExpense('job-1', { category: 'tol', amount: 0, expenseGroup: 'operational' }, { name: 'Operational Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_AMOUNT_INVALID' && error.statusCode === 400,
  );
});

test('correct expense memakai validasi kategori, nominal, dan status pembayaran yang sama', () => {
  assert.throws(
    () => correctContainerJobExpense('job-1', 'expense-1', { category: 'solar', amount: 100000 }, { name: 'Operational Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_CATEGORY_INVALID' && error.statusCode === 400,
  );
  assert.throws(
    () => correctContainerJobExpense('job-1', 'expense-1', { category: 'tol', amount: 0 }, { name: 'Operational Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_AMOUNT_INVALID' && error.statusCode === 400,
  );
  assert.throws(
    () => correctContainerJobExpense('job-1', 'expense-1', { category: 'tol', amount: 100000, paymentStatus: 'selesai' }, { name: 'Operational Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_PAYMENT_STATUS_INVALID' && error.statusCode === 400,
  );
});

test('upload proof expense wajib membawa bukti pembayaran', () => {
  assert.throws(
    () => updateContainerJobExpenseProof('job-1', 'expense-1', {}, { name: 'Operational Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_PROOF_REQUIRED' && error.statusCode === 400,
  );
});

test('E/F: running_at leg awal job Repo dipertahankan; pickup Repo tetap terpisah', () => {
  const repoJob = {
    running_at: '2026-09-23T03:00:00.000Z',
    repo_stored_at: '2026-09-23T14:34:00.000Z',
    repo_picked_up_at: '2026-10-09T08:36:00.000Z',
  };
  // Setelah pickup Repo (dan saat penyelesaian), form tidak boleh menimpa waktu mulai leg awal.
  assert.equal(shouldPreserveOriginalRunningAt(repoJob), true);
  // Pickup lewat jalur update umum (masih repo_stored, belum ada repo_picked_up_at) juga dipertahankan.
  assert.equal(shouldPreserveOriginalRunningAt({ ...repoJob, repo_picked_up_at: null }), true);
  // Koreksi Admin tetap boleh memperbaiki running_at.
  assert.equal(shouldPreserveOriginalRunningAt(repoJob, { allowAdminCorrection: true }), false);
  // Job normal (tanpa leg Repo) tetap mengikuti input form seperti sebelumnya.
  assert.equal(shouldPreserveOriginalRunningAt({ running_at: repoJob.running_at }), false);
  assert.equal(shouldPreserveOriginalRunningAt({ repo_stored_at: repoJob.repo_stored_at, running_at: null }), false);
  assert.notEqual(repoJob.running_at, repoJob.repo_picked_up_at);
});
