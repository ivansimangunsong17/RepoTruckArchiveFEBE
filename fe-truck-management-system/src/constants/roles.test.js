import { describe, expect, it } from 'vitest';
import { USER_ROLES, hasPermission } from './roles';

describe('hasPermission', () => {
  it('memberikan admin akses ke permission baru tanpa perlu didaftarkan satu per satu', () => {
    expect(hasPermission({ role: USER_ROLES.ADMIN }, 'future.permission.manage')).toBe(true);
    expect(hasPermission(USER_ROLES.ADMIN, 'future.permission.manage')).toBe(true);
  });

  it('tetap menolak permission kosong untuk admin', () => {
    expect(hasPermission({ role: USER_ROLES.ADMIN }, '')).toBe(false);
  });

  it('role non-admin tetap mengikuti permission matrix', () => {
    expect(hasPermission({ role: USER_ROLES.OPERATIONAL }, 'operations.update')).toBe(true);
    expect(hasPermission({ role: USER_ROLES.OPERATIONAL }, 'future.permission.manage')).toBe(false);
  });
});
