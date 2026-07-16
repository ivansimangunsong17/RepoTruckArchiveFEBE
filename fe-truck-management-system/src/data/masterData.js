import { USER_ROLES } from '../constants/roles';

export const fallbackCustomers = [
  { id: 'client-1', name: 'PT Mayora Indah', npwp: '01.234.567.8-091.000', address: 'Bekasi, Jawa Barat', pic: 'Dian Prasetyo', phone: '021-8980-1234', email: 'logistik@mayora.co.id', contractNumber: 'UC/MYR/2026/014', contractStart: '2026-01-01', contractEnd: '2026-12-31', contract: 'Aktif' },
  { id: 'client-2', name: 'PT Wings Surya', npwp: '02.345.678.9-092.000', address: 'Karawang, Jawa Barat', pic: 'Maya Kusuma', phone: '021-8877-2200', email: 'supply@wings.co.id', contractNumber: 'UC/WNG/2026/008', contractStart: '2026-02-01', contractEnd: '2027-01-31', contract: 'Aktif' },
  { id: 'client-3', name: 'PT Indofood CBP', npwp: '03.456.789.0-093.000', address: 'Jakarta Utara', pic: 'Rizki Ananda', phone: '021-5795-8822', email: 'transport@indofood.co.id', contractNumber: 'UC/ICBP/2025/031', contractStart: '2025-07-01', contractEnd: '2026-06-30', contract: 'Review' },
  { id: 'client-4', name: 'PT Unilever Indonesia', npwp: '04.567.890.1-094.000', address: 'Cikarang, Jawa Barat', pic: 'Nadia Putri', phone: '021-5211-8800', email: 'transport@unilever.co.id', contractNumber: 'UC/ULI/2026/012', contractStart: '2026-01-15', contractEnd: '2027-01-14', contract: 'Aktif' },
  { id: 'client-5', name: 'PT Sinar Sosro', npwp: '05.678.901.2-095.000', address: 'Bekasi, Jawa Barat', pic: 'Arif Hidayat', phone: '021-8840-2500', email: 'logistik@sosro.com', contractNumber: 'UC/SSR/2025/019', contractStart: '2025-10-01', contractEnd: '2026-09-30', contract: 'Aktif' },
  { id: 'client-6', name: 'PT Kalbe Farma', npwp: '06.789.012.3-096.000', address: 'Jakarta Timur', pic: 'Lina Hartati', phone: '021-4287-3888', email: 'distribution@kalbe.co.id', contractNumber: 'UC/KLB/2025/027', contractStart: '2025-08-01', contractEnd: '2026-07-31', contract: 'Tidak Aktif' },
];

export const fallbackUsers = [
  { id: 'user-1', name: 'Andi Pratama', email: 'admin@demo.com', password: '********', role: USER_ROLES.ADMIN, status: 'Aktif' },
  { id: 'user-2', name: 'Sinta Maharani', email: 'sales@demo.com', password: '********', role: USER_ROLES.SALES, status: 'Aktif' },
  { id: 'user-3', name: 'Budi Operational', email: 'operational@demo.com', password: '********', role: USER_ROLES.OPERATIONAL, status: 'Aktif' },
  { id: 'user-4', name: 'Rina Management', email: 'management@demo.com', password: '********', role: USER_ROLES.OBSERVER, status: 'Aktif' },
  { id: 'user-5', name: 'Fitri Finance', email: 'finance@demo.com', password: '********', role: USER_ROLES.FINANCE, status: 'Aktif' },
];
