import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Truck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { USER_ROLES } from './roles';

const adminOnly = [USER_ROLES.ADMIN];
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
const managementRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER];

export const navigationGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/weekly-orders', label: 'Order Mingguan', icon: CalendarDays },
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
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/reports', label: 'Laporan', icon: BarChart3, roles: reportRoles },
      { to: '/driver-performance', label: 'Performa Driver', icon: Truck, roles: managementRoles },
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
