import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { AUTH_UNAUTHORIZED_EVENT } from '../services/auth/authTokenStore';

vi.mock('../services/auth/authService', () => ({
  isConfigured: () => false,
}));

function AuthHarness() {
  const { user, signIn, signOut, isDemo } = useAuth();

  return (
    <div>
      <span>{isDemo ? 'Mode Demo' : 'Mode Database'}</span>
      <span>{user?.email || 'Belum Login'}</span>
      <span>{user?.role || '-'}</span>
      <button type="button" onClick={() => signIn('sales@armada.com', 'password')}>
        Login Sales
      </button>
      <button type="button" onClick={() => signIn('sales@armada.com', 'salah').catch(() => {})}>
        Login Salah
      </button>
      <button type="button" onClick={signOut}>Logout</button>
    </div>
  );
}

describe('AuthContext mode demo', () => {
  it('melakukan login dan menyimpan sesi demo', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><AuthHarness /></AuthProvider>);

    await user.click(screen.getByRole('button', { name: 'Login Sales' }));

    expect(screen.getByText('sales@armada.com')).toBeInTheDocument();
    expect(screen.getByText('sales')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('tms-demo-session'))).toMatchObject({
      email: 'sales@armada.com',
      role: 'sales',
    });
  });

  it('menghapus sesi ketika logout', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><AuthHarness /></AuthProvider>);

    await user.click(screen.getByRole('button', { name: 'Login Sales' }));
    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(screen.getByText('Belum Login')).toBeInTheDocument();
    expect(localStorage.getItem('tms-demo-session')).toBeNull();
  });

  it('tetap tanpa sesi ketika kredensial salah', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><AuthHarness /></AuthProvider>);

    await user.click(screen.getByRole('button', { name: 'Login Salah' }));

    expect(screen.getByText('Belum Login')).toBeInTheDocument();
    expect(localStorage.getItem('tms-demo-session')).toBeNull();
  });

  it('mengosongkan user ketika sesi API dinyatakan tidak valid', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><AuthHarness /></AuthProvider>);

    await user.click(screen.getByRole('button', { name: 'Login Sales' }));
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));

    expect(await screen.findByText('Belum Login')).toBeInTheDocument();
  });
});
