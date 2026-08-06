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
const OrderHistoryPage = lazy(() => import('../pages/dashboard/OrderHistoryPage'));
const SalesOrdersPage = lazy(() => import('../pages/sales-orders/SalesOrdersPage'));
const HistoricalEntryPage = lazy(() => import('../pages/admin/HistoricalEntryPage'));
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
const DocumentMonitoringPage = lazy(() => import('../pages/monitoring/DocumentMonitoringPage'));
const FinanceOrderVerificationPage = lazy(() => import('../pages/finance/FinanceOrderVerificationPage'));
const FinanceRpujApprovalPage = lazy(() => import('../pages/finance/FinanceRpujApprovalPage'));
const FinanceInvoiceNumberPage = lazy(() => import('../pages/finance/FinanceInvoiceNumberPage'));
const FinanceCompletedTripsPage = lazy(() => import('../pages/finance/FinanceCompletedTripsPage'));
const FinanceBillingReadinessPage = lazy(() => import('../pages/finance/FinanceBillingReadinessPage'));
const FinanceCorrectionsPage = lazy(() => import('../pages/finance/FinanceCorrectionsPage'));

function LazyPage({ children }) {
  const location = useLocation();

  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </AppErrorBoundary>
  );
}

const nonFinanceRoles = [USER_ROLES.ADMIN, USER_ROLES.SALES, USER_ROLES.OPERATIONAL];
const overviewRoles = [USER_ROLES.ADMIN, USER_ROLES.SALES, USER_ROLES.OPERATIONAL, USER_ROLES.OBSERVER, USER_ROLES.FINANCE];
const orderRoles = nonFinanceRoles;
const customerDocumentRoles = [USER_ROLES.ADMIN, USER_ROLES.SALES];
const operationalRoles = [USER_ROLES.ADMIN, USER_ROLES.OPERATIONAL];
const adminRoles = [USER_ROLES.ADMIN];
const viewerOnlyRoles = [USER_ROLES.OBSERVER];
const observerRoles = [USER_ROLES.ADMIN, USER_ROLES.OBSERVER];
const financeRoles = [USER_ROLES.FINANCE];

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
        { index: true, element: <Navigate to="/order-running" replace /> },
        { path: 'dashboard', element: <Navigate to="/order-running" replace /> },
        { path: 'order-running', element: <LazyPage><Dashboard /></LazyPage> },
        { path: 'weekly-orders', children: [guardedPage(overviewRoles, <LazyPage><WeeklyOrdersPage /></LazyPage>)] },
        { path: 'order-history', children: [guardedPage(overviewRoles, <LazyPage><OrderHistoryPage /></LazyPage>)] },
        { path: 'profile', element: <LazyPage><ProfilePage /></LazyPage> },
        { path: 'delivery-orders', element: <Navigate to="/sales-orders" replace /> },
        { path: 'sales-orders', children: [guardedPage(orderRoles, <LazyPage><SalesOrdersPage /></LazyPage>)] },
        { path: 'historical-entry', children: [guardedPage(adminRoles, <LazyPage><HistoricalEntryPage /></LazyPage>)] },
        { path: 'sales/customer-documents', children: [guardedPage(customerDocumentRoles, <LazyPage><SalesOrdersPage customerDocumentsOnly /></LazyPage>)] },
        { path: 'operations', children: [guardedPage(operationalRoles, <LazyPage><OperationsPage /></LazyPage>)] },
        { path: 'operations/repo-storage', children: [guardedPage(operationalRoles, <LazyPage><OperationsPage repoStorageOnly /></LazyPage>)] },
        { path: 'operations/incomplete-documents', children: [guardedPage(operationalRoles, <LazyPage><OperationsPage documentFollowUp /></LazyPage>)] },
        { path: 'trucks', children: [guardedPage(adminRoles, <LazyPage><TrucksPage /></LazyPage>)] },
        { path: 'drivers', children: [guardedPage(adminRoles, <LazyPage><DriversPage /></LazyPage>)] },
        { path: 'clients', children: [guardedPage(adminRoles, <LazyPage><ClientsPage /></LazyPage>)] },
        { path: 'kir-chassis', children: [guardedPage(adminRoles, <LazyPage><KirChassisPage /></LazyPage>)] },
        { path: 'depots', children: [guardedPage(adminRoles, <LazyPage><DepotsPage /></LazyPage>)] },
        { path: 'terminals', children: [guardedPage(adminRoles, <LazyPage><TerminalsPage /></LazyPage>)] },
        { path: 'destinations', children: [guardedPage(adminRoles, <LazyPage><DestinationsPage /></LazyPage>)] },
        { path: 'viewer/trucks', children: [guardedPage(viewerOnlyRoles, <LazyPage><TrucksPage readOnly /></LazyPage>)] },
        { path: 'viewer/drivers', children: [guardedPage(viewerOnlyRoles, <LazyPage><DriversPage readOnly /></LazyPage>)] },
        { path: 'viewer/clients', children: [guardedPage(viewerOnlyRoles, <LazyPage><ClientsPage readOnly /></LazyPage>)] },
        { path: 'viewer/kir-chassis', children: [guardedPage(viewerOnlyRoles, <LazyPage><KirChassisPage readOnly /></LazyPage>)] },
        { path: 'viewer/depots', children: [guardedPage(viewerOnlyRoles, <LazyPage><DepotsPage readOnly /></LazyPage>)] },
        { path: 'viewer/terminals', children: [guardedPage(viewerOnlyRoles, <LazyPage><TerminalsPage readOnly /></LazyPage>)] },
        { path: 'viewer/destinations', children: [guardedPage(viewerOnlyRoles, <LazyPage><DestinationsPage readOnly /></LazyPage>)] },
        { path: 'users', children: [guardedPage(adminRoles, <LazyPage><UsersPage /></LazyPage>)] },
        { path: 'settings', children: [guardedPage(adminRoles, <LazyPage><SettingsPage /></LazyPage>)] },
        { path: 'activity-log', children: [guardedPage(adminRoles, <LazyPage><ActivityLogPage /></LazyPage>)] },
        { path: 'audit-trail', element: <Navigate to="/activity-log" replace /> },
        { path: 'document-monitoring', children: [guardedPage(observerRoles, <LazyPage><DocumentMonitoringPage /></LazyPage>)] },
        { path: 'reports', children: [guardedPage(observerRoles, <LazyPage><ReportsPage /></LazyPage>)] },
        { path: 'finance', element: <Navigate to="/finance/order-verification" replace /> },
        { path: 'finance/order-verification', children: [guardedPage(financeRoles, <LazyPage><FinanceOrderVerificationPage /></LazyPage>)] },
        { path: 'finance/rpuj-approval', children: [guardedPage(financeRoles, <LazyPage><FinanceRpujApprovalPage /></LazyPage>)] },
        { path: 'finance/invoices', children: [guardedPage(financeRoles, <LazyPage><FinanceInvoiceNumberPage /></LazyPage>)] },
        { path: 'finance/corrections', children: [guardedPage(adminRoles, <LazyPage><FinanceCorrectionsPage /></LazyPage>)] },
        { path: 'finance/completed-trips', children: [guardedPage(financeRoles, <LazyPage><FinanceCompletedTripsPage /></LazyPage>)] },
        { path: 'finance/billing-readiness', children: [guardedPage(financeRoles, <LazyPage><FinanceBillingReadinessPage /></LazyPage>)] },
        { path: 'truck-utilization', element: <Navigate to="/reports?tab=utilization" replace /> },
        { path: 'driver-performance', element: <Navigate to="/reports" replace /> },
        { path: 'unit-performance', element: <Navigate to="/reports?tab=utilization" replace /> },
      ],
    }],
  },
  { path: '*', element: <Navigate to="/order-running" replace /> },
]);
