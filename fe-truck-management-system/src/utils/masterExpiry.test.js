import { describe, expect, it } from 'vitest';
import {
  buildMasterExpiryOverview,
  formatMasterExpiryRemaining,
  getMasterExpiryState,
} from './masterExpiry';

const TODAY = new Date(2026, 6, 20);

describe('master expiry', () => {
  it.each([
    ['2026-07-19', 'expired', -1],
    ['2026-07-20', 'critical', 0],
    ['2026-07-27', 'critical', 7],
    ['2026-07-28', 'soon', 8],
    ['2026-08-19', 'soon', 30],
    ['2026-08-20', 'monitor', 31],
    ['2026-09-18', 'monitor', 60],
    ['2026-09-19', 'safe', 61],
    ['', 'missing', null],
  ])('memetakan %s sebagai %s', (value, expectedKey, expectedDays) => {
    const state = getMasterExpiryState(value, { today: TODAY });
    expect(state.key).toBe(expectedKey);
    expect(state.daysLeft).toBe(expectedDays);
  });

  it('menyusun peringatan berdasarkan tingkat urgensi', () => {
    const overview = buildMasterExpiryOverview({
      today: TODAY,
      singular: 'Truck',
      fields: [
        { key: 'stnkExpiryDate', label: 'STNK OFF', expiryAlert: { label: 'STNK' } },
        { key: 'kirExpiryDate', label: 'KIR OFF', expiryAlert: { label: 'KIR Truck' } },
      ],
      rows: [
        { id: 'truck-1', plateNumber: 'B 1000 ARM', stnkExpiryDate: '2026-07-10', kirExpiryDate: '2026-07-25' },
        { id: 'truck-2', plateNumber: 'B 2000 ARM', stnkExpiryDate: '2026-10-01', kirExpiryDate: '' },
      ],
    });

    expect(overview.counts.expired).toBe(1);
    expect(overview.counts.critical).toBe(1);
    expect(overview.counts.safe).toBe(1);
    expect(overview.counts.missing).toBe(1);
    expect(overview.alerts.map((entry) => entry.state.key)).toEqual(['expired', 'critical']);
    expect(overview.alerts[0].documentLabel).toBe('STNK');
    expect(formatMasterExpiryRemaining(overview.alerts[0].state)).toBe('Lewat 10 hari');
  });
});
