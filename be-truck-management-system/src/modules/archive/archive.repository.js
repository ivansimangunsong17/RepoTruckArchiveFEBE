import { query } from '../../db/client.js';
import { mapArchiveTrip } from './archive.mapper.js';

const archiveColumns = `
  cj.id, cj.sales_order_id, cj.container_number, cj.container_size, cj.container_type,
  cj.spk_number, cj.loading_voucher_number, cj.unloading_voucher_number,
  cj.travel_document_number, cj.weighing_document_number, cj.tila_gatepass_document_number,
  cj.assignment_snapshot,
  cj.status, cj.received_at, cj.running_at, cj.completed_at, cj.updated_by_name,
  so.so_number, so.do_number, so.customer_name, so.shipment_type, so.origin,
  so.destination, so.trip_date
`;

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { pageSize, offset: (page - 1) * pageSize };
}

function buildWhere({ query: keyword = '' } = {}) {
  const clauses = ["cj.status = 'completed'"];
  const params = [];
  const cleanKeyword = keyword.trim();

  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }

  return {
    whereSql: `where ${clauses.join(' and ')}`,
    params,
  };
}

export async function findArchiveTripsPage(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildWhere(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rowsResult, countResult] = await Promise.all([
    query(
      `
        select ${archiveColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
        order by cj.completed_at desc nulls last, so.trip_date desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapArchiveTrip),
    total: countResult.rows[0]?.total || 0,
  };
}
