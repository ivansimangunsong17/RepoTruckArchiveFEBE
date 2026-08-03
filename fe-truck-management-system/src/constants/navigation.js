import {
  Archive,
  Anchor,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Database,
  FilePenLine,
  FileClock,
  FileWarning,
  History,
  IdCard,
  LayoutDashboard,
  ReceiptText,
  Route,
  Send,
  Settings,
  ShieldCheck,
  Truck,
  Warehouse,
} from 'lucide-react';
import { USER_ROLES } from './roles';

const adminOnly = [USER_ROLES.ADMIN];
const viewerOnly = [USER_ROLES.OBSERVER];
const masterDataRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER];
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
const reportRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER];
const financeRoles = [USER_ROLES.FINANCE];

export const navigationGroups = [
  {
    label: 'Order',
    items: [
      { to: '/order-running', label: 'Order Berjalan', icon: LayoutDashboard, roles: overviewRoles },
      { to: '/weekly-orders', label: 'Order Mingguan', icon: CalendarDays, roles: overviewRoles },
      { to: '/order-history', label: 'Riwayat Order', icon: History, roles: overviewRoles },
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
          { to: '/clients', label: 'Data Customer', icon: Building2, roles: adminOnly },
          { to: '/viewer/clients', label: 'Data Customer', icon: Building2, roles: viewerOnly },
          { to: '/drivers', label: 'Data Supir', icon: IdCard, roles: adminOnly },
          { to: '/viewer/drivers', label: 'Data Supir', icon: IdCard, roles: viewerOnly },
          { to: '/trucks', label: 'Data Truck', icon: Truck, roles: adminOnly },
          { to: '/viewer/trucks', label: 'Data Truck', icon: Truck, roles: viewerOnly },
          { to: '/kir-chassis', label: 'Data Chassis', icon: Boxes, roles: adminOnly },
          { to: '/viewer/kir-chassis', label: 'Data Chassis', icon: Boxes, roles: viewerOnly },
          { to: '/depots', label: 'Data Depo', icon: Warehouse, roles: adminOnly },
          { to: '/viewer/depots', label: 'Data Depo', icon: Warehouse, roles: viewerOnly },
          { to: '/terminals', label: 'Data Terminal', icon: Anchor, roles: adminOnly },
          { to: '/viewer/terminals', label: 'Data Terminal', icon: Anchor, roles: viewerOnly },
          { to: '/destinations', label: 'Data Lokasi Tujuan', icon: Route, roles: adminOnly },
          { to: '/viewer/destinations', label: 'Data Lokasi Tujuan', icon: Route, roles: viewerOnly },
        ],
      },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/document-monitoring', label: 'Dokumen & OFF', icon: FileWarning, roles: adminOnly },
      { to: '/reports', label: 'Laporan', icon: BarChart3, roles: reportRoles },
      { to: '/finance/order-verification', label: 'Verifikasi Order', icon: CheckCircle2, roles: financeRoles },
      { to: '/finance/rpuj-approval', label: 'Approval RPUJ', icon: ReceiptText, roles: financeRoles },
      { to: '/finance/invoices', label: 'Input Invoice', icon: ClipboardList, roles: financeRoles },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/users', label: 'User Management', icon: ShieldCheck, roles: adminOnly },
      { to: '/finance/corrections', label: 'Koreksi Finance', icon: FilePenLine, roles: adminOnly },
      { to: '/activity-log', label: 'Activity Log', icon: FileClock, roles: adminOnly },
      { to: '/settings', label: 'Pengaturan Sistem', icon: Settings, roles: adminOnly },
    ],
  },
];
