import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from './httpClient';
import { AUTH_UNAUTHORIZED_EVENT } from '../auth/authTokenStore';

describe('httpClient unauthorized session handling', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('menghapus token dan memberitahu AuthContext ketika API mengembalikan 401', async () => {
    localStorage.setItem('tms-api-auth-token', 'token-lama');
    const unauthorized = vi.fn();
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, unauthorized, { once: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Token auth tidak valid.' } }),
    }));

    await expect(httpClient.post('/container-jobs/job-1/repo', {})).rejects.toThrow('Token auth tidak valid.');

    expect(localStorage.getItem('tms-api-auth-token')).toBeNull();
    expect(unauthorized).toHaveBeenCalledOnce();
  });
});
