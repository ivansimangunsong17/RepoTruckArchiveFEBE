import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  ReceiptText,
  Settings,
  ShieldCheck,
  Truck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { USER_ROLES } from './roles';

const adminOnly = [USER_ROLES.ADMIN];
const nonFinanceRoles = [
  USER_ROLES.ADMIN,
  USER_ROLES.SALES,
  USER_ROLES.OPERATIONAL,
  USER_ROLES.OBSERVER,
];
const overviewRoles = [
  ...nonFinanceRoles,
  USER_ROLES.FINANCE,
];
const orderRoles = [
  USER_ROLES.ADMIN,
  USER_ROLES.SALES,
  USER_ROLES.OPERATIONAL,
  USER_ROLES.OBSERVER,
];
const operationalRoles = [
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATIONAL,
  USER_ROLES.OBSERVER,
];
const reportRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER];
const financeRoles = [USER_ROLES.FINANCE];

export const navigationGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: overviewRoles },
      { to: '/weekly-orders', label: 'Order Mingguan', icon: CalendarDays, roles: overviewRoles },
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
    ],
  },
  {
    label: 'Master Data',
    items: [
      { to: '/clients', label: 'Data Customer', icon: UsersRound, roles: adminOnly },
      { to: '/drivers', label: 'Data Supir', icon: UserRound, roles: adminOnly },
      { to: '/trucks', label: 'Data Truck', icon: Truck, roles: adminOnly },
      { to: '/kir-chassis', label: 'Data Chassis', icon: ClipboardCheck, roles: adminOnly },
      { to: '/depots', label: 'Data Depo', icon: ClipboardCheck, roles: adminOnly },
      { to: '/terminals', label: 'Data Terminal', icon: ClipboardCheck, roles: adminOnly },
      { to: '/destinations', label: 'Data Lokasi Tujuan', icon: ClipboardCheck, roles: adminOnly },
    ],
  },
  {
    label: 'Monitoring',
    items: [
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
      { to: '/activity-log', label: 'Activity Log', icon: FileClock, roles: adminOnly },
      { to: '/settings', label: 'Pengaturan Sistem', icon: Settings, roles: adminOnly },
    ],
  },
];
