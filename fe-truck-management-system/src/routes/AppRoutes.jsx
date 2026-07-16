/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import App from '../App';
import { AppErrorBoundary, PageSkeleton } from '../components/common/PageStates';
import { USER_ROLES } from '../constants/roles';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const WeeklyOrdersPage = lazy(() => import('../pages/dashboard/WeeklyOrdersPage'));
const SalesOrdersPage = lazy(() => import('../pages/sales-orders/SalesOrdersPage'));
const OperationsPage = lazy(() => import('../pages/operations/OperationsPage'));
const TrucksPage = lazy(() => import('../pages/TrucksPage'));
const ClientsPage = lazy(() => import('../pages/admin/ClientsPage'));
const DepotsPage = lazy(() => import('../pages/admin/DepotsPage'));
const DestinationsPage = lazy(() => import('../pages/admin/DestinationsPage'));
const DriversPage = lazy(() => import('../pages/admin/DriversPage'));
const KirChassisPage = lazy(() => import('../pages/admin/KirChassisPage'));
const TerminalsPage = lazy(() => import('../pages/admin/TerminalsPage'));
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));
const SettingsPage = lazy(() => import('../pages/admin/SettingsPage'));
const ActivityLogPage = lazy(() => import('../pages/system/ActivityLogPage'));
const ProfilePage = lazy(() => import('../pages/system/ProfilePage'));
const ReportsPage = lazy(() => import('../pages/reports/ReportsPage'));
const FinanceOrderVerificationPage = lazy(() => import('../pages/finance/FinanceOrderVerificationPage'));
const FinanceRpujApprovalPage = lazy(() => import('../pages/finance/FinanceRpujApprovalPage'));
const FinanceInvoiceNumberPage = lazy(() => import('../pages/finance/FinanceInvoiceNumberPage'));
const FinanceCompletedTripsPage = lazy(() => import('../pages/finance/FinanceCompletedTripsPage'));
const FinanceBillingReadinessPage = lazy(() => import('../pages/finance/FinanceBillingReadinessPage'));

function LazyPage({ children }) {
  const location = useLocation();

  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </AppErrorBoundary>
  );
}

const nonFinanceRoles = [USER_ROLES.ADMIN, USER_ROLES.SALES, USER_ROLES.OPERATIONAL, USER_ROLES.OBSERVER];
const orderRoles = nonFinanceRoles;
const operationalRoles = [USER_ROLES.ADMIN, USER_ROLES.OPERATIONAL, USER_ROLES.OBSERVER];
const adminRoles = [USER_ROLES.ADMIN];
const observerRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER];
const financeRoles = [USER_ROLES.ADMIN, USER_ROLES.FINANCE];

function guardedPage(roles, element) {
  return {
    element: <RoleRoute allowedRoles={roles} />,
    children: [{ index: true, element }],
  };
}

export const router = createBrowserRouter([
  { path: '/login', element: <LazyPage><LoginPage /></LazyPage> },
  {
    element: <ProtectedRoute />,
    children: [{
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <LazyPage><Dashboard /></LazyPage> },
        { path: 'weekly-orders', children: [guardedPage(nonFinanceRoles, <LazyPage><WeeklyOrdersPage /></LazyPage>)] },
        { path: 'profile', element: <LazyPage><ProfilePage /></LazyPage> },
        { path: 'delivery-orders', element: <Navigate to="/sales-orders" replace /> },
        { path: 'sales-orders', children: [guardedPage(orderRoles, <LazyPage><SalesOrdersPage /></LazyPage>)] },
        { path: 'operations', children: [guardedPage(operationalRoles, <LazyPage><OperationsPage /></LazyPage>)] },
        { path: 'trucks', children: [guardedPage(adminRoles, <LazyPage><TrucksPage /></LazyPage>)] },
        { path: 'drivers', children: [guardedPage(adminRoles, <LazyPage><DriversPage /></LazyPage>)] },
        { path: 'clients', children: [guardedPage(adminRoles, <LazyPage><ClientsPage /></LazyPage>)] },
        { path: 'kir-chassis', children: [guardedPage(adminRoles, <LazyPage><KirChassisPage /></LazyPage>)] },
        { path: 'depots', children: [guardedPage(adminRoles, <LazyPage><DepotsPage /></LazyPage>)] },
        { path: 'terminals', children: [guardedPage(adminRoles, <LazyPage><TerminalsPage /></LazyPage>)] },
        { path: 'destinations', children: [guardedPage(adminRoles, <LazyPage><DestinationsPage /></LazyPage>)] },
        { path: 'users', children: [guardedPage(adminRoles, <LazyPage><UsersPage /></LazyPage>)] },
        { path: 'settings', children: [guardedPage(adminRoles, <LazyPage><SettingsPage /></LazyPage>)] },
        { path: 'activity-log', children: [guardedPage(adminRoles, <LazyPage><ActivityLogPage /></LazyPage>)] },
        { path: 'audit-trail', element: <Navigate to="/activity-log" replace /> },
        { path: 'reports', children: [guardedPage(observerRoles, <LazyPage><ReportsPage /></LazyPage>)] },
        { path: 'finance', element: <Navigate to="/finance/order-verification" replace /> },
        { path: 'finance/order-verification', children: [guardedPage(financeRoles, <LazyPage><FinanceOrderVerificationPage /></LazyPage>)] },
        { path: 'finance/rpuj-approval', children: [guardedPage(financeRoles, <LazyPage><FinanceRpujApprovalPage /></LazyPage>)] },
        { path: 'finance/invoices', children: [guardedPage(financeRoles, <LazyPage><FinanceInvoiceNumberPage /></LazyPage>)] },
        { path: 'finance/completed-trips', children: [guardedPage(financeRoles, <LazyPage><FinanceCompletedTripsPage /></LazyPage>)] },
        { path: 'finance/billing-readiness', children: [guardedPage(financeRoles, <LazyPage><FinanceBillingReadinessPage /></LazyPage>)] },
        { path: 'truck-utilization', element: <Navigate to="/reports?tab=utilization" replace /> },
        { path: 'driver-performance', element: <Navigate to="/reports" replace /> },
        { path: 'unit-performance', element: <Navigate to="/reports?tab=utilization" replace /> },
      ],
    }],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
