import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './csvExport';

describe('downloadCsv', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
  });

  it('tidak membuat file jika tidak ada baris data', () => {
    expect(downloadCsv('kosong', ['A'], [])).toBe(false);
  });

  it('membuat file csv dan memicu download', () => {
    const anchor = { click: vi.fn(), href: '', download: '' };
    URL.createObjectURL = vi.fn(() => 'blob:rekening-dropping');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    expect(downloadCsv('rekening-dropping', ['Tanggal', 'Keterangan'], [['2026-08-20', 'Tol "Cikampek"']])).toBe(true);
    expect(anchor.download).toBe('rekening-dropping.csv');
    expect(anchor.href).toBe('blob:rekening-dropping');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:rekening-dropping');
  });
});
