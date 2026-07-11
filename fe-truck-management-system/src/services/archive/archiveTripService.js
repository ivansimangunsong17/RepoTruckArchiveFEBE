import { httpClient } from '../api/httpClient';
import { isApiDataSource } from '../config/dataSource';

export async function fetchArchiveTripsPage({
  page = 1,
  pageSize = 20,
  query = '',
} = {}) {
  if (!isApiDataSource()) return { rows: [], total: 0 };

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    query,
  });
  return httpClient.get(`/archive/trips?${params.toString()}`);
}
