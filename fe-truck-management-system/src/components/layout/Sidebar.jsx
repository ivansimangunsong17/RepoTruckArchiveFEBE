import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, X } from 'lucide-react';
import { navigationGroups } from '../../constants/navigation';
import { useAuth } from '../../hooks/useAuth';
import armadaLogo from '../../Assets/BGLogoArmada.png';

function canShowItem(item, role) {
  return !item.roles || item.roles.includes(role);
}

function visibleNavigationItems(items, role) {
  return items.reduce((visible, item) => {
    if (!canShowItem(item, role)) return visible;
    if (item.children?.length) {
      const children = item.children.filter((child) => canShowItem(child, role));
      if (children.length) visible.push({ ...item, children });
      return visible;
    }
    visible.push(item);
    return visible;
  }, []);
}

function matchesPath(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function isNavigationItemActive(item, pathname) {
  if (item.to && matchesPath(pathname, item.to)) return true;
  return item.children?.some((child) => matchesPath(pathname, child.to)) || false;
}

const collapsibleGroupLabels = ['System'];

function Sidebar({ open, collapsed, onClose }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [openGroups, setOpenGroups] = useState({});

  function toggleDropdown(label) {
    setOpenDropdowns((current) => ({ ...current, [label]: !current[label] }));
  }

  function toggleGroup(label) {
    setOpenGroups((current) => ({ ...current, [label]: current[label] === false ? true : false }));
  }

  return (
    <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><img src={armadaLogo} alt="Armada" /></div>
        <div><strong>ARMADA</strong><span>Transportation Management System</span></div>
        <button className="sidebar-close" onClick={onClose} aria-label="Tutup menu">
          <X size={20} />
        </button>
      </div>

      <nav className="nav-list" aria-label="Navigasi utama">
        {navigationGroups.map((group) => {
          const visibleItems = visibleNavigationItems(group.items, user?.role);
          if (!visibleItems.length) return null;

          const isCollapsibleGroup = collapsibleGroupLabels.includes(group.label);
          const groupOpen = !isCollapsibleGroup || openGroups[group.label] !== false;
          const GroupIcon = group.icon;

          return (
            <div className="nav-group" key={group.label}>
              {isCollapsibleGroup && GroupIcon ? (
                <button
                  aria-expanded={groupOpen}
                  className={`nav-link nav-dropdown-trigger ${groupOpen ? 'expanded' : ''}`}
                  onClick={() => toggleGroup(group.label)}
                  type="button"
                >
                  <GroupIcon size={18} />
                  <span>{group.label}</span>
                  <ChevronDown className={`nav-dropdown-chevron ${groupOpen ? 'open' : ''}`} size={15} />
                </button>
              ) : (
                <p className="nav-group-header">{group.label}</p>
              )}
              {groupOpen && visibleItems.map((item) => {
                const { to, label, icon: Icon } = item;
                const itemActive = isNavigationItemActive(item, location.pathname);
                const dropdownOpen = Boolean(item.children?.length && (itemActive || openDropdowns[label]));

                if (item.children?.length) {
                  return (
                    <div className="nav-dropdown" key={label}>
                      <button
                        type="button"
                        className={`nav-link nav-dropdown-trigger ${itemActive ? 'expanded' : ''}`}
                        onClick={() => toggleDropdown(label)}
                        aria-expanded={dropdownOpen}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                        <ChevronDown className={`nav-dropdown-chevron ${dropdownOpen ? 'open' : ''}`} size={15} />
                      </button>
                      {dropdownOpen ? (
                        <div className="nav-dropdown-content">
                          {item.children.map(({ to: childTo, label: childLabel, icon: ChildIcon }) => (
                            <NavLink
                              key={childTo}
                              to={childTo}
                              onClick={onClose}
                              className={({ isActive }) => `nav-link nav-child-link ${isActive ? 'active' : ''}`}
                            >
                              <ChildIcon size={15} />
                              <span>{childLabel}</span>
                            </NavLink>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
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
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-mobile-account">
        <div className="sidebar-mobile-avatar">{user?.fullName?.slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{user?.fullName || '-'}</strong>
          <span>{user?.email || '-'}</span>
        </div>
        <button type="button" onClick={signOut}>
          <LogOut size={16} />
          Keluar
        </button>
      </div>

      <div className="sidebar-help">
        <span>Pusat bantuan</span>
        <strong>Butuh dukungan?</strong>
        <small>Hubungi administrator sistem</small>
      </div>
    </aside>
  );
}

export default Sidebar;
