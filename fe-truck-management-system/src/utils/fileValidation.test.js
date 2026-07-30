import { describe, expect, it } from 'vitest';
import { validateArchiveFile, validateFinalUploadFile } from './fileValidation';

function file(name, type, size = 1024) {
  return { name, type, size };
}

describe('validateArchiveFile', () => {
  it('menerima PDF, JPG, dan PNG', () => {
    expect(validateArchiveFile(file('do.pdf', 'application/pdf'))).toBe('');
    expect(validateArchiveFile(file('foto.jpg', 'image/jpeg'))).toBe('');
    expect(validateArchiveFile(file('scan.png', 'image/png'))).toBe('');
  });

  it('menolak tipe file di luar dokumen arsip', () => {
    expect(validateArchiveFile(file('catatan.xlsx', 'application/vnd.ms-excel', 1000))).toBe(
      'Dokumen hanya boleh berupa PDF, JPG, atau PNG.',
    );
  });

  it('menolak PDF lebih dari 5 MB', () => {
    expect(validateArchiveFile(file('besar.pdf', 'application/pdf', 5 * 1024 * 1024 + 1), { label: 'Dokumen SPK' })).toBe(
      'Dokumen SPK melebihi batas maksimal 5 MB.',
    );
  });

  it('menerima gambar mentah sampai 10 MB sebelum kompres', () => {
    expect(validateArchiveFile(file('foto-besar.jpg', 'image/jpeg', 8 * 1024 * 1024), { label: 'Foto KTP' })).toBe('');
  });

  it('menolak gambar mentah lebih dari 10 MB', () => {
    expect(validateArchiveFile(file('foto-terlalu-besar.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1), { label: 'Foto KTP' })).toBe(
      'Foto KTP melebihi batas maksimal 10 MB.',
    );
  });

  it('validasi final upload tetap maksimal 5 MB setelah kompres', () => {
    expect(validateFinalUploadFile(file('foto.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1), { label: 'Foto KTP' })).toBe(
      'Foto KTP melebihi batas maksimal 5 MB.',
    );
  });
});
