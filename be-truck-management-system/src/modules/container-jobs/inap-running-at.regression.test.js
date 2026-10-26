// Regresi P0-1: status inap tidak boleh menghapus running_at, sehingga Selesai Inap (resume) dan closing
// tetap bisa dilakukan tanpa mengirim ulang runningAt. Tanpa database.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { requireCompletedJobReady, resolveRunningAtForSave } = await import('./container-jobs.repository.js');
const { ensureInapPayload } = await import('./container-jobs.service.js');

const startedAt = '2026-10-20T01:00:00.000Z';

function jobRow(overrides = {}) {
  return {
    id: 'job-1',
    status: 'running',
    running_at: startedAt,
    completed_at: null,
    container_number: 'MSCU1234567',
    driver_id: 'drv-1',
    vehicle_id: 'veh-1',
    spk_number: 'SPK-1',
    repo_stored_at: null,
    repo_picked_up_at: null,
    ...overrides,
  };
}

function attachmentClient(categories = ['spkDocument', 'eirDocument']) {
  return {
    async query(sql) {
      if (/from attachments/i.test(sql)) return { rows: categories.map((category) => ({ category })) };
      throw new Error(`Query tidak terduga: ${sql}`);
    },
  };
}

test('running -> inap mempertahankan running_at (sebelumnya menjadi null)', () => {
  const runningAt = resolveRunningAtForSave(jobRow(), { status: 'inap', inapReason: 'Curfew malam di rest area' }, 'inap');
  assert.equal(runningAt, startedAt);
});

test('running -> inap -> running -> completed tanpa mengirim ulang runningAt', async () => {
  // running: waktu mulai diisi.
  const afterRunning = jobRow({ status: 'running', running_at: resolveRunningAtForSave(jobRow({ status: 'received', running_at: null }), { runningAt: startedAt }, 'running') });
  assert.equal(afterRunning.running_at, startedAt);

  // inap: payload Tandai Inap tidak membawa runningAt.
  const afterInap = jobRow({ status: 'inap', running_at: resolveRunningAtForSave(afterRunning, { status: 'inap' }, 'inap') });
  assert.equal(afterInap.running_at, startedAt);

  // Selesai Inap: payload resumeFromInap juga tidak membawa runningAt.
  const resumePayload = { status: 'running', containerNumber: 'MSCU1234567', driver: 'SOPIR', plateNumber: 'B 1 AA' };
  const afterResume = jobRow({ status: 'running', running_at: resolveRunningAtForSave(afterInap, resumePayload, 'running') });
  assert.equal(afterResume.running_at, startedAt);

  // Closing tanpa runningAt: waktu mulai diambil dari data tersimpan.
  const completedAt = '2026-10-21T03:00:00.000Z';
  const closingPayload = { status: 'completed', completedAt };
  assert.equal(resolveRunningAtForSave(afterResume, closingPayload, 'completed'), startedAt);
  assert.equal(await requireCompletedJobReady(attachmentClient(), 'job-1', closingPayload, afterResume), completedAt);
});

test('closing langsung dari inap tanpa runningAt tidak lagi gagal "Lengkapi waktu mulai"', async () => {
  const inapJob = jobRow({ status: 'inap' });
  const completedAt = '2026-10-21T03:00:00.000Z';
  assert.equal(await requireCompletedJobReady(attachmentClient(), 'job-1', { status: 'completed', completedAt }, inapJob), completedAt);
});

test('aturan running_at lain tidak berubah', () => {
  const edited = '2026-10-20T02:00:00.000Z';
  assert.equal(resolveRunningAtForSave(jobRow(), { runningAt: edited }, 'running'), edited);
  assert.equal(resolveRunningAtForSave(jobRow(), {}, 'received'), null);
  assert.equal(resolveRunningAtForSave(jobRow(), {}, 'cancelled'), startedAt);
  assert.equal(resolveRunningAtForSave(jobRow(), { runningAt: edited }, 'inap', { documentOnlyUpdate: true }), startedAt);
  const repoJob = jobRow({ repo_stored_at: '2026-10-20T05:00:00.000Z' });
  assert.equal(resolveRunningAtForSave(repoJob, { runningAt: edited }, 'completed'), startedAt);
  assert.equal(resolveRunningAtForSave(repoJob, { runningAt: edited }, 'completed', { allowAdminCorrection: true }), edited);
});

test('mengedit job yang sudah inap tidak diperlakukan sebagai penandaan inap baru', () => {
  assert.doesNotThrow(() => ensureInapPayload({ status: 'inap' }, { status: 'inap' }));
  // Penandaan inap baru tetap wajib dari running dengan alasan minimal 8 karakter.
  assert.throws(() => ensureInapPayload({ status: 'received' }, { status: 'inap', inapReason: 'Curfew malam di rest area' }), { code: 'CONTAINER_JOB_INAP_REQUIRES_RUNNING_STATUS' });
  assert.throws(() => ensureInapPayload({ status: 'running' }, { status: 'inap', inapReason: 'macet' }), { code: 'CONTAINER_JOB_INAP_REASON_REQUIRED' });
});
