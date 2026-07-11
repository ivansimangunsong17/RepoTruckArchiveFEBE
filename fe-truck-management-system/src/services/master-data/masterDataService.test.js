import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMaster, fetchMasterPage, saveMaster } from './masterDataService';
import { httpClient } from '../api/httpClient';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('masterDataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengambil master customer dari backend API', async () => {
    httpClient.get.mockResolvedValue([{ id: 'customer-1', name: 'PT Test' }]);

    await expect(fetchMaster('customers')).resolves.toEqual([{ id: 'customer-1', name: 'PT Test' }]);
    expect(httpClient.get).toHaveBeenCalledWith('/master/customers');
  });

  it('mengambil satu halaman Master Customer dari backend API', async () => {
    httpClient.get.mockResolvedValue({ rows: [{ id: 'customer-1', name: 'PT Test' }], total: 21 });

    const result = await fetchMasterPage('customers', {
      page: 2,
      pageSize: 5,
      query: 'PT',
      filters: { contract: 'Aktif' },
    });

    expect(httpClient.get).toHaveBeenCalledWith('/master/customers/page?page=2&pageSize=5&query=PT&contract=Aktif');
    expect(result).toMatchObject({
      total: 21,
      rows: [{ id: 'customer-1', name: 'PT Test' }],
    });
  });

  it('memetakan role observer ke pengamat saat menyimpan user', async () => {
    httpClient.post.mockResolvedValue({ id: 'user-1', name: 'Rina', email: 'rina@example.com', role: 'pengamat', status: 'Aktif' });

    const result = await saveMaster('users', {
      name: 'Rina',
      email: 'rina@example.com',
      role: 'observer',
      status: 'Aktif',
    });

    expect(httpClient.post).toHaveBeenCalledWith('/users', expect.objectContaining({ role: 'pengamat' }));
    expect(result).toMatchObject({ id: 'user-1', role: 'observer', password: '********' });
  });
});
