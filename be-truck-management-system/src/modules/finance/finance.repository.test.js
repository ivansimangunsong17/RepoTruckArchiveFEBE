import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  invoiceOrdersCte,
} = await import('./finance.repository.js');

test('invoice CTE hanya mengambil completed job yang punya completed_at valid', () => {
  const sql = invoiceOrdersCte();

  assert.match(sql, /where\s+cj\.status\s*=\s*'completed'/i);
  assert.match(sql, /and\s+cj\.completed_at\s+is\s+not\s+null/i);
});
