import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('menerjemahkan status internal menjadi label pengguna', () => {
    render(<StatusBadge status="waiting_operational" />);

    expect(screen.getByText('Belum Jalan')).toHaveClass('status-badge', 'waiting_operational');
  });

  it('menerjemahkan status container titip', () => {
    render(<StatusBadge status="repo_stored" />);

    expect(screen.getByText('Container Titip')).toHaveClass('status-badge', 'repo_stored');
  });

  it('mengutamakan label khusus', () => {
    render(<StatusBadge status="completed" label="Sudah Ditutup" />);

    expect(screen.getByText('Sudah Ditutup')).toBeInTheDocument();
  });
});
