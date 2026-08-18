import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildCommissionPeriod,
  isDateKey,
  isCommissionWeekPeriod,
  normalizeCommissionPeriod,
} = await import('./driver-commissions.period.js');

test('buildCommissionPeriod builds Thursday to Wednesday period', () => {
  assert.deepEqual(buildCommissionPeriod('2026-08-13'), {
    periodStart: '2026-08-13',
    periodEnd: '2026-08-19',
  });

  assert.deepEqual(buildCommissionPeriod('2026-08-14'), {
    periodStart: '2026-08-13',
    periodEnd: '2026-08-19',
  });

  assert.deepEqual(buildCommissionPeriod('2026-08-19'), {
    periodStart: '2026-08-13',
    periodEnd: '2026-08-19',
  });
});

test('normalizeCommissionPeriod accepts explicit date range', () => {
  assert.deepEqual(normalizeCommissionPeriod({
    periodStart: '2026-08-06',
    periodEnd: '2026-08-12',
  }), {
    periodStart: '2026-08-06',
    periodEnd: '2026-08-12',
  });
});

test('normalizeCommissionPeriod rejects invalid dates and inverted ranges', () => {
  assert.equal(isDateKey('2026-02-29'), false);
  assert.throws(
    () => normalizeCommissionPeriod({ periodStart: '2026-08-12', periodEnd: '2026-08-06' }),
    /tanggal akhir/i,
  );
});

test('isCommissionWeekPeriod hanya menerima periode Kamis sampai Rabu', () => {
  assert.equal(isCommissionWeekPeriod({ periodStart: '2026-08-13', periodEnd: '2026-08-19' }), true);
  assert.equal(isCommissionWeekPeriod({ periodStart: '2026-08-13', periodEnd: '2026-08-18' }), false);
  assert.equal(isCommissionWeekPeriod({ periodStart: '2026-08-14', periodEnd: '2026-08-20' }), false);
});
