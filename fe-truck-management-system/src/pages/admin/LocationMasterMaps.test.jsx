import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalsPage from './TerminalsPage';
import DepotsPage from './DepotsPage';
import EndUsersPage from './EndUsersPage';
import { useArchiveData } from '../../hooks/useArchiveData';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import {
  fetchMasterPage,
  fetchMasterViewerNote,
  saveMasterViewerNote,
} from '../../services/master-data/masterDataService';

vi.mock('../../hooks/useArchiveData', () => ({
  useArchiveData: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
}));

vi.mock('../../services/master-data/masterDataService', () => ({
  fetchMasterPage: vi.fn(),
  fetchMasterViewerNote: vi.fn(),
  saveMasterViewerNote: vi.fn(),
}));

vi.mock('../../services/files/fileService', () => ({
  createAttachmentDownloadUrl: vi.fn(),
  deleteAttachmentFile: vi.fn(),
  downloadAttachmentFile: vi.fn(),
  uploadAttachmentFile: vi.fn(),
}));

const MAPS_URL = 'https://maps.google.com/?q=-6.1,106.88';

function mockRows(resource, rows) {
  fetchMasterPage.mockResolvedValue({ rows, total: rows.length });
  useArchiveData.mockReturnValue({
    isDatabaseMode: true,
    masters: { [resource]: [], destinations: [] },
    upsertMaster: vi.fn(),
    removeMaster: vi.fn(),
  });
}

function headerLabels() {
  return screen.getAllByRole('columnheader').map((header) => header.textContent.trim());
}

const pages = [
  {
    title: 'Master Terminal',
    resource: 'terminals',
    singular: 'Terminal',
    Page: TerminalsPage,
    row: { id: 'terminal-1', name: 'NPCT1', code: 'PT New Priok', portArea: 'Tanjung Priok', status: 'Aktif' },
    areaPlaceholder: 'Contoh: Tanjung Priok',
  },
  {
    title: 'Master Depo',
    resource: 'depots',
    singular: 'Depo',
    Page: DepotsPage,
    row: { id: 'depot-1', name: 'Depo Marunda', code: 'DPMRD', address: 'Marunda, Jakarta Utara', depotType: 'destination' },
    areaPlaceholder: 'Contoh: Marunda, Jakarta Utara',
  },
];

describe('Maps di Master Terminal dan Master Depo', () => {
  let openSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMasterViewerNote.mockResolvedValue([]);
    saveMasterViewerNote.mockResolvedValue({});
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    useFeedback.mockReturnValue({ notify: vi.fn(), confirmAction: vi.fn() });
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  pages.forEach(({ title, resource, singular, Page, row, areaPlaceholder }) => {
    it(`${title}: tabel punya kolom Maps dan tidak punya kolom Alamat`, async () => {
      mockRows(resource, [{ ...row, googleMapsUrl: '', latitude: null, longitude: null }]);
      render(<Page />);
      await screen.findAllByText(row.name);
      const labels = headerLabels();
      expect(labels).toContain('Maps');
      expect(labels.some((label) => /alamat/i.test(label))).toBe(false);
    });

    it(`${title}: link Maps tersimpan membuka tab baru seperti Master Lokasi`, async () => {
      const user = userEvent.setup();
      mockRows(resource, [{ ...row, googleMapsUrl: MAPS_URL, latitude: null, longitude: null }]);
      render(<Page />);
      await screen.findAllByText(row.name);
      const [mapsButton] = screen.getAllByRole('button', { name: 'Buka lokasi di Google Maps' });
      expect(mapsButton).toBeEnabled();
      await user.click(mapsButton);
      expect(openSpy).toHaveBeenCalledWith(MAPS_URL, '_blank', 'noopener,noreferrer');
    });

    it(`${title}: koordinat tanpa link membuka Maps dari koordinat`, async () => {
      const user = userEvent.setup();
      mockRows(resource, [{ ...row, googleMapsUrl: '', latitude: -6.1, longitude: 106.88 }]);
      render(<Page />);
      await screen.findAllByText(row.name);
      const [mapsButton] = screen.getAllByRole('button', { name: 'Buka lokasi di Google Maps' });
      await user.click(mapsButton);
      expect(openSpy).toHaveBeenCalledWith('https://www.google.com/maps?q=-6.1,106.88', '_blank', 'noopener,noreferrer');
    });

    it(`${title}: data lama tanpa Maps tetap tampil dengan ikon Maps nonaktif (tanpa fallback area/alamat)`, async () => {
      mockRows(resource, [{ ...row, googleMapsUrl: '', latitude: null, longitude: null }]);
      render(<Page />);
      await screen.findAllByText(row.name);
      expect(screen.queryAllByRole('button', { name: 'Buka lokasi di Google Maps' })).toHaveLength(0);
      const [disabledButton] = screen.getAllByTitle('Belum ada link Maps atau koordinat');
      expect(disabledButton).toBeDisabled();
    });

    it(`${title}: form input menyediakan Link Google Maps, Latitude, dan Longitude`, async () => {
      const user = userEvent.setup();
      mockRows(resource, [row]);
      render(<Page />);
      await screen.findAllByText(row.name);
      await user.click(screen.getByRole('button', { name: new RegExp(`Input ${singular} Baru`, 'i') }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByPlaceholderText('https://maps.google.com/?q=...')).toBeInTheDocument();
      expect(within(dialog).getByPlaceholderText('Contoh: -6.123456')).toBeInTheDocument();
      expect(within(dialog).getByPlaceholderText('Contoh: 106.123456')).toBeInTheDocument();
      expect(within(dialog).getByPlaceholderText(areaPlaceholder)).toBeInTheDocument();
    });
  });
});

describe('Master Lokasi tanpa kolom Alamat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMasterViewerNote.mockResolvedValue([]);
    saveMasterViewerNote.mockResolvedValue({});
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    useFeedback.mockReturnValue({ notify: vi.fn(), confirmAction: vi.fn() });
  });

  it('tabel tidak menampilkan kolom Alamat tapi Maps tetap memakai fallback alamat', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    mockRows('end-users', [{
      id: 'end-user-1',
      name: 'Gudang Bekasi Plant',
      address: 'Jl. Industri No. 1, Bekasi',
      status: 'Aktif',
      destinationId: null,
      googleMapsUrl: '',
      latitude: null,
      longitude: null,
    }]);
    render(<EndUsersPage />);
    await screen.findAllByText('Gudang Bekasi Plant');

    const labels = headerLabels();
    expect(labels).toEqual(expect.arrayContaining(['Nama Lokasi', 'Tujuan', 'Status', 'Maps']));
    expect(labels.some((label) => /alamat/i.test(label))).toBe(false);
    expect(screen.queryAllByText('Jl. Industri No. 1, Bekasi')).toHaveLength(0);

    const [mapsButton] = screen.getAllByRole('button', { name: 'Buka lokasi di Google Maps' });
    await user.click(mapsButton);
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=Jl.%20Industri%20No.%201%2C%20Bekasi',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });
});
