import { describe, expect, it } from 'vitest';
import { USER_ROLES } from './roles';
import { navigationGroups } from './navigation';

describe('navigationGroups', () => {
  it('tidak menampilkan menu finance untuk admin', () => {
    const monitoringGroup = navigationGroups.find((group) => group.label === 'Monitoring');
    const financeItems = monitoringGroup?.items.filter((item) => item.to.startsWith('/finance')) || [];

    expect(financeItems).toHaveLength(3);
    financeItems.forEach((item) => {
      expect(item.roles).toEqual([USER_ROLES.FINANCE]);
      expect(item.roles).not.toContain(USER_ROLES.ADMIN);
    });
  });

  it('menampilkan struktur menu order untuk finance', () => {
    const orderGroup = navigationGroups.find((group) => group.label === 'Order');
    const runningItem = orderGroup?.items.find((item) => item.to === '/order-running');
    const weeklyItem = orderGroup?.items.find((item) => item.to === '/weekly-orders');
    const historyItem = orderGroup?.items.find((item) => item.to === '/order-history');

    expect(orderGroup?.items.map((item) => item.label)).toEqual(['Order Berjalan', 'Order Mingguan', 'Riwayat Order']);
    expect(runningItem?.roles).toContain(USER_ROLES.FINANCE);
    expect(weeklyItem?.roles).toContain(USER_ROLES.FINANCE);
    expect(historyItem?.roles).toContain(USER_ROLES.FINANCE);
  });

  it('membatasi menu container titip untuk admin dan operational', () => {
    const operationalGroup = navigationGroups.find((group) => group.label === 'Operational');
    const repoItem = operationalGroup?.items.find((item) => item.to === '/operations/repo-storage');

    expect(repoItem?.label).toBe('Container Titip');
    expect(repoItem?.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.OPERATIONAL]);
  });

  it('menampilkan Dokumen Customer hanya untuk admin dan sales', () => {
    const salesOrderGroup = navigationGroups.find((group) => group.label === 'Sales Order');
    const customerDocumentItem = salesOrderGroup?.items.find((item) => item.to === '/sales/customer-documents');

    expect(customerDocumentItem?.label).toBe('Dokumen Customer');
    expect(customerDocumentItem?.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.SALES]);
  });

  it('membatasi Input Data Lama hanya untuk admin', () => {
    const salesOrderGroup = navigationGroups.find((group) => group.label === 'Sales Order');
    const historicalEntryItem = salesOrderGroup?.items.find((item) => item.to === '/historical-entry');

    expect(historicalEntryItem?.label).toBe('Input Data Lama');
    expect(historicalEntryItem?.roles).toEqual([USER_ROLES.ADMIN]);
  });

  it('menampilkan Viewer pada dashboard order read-only dan laporan', () => {
    const items = navigationGroups.flatMap((group) => group.items.flatMap((item) => item.children || item));
    const viewerItems = items.filter((item) => item.roles?.includes(USER_ROLES.OBSERVER));

    expect(viewerItems.map((item) => item.to)).toEqual([
      '/order-running',
      '/weekly-orders',
      '/order-history',
      '/viewer/clients',
      '/viewer/drivers',
      '/viewer/trucks',
      '/viewer/kir-chassis',
      '/viewer/depots',
      '/viewer/terminals',
      '/viewer/destinations',
      '/reports',
    ]);
    expect(viewerItems.map((item) => item.to)).not.toContain('/document-monitoring');
  });
});
