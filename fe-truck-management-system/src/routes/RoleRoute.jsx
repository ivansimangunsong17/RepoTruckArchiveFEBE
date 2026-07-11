import { Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AccessRestrictedPage from '../pages/system/AccessRestrictedPage';

function RoleRoute({ allowedRoles }) {
  const { user } = useAuth();
  return allowedRoles.includes(user?.role) ? <Outlet /> : <AccessRestrictedPage />;
}

export default RoleRoute;
