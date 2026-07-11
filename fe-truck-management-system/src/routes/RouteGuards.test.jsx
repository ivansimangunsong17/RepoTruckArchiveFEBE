import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../hooks/useAuth';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengalihkan pengguna tanpa sesi ke halaman login', () => {
    useAuth.mockReturnValue({ user: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/login" element={<div>Halaman Login</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/private" element={<div>Data Internal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Halaman Login')).toBeInTheDocument();
    expect(screen.queryByText('Data Internal')).not.toBeInTheDocument();
  });

  it('membuka halaman terlindungi untuk pengguna login', () => {
    useAuth.mockReturnValue({ user: { role: 'admin' }, loading: false });

    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/private" element={<div>Data Internal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Data Internal')).toBeInTheDocument();
  });
});

describe('RoleRoute', () => {
  it('membuka modul jika role diizinkan', () => {
    useAuth.mockReturnValue({ user: { role: 'sales' } });

    render(
      <MemoryRouter initialEntries={['/sales']}>
        <Routes>
          <Route element={<RoleRoute allowedRoles={['sales']} />}>
            <Route path="/sales" element={<div>Kelola Sales Order</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Kelola Sales Order')).toBeInTheDocument();
  });

  it('menolak modul jika role tidak diizinkan', () => {
    useAuth.mockReturnValue({ user: { role: 'observer' } });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<RoleRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<div>Kelola Master</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Kelola Master')).not.toBeInTheDocument();
    expect(screen.getByText(/akses dibatasi/i)).toBeInTheDocument();
  });
});
