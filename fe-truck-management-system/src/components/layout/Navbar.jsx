import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_LABELS, USER_ROLES } from '../../constants/roles';
import { useArchiveData } from '../../hooks/useArchiveData';

const routeLabels = {
  dashboard: 'Dashboard',
  'weekly-orders': 'Order Mingguan',
  profile: 'Profil Saya',
  'sales-orders': 'Sales Order',
  operations: 'Container Job',
  'repo-storage': 'Container Titip',
  clients: 'Master Client',
  trucks: 'Master Truck',
  stids: 'Master STID',
  drivers: 'Master Driver',
  users: 'User Management',
  reports: 'Laporan',
  'driver-performance': 'Performa Driver',
  'unit-performance': 'Performa Unit',
  'activity-log': 'Activity Log',
  settings: 'Pengaturan Sistem',
};

function Navbar({ sidebarCollapsed, onMenuClick, onSidebarToggle }) {
  const { user, signOut } = useAuth();
  const archive = useArchiveData();
  const salesOrders = archive.orders;
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchItems = useMemo(() => {
    const orderItems = salesOrders.flatMap((order) => [
      { type: 'Sales Order', title: order.soNumber, detail: `${order.customer} - ${order.doNumber}`, to: '/sales-orders' },
      ...order.containers.map((container) => ({
        type: 'Container',
        title: container.containerNumber,
        detail: user?.role === USER_ROLES.SALES
          ? `${order.soNumber} - ${order.customer}`
          : `${order.soNumber} - ${container.plateNumber || 'Belum ada truck'}`,
        to: user?.role === USER_ROLES.SALES ? '/sales-orders' : '/operations',
      })),
    ]);
    const operationalItems = [
      { type: 'Truck', title: 'B 8871 TZX', detail: 'TRK-001 - Hino', to: '/operations' },
      { type: 'Truck', title: 'B 9142 UYK', detail: 'TRK-002 - Mitsubishi Fuso', to: '/operations' },
      { type: 'Driver', title: 'Agus Setiawan', detail: 'SIM B2 Umum', to: '/operations' },
      { type: 'Driver', title: 'Rudi Hartono', detail: 'SIM B2 Umum', to: '/operations' },
    ];
    const adminItems = operationalItems.map((item) => ({
      ...item,
      to: item.type === 'Truck' ? '/trucks' : '/drivers',
    }));
    const roleItems = {
      [USER_ROLES.ADMIN]: [...orderItems, ...adminItems],
      [USER_ROLES.SALES]: orderItems,
      [USER_ROLES.OPERATIONAL]: [...orderItems, ...operationalItems],
      [USER_ROLES.OBSERVER]: orderItems,
    };
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return (roleItems[user?.role] || [])
      .filter((item) => `${item.title} ${item.detail} ${item.type}`.toLowerCase().includes(keyword))
      .slice(0, 6);
  }, [query, salesOrders, user?.role]);

  useEffect(() => {
    function focusSearch(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.global-search input')?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const pathSegments = location.pathname.split('/').filter(Boolean);

  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenuClick} aria-label="Buka menu"><Menu size={21} /></button>
      <button
        className="sidebar-toggle-button"
        type="button"
        onClick={onSidebarToggle}
        aria-label={sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        title={sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>
      <div className="topbar-context">
        <div className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/dashboard">ATMS</Link>
          {pathSegments.map((segment) => <span key={segment}>/ {routeLabels[segment] || segment}</span>)}
        </div>
        <span className="environment-badge">Development</span>
        <div className="global-search">
          <Search size={18} />
          <input
            aria-label="Pencarian global"
            placeholder="Cari data yang tersedia untuk role Anda..."
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
          />
          <kbd>Ctrl K</kbd>
          {searchOpen && query ? (
            <div className="global-search-results">
              {searchItems.map((item) => (
                <button key={`${item.type}-${item.title}`} type="button" onMouseDown={() => {
                  navigate(item.to); setQuery(''); setSearchOpen(false);
                }}>
                  <span>{item.type}</span><strong>{item.title}</strong><small>{item.detail}</small>
                </button>
              ))}
              {!searchItems.length ? <div className="global-search-empty">Data tidak ditemukan.</div> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="topbar-actions">
        <div className="notification-area">
          <button className="notification-button" aria-label="Notifikasi" onClick={() => setNotificationsOpen((open) => !open)}>
            <Bell size={20} /><span />
          </button>
          {notificationsOpen ? (
            <div className="notification-panel">
              <header><strong>Notifikasi</strong><span>3 belum dibaca</span></header>
              <div>
                <button type="button"><strong>Container belum memiliki assignment</strong><span>MSCU-790112-3 - 10 menit lalu</span></button>
                <button type="button"><strong>Sales Order baru dibuat</strong><span>SO-2606-0183 - 35 menit lalu</span></button>
                <button type="button"><strong>Dokumen SIM segera berakhir</strong><span>3 driver perlu diperiksa</span></button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="user-menu">
          <div className="avatar">{user?.fullName?.slice(0, 2).toUpperCase()}</div>
          <div><strong>{user?.fullName}</strong><span>{ROLE_LABELS[user?.role]}</span></div>
          <button onClick={() => setProfileOpen((open) => !open)} title="Menu profil"><ChevronDown size={17} /></button>
          {profileOpen ? (
            <div className="profile-dropdown">
              <header><strong>{user?.fullName}</strong><span>{user?.email}</span></header>
              <Link to="/profile" onClick={() => setProfileOpen(false)}><UserRound size={16} /> Profil Saya</Link>
              <button type="button" onClick={signOut}><LogOut size={16} /> Keluar</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
