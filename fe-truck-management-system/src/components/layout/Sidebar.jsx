import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { navigationGroups } from '../../constants/navigation';
import { useAuth } from '../../hooks/useAuth';
import armadaLogo from '../../Assets/BGLogoArmada.png';

function Sidebar({ open, collapsed, onClose }) {
  const { user } = useAuth();

  return (
    <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><img src={armadaLogo} alt="Armada" /></div>
        <div><strong>ARMADA</strong><span>Truck Management System</span></div>
        <button className="sidebar-close" onClick={onClose} aria-label="Tutup menu">
          <X size={20} />
        </button>
      </div>

      <nav className="nav-list" aria-label="Navigasi utama">
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.roles || item.roles.includes(user?.role),
          );
          if (!visibleItems.length) return null;

          return (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {visibleItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/finance' || to === '/operations'}
                  onClick={onClose}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-help">
        <span>Pusat bantuan</span>
        <strong>Butuh dukungan?</strong>
        <small>Hubungi administrator sistem</small>
      </div>
    </aside>
  );
}

export default Sidebar;
