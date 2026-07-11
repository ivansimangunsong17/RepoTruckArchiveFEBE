import { findArchiveTripsPage } from './archive.repository.js';

export function listArchiveTrips(query) {
  return findArchiveTripsPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || '',
  });
}
