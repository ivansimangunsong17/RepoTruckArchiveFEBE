import { Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { USER_ROLES } from '../constants/roles';
import AccessRestrictedPage from '../pages/system/AccessRestrictedPage';

function RoleRoute({ allowedRoles }) {
  const { user } = useAuth();
  if (user?.role === USER_ROLES.ADMIN) return <Outlet />;
  return allowedRoles.includes(user?.role) ? <Outlet /> : <AccessRestrictedPage />;
}

export default RoleRoute;
