import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useArchiveData } from '../../hooks/useArchiveData';
import { PageSkeleton } from '../common/PageStates';

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const archive = useArchiveData();

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar open={sidebarOpen} collapsed={sidebarCollapsed} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <Navbar
          sidebarCollapsed={sidebarCollapsed}
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
        <main className="main-content">
          {archive.loading ? <PageSkeleton label="Memuat data archive" /> : null}
          {!archive.loading && archive.error ? (
            <div className="archive-inline-alert" role="alert">
              <span className="archive-inline-alert-icon"><AlertTriangle size={18} /></span>
              <div className="archive-inline-alert-copy">
                <strong>Data archive belum lengkap</strong>
                <p>{archive.error}</p>
              </div>
              <button className="secondary-button" type="button" onClick={archive.refresh}>
                <RefreshCw size={16} /> Coba Lagi
              </button>
            </div>
          ) : null}
          {children}
        </main>
      </div>
      {sidebarOpen ? (
        <button
          className="sidebar-backdrop"
          aria-label="Tutup navigasi"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default AppLayout;
