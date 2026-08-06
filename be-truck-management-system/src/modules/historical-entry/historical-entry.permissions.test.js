import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureCanManageHistoricalEntry,
  payloadRequestsHistoricalEntry,
  recordIsHistorical,
} from './historical-entry.permissions.js';

test('payloadRequestsHistoricalEntry detects historical order and container payloads', () => {
  assert.equal(payloadRequestsHistoricalEntry({ entrySource: 'historical' }), true);
  assert.equal(payloadRequestsHistoricalEntry({ historicalPeriod: '2026-07' }), true);
  assert.equal(payloadRequestsHistoricalEntry({ containers: [{ entrySource: 'historical' }] }), true);
  assert.equal(payloadRequestsHistoricalEntry({ entrySource: 'realtime' }), false);
});

test('recordIsHistorical detects camelCase and snake_case records', () => {
  assert.equal(recordIsHistorical({ entrySource: 'historical' }), true);
  assert.equal(recordIsHistorical({ entry_source: 'historical' }), true);
  assert.equal(recordIsHistorical({ entrySource: 'realtime' }), false);
});

test('ensureCanManageHistoricalEntry allows admin and rejects non-admin roles', () => {
  assert.doesNotThrow(() => ensureCanManageHistoricalEntry(
    { role: 'admin' },
    { payload: { entrySource: 'historical' }, entityLabel: 'Data historis Sales Order' },
  ));

  assert.throws(
    () => ensureCanManageHistoricalEntry(
      { role: 'sales' },
      { payload: { entrySource: 'historical' }, entityLabel: 'Data historis Sales Order' },
    ),
    (error) => error.code === 'HISTORICAL_ENTRY_ADMIN_ONLY' && error.statusCode === 403,
  );
});

test('ensureCanManageHistoricalEntry protects existing historical records', () => {
  assert.throws(
    () => ensureCanManageHistoricalEntry(
      { role: 'operational' },
      { payload: { status: 'completed' }, currentRecord: { entrySource: 'historical' } },
    ),
    (error) => error.code === 'HISTORICAL_ENTRY_ADMIN_ONLY',
  );
});
