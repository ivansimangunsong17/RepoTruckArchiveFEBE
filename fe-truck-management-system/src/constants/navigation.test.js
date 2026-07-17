import { describe, expect, it } from 'vitest';
import { USER_ROLES } from './roles';
import { navigationGroups } from './navigation';

describe('navigationGroups', () => {
  it('tidak menampilkan menu finance untuk admin', () => {
    const monitoringGroup = navigationGroups.find((group) => group.label === 'Monitoring');
    const financeItems = monitoringGroup?.items.filter((item) => item.to.startsWith('/finance')) || [];

    expect(financeItems).toHaveLength(3);
    financeItems.forEach((item) => {
      expect(item.roles).toEqual([USER_ROLES.FINANCE]);
      expect(item.roles).not.toContain(USER_ROLES.ADMIN);
    });
  });

  it('menampilkan dashboard today dan order mingguan untuk finance', () => {
    const overviewGroup = navigationGroups.find((group) => group.label === 'Overview');
    const dashboardItem = overviewGroup?.items.find((item) => item.to === '/dashboard');
    const weeklyItem = overviewGroup?.items.find((item) => item.to === '/weekly-orders');

    expect(dashboardItem?.roles).toContain(USER_ROLES.FINANCE);
    expect(weeklyItem?.roles).toContain(USER_ROLES.FINANCE);
  });
});
