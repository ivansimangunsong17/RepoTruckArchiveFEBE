import { USER_ROLES } from '../constants/roles';
import { useAuth } from '../hooks/useAuth';
import AdminDashboard from './dashboard/AdminDashboard';
import ManagementDashboard from './dashboard/ManagementDashboard';
import OperationalDashboard from './dashboard/OperationalDashboard';
import SalesDashboard from './dashboard/SalesDashboard';

function Dashboard() {
  const { user } = useAuth();

  if (user?.role === USER_ROLES.ADMIN) return <AdminDashboard />;
  if (user?.role === USER_ROLES.SALES) return <SalesDashboard />;
  if (user?.role === USER_ROLES.OPERATIONAL) return <OperationalDashboard />;
  return <ManagementDashboard />;
}

export default Dashboard;
