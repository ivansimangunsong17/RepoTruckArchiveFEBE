import { describe, expect, it } from 'vitest';
import { USER_ROLES } from './roles';
import { navigationGroups } from './navigation';

function groupItems(label) {
  const group = navigationGroups.find((item) => item.label === label);
  return group?.items.flatMap((item) => item.children || item) || [];
}

describe('navigationGroups', () => {
  it('menampilkan menu finance untuk admin dan finance', () => {
    const financeItems = groupItems('Finance').filter((item) => item.to.startsWith('/finance'));

    expect(financeItems).toHaveLength(5);
    financeItems.forEach((item) => {
      expect(item.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.FINANCE]);
    });
  });

  it('menampilkan struktur menu order untuk finance', () => {
    const orderGroup = navigationGroups.find((group) => group.label === 'Order');
    const dashboardItem = orderGroup?.items.find((item) => item.to === '/order-running');

    expect(orderGroup?.items.map((item) => item.label)).toEqual(['Dashboard']);
    expect(dashboardItem?.roles).toContain(USER_ROLES.FINANCE);
  });

  it('membatasi menu container titip untuk admin dan operational', () => {
    const operationalGroup = navigationGroups.find((group) => group.label === 'Operational');
    const repoItem = operationalGroup?.items.find((item) => item.to === '/operations/repo-storage');

    expect(repoItem?.label).toBe('Container Titip');
    expect(repoItem?.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.OPERATIONAL]);
  });

  it('menambahkan rekening dropping untuk operational sebagai riwayat saldo', () => {
    const operationalGroup = navigationGroups.find((group) => group.label === 'Operational');
    const droppingItem = operationalGroup?.items.find((item) => item.to === '/operations/rekening-dropping');

    expect(droppingItem?.label).toBe('Rekening Dropping');
    expect(droppingItem?.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.OPERATIONAL]);
  });

  it('memisahkan menu komisi Operational dan Finance', () => {
    const operationalGroup = navigationGroups.find((group) => group.label === 'Operational');
    const financeItems = groupItems('Finance');

    const operationalCommission = operationalGroup?.items.find((item) => item.to === '/operations/driver-commissions');
    const financeCommission = financeItems.find((item) => item.to === '/finance/driver-commissions');

    expect(operationalCommission?.label).toBe('Report Komisi');
    expect(operationalCommission?.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.OPERATIONAL]);
    expect(financeCommission?.label).toBe('Pembayaran Komisi');
    expect(financeCommission?.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.FINANCE]);
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

  it('menambahkan menu laporan untuk finance', () => {
    const reportsItem = groupItems('Finance').find((item) => item.to === '/reports');

    expect(reportsItem?.roles).toEqual([USER_ROLES.ADMIN, USER_ROLES.OBSERVER, USER_ROLES.FINANCE]);
  });

  it('menampilkan Viewer pada dashboard order read-only dan laporan', () => {
    const items = navigationGroups.flatMap((group) => group.items.flatMap((item) => item.children || item));
    const viewerItems = items.filter((item) => item.roles?.includes(USER_ROLES.OBSERVER));

    expect(viewerItems.map((item) => item.to)).toEqual([
      '/order-running',
      '/viewer/clients',
      '/viewer/end-users',
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
