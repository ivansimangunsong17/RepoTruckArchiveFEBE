import { useState } from 'react';
import { CalendarDays, History, LayoutDashboard } from 'lucide-react';
import Dashboard from './Dashboard';
import WeeklyOrdersPage from './dashboard/WeeklyOrdersPage';
import OrderHistoryPage from './dashboard/OrderHistoryPage';

const ORDER_DASHBOARD_TABS = [
  { id: 'running', label: 'Order Berjalan', icon: LayoutDashboard },
  { id: 'weekly', label: 'Order Mingguan', icon: CalendarDays },
  { id: 'history', label: 'Riwayat Order', icon: History },
];

function OrderDashboardPage({ initialTab = 'running' }) {
  const [activeTab, setActiveTab] = useState(
    ORDER_DASHBOARD_TABS.some((tab) => tab.id === initialTab) ? initialTab : 'running',
  );

  return (
    <div className="order-dashboard-page">
      <div className="order-dashboard-nav" role="tablist" aria-label="Navigasi Order">
        {ORDER_DASHBOARD_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              aria-selected={active}
              className={`order-dashboard-nav-card ${active ? 'is-active' : ''}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <tab.icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'running' ? <Dashboard /> : null}
      {activeTab === 'weekly' ? <WeeklyOrdersPage /> : null}
      {activeTab === 'history' ? <OrderHistoryPage /> : null}
    </div>
  );
}

export default OrderDashboardPage;
