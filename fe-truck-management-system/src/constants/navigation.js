import {
  Archive,
  Anchor,
  ArrowRightLeft,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  CircleDollarSign,
  Cog,
  Database,
  FilePenLine,
  FileClock,
  FileWarning,
  IdCard,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Route,
  Satellite,
  Send,
  Settings,
  ShieldCheck,
  Truck,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { USER_ROLES } from './roles';

const adminOnly = [USER_ROLES.ADMIN];
const viewerOnly = [USER_ROLES.OBSERVER];
const masterDataRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER, USER_ROLES.FINANCE];
const customerReadOnlyRoles = [USER_ROLES.OBSERVER, USER_ROLES.FINANCE];
const nonFinanceRoles = [
  USER_ROLES.ADMIN,
  USER_ROLES.SALES,
  USER_ROLES.OPERATIONAL,
];
const overviewRoles = [
  USER_ROLES.ADMIN,
  USER_ROLES.SALES,
  USER_ROLES.OPERATIONAL,
  USER_ROLES.OBSERVER,
  USER_ROLES.FINANCE,
];
const orderRoles = nonFinanceRoles;
const customerDocumentRoles = [USER_ROLES.ADMIN, USER_ROLES.SALES];
const operationalRoles = [
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATIONAL,
];
const driverCommissionSubmitRoles = [USER_ROLES.ADMIN, USER_ROLES.OPERATIONAL, USER_ROLES.SALES];
const reportRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER, USER_ROLES.FINANCE];
const financeReadOnlyRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER, USER_ROLES.FINANCE];

export const navigationGroups = [
  {
    label: 'Order',
    items: [
      { to: '/order-running', label: 'Dashboard', icon: LayoutDashboard, roles: overviewRoles },
    ],
  },
  {
    label: 'Sales Order',
    items: [
      {
        to: '/sales-orders',
        label: 'Daftar Sales Order',
        icon: ClipboardList,
        roles: orderRoles,
      },
      {
        to: '/historical-entry',
        label: 'Input Data Lama',
        icon: FileClock,
        roles: adminOnly,
      },
      {
        to: '/sales/customer-documents',
        label: 'Dokumen Customer',
        icon: Send,
        roles: customerDocumentRoles,
      },
    ],
  },
  {
    label: 'Operational',
    items: [
      {
        to: '/operations',
        label: 'Container Job',
        icon: ClipboardCheck,
        roles: operationalRoles,
      },
      {
        to: '/operations/rekening-dropping',
        label: 'Rekening Dropping',
        icon: ReceiptText,
        roles: operationalRoles,
      },
      {
        to: '/operations/repo-storage',
        label: 'Container Titip',
        icon: Archive,
        roles: operationalRoles,
      },
      {
        to: '/operations/incomplete-documents',
        label: 'Dokumen Belum Lengkap',
        icon: FileWarning,
        roles: operationalRoles,
      },
      {
        to: '/operations/driver-commissions',
        label: 'Report Komisi',
        icon: CircleDollarSign,
        roles: driverCommissionSubmitRoles,
      },
      {
        to: '/operations/fleet-assignment',
        label: 'Assignment Armada',
        icon: ArrowRightLeft,
        roles: operationalRoles,
      },
      {
        to: '/operations/hino-connect',
        label: 'HINO Connect',
        icon: Satellite,
        roles: operationalRoles,
      },
    ],
  },
  {
    label: 'Laporan',
    items: [
      { to: '/reports', label: 'Laporan', icon: BarChart3, roles: reportRoles },
      { to: '/input-monitoring', label: 'Monitoring Input', icon: ClipboardCheck, roles: reportRoles },
    ],
  },
  {
    label: 'Master Data',
    items: [
      {
        label: 'Master Data',
        icon: Database,
        roles: masterDataRoles,
        children: [
          { to: '/clients', label: 'Customer', icon: Building2, roles: adminOnly },
          { to: '/viewer/clients', label: 'Customer', icon: Building2, roles: customerReadOnlyRoles },
          { to: '/end-users', label: 'Lokasi', icon: Building2, roles: adminOnly },
          { to: '/viewer/end-users', label: 'Lokasi', icon: Building2, roles: viewerOnly },
          { to: '/drivers', label: 'Sopir', icon: IdCard, roles: adminOnly },
          { to: '/viewer/drivers', label: 'Sopir', icon: IdCard, roles: viewerOnly },
          { to: '/trucks', label: 'Truck', icon: Truck, roles: adminOnly },
          { to: '/viewer/trucks', label: 'Truck', icon: Truck, roles: viewerOnly },
          { to: '/kir-chassis', label: 'Chassis', icon: Boxes, roles: adminOnly },
          { to: '/viewer/kir-chassis', label: 'Chassis', icon: Boxes, roles: viewerOnly },
          { to: '/depots', label: 'Depo', icon: Warehouse, roles: adminOnly },
          { to: '/viewer/depots', label: 'Depo', icon: Warehouse, roles: viewerOnly },
          { to: '/terminals', label: 'Terminal', icon: Anchor, roles: adminOnly },
          { to: '/viewer/terminals', label: 'Terminal', icon: Anchor, roles: viewerOnly },
          { to: '/destinations', label: 'UJ dan Komisi', icon: Route, roles: adminOnly },
          { to: '/viewer/destinations', label: 'UJ dan Komisi', icon: Route, roles: viewerOnly },
        ],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Finance',
        icon: Landmark,
        roles: [USER_ROLES.ADMIN, USER_ROLES.OBSERVER, USER_ROLES.FINANCE],
        children: [
          { to: '/finance/order-verification', label: 'Verifikasi Order', icon: CheckCircle2, roles: financeReadOnlyRoles },
          { to: '/finance/rpuj-approval', label: 'Rekening Dropping', icon: ReceiptText, roles: financeReadOnlyRoles },
          { to: '/finance/driver-commissions', label: 'Pembayaran Komisi', icon: CircleDollarSign, roles: financeReadOnlyRoles },
          { to: '/finance/invoices', label: 'Input Invoice', icon: ClipboardList, roles: financeReadOnlyRoles },
          { to: '/finance/outstanding', label: 'Customer Outstanding', icon: Wallet, roles: financeReadOnlyRoles },
          { to: '/finance/container-jobs', label: 'Container Job', icon: ClipboardCheck, roles: financeReadOnlyRoles },
        ],
      },
    ],
  },
  {
    label: 'System',
    icon: Cog,
    items: [
      { to: '/users', label: 'User Management', icon: ShieldCheck, roles: adminOnly },
      { to: '/finance/corrections', label: 'Koreksi Finance', icon: FilePenLine, roles: adminOnly },
      { to: '/activity-log', label: 'Activity Log', icon: FileClock, roles: adminOnly },
      { to: '/settings', label: 'Pengaturan Sistem', icon: Settings, roles: adminOnly },
    ],
  },
];
