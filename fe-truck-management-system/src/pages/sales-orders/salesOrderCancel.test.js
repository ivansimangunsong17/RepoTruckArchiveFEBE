import { describe, expect, it } from 'vitest';
import { canCancelOrderBeforeOperational, canUserCancelSalesOrder } from './SalesOrdersPage';
import { hasProcessedContainers } from '../../contexts/ArchiveDataContext';

const order = (statuses, extra = {}) => ({
  status: 'waiting_operational',
  containers: statuses.map((status, index) => ({ id: `job-${index + 1}`, status })),
  ...extra,
});

describe('pembatalan Sales Order dengan container yang sudah dibatalkan', () => {
  it('regresi: SO dengan container cancelled + received tetap bisa dibatalkan', () => {
    expect(canCancelOrderBeforeOperational(order(['cancelled', 'received']))).toBe(true);
    expect(hasProcessedContainers(order(['cancelled', 'received']))).toBe(false);
  });

  it('container yang sudah diproses Operational tetap mengunci pembatalan', () => {
    for (const status of ['running', 'inap', 'completed', 'repo_stored']) {
      expect(canCancelOrderBeforeOperational(order([status, 'cancelled']))).toBe(false);
      expect(hasProcessedContainers(order([status, 'cancelled']))).toBe(true);
    }
  });

  it('aturan status SO lain tidak berubah', () => {
    expect(canCancelOrderBeforeOperational(order(['received']))).toBe(true);
    expect(canCancelOrderBeforeOperational(order(['received'], { status: 'completed' }))).toBe(false);
    expect(canCancelOrderBeforeOperational(order(['cancelled'], { status: 'cancelled' }))).toBe(false);
    expect(canCancelOrderBeforeOperational(null)).toBe(false);
  });
});

describe('hak batal Sales dipisah dari hak revisi', () => {
  const sales = { role: 'sales', name: 'Sales A', id: 'user-sales-a' };
  const admin = { role: 'admin', name: 'Admin' };
  const lockedOrder = (statuses, flags) => order(statuses, { createdByUserId: 'user-sales-a', createdBy: 'Sales A', ...flags });

  it('Sales pemilik bisa membatalkan SO terkunci Finance (canCancel) walau tidak boleh merevisi (canRevise=false)', () => {
    expect(canUserCancelSalesOrder(sales, lockedOrder(['cancelled', 'received'], { canRevise: false, canCancel: true }))).toBe(true);
  });

  it('flag canCancel dari backend tetap dihormati: false berarti tombol batal tersembunyi', () => {
    expect(canUserCancelSalesOrder(sales, lockedOrder(['cancelled', 'received'], { canRevise: false, canCancel: false }))).toBe(false);
  });

  it('Sales bukan pemilik, Operational, dan Observer tidak mendapat tombol batal', () => {
    const unlocked = lockedOrder(['received'], { canRevise: true, canCancel: true });
    expect(canUserCancelSalesOrder({ role: 'sales', name: 'Sales B', id: 'user-sales-b' }, unlocked)).toBe(false);
    expect(canUserCancelSalesOrder({ role: 'operational', name: 'Ops' }, unlocked)).toBe(false);
    expect(canUserCancelSalesOrder({ role: 'observer', name: 'Viewer' }, unlocked)).toBe(false);
  });

  it('container yang sudah berjalan tetap mengunci tombol batal untuk semua role', () => {
    expect(canUserCancelSalesOrder(admin, lockedOrder(['running', 'cancelled'], { canCancel: true }))).toBe(false);
    expect(canUserCancelSalesOrder(sales, lockedOrder(['inap'], { canCancel: true }))).toBe(false);
    expect(canUserCancelSalesOrder(admin, lockedOrder(['cancelled', 'received'], {}))).toBe(true);
  });
});
