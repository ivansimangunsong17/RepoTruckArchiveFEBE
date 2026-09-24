import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildCommissionPeriod,
  isDateKey,
  isCommissionWeekPeriod,
  normalizeCommissionPeriod,
} = await import('./driver-commissions.period.js');

test('buildCommissionPeriod builds Sunday to Saturday period', () => {
  assert.deepEqual(buildCommissionPeriod('2026-08-09'), {
    periodStart: '2026-08-09',
    periodEnd: '2026-08-15',
  });

  assert.deepEqual(buildCommissionPeriod('2026-08-10'), {
    periodStart: '2026-08-09',
    periodEnd: '2026-08-15',
  });

  assert.deepEqual(buildCommissionPeriod('2026-08-15'), {
    periodStart: '2026-08-09',
    periodEnd: '2026-08-15',
  });
});

test('normalizeCommissionPeriod accepts explicit date range', () => {
  assert.deepEqual(normalizeCommissionPeriod({
    periodStart: '2026-08-09',
    periodEnd: '2026-08-15',
  }), {
    periodStart: '2026-08-09',
    periodEnd: '2026-08-15',
  });
});

test('normalizeCommissionPeriod rejects invalid dates and inverted ranges', () => {
  assert.equal(isDateKey('2026-02-29'), false);
  assert.throws(
    () => normalizeCommissionPeriod({ periodStart: '2026-08-12', periodEnd: '2026-08-06' }),
    /tanggal akhir/i,
  );
});

test('isCommissionWeekPeriod hanya menerima periode Minggu sampai Sabtu', () => {
  assert.equal(isCommissionWeekPeriod({ periodStart: '2026-08-09', periodEnd: '2026-08-15' }), true);
  assert.equal(isCommissionWeekPeriod({ periodStart: '2026-08-09', periodEnd: '2026-08-14' }), false);
  assert.equal(isCommissionWeekPeriod({ periodStart: '2026-08-08', periodEnd: '2026-08-14' }), false);
});
