import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('settingsService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('menggunakan backend API sebagai data source settings', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ data: { companyName: 'PT API' } })),
    })));
    const { fetchSystemSettings, saveSystemSettings, isSettingsDatabaseEnabled } = await import('./settingsService');

    expect(isSettingsDatabaseEnabled()).toBe(true);
    await expect(fetchSystemSettings()).resolves.toEqual({ companyName: 'PT API' });
    await expect(saveSystemSettings({ companyName: 'PT API' })).resolves.toEqual({ companyName: 'PT API' });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/settings$/), expect.objectContaining({ method: 'GET' }));
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/settings$/), expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ companyName: 'PT API' }),
    }));
  });
});
